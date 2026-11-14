-- Fiscal: crédito de PIS/COFINS nota a nota (toma / não toma) e conferência com o escritório contábil.
-- Regra do escritório (relatórios de outubro/2026): no não cumulativo, só as compras de mercadoria (CST 50) geram crédito,
-- sobre a soma dos itens; uso e consumo, combustível, serviços e CST 70 não geram. A central sugere, a equipe confirma.

alter table public.fiscal_notas
  add column if not exists base_credito numeric(14,2),            -- soma dos itens (valor do item − desconto), base do crédito
  add column if not exists credito boolean,                       -- true = toma crédito; false = não toma; null = falta decidir
  add column if not exists credito_origem text check (credito_origem in ('regra', 'historico', 'escritorio', 'manual')),
  add column if not exists credito_por uuid references public.perfis (id),
  add column if not exists credito_em timestamptz;

-- Relatórios do escritório (PDF lido na tela "Conferência com o escritório").
create table if not exists public.fiscal_escritorio_notas (
  id bigint generated always as identity primary key,
  competencia text not null, tributo text not null check (tributo in ('pis', 'cofins')), direcao text not null check (direcao in ('entrada', 'saida')),
  dia text, numero text not null, cfop text, emitente text,
  valor_contabil numeric(14,2), base numeric(14,2), valor numeric(14,2),
  importado_em timestamptz not null default now()
);
create index if not exists fiscal_escritorio_notas_idx on public.fiscal_escritorio_notas (competencia, tributo, direcao);

create table if not exists public.fiscal_escritorio_apuracao (
  competencia text not null, tributo text not null check (tributo in ('pis', 'cofins')),
  debito_nc numeric(14,2), credito numeric(14,2), nc_a_pagar numeric(14,2), cumulativo_a_pagar numeric(14,2), total_a_pagar numeric(14,2),
  darf_nc numeric(14,2), darf_cumulativo numeric(14,2), vencimento text,
  importado_em timestamptz not null default now(), importado_por uuid references public.perfis (id),
  primary key (competencia, tributo)
);

alter table public.fiscal_escritorio_notas enable row level security;
alter table public.fiscal_escritorio_apuracao enable row level security;
drop policy if exists fiscal_escritorio_notas_ler on public.fiscal_escritorio_notas;
create policy fiscal_escritorio_notas_ler on public.fiscal_escritorio_notas for select using (public.eh_equipe());
drop policy if exists fiscal_escritorio_apuracao_ler on public.fiscal_escritorio_apuracao;
create policy fiscal_escritorio_apuracao_ler on public.fiscal_escritorio_apuracao for select using (public.eh_equipe());
grant select on public.fiscal_escritorio_notas, public.fiscal_escritorio_apuracao to authenticated;

-- Grava o que foi lido dos PDFs. p = { relacoes: [{tributo, competencia, direcao, notas: [...]}], memorias: [...], darfs: [...] }.
-- Relação reimportada substitui a anterior do mesmo mês/tributo/direção.
create or replace function public.fiscal_importar_escritorio(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb; i jsonb;
begin
  if not public.eh_equipe() then raise exception 'sem permissão' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'relacoes', '[]')) loop
    delete from public.fiscal_escritorio_notas where competencia = r->>'competencia' and tributo = r->>'tributo' and direcao = r->>'direcao';
    insert into public.fiscal_escritorio_notas (competencia, tributo, direcao, dia, numero, cfop, emitente, valor_contabil, base, valor)
    select r->>'competencia', r->>'tributo', r->>'direcao', n->>'dia', n->>'numero', n->>'cfop', n->>'emitente',
           (n->>'valor_contabil')::numeric, (n->>'base')::numeric, (n->>'valor')::numeric
    from jsonb_array_elements(r->'notas') n;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'memorias', '[]')) loop
    insert into public.fiscal_escritorio_apuracao (competencia, tributo, debito_nc, credito, nc_a_pagar, cumulativo_a_pagar, total_a_pagar, importado_por)
    values (r->>'competencia', r->>'tributo', (r->>'debito_nc')::numeric, (r->>'credito')::numeric, (r->>'nc_a_pagar')::numeric,
            (r->>'cumulativo_a_pagar')::numeric, (r->>'total_a_pagar')::numeric, auth.uid())
    on conflict (competencia, tributo) do update set debito_nc = excluded.debito_nc, credito = excluded.credito, nc_a_pagar = excluded.nc_a_pagar,
      cumulativo_a_pagar = excluded.cumulativo_a_pagar, total_a_pagar = excluded.total_a_pagar, importado_em = now(), importado_por = auth.uid();
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'darfs', '[]')) loop
    for i in select * from jsonb_array_elements(r->'itens') loop
      insert into public.fiscal_escritorio_apuracao (competencia, tributo, darf_nc, darf_cumulativo, vencimento, importado_por)
      values (r->>'competencia', i->>'tributo',
              case when i->>'regime' = 'nc' then (i->>'valor')::numeric end, case when i->>'regime' = 'cumulativo' then (i->>'valor')::numeric end,
              r->>'vencimento', auth.uid())
      on conflict (competencia, tributo) do update set
        darf_nc = coalesce(case when i->>'regime' = 'nc' then (i->>'valor')::numeric end, fiscal_escritorio_apuracao.darf_nc),
        darf_cumulativo = coalesce(case when i->>'regime' = 'cumulativo' then (i->>'valor')::numeric end, fiscal_escritorio_apuracao.darf_cumulativo),
        vencimento = coalesce(excluded.vencimento, fiscal_escritorio_apuracao.vencimento), importado_em = now();
    end loop;
  end loop;
  insert into public.fiscal_log (texto, por) values ('Relatórios do escritório importados', auth.uid());
