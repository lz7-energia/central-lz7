-- Central LZ7 — ajustes manuais nos títulos a receber (11/11/2026).
-- Só na central (o Flow não é alterado): baixa manual, exclusão da lista e nome para exibir.
-- A sincronização nunca mexe nesta tabela.

create table public.titulo_ajustes (
  titulo_flow_id   text primary key references public.titulos_receber (flow_id) on delete cascade,
  baixa_manual     boolean not null default false,
  baixa_data       date,
  baixa_valor      numeric(14, 2),
  baixa_obs        text,
  excluido         boolean not null default false,
  excluido_motivo  text,
  nome_exibicao    text,
  alterado_por     text,
  alterado_em      timestamptz not null default now()
);

create trigger titulo_ajustes_carimbo
  before insert or update on public.titulo_ajustes
  for each row execute function public.carimbar_ajuste();

alter table public.titulo_ajustes enable row level security;
create policy "lê ajustes de título"     on public.titulo_ajustes for select to authenticated using (public.ve_recebiveis());
create policy "equipe ajusta título"      on public.titulo_ajustes for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera ajuste"      on public.titulo_ajustes for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Recebíveis com os ajustes. Baixa manual → recebido; excluído → estado 'excluido'.
-- (Colunas existentes mantêm nome e tipo; as novas vão no fim.)
create or replace view public.recebiveis
with (security_invoker = true)
as
with base as (
  select
    t.*,
    p.cliente        as p_cliente,
    p.codigo_projeto as p_codigo,
    p.cliente_apelido as p_apelido,
    n.situacao as n_situacao, n.previsao as n_previsao, n.motivo as n_motivo,
    n.alterado_por as n_por, n.alterado_em as n_em,
    a.baixa_manual, a.baixa_data, a.baixa_valor, a.baixa_obs,
    a.excluido, a.excluido_motivo, a.nome_exibicao,
    a.alterado_por as a_por, a.alterado_em as a_em,
    case when coalesce(a.baixa_manual, false) then coalesce(a.baixa_data, (a.alterado_em at time zone 'America/Sao_Paulo')::date)
         else t.recebido_em end as rec_em,
    case when coalesce(a.baixa_manual, false) then coalesce(a.baixa_valor, t.valor)
         else t.valor_recebido end as rec_valor,
    (now() at time zone 'America/Sao_Paulo')::date as hoje
  from public.titulos_receber t
  left join public.pedidos_venda p   on p.flow_id = t.pedido_flow_id
  left join public.cobranca_notas n  on n.titulo_flow_id = t.flow_id
  left join public.titulo_ajustes a  on a.titulo_flow_id = t.flow_id
)
select
  flow_id,
  coalesce(cliente, p_cliente)              as cliente,
  coalesce(codigo_projeto, p_codigo)        as codigo_projeto,
  pedido_flow_id,
  vencimento,
  rec_em                                    as recebido_em,
  valor,
  rec_valor                                 as valor_recebido,
  case when coalesce(baixa_manual, false) then 0 else greatest(valor - rec_valor, 0) end as valor_aberto,
  situacao                                  as situacao_flow,
  case
    when coalesce(excluido, false)                         then 'excluido'
    when coalesce(baixa_manual, false)
      or rec_em is not null or rec_valor >= valor          then 'recebido'
    when vencimento < hoje                                 then 'vencido'
    else 'a_vencer'
  end                                       as estado,
  case
    when not coalesce(excluido, false) and not coalesce(baixa_manual, false)
         and rec_em is null and rec_valor < valor and vencimento < hoje
    then hoje - vencimento
  end                                       as dias_atraso,
  coalesce(n_situacao, 'sem_contato')       as cobranca_situacao,
  n_previsao                                as previsao,
  n_motivo                                  as motivo,
  n_por                                     as alterado_por,
  n_em                                      as alterado_em,
  coalesce(nullif(nome_exibicao, ''), nullif(cliente_apelido, ''), nullif(p_apelido, '')) as cliente_apelido,
  coalesce(baixa_manual, false)             as baixa_manual,
  baixa_obs,
  coalesce(excluido, false)                 as excluido,
  excluido_motivo,
  nome_exibicao,
  a_por                                     as ajuste_por,
  a_em                                      as ajuste_em
from base;
