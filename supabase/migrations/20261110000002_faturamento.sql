-- Central LZ7 — painel de faturamento (fase 1).
-- Espelho somente-leitura de dados do Flow, preenchido pela rotina de sincronização.
-- Os campos exatos da API ainda serão confirmados: cada tabela guarda o JSON original em "bruto".

-- Pedidos de venda: a base do painel.
create table public.pedidos_venda (
  flow_id          text primary key,
  numero           text,
  codigo_projeto   text,           -- código da obra: 2 letras + 6 dígitos + 3 letras
  cliente          text,
  valor_total      numeric(14, 2),
  data_pedido      date,
  responsavel      text,           -- quem acompanha o faturamento na central
  bruto            jsonb not null default '{}'::jsonb,
  sincronizado_em  timestamptz not null default now()
);

create index on public.pedidos_venda (codigo_projeto);

-- Ordens de serviço: todo pedido tem OS, e toda OS tem pedido.
create table public.ordens_servico (
  flow_id          text primary key,
  pedido_flow_id   text not null references public.pedidos_venda (flow_id) on delete cascade,
  numero           text,
  status           text,
  status_desde     timestamptz,    -- quando a OS entrou no status atual (base do "dias parado")
  bruto            jsonb not null default '{}'::jsonb,
  sincronizado_em  timestamptz not null default now()
);

create index on public.ordens_servico (pedido_flow_id);

-- Quais status de OS liberam o faturamento. Configurável, sem mexer em código.
create table public.status_os_faturamento (
  status             text primary key,
  libera_faturamento boolean not null default true
);

insert into public.status_os_faturamento (status) values ('Aguardando vistoria');

-- Notas fiscais vinculadas aos pedidos.
create table public.notas_fiscais (
  flow_id          text primary key,
  pedido_flow_id   text not null references public.pedidos_venda (flow_id) on delete cascade,
  numero           text,
  serie            text,
  chave_acesso     text,
  situacao         text not null default 'autorizada'
                   check (situacao in ('autorizada', 'cancelada', 'denegada', 'outra')),
  valor            numeric(14, 2),
  emitida_em       timestamptz,
  xml_caminho      text,           -- caminho no armazenamento da central (quando o download for mapeado)
  pdf_caminho      text,
  bruto            jsonb not null default '{}'::jsonb,
  sincronizado_em  timestamptz not null default now()
);

create index on public.notas_fiscais (pedido_flow_id);

-- Títulos do contas a receber (/recebers/).
create table public.titulos_receber (
  flow_id          text primary key,
  pedido_flow_id   text references public.pedidos_venda (flow_id) on delete set null,
  codigo_projeto   text,
  valor            numeric(14, 2) not null default 0,
  valor_recebido   numeric(14, 2) not null default 0,
  vencimento       date,
  recebido_em      date,
  bruto            jsonb not null default '{}'::jsonb,
  sincronizado_em  timestamptz not null default now()
);

create index on public.titulos_receber (pedido_flow_id);
create index on public.titulos_receber (codigo_projeto);

-- Registro de cada execução da sincronização (pra alertar quando parar).
create table public.sincronizacoes (
  id               bigint generated always as identity primary key,
  recurso          text not null,  -- pedidosVenda, os, nfe, recebers…
  iniciada_em      timestamptz not null default now(),
  terminada_em     timestamptz,
  registros        integer,
  sucesso          boolean,
  erro             text
);

-- O painel: uma linha por pedido de venda, já com a coluna calculada.
-- Regras (CLAUDE.md, fase 1):
--   NF-e autorizada + 100% recebido  → recebido
--   NF-e autorizada                  → faturado
--   OS em status que libera, sem NF  → pronto_faturar (NF cancelada volta pra cá)
--   demais                           → em_execucao
create or replace view public.painel_faturamento
with (security_invoker = true)
as
with nf as (
  select pedido_flow_id,
         max(numero) filter (where situacao = 'autorizada') as nf_numero,
         bool_or(situacao = 'autorizada')                    as tem_nf,
         max(emitida_em) filter (where situacao = 'autorizada') as nf_emitida_em
  from public.notas_fiscais
  group by pedido_flow_id
),
os as (
  select distinct on (pedido_flow_id)
         pedido_flow_id, numero as os_numero, status as os_status, status_desde
  from public.ordens_servico
  order by pedido_flow_id, status_desde desc nulls last
),
receb as (
  select p.flow_id as pedido_flow_id,
         coalesce(sum(t.valor), 0)          as total_titulos,
         coalesce(sum(t.valor_recebido), 0) as total_recebido
  from public.pedidos_venda p
  left join public.titulos_receber t
    on t.pedido_flow_id = p.flow_id
    or (t.pedido_flow_id is null and t.codigo_projeto = p.codigo_projeto)
  group by p.flow_id
)
select
  p.flow_id,
  p.numero,
  p.codigo_projeto,
  p.cliente,
  p.valor_total,
  p.responsavel,
  os.os_numero,
  os.os_status,
  nf.nf_numero,
  nf.nf_emitida_em,
  r.total_titulos,
  r.total_recebido,
  case when r.total_titulos > 0
       then least(100, round(r.total_recebido / r.total_titulos * 100, 1))
       else 0 end as pct_recebido,
  case
    when coalesce(nf.tem_nf, false) and r.total_titulos > 0
         and r.total_recebido >= r.total_titulos              then 'recebido'
    when coalesce(nf.tem_nf, false)                            then 'faturado'
    when s.libera_faturamento                                  then 'pronto_faturar'
    else 'em_execucao'
  end as coluna,
  case
    when not coalesce(nf.tem_nf, false) and s.libera_faturamento and os.status_desde is not null
    then (current_date - os.status_desde::date)
  end as dias_parado
from public.pedidos_venda p
left join os    on os.pedido_flow_id = p.flow_id
left join nf    on nf.pedido_flow_id = p.flow_id
left join receb r on r.pedido_flow_id = p.flow_id
left join public.status_os_faturamento s on s.status = os.os_status;

-- Acesso: só a equipe lê. Escrita só pela rotina de sincronização (service_role ignora RLS).
alter table public.pedidos_venda          enable row level security;
alter table public.ordens_servico         enable row level security;
alter table public.status_os_faturamento  enable row level security;
alter table public.notas_fiscais          enable row level security;
alter table public.titulos_receber        enable row level security;
alter table public.sincronizacoes         enable row level security;

create policy "equipe lê pedidos de venda" on public.pedidos_venda
  for select to authenticated using (public.eh_equipe());
create policy "equipe lê OS" on public.ordens_servico
  for select to authenticated using (public.eh_equipe());
create policy "equipe lê status de OS" on public.status_os_faturamento
  for select to authenticated using (public.eh_equipe());
create policy "admin configura status de OS" on public.status_os_faturamento
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "equipe lê notas fiscais" on public.notas_fiscais
  for select to authenticated using (public.eh_equipe());
create policy "equipe lê títulos" on public.titulos_receber
  for select to authenticated using (public.eh_equipe());
create policy "equipe lê sincronizações" on public.sincronizacoes
  for select to authenticated using (public.eh_equipe());

-- O responsável pelo pedido pode ser ajustado pela equipe (único campo editável na central).
-- A rotina de sincronização não sobrescreve "responsavel" (o upsert deve omitir essa coluna).
create policy "equipe define responsável" on public.pedidos_venda
  for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
revoke update on public.pedidos_venda from authenticated;
grant update (responsavel) on public.pedidos_venda to authenticated;

revoke all on public.painel_faturamento from anon;
grant select on public.painel_faturamento to authenticated;
