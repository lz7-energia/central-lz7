-- Planner: tarefas e calls entre a equipe. Quem cria escolhe "Para quem"; a cópia entra no planner de cada pessoa
-- (as cópias ficam em planner_tasks, id "eq-<tarefa>-<pessoa>"). Esta tabela guarda os avisos de novidade.
create table if not exists public.planner_avisos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.perfis (id) on delete cascade,   -- quem recebe o aviso
  de_id      uuid references public.perfis (id) on delete set null,          -- quem causou
  texto      text not null check (char_length(texto) <= 400),
  tarefa_id  text,
  criado_em  timestamptz not null default now(),
  lido_em    timestamptz
);
create index if not exists planner_avisos_user_idx on public.planner_avisos (user_id, lido_em, criado_em desc);
comment on table public.planner_avisos is 'Avisos do planner: tarefa passada, convite para call, alteração, recusa, conclusão.';

alter table public.planner_avisos enable row level security;
drop policy if exists planner_avisos_proprio on public.planner_avisos;
create policy planner_avisos_proprio on public.planner_avisos for select using (user_id = auth.uid());
drop policy if exists planner_avisos_ler on public.planner_avisos;
create policy planner_avisos_ler on public.planner_avisos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update on public.planner_avisos to authenticated;
