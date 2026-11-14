-- Melhorias de 14/11/2026:
--  1) Diretoria com acesso total (o mesmo da equipe; pastas sensíveis e permissões continuam só do administrador).
--  2) Equipe cria, edita e exclui tipos de pedido (e as perguntas de cada um).
--  3) Link de acompanhamento do pedido gerado de novo pela equipe, sem invalidar o link antigo.

-- 1) Quem é da equipe: qualquer perfil ativo (equipe, admin ou diretoria).
create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- 2) Tipos de pedido: a equipe edita (antes só o administrador).
drop policy if exists "equipe edita tipos" on public.tipos_pedido;
create policy "equipe edita tipos" on public.tipos_pedido for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Excluir um tipo: apaga de vez se nunca foi usado; se já tem pedidos, só tira do portal (os pedidos antigos continuam com o nome).
create or replace function public.excluir_tipo_pedido(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if exists (select 1 from public.pedidos where tipo_id = p_id) then
    update public.tipos_pedido set ativo = false where id = p_id;
    return 'desativado';
  end if;
  delete from public.tipos_pedido where id = p_id;
  return 'apagado';
end $$;
grant execute on function public.excluir_tipo_pedido(bigint) to authenticated;

-- 3) Links extras de acompanhamento (o do e-mail de confirmação continua valendo).
create table if not exists public.pedido_links (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id) on delete cascade,
  token_hash bytea not null,
  criado_por uuid references public.perfis (id),
  criado_em timestamptz not null default now()
);
create index if not exists pedido_links_pedido_idx on public.pedido_links (pedido_id);
alter table public.pedido_links enable row level security; -- sem políticas: só as funções abaixo mexem

create or replace function public.gerar_link_consulta(p_pedido_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_token text := public.gerar_token(); v_protocolo text;
begin
  if not public.eh_equipe() then raise exception 'sem permissão' using errcode = '42501'; end if;
  select protocolo into v_protocolo from public.pedidos where id = p_pedido_id;
  if v_protocolo is null then raise exception 'pedido não encontrado'; end if;
  insert into public.pedido_links (pedido_id, token_hash, criado_por) values (p_pedido_id, public.hash_token(v_token), auth.uid());
  return jsonb_build_object('protocolo', v_protocolo, 'token', v_token);
end $$;
revoke all on function public.gerar_link_consulta(bigint) from public, anon;
grant execute on function public.gerar_link_consulta(bigint) to authenticated;

create or replace function public.consultar_pedido(p_protocolo text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'protocolo', p.protocolo,
    'setor', s.nome,
    'tipo', t.nome,
    'status', p.status,
    'criado_em', p.criado_em,
    'prazo', p.prazo,
    'historico', (select coalesce(jsonb_agg(jsonb_build_object(
                    'quando', e.criado_em, 'tipo', e.tipo, 'para_status', e.para_status, 'texto', e.texto)
                    order by e.criado_em), '[]')
                  from public.pedido_eventos e
                  where e.pedido_id = p.id and e.visivel_solicitante)
  )
  from public.pedidos p
  join public.setores s on s.id = p.setor_id
  join public.tipos_pedido t on t.id = p.tipo_id
  where p.protocolo = p_protocolo
    and (p.consulta_token_hash = public.hash_token(p_token)
         or exists (select 1 from public.pedido_links l where l.pedido_id = p.id and l.token_hash = public.hash_token(p_token)));
$$;
revoke all on function public.consultar_pedido(text, text) from public, anon, authenticated;
grant execute on function public.consultar_pedido(text, text) to service_role;
