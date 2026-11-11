-- Central LZ7 — Recebíveis v2 (11/11/2026):
--   • apelido do cliente (do Flow) como nome principal;
--   • situações de cobrança configuráveis pela equipe, cada uma num grupo
--     (inadimplente / em negociação / aguardando terceiro / outro), base do gráfico.

alter table public.titulos_receber add column if not exists cliente_apelido text;
alter table public.pedidos_venda   add column if not exists cliente_apelido text;

create table public.cobranca_situacoes (
  id      text primary key,
  rotulo  text not null,
  grupo   text not null check (grupo in ('inadimplente', 'negociacao', 'aguardando', 'outro')),
  ordem   integer not null default 100,
  ativo   boolean not null default true,
  padrao  boolean not null default false   -- as que vêm de fábrica (não podem ser renomeadas por engano)
);

insert into public.cobranca_situacoes (id, rotulo, grupo, ordem, padrao) values
  ('sem_contato',   'Sem contato',                      'inadimplente', 10, true),
  ('cobrado',       'Cobrado',                          'inadimplente', 20, true),
  ('sem_retorno',   'Cobrado, sem retorno',             'inadimplente', 30, true),
  ('juridico',      'Jurídico / protesto',              'inadimplente', 40, true),
  ('negociando',    'Negociando',                       'negociacao',   50, true),
  ('promessa',      'Promessa de pagamento',            'negociacao',   60, true),
  ('acordo',        'Acordo fechado / parcelado',       'negociacao',   70, true),
  ('financiamento', 'Aguardando liberação do financiamento', 'aguardando', 80, true),
  ('contestacao',   'Cliente contesta / pendência técnica',  'aguardando', 90, true),
  ('outro',         'Outro',                            'outro',       100, true)
on conflict (id) do nothing;

-- A situação da anotação passa a apontar para a tabela (sai a lista fixa).
alter table public.cobranca_notas drop constraint if exists cobranca_notas_situacao_check;
alter table public.cobranca_notas
  add constraint cobranca_notas_situacao_fk foreign key (situacao)
  references public.cobranca_situacoes (id) on update cascade;

alter table public.cobranca_situacoes enable row level security;
create policy "lê situações"       on public.cobranca_situacoes for select to authenticated using (public.ve_recebiveis());
create policy "equipe cria situação" on public.cobranca_situacoes for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera situação" on public.cobranca_situacoes for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Recebíveis com o apelido (coluna nova no fim).
create or replace view public.recebiveis
with (security_invoker = true)
as
select
  t.flow_id,
  coalesce(t.cliente, p.cliente)              as cliente,
  coalesce(t.codigo_projeto, p.codigo_projeto) as codigo_projeto,
  t.pedido_flow_id,
  t.vencimento,
  t.recebido_em,
  t.valor,
  t.valor_recebido,
  greatest(t.valor - t.valor_recebido, 0)     as valor_aberto,
  t.situacao                                  as situacao_flow,
  case
    when t.recebido_em is not null or t.valor_recebido >= t.valor then 'recebido'
    when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    else 'a_vencer'
  end                                         as estado,
  case
    when t.recebido_em is null and t.valor_recebido < t.valor
         and t.vencimento < (now() at time zone 'America/Sao_Paulo')::date
    then (now() at time zone 'America/Sao_Paulo')::date - t.vencimento
  end                                         as dias_atraso,
  coalesce(n.situacao, 'sem_contato')         as cobranca_situacao,
  n.previsao,
  n.motivo,
  n.alterado_por,
  n.alterado_em,
  coalesce(nullif(t.cliente_apelido, ''), nullif(p.cliente_apelido, '')) as cliente_apelido
from public.titulos_receber t
left join public.pedidos_venda p on p.flow_id = t.pedido_flow_id
left join public.cobranca_notas n on n.titulo_flow_id = t.flow_id;

-- Painel de faturamento com o apelido (coluna nova no fim).
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
),
base as (
  select p.*, os.os_numero, os.os_status, os.status_desde,
         nf.nf_numero, nf.nf_emitida_em,
         coalesce(nf.tem_nf, false) or coalesce(a.nota_manual, false) as tem_nota,
         r.total_titulos, r.total_recebido,
         s.libera_faturamento, s.oculta_no_painel,
         a.oculto, a.oculto_motivo, a.nota_manual, a.nota_numero, a.alterado_por, a.alterado_em
  from public.pedidos_venda p
  left join os    on os.pedido_flow_id = p.flow_id
  left join nf    on nf.pedido_flow_id = p.flow_id
  left join receb r on r.pedido_flow_id = p.flow_id
  left join public.status_os_faturamento s on s.status = os.os_status
  left join public.painel_ajustes a on a.pedido_flow_id = p.flow_id
)
select
  flow_id,
  numero,
  codigo_projeto,
  cliente,
  valor_total,
  responsavel,
  os_numero,
  os_status,
  coalesce(nf_numero, case when nota_manual then nota_numero end) as nf_numero,
  nf_emitida_em,
  total_titulos,
  total_recebido,
  case when total_titulos > 0
       then least(100, round(total_recebido / total_titulos * 100, 1))
       else 0 end as pct_recebido,
  case
    when tem_nota and total_titulos > 0 and total_recebido >= total_titulos then 'recebido'
    when tem_nota                                                           then 'faturado'
    when libera_faturamento                                                 then 'pronto_faturar'
    else 'em_execucao'
  end as coluna,
  case
    when not tem_nota and libera_faturamento and status_desde is not null
    then (current_date - status_desde::date)
  end as dias_parado,
  coalesce(oculto, false)      as oculto,
  oculto_motivo,
  coalesce(nota_manual, false) as nota_manual,
  alterado_por,
  alterado_em,
  nullif(cliente_apelido, '') as cliente_apelido
from base
where not coalesce(oculta_no_painel, false);
