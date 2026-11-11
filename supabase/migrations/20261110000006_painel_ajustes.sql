-- Central LZ7 — ajustes manuais do painel de faturamento (decisão do usuário em 10/11/2026).
-- Ficam numa tabela só da central: a sincronização com o Flow nunca lê nem apaga estes dados,
-- então o que a equipe ocultou ou marcou continua valendo nas próximas sincronizações.
--   oculto      → o card some do painel (reversível: "Mostrar de novo").
--   nota_manual → o card conta como faturado mesmo sem nota encontrada no Flow.

create table public.painel_ajustes (
  pedido_flow_id  text primary key references public.pedidos_venda (flow_id) on delete cascade,
  oculto          boolean not null default false,
  oculto_motivo   text,
  nota_manual     boolean not null default false,
  nota_numero     text,
  alterado_por    text,
  alterado_em     timestamptz not null default now()
);

comment on table public.painel_ajustes is
  'Ajustes manuais do painel (ocultar card, marcar nota emitida). A sincronização com o Flow não toca nesta tabela.';

-- Quem alterou e quando: preenchido pelo banco, não pela tela.
create or replace function public.carimbar_ajuste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.alterado_por := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
  new.alterado_em := now();
  return new;
end;
$$;

create trigger painel_ajustes_carimbo
  before insert or update on public.painel_ajustes
  for each row execute function public.carimbar_ajuste();

alter table public.painel_ajustes enable row level security;

create policy "equipe lê ajustes"     on public.painel_ajustes for select to authenticated using (public.eh_equipe());
create policy "equipe cria ajustes"   on public.painel_ajustes for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera ajustes" on public.painel_ajustes for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Painel com os ajustes. Colunas novas vão no fim (exigência do "create or replace view").
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
  alterado_em
from base
where not coalesce(oculta_no_painel, false);
