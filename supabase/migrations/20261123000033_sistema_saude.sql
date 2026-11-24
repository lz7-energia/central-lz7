-- Sistema (só administrador, /sistema): saúde das sincronizações e botão "Atualizar agora" (pedido de 23/11/2026).
-- As funções do Supabase continuam com a trava própria (não rodam duas vezes em menos de 10 minutos).

create table if not exists public.sync_funcoes (
  recurso text primary key,      -- flow | fiscal | dfc (igual a sincronizacoes.recurso)
  nome    text not null,
  url     text not null,
  ordem   int not null default 0
);
alter table public.sync_funcoes enable row level security;
drop policy if exists "admin lê sync_funcoes" on public.sync_funcoes;
create policy "admin lê sync_funcoes" on public.sync_funcoes for select to authenticated using (public.eh_admin());
grant select on public.sync_funcoes to authenticated;
-- endereços do central-teste (nomes automáticos do editor); em produção, trocar pelos de lá
insert into public.sync_funcoes (recurso, nome, url, ordem) values
  ('flow',   'Flow (pedidos, OS, notas, recebíveis, clientes)', 'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/hyper-function', 1),
  ('fiscal', 'Fiscal (PIS e COFINS)',                           'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/fiscal-sincronizar', 2),
  ('dfc',    'DFC (contas pagas e recebidas)',                  'https://ypiudecoofbrqicpwapm.supabase.co/functions/v1/super-function', 3)
on conflict (recurso) do nothing;

-- Retrato da saúde: últimas rodadas de cada sincronização, agendamentos e o planner/ClickUp de cada pessoa.
create or replace function public.admin_saude()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  cron_jobs jsonb := '[]'::jsonb;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.' using errcode = '42501'; end if;
  select jsonb_agg(jsonb_build_object('recurso', f.recurso, 'nome', f.nome,
           'rodadas', coalesce((select jsonb_agg(to_jsonb(s) order by s.iniciada_em desc)
                                from (select iniciada_em, terminada_em, registros, sucesso, erro from public.sincronizacoes
                                      where recurso = f.recurso order by iniciada_em desc limit 8) s), '[]'::jsonb))
         order by f.ordem)
    into r from public.sync_funcoes f;
  if to_regclass('cron.job') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('nome', j.jobname, 'quando', j.schedule, 'ativo', j.active,
               'ultima', (select jsonb_build_object('inicio', d.start_time, 'status', d.status, 'mensagem', left(d.return_message, 200))
                          from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1))
             order by j.jobname), '[]'::jsonb)
      from cron.job j $q$ into cron_jobs;
  end if;
  return jsonb_build_object(
    'agora', now(),
    'sincronizacoes', coalesce(r, '[]'::jsonb),
    'agendamentos', cron_jobs,
    'planner', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'ligado', coalesce((s.data->>'enabled')::boolean, false),
                 'ultima', s.ultima_execucao, 'status', s.ultimo_status, 'mensagem', left(s.ultima_mensagem, 200)) order by p.nome)
               from public.planner_sync_state s join public.perfis p on p.id = s.user_id), '[]'::jsonb));
end $$;
grant execute on function public.admin_saude() to authenticated;

-- "Atualizar agora": chama a função pelo pg_net (não espera terminar). A trava de 10 minutos de cada função continua valendo.
create or replace function public.admin_disparar_sincronizacao(p_recurso text)
returns text language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.' using errcode = '42501'; end if;
  select url into u from public.sync_funcoes where recurso = p_recurso;
  if u is null then raise exception 'Sincronização desconhecida.' using errcode = '22023'; end if;
  if exists (select 1 from public.sincronizacoes where recurso = p_recurso and sucesso is null and iniciada_em > now() - interval '10 minutes') then
    return 'rodando';
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'pg_net não está ligado neste banco.' using errcode = '55000';
  end if;
  execute 'select net.http_post(url := $1, headers := ''{"Content-Type": "application/json"}''::jsonb, body := ''{}''::jsonb, timeout_milliseconds := 150000)' using u;
  return 'disparada';
end $$;
grant execute on function public.admin_disparar_sincronizacao(text) to authenticated;
