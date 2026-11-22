-- Clientes → Projetos: fechar 100% cada projeto (pedido de venda) e nunca mais mexer nele (pedido do usuário, 22/11/2026).
-- Fechado = recebido 100% + nota emitida + indicador pago (ou sem indicador). "Fechar mesmo assim" (com motivo) para casos fora da regra.
-- Indicador e fechamento manual ficam só na central (projeto_fechamento); o Flow não muda e a sincronização não mexe.

create table if not exists public.projeto_fechamento (
  pedido_flow_id    text primary key references public.pedidos_venda (flow_id) on delete cascade,
  sem_indicador     boolean not null default false,
  indicador_nome    text check (indicador_nome is null or length(indicador_nome) <= 120),
  indicador_valor   numeric(14,2) check (indicador_valor is null or indicador_valor >= 0),
  indicador_pago_em date,
  indicador_obs     text check (indicador_obs is null or length(indicador_obs) <= 300),
  fechado_manual    boolean not null default false,
  fechado_motivo    text check (fechado_motivo is null or length(fechado_motivo) <= 300),
  alterado_por      text,
  alterado_em       timestamptz not null default now(),
  constraint projeto_indicador_coerente check (not (sem_indicador and indicador_nome is not null)),
  constraint projeto_pago_tem_indicador check (indicador_pago_em is null or indicador_nome is not null),
  constraint projeto_fechado_tem_motivo check (not fechado_manual or fechado_motivo is not null)
);
alter table public.projeto_fechamento enable row level security;
drop policy if exists "equipe lê fechamento" on public.projeto_fechamento;
drop policy if exists "equipe grava fechamento" on public.projeto_fechamento;
create policy "equipe lê fechamento" on public.projeto_fechamento for select to authenticated using (public.eh_equipe());
create policy "equipe grava fechamento" on public.projeto_fechamento for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
drop trigger if exists projeto_fechamento_carimbo on public.projeto_fechamento;
create trigger projeto_fechamento_carimbo before insert or update on public.projeto_fechamento
  for each row execute function public.carimbar_ajuste();
grant select, insert, update, delete on public.projeto_fechamento to authenticated;

create or replace view public.projetos_fechamento with (security_invoker = true) as
select x.*,
  (x.fechado_manual or (x.recebido_ok and x.nota = 'emitida' and x.indicador in ('sem', 'pago'))) as fechado
from (
  select p.flow_id, p.numero, p.codigo_projeto, p.cliente, p.cliente_apelido,
         pv.bruto -> 'cliente' ->> 'id' as cliente_id,
         p.valor_total, p.total_titulos, p.total_recebido, p.pct_recebido,
         greatest(coalesce(p.total_titulos, 0) - coalesce(p.total_recebido, 0), 0) as falta_receber,
         (coalesce(p.total_titulos, 0) > 0 and p.total_recebido >= p.total_titulos) as recebido_ok,
         case when p.coluna in ('faturado', 'recebido') then 'emitida'
              when p.coluna = 'pronto_faturar' then 'a_emitir' else 'em_obra' end as nota,
         p.nf_numero, p.nf_emitida_em, p.os_status, pv.data_pedido,
         case when f.sem_indicador then 'sem'
              when f.indicador_pago_em is not null then 'pago'
              when f.indicador_nome is not null then 'a_pagar'
              else 'nao_informado' end as indicador,
         f.indicador_nome, f.indicador_valor, f.indicador_pago_em, f.indicador_obs,
         coalesce(f.fechado_manual, false) as fechado_manual, f.fechado_motivo, f.alterado_por, f.alterado_em
  from public.painel_faturamento p
  join public.pedidos_venda pv on pv.flow_id = p.flow_id
  left join public.projeto_fechamento f on f.pedido_flow_id = p.flow_id
) x;
grant select on public.projetos_fechamento to authenticated;
