-- Fiscal: "Notas a emitir" entra no lugar do Painel de faturamento (decisão de 22/11/2026).
-- Lista do que falta emitir, com dias parado, a partir de duas fontes:
--   flow:        pedido com OS em "Obra concluída." e sem nota (mesma regra do painel: coluna pronto_faturar);
--   cronograma:  obra marcada como concluída no Cronograma de instalação (fim_real) cuja OS ainda não está concluída no Flow;
--   sem_pedido:  obra concluída no cronograma nos últimos 60 dias sem pedido no Flow com o mesmo código.
-- Cada nota a emitir vira tarefa "Emitir nota" no planner da pessoa fixa escolhida na tela (lib/notas-planner.ts).

create table if not exists public.notas_config (
  id           boolean primary key default true check (id),
  responsavel  uuid references public.perfis (id) on delete set null,
  alterado_por text,
  alterado_em  timestamptz not null default now()
);
insert into public.notas_config (id) values (true) on conflict do nothing;
alter table public.notas_config enable row level security;
drop policy if exists "equipe lê notas_config" on public.notas_config;
drop policy if exists "equipe altera notas_config" on public.notas_config;
create policy "equipe lê notas_config" on public.notas_config for select to authenticated using (public.eh_equipe());
create policy "equipe altera notas_config" on public.notas_config for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
drop trigger if exists notas_config_carimbo on public.notas_config;
create trigger notas_config_carimbo before insert or update on public.notas_config
  for each row execute function public.carimbar_ajuste();
grant select, update on public.notas_config to authenticated;

-- obra concluída sem pedido no Flow: "Ocultar" fica aqui (painel_ajustes exige pedido)
create table if not exists public.notas_ocultas_obra (
  codigo       text primary key references public.obra_obras (codigo) on delete cascade on update cascade,
  alterado_por text,
  alterado_em  timestamptz not null default now()
);
alter table public.notas_ocultas_obra enable row level security;
drop policy if exists "equipe lê ocultas obra" on public.notas_ocultas_obra;
drop policy if exists "equipe grava ocultas obra" on public.notas_ocultas_obra;
create policy "equipe lê ocultas obra" on public.notas_ocultas_obra for select to authenticated using (public.eh_equipe());
create policy "equipe grava ocultas obra" on public.notas_ocultas_obra for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
drop trigger if exists notas_ocultas_carimbo on public.notas_ocultas_obra;
create trigger notas_ocultas_carimbo before insert or update on public.notas_ocultas_obra
  for each row execute function public.carimbar_ajuste();
grant select, insert, update, delete on public.notas_ocultas_obra to authenticated;

create or replace view public.notas_a_emitir with (security_invoker = true) as
with flow as (
  select p.flow_id as chave, p.flow_id, p.numero, p.codigo_projeto, p.cliente, p.cliente_apelido, p.valor_total, p.responsavel,
         p.os_numero, p.os_status, 'flow'::text as origem,
         coalesce(current_date - p.dias_parado, current_date) as desde, null::text as aviso
  from public.painel_faturamento p
  where p.coluna = 'pronto_faturar' and not p.oculto
),
crono as (
  select distinct on (o.codigo)
         p.flow_id as chave, p.flow_id, p.numero, p.codigo_projeto, p.cliente, p.cliente_apelido, p.valor_total, p.responsavel,
         p.os_numero, p.os_status, 'cronograma'::text as origem, o.fim_real as desde,
         'Concluída no cronograma em ' || to_char(o.fim_real, 'DD/MM') || '; a OS no Flow ainda está em "'
           || coalesce(p.os_status, 'sem status') || '"' as aviso
  from public.obra_obras o
  join public.painel_faturamento p on upper(p.codigo_projeto) = o.codigo
  where o.fim_real is not null and p.coluna = 'em_execucao' and not p.oculto
  order by o.codigo, p.flow_id
),
sem_pedido as (
  select 'obra:' || o.codigo as chave, null::text as flow_id, null::text as numero, o.codigo as codigo_projeto,
         o.cliente, null::text as cliente_apelido, o.valor as valor_total, null::text as responsavel,
         null::text as os_numero, null::text as os_status, 'sem_pedido'::text as origem, o.fim_real as desde,
         'Concluída no cronograma em ' || to_char(o.fim_real, 'DD/MM') || '; pedido com esse código não encontrado no Flow' as aviso
  from public.obra_obras o
  where o.fim_real is not null and o.fim_real >= current_date - 60
    and not exists (select 1 from public.pedidos_venda pv where upper(pv.codigo_projeto) = o.codigo)
    and not exists (select 1 from public.notas_ocultas_obra h where h.codigo = o.codigo)
)
select x.*, (current_date - x.desde) as dias
from (select * from flow union all select * from crono union all select * from sem_pedido) x
where public.eh_equipe() or current_user in ('service_role', 'postgres');  -- só de Obras não vê; o servidor (planner) lê tudo

grant select on public.notas_a_emitir to authenticated;
