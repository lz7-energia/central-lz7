-- Central de Obras (esqueleto), 20/11/2026.
-- Mesmo sistema, mesmo banco e mesmo login. Novo perfil "obras": entra só na Central de Obras (planner próprio, Compras,
-- Logística, Obras). Equipe, admin e diretoria entram nas duas.
-- (Comparação por texto: o valor novo do enum não pode ser usado como literal na mesma transação em que foi criado.)

alter type public.papel add value if not exists 'obras';

-- Central Administrativa: qualquer perfil ativo, menos o de obras.
create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel::text <> 'obras');
$$;

create or replace function public.ve_recebiveis()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel::text <> 'obras');
$$;

-- Central de Obras: qualquer perfil ativo (equipe, admin, diretoria e obras).
create or replace function public.eh_obras()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;
grant execute on function public.eh_obras() to authenticated;

-- Planner: um por pessoa, para todos os perfis ativos (é ele que liga as duas centrais).
drop policy if exists "planner: próprias tarefas" on public.planner_tasks;
create policy "planner: próprias tarefas" on public.planner_tasks for all to authenticated
  using (user_id = auth.uid() and public.eh_obras()) with check (user_id = auth.uid() and public.eh_obras());
drop policy if exists "planner: próprios eventos" on public.planner_events;
create policy "planner: próprios eventos" on public.planner_events for all to authenticated
  using (user_id = auth.uid() and public.eh_obras()) with check (user_id = auth.uid() and public.eh_obras());
drop policy if exists "planner: próprias configurações" on public.planner_settings;
create policy "planner: próprias configurações" on public.planner_settings for all to authenticated
  using (user_id = auth.uid() and public.eh_obras()) with check (user_id = auth.uid() and public.eh_obras());
drop policy if exists "planner: lê o próprio estado de sincronização" on public.planner_sync_state;
create policy "planner: lê o próprio estado de sincronização" on public.planner_sync_state for select to authenticated
  using (user_id = auth.uid() and public.eh_obras());

-- Ordem dos cards: quem é de obras também arruma a própria tela.
drop policy if exists "grava a própria ordem" on public.tela_ordem;
create policy "grava a própria ordem" on public.tela_ordem for insert to authenticated
  with check (perfil_id = (select auth.uid()) and public.eh_obras());
drop policy if exists "altera a própria ordem" on public.tela_ordem;
create policy "altera a própria ordem" on public.tela_ordem for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()) and public.eh_obras());
