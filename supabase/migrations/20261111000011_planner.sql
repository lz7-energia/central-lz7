-- Planner Eisenhower (recriado do planner-index.html, especificação de 11/11/2026).
-- Cada pessoa da equipe tem o próprio planner: tarefas, eventos, configurações e estado da sincronização.
-- Os documentos ficam em jsonb com os MESMOS campos do planner original (tasks, events, config/settings, config/sync).
-- A sincronização com o ClickUp roda no servidor da Central (rota /planner/api/sync), nunca no navegador.
-- A regra "nunca escrever" vale só para o Flow; o ClickUp recebe alterações do planner.

create table public.planner_tasks (
  user_id       uuid not null references public.perfis (id) on delete cascade,
  id            text not null,                 -- "t…" criadas aqui, "cu<id>" importadas do ClickUp
  data          jsonb not null,                -- {id,title,desc,cat,rec,start,time,important,dailyQ,urgentDays,subs,done,subDone,files,comments,clickupId,…}
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.planner_tasks (user_id, ((data->>'clickupId')));

create table public.planner_events (
  user_id       uuid not null references public.perfis (id) on delete cascade,
  id            text not null,
  data          jsonb not null,                -- {id,title,date,kind:"important"|"holiday",yearly}
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.planner_settings (
  user_id       uuid primary key references public.perfis (id) on delete cascade,
  data          jsonb not null,                -- {name,theme,urgentDays,qNames,counters,facultativos,quintoDiaUtil,satCount}
  atualizado_em timestamptz not null default now()
);

create table public.planner_sync_state (
  user_id            uuid primary key references public.perfis (id) on delete cascade,
  data               jsonb not null default '{}'::jsonb,  -- {enabled,activatedAt,clickupUserId,baseline,deleted,noPush,pendingDeletes,lastPullAt,lastMissingAt,pausedUntil,usage}
  sincronizando_ate  timestamptz,               -- trava: uma sincronização por pessoa de cada vez
  ultima_execucao    timestamptz,
  ultimo_status      text,                      -- ok | erro
  ultima_mensagem    text,
  atualizado_em      timestamptz not null default now()
);

alter table public.planner_tasks      enable row level security;
alter table public.planner_events     enable row level security;
alter table public.planner_settings   enable row level security;
alter table public.planner_sync_state enable row level security;

-- Cada um só vê e mexe no próprio planner (e só quem é da equipe).
create policy "planner: próprias tarefas" on public.planner_tasks for all to authenticated
  using (user_id = auth.uid() and public.eh_equipe()) with check (user_id = auth.uid() and public.eh_equipe());
create policy "planner: próprios eventos" on public.planner_events for all to authenticated
  using (user_id = auth.uid() and public.eh_equipe()) with check (user_id = auth.uid() and public.eh_equipe());
create policy "planner: próprias configurações" on public.planner_settings for all to authenticated
  using (user_id = auth.uid() and public.eh_equipe()) with check (user_id = auth.uid() and public.eh_equipe());
-- Estado da sincronização: a pessoa lê; quem grava é o servidor (chave de serviço).
create policy "planner: lê o próprio estado de sincronização" on public.planner_sync_state for select to authenticated
  using (user_id = auth.uid() and public.eh_equipe());

-- Trava da sincronização: devolve true se conseguiu (ninguém sincronizando essa pessoa agora).
create or replace function public.planner_travar_sync(p_user uuid, p_segundos integer default 240)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.planner_sync_state (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.planner_sync_state
     set sincronizando_ate = now() + make_interval(secs => p_segundos)
   where user_id = p_user and (sincronizando_ate is null or sincronizando_ate < now());
  return found;
end;
$$;
revoke all on function public.planner_travar_sync(uuid, integer) from public, anon, authenticated;

-- Anexos: bucket privado, uma pasta por pessoa (<id da pessoa>/<arquivo>), até 20 MB.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('planner-anexos', 'planner-anexos', false, 20971520)
    on conflict (id) do nothing;
    execute $p$
      create policy "planner: lê os próprios anexos" on storage.objects for select to authenticated
        using (bucket_id = 'planner-anexos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "planner: envia os próprios anexos" on storage.objects for insert to authenticated
        with check (bucket_id = 'planner-anexos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "planner: apaga os próprios anexos" on storage.objects for delete to authenticated
        using (bucket_id = 'planner-anexos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end;
$$;
