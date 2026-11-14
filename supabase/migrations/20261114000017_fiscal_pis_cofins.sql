-- Fiscal: PIS e COFINS a partir das notas do Flow (a partir de outubro/2026).
-- A sincronização (Edge Function fiscal-sincronizar, só GET no Flow) grava cada nota já classificada pelas regras;
-- a tela só lê. Nota sem classificação segura fica "pendente" e fora dos totais até alguém decidir na tela.

create table if not exists public.fiscal_notas (
  id               bigint generated always as identity primary key,
  origem           text not null check (origem in ('recebida', 'saida_produto', 'saida_servico')),
  flow_id          text not null,                       -- id no Flow (evento da nota recebida, documento de saída ou NFS-e)
  chave            text,                                -- chave de acesso (NF-e) ou código da NFS-e
  numero           text not null,
  tipo_doc         text not null check (tipo_doc in ('nfe', 'nfse', 'resumo')),
  direcao          text not null check (direcao in ('entrada', 'saida')),
  categoria        text check (categoria in ('saida_produtos', 'saida_servicos', 'entrada_produtos', 'entrada_servicos', 'despesas')),
  status           text not null check (status in ('ok', 'divergente', 'pendente', 'cancelada')),
  motivo           text,                                -- por que está pendente / divergente / em despesas
  data_emissao     date,
  competencia      text,                                -- AAAA-MM (mês da emissão, horário de Brasília)
  emitente_cnpj    text, emitente_nome text,
  dest_cnpj        text, dest_nome text,
  cfops            text[] not null default '{}',
  csts             text[] not null default '{}',
  ncms             text[] not null default '{}',
  descricao        text,
  valor_produtos   numeric(14,2), valor_servicos numeric(14,2), valor_total numeric(14,2), base_calculo numeric(14,2),
  -- informados no documento (null = "Não informado")
  pis_xml numeric(14,2), cofins_xml numeric(14,2), icms_xml numeric(14,2), ipi_xml numeric(14,2), iss_xml numeric(14,2),
  -- lançados na tabela da categoria (calculados pelo modelo quando a regra manda; null = "Não informado")
  pis numeric(14,2), cofins numeric(14,2), icms numeric(14,2), ipi numeric(14,2), iss numeric(14,2),
  xml_completo     boolean not null default false,
  correcoes        jsonb not null default '[]'::jsonb,  -- cartas de correção: [{numero, data, texto}]
  cancelada_em     timestamptz, justificativa_cancelamento text,
  decisao          text check (decisao in ('modelo', 'aguardar', 'despesas')),
  decidido_por     uuid references public.perfis (id), decidido_em timestamptz,
  extras           jsonb not null default '{}'::jsonb,  -- campos lidos do documento, para conferência na tela
  sincronizado_em  timestamptz not null default now(),
  unique (origem, flow_id)
);
create index if not exists fiscal_notas_comp_idx on public.fiscal_notas (competencia, categoria);
comment on table public.fiscal_notas is 'Notas do Flow classificadas para a apuração de PIS/COFINS (classificação operacional; revisar antes de uso oficial).';

create table if not exists public.fiscal_xml (
  origem text not null, flow_id text not null, xml text not null, baixado_em timestamptz not null default now(),
  primary key (origem, flow_id)
);
comment on table public.fiscal_xml is 'XML original de cada nota baixado do Flow (só leitura), para conferência e reprocessamento.';

create table if not exists public.fiscal_log (
  id bigint generated always as identity primary key, em timestamptz not null default now(),
  nota_id bigint references public.fiscal_notas (id) on delete set null, numero text, texto text not null,
  por uuid references public.perfis (id)
);

alter table public.fiscal_notas enable row level security;
alter table public.fiscal_xml enable row level security;
alter table public.fiscal_log enable row level security;
drop policy if exists fiscal_notas_ler on public.fiscal_notas;
create policy fiscal_notas_ler on public.fiscal_notas for select using (public.eh_equipe());
drop policy if exists fiscal_xml_ler on public.fiscal_xml;
create policy fiscal_xml_ler on public.fiscal_xml for select using (public.eh_equipe());
drop policy if exists fiscal_log_ler on public.fiscal_log;
create policy fiscal_log_ler on public.fiscal_log for select using (public.eh_equipe());
grant select on public.fiscal_notas, public.fiscal_xml, public.fiscal_log to authenticated;

-- Decisão de quem confere, para nota pendente (só resumo/DANFE, CFOP não mapeado…):
--   modelo   → lança em Produtos (entrada ou saída) pelo modelo fixo 1,65% / 7,60%; ICMS/IPI = informado, senão 0
--   despesas → vai para Despesas, impostos 0
--   aguardar → continua pendente, esperando o XML completo
create or replace function public.fiscal_decidir(p_id bigint, p_decisao text) returns void
language plpgsql security definer set search_path = public as $$
declare n public.fiscal_notas;
begin
  if not public.eh_equipe() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_decisao not in ('modelo', 'aguardar', 'despesas') then raise exception 'decisão inválida'; end if;
  select * into n from public.fiscal_notas where id = p_id for update;
  if not found then raise exception 'nota não encontrada'; end if;
  if n.status = 'cancelada' then raise exception 'nota cancelada'; end if;
  if p_decisao = 'modelo' then
    update public.fiscal_notas set decisao = 'modelo', decidido_por = auth.uid(), decidido_em = now(), status = 'ok',
      categoria = case when n.direcao = 'saida' then 'saida_produtos' else 'entrada_produtos' end,
      base_calculo = coalesce(n.valor_total, n.valor_produtos),
      pis = round(coalesce(n.valor_total, n.valor_produtos, 0) * 0.0165, 2), cofins = round(coalesce(n.valor_total, n.valor_produtos, 0) * 0.076, 2),
      icms = coalesce(n.icms_xml, 0), ipi = coalesce(n.ipi_xml, 0), iss = null,
      motivo = 'Lançada pelo modelo fixo (1,65% / 7,60%) por decisão na tela.'
    where id = p_id;
  elsif p_decisao = 'despesas' then
    update public.fiscal_notas set decisao = 'despesas', decidido_por = auth.uid(), decidido_em = now(), status = 'ok',
      categoria = 'despesas', pis = 0, cofins = 0, icms = 0, ipi = 0, iss = null, motivo = 'Movida para Despesas por decisão na tela.'
    where id = p_id;
  else
    update public.fiscal_notas set decisao = 'aguardar', decidido_por = auth.uid(), decidido_em = now() where id = p_id;
  end if;
  insert into public.fiscal_log (nota_id, numero, texto, por)
  values (p_id, n.numero, case p_decisao when 'modelo' then 'Lançada pelo modelo fixo' when 'despesas' then 'Movida para Despesas' else 'Aguardando o XML completo' end, auth.uid());
end $$;
grant execute on function public.fiscal_decidir(bigint, text) to authenticated;
