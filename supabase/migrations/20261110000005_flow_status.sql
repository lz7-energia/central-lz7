-- Central LZ7 — status reais da OS no Flow (mapeados em 10/11/2026 pela API).
-- No Flow não existe "Aguardando vistoria". Pipeline "Planejamento e Execução":
-- Adição no Cronograma → Lista de materiais → Separação → Entrega → Aguardando instalação →
-- Instalação → Obra concluída. (e Cancelado).
-- Decisão do usuário: "Obra concluída." libera o faturamento. OS cancelada some do painel.

alter table public.status_os_faturamento
  add column if not exists oculta_no_painel boolean not null default false;

delete from public.status_os_faturamento where status = 'Aguardando vistoria';

insert into public.status_os_faturamento (status, libera_faturamento, oculta_no_painel) values
  ('Obra concluída.', true,  false),
  ('Cancelado',       false, true)
on conflict (status) do update
  set libera_faturamento = excluded.libera_faturamento,
      oculta_no_painel   = excluded.oculta_no_painel;

-- Mesmo painel, agora escondendo os pedidos com OS em status marcado como oculto.
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
left join public.status_os_faturamento s on s.status = os.os_status
where not coalesce(s.oculta_no_painel, false);