end $$;
grant execute on function public.fiscal_importar_escritorio(jsonb) to authenticated;

-- Marca "toma crédito" / "não toma" em notas de entrada de produtos. origem: manual (equipe) ou escritorio (seguir o relatório).
create or replace function public.fiscal_marcar_credito(p_ids bigint[], p_credito boolean, p_origem text default 'manual') returns int
language plpgsql security definer set search_path = public as $$
declare qtd int;
begin
  if not public.eh_equipe() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_origem not in ('manual', 'escritorio') then raise exception 'origem inválida'; end if;
  update public.fiscal_notas set credito = p_credito, credito_origem = p_origem, credito_por = auth.uid(), credito_em = now(),
    status = case when status = 'pendente' and base_credito is not null then 'ok' else status end,
    categoria = case when status = 'pendente' and base_credito is not null then 'entrada_produtos' else categoria end,
    pis = case when p_credito then round(coalesce(base_credito, valor_total, 0) * 0.0165, 2) else 0 end,
    cofins = case when p_credito then round(coalesce(base_credito, valor_total, 0) * 0.076, 2) else 0 end
  where id = any(p_ids) and direcao = 'entrada' and origem = 'recebida' and tipo_doc <> 'nfse' and status <> 'cancelada'
    and (categoria = 'entrada_produtos' or (status = 'pendente' and base_credito is not null));
  get diagnostics qtd = row_count;
  insert into public.fiscal_log (nota_id, numero, texto, por)
  select id, numero, case when p_credito then 'Marcada: toma crédito' else 'Marcada: não toma crédito' end
         || case when p_origem = 'escritorio' then ' (seguindo o escritório)' else '' end, auth.uid()
  from public.fiscal_notas where id = any(p_ids);
  return qtd;
end $$;
grant execute on function public.fiscal_marcar_credito(bigint[], boolean, text) to authenticated;

-- "Lançar pelo modelo fixo" numa entrada sem XML completo passa a ser "toma crédito pelo valor total".
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
      base_credito = case when n.direcao = 'entrada' then coalesce(n.base_credito, n.valor_total, n.valor_produtos) end,
      credito = case when n.direcao = 'entrada' then true end,
      credito_origem = case when n.direcao = 'entrada' then 'manual' end, credito_por = auth.uid(), credito_em = now(),
      pis = round(coalesce(n.base_credito, n.valor_total, n.valor_produtos, 0) * 0.0165, 2),
      cofins = round(coalesce(n.base_credito, n.valor_total, n.valor_produtos, 0) * 0.076, 2),
      icms = coalesce(n.icms_xml, 0), ipi = coalesce(n.ipi_xml, 0), iss = null,
      motivo = 'Lançada pelo modelo fixo (1,65% / 7,60%) por decisão na tela.'
    where id = p_id;
  elsif p_decisao = 'despesas' then
    update public.fiscal_notas set decisao = 'despesas', decidido_por = auth.uid(), decidido_em = now(), status = 'ok',
      categoria = 'despesas', credito = case when n.direcao = 'entrada' then false end,
      pis = 0, cofins = 0, icms = 0, ipi = 0, iss = null, motivo = 'Movida para Despesas por decisão na tela.'
    where id = p_id;
  else
    update public.fiscal_notas set decisao = 'aguardar', decidido_por = auth.uid(), decidido_em = now() where id = p_id;
  end if;
  insert into public.fiscal_log (nota_id, numero, texto, por)
  values (p_id, n.numero, case p_decisao when 'modelo' then 'Lançada pelo modelo fixo' when 'despesas' then 'Movida para Despesas' else 'Aguardando o XML completo' end, auth.uid());
end $$;
