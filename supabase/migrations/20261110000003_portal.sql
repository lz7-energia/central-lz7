-- Central LZ7 — portal de pedidos (fase 1).
-- Colaboradores não têm login: o formulário é atendido por uma rota do servidor (Vercel)
-- que confere a verificação anti-robô e chama as funções abaixo com a chave de serviço.
-- O papel "anon" não recebe acesso a nada deste arquivo.

create table public.setores (
  id                 text primary key,           -- financeiro, fiscal, rh, adm
  nome               text not null,
  email_responsavel  text,                       -- recebe o aviso de pedido novo
  ordem              smallint not null default 0
);

create table public.tipos_pedido (
  id               bigint generated always as identity primary key,
  setor_id         text not null references public.setores (id),
  nome             text not null,
  exige_aprovacao  boolean not null default false,
  aprovador_email  text,                         -- usado quando o solicitante não tem gestor cadastrado
  prazo_dias       smallint not null default 3,  -- prazo padrão de atendimento, em dias corridos
  -- Campos do formulário: [{"chave":"valor","rotulo":"Valor (R$)","tipo":"numero","obrigatorio":true}, …]
  campos           jsonb not null default '[]'::jsonb,
  ativo            boolean not null default true,
  ordem            smallint not null default 0,
  unique (setor_id, nome)
);

-- Lista fechada de colaboradores que podem abrir pedidos.
create table public.solicitantes (
  id            bigint generated always as identity primary key,
  nome          text not null unique,
  email         text,                            -- recebe os avisos do próprio pedido
  gestor_email  text,                            -- aprova os pedidos que exigem aprovação
  ativo         boolean not null default true
);

create type public.status_pedido as enum (
  'aguardando_aprovacao', 'aberto', 'em_andamento', 'aguardando', 'concluido', 'recusado', 'cancelado'
);

create sequence public.protocolo_seq;

create table public.pedidos (
  id                   bigint generated always as identity primary key,
  protocolo            text not null unique,
  setor_id             text not null references public.setores (id),
  tipo_id              bigint not null references public.tipos_pedido (id),
  solicitante_id       bigint references public.solicitantes (id),   -- nulo nos pedidos automáticos
  origem               text not null default 'portal' check (origem in ('portal', 'automatico')),
  dados                jsonb not null default '{}'::jsonb,
  vinculo              jsonb not null default '{}'::jsonb,           -- ex.: {"pedido_flow_id": "..."}
  status               public.status_pedido not null default 'aberto',
  responsavel_id       uuid references public.perfis (id),
  prazo                date,
  consulta_token_hash  bytea not null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

create index on public.pedidos (setor_id, status);
create index on public.pedidos (solicitante_id, criado_em);

create trigger pedidos_atualizado_em
  before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

create table public.pedido_eventos (
  id                   bigint generated always as identity primary key,
  pedido_id            bigint not null references public.pedidos (id) on delete cascade,
  tipo                 text not null check (tipo in ('criado', 'status', 'comentario', 'aprovacao', 'responsavel')),
  de_status            public.status_pedido,
  para_status          public.status_pedido,
  texto                text,
  autor                text,
  visivel_solicitante  boolean not null default true,
  criado_em            timestamptz not null default now()
);

create index on public.pedido_eventos (pedido_id, criado_em);

create table public.aprovacoes (
  id               bigint generated always as identity primary key,
  pedido_id        bigint not null references public.pedidos (id) on delete cascade,
  aprovador_email  text not null,
  token_hash       bytea not null unique,
  expira_em        timestamptz not null default now() + interval '7 days',
  decisao          text check (decisao in ('aprovado', 'recusado')),
  comentario       text,
  decidida_em      timestamptz
);

-- Utilitários de token: o token só existe em texto no e-mail/link; o banco guarda o hash.
create or replace function public.gerar_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$ select encode(extensions.gen_random_bytes(24), 'hex') $$;

create or replace function public.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = public, extensions
as $$ select extensions.digest(p_token, 'sha256') $$;

-- Histórico automático: toda mudança de status ou responsável vira um evento.
create or replace function public.registrar_mudanca_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor text := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
begin
  if new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, tipo, de_status, para_status, autor)
    values (new.id, 'status', old.status, new.status, v_autor);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.pedido_eventos (pedido_id, tipo, texto, autor, visivel_solicitante)
    values (new.id, 'responsavel',
            (select nome from public.perfis where id = new.responsavel_id), v_autor, false);
  end if;
  return new;
end;
$$;

create trigger pedidos_historico
  after update on public.pedidos
  for each row execute function public.registrar_mudanca_pedido();

-- Opções do formulário (setores, tipos ativos e nomes da lista fechada).
create or replace function public.portal_opcoes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'setores', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by ordem), '[]')
                from public.setores),
    'tipos', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', id, 'setor_id', setor_id, 'nome', nome,
                'exige_aprovacao', exige_aprovacao, 'campos', campos) order by setor_id, ordem), '[]')
              from public.tipos_pedido where ativo),
    'solicitantes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome), '[]')
                     from public.solicitantes where ativo)
  );
$$;

-- Cria um pedido vindo do portal. Devolve o protocolo, o token de consulta e,
-- quando houver aprovação, o token e o e-mail do aprovador (a rota envia os e-mails).
create or replace function public.criar_pedido(
  p_tipo_id        bigint,
  p_solicitante_id bigint,
  p_dados          jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tipo         public.tipos_pedido;
  v_solic        public.solicitantes;
  v_campo        jsonb;
  v_status       public.status_pedido;
  v_protocolo    text;
  v_token        text := public.gerar_token();
  v_token_aprov  text;
  v_aprovador    text;
  v_pedido_id    bigint;
begin
  select * into v_tipo from public.tipos_pedido where id = p_tipo_id and ativo;
  if not found then raise exception 'Tipo de pedido inválido' using errcode = '22023'; end if;

  select * into v_solic from public.solicitantes where id = p_solicitante_id and ativo;
  if not found then raise exception 'Solicitante inválido' using errcode = '22023'; end if;

  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do formulário inválidos' using errcode = '22023';
  end if;
  if length(p_dados::text) > 20000 then
    raise exception 'Formulário grande demais' using errcode = '22023';
  end if;

  for v_campo in select * from jsonb_array_elements(v_tipo.campos) loop
    if coalesce((v_campo->>'obrigatorio')::boolean, false)
       and coalesce(btrim(p_dados->>(v_campo->>'chave')), '') = '' then
      raise exception 'Campo obrigatório: %', v_campo->>'rotulo' using errcode = '22023';
    end if;
  end loop;

  -- Limite de envios: até 10 pedidos por solicitante por hora e 200 no total por hora.
  if (select count(*) from public.pedidos
      where solicitante_id = p_solicitante_id and criado_em > now() - interval '1 hour') >= 10
     or (select count(*) from public.pedidos
         where origem = 'portal' and criado_em > now() - interval '1 hour') >= 200 then
    raise exception 'Muitos pedidos em pouco tempo. Tente de novo mais tarde.' using errcode = '54000';
  end if;

  v_status := case when v_tipo.exige_aprovacao then 'aguardando_aprovacao' else 'aberto' end;
  v_protocolo := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-'
                 || lpad(nextval('public.protocolo_seq')::text, 5, '0');

  insert into public.pedidos (protocolo, setor_id, tipo_id, solicitante_id, dados, status, prazo, consulta_token_hash)
  values (v_protocolo, v_tipo.setor_id, v_tipo.id, v_solic.id, p_dados, v_status,
          case when v_status = 'aberto' then current_date + v_tipo.prazo_dias end,
          public.hash_token(v_token))
  returning id into v_pedido_id;

  insert into public.pedido_eventos (pedido_id, tipo, para_status, autor)
  values (v_pedido_id, 'criado', v_status, v_solic.nome);

  if v_tipo.exige_aprovacao then
    v_aprovador := coalesce(v_solic.gestor_email, v_tipo.aprovador_email);
    if v_aprovador is null then
      raise exception 'Este pedido precisa de aprovação, mas não há aprovador cadastrado' using errcode = '22023';
    end if;
    v_token_aprov := public.gerar_token();
    insert into public.aprovacoes (pedido_id, aprovador_email, token_hash)
    values (v_pedido_id, v_aprovador, public.hash_token(v_token_aprov));
  end if;

  return jsonb_build_object(
    'protocolo', v_protocolo,
    'token_consulta', v_token,
    'status', v_status,
    'setor_email', (select email_responsavel from public.setores where id = v_tipo.setor_id),
    'solicitante_email', v_solic.email,
    'aprovacao', case when v_token_aprov is not null
                      then jsonb_build_object('token', v_token_aprov, 'email', v_aprovador) end
  );
end;
$$;

-- Consulta pública de um pedido: exige protocolo + token do link. Não expõe dados internos.
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
    and p.consulta_token_hash = public.hash_token(p_token);
$$;

-- Decisão do gestor pelo link do e-mail.
create or replace function public.decidir_aprovacao(p_token text, p_decisao text, p_comentario text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_aprov public.aprovacoes;
  v_tipo  public.tipos_pedido;
  v_novo  public.status_pedido;
begin
  if p_decisao not in ('aprovado', 'recusado') then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;

  select * into v_aprov from public.aprovacoes
  where token_hash = public.hash_token(p_token)
  for update;

  if not found then raise exception 'Link de aprovação inválido' using errcode = '22023'; end if;
  if v_aprov.decidida_em is not null then raise exception 'Este pedido já foi decidido' using errcode = '22023'; end if;
  if v_aprov.expira_em < now() then raise exception 'Link de aprovação expirado' using errcode = '22023'; end if;

  update public.aprovacoes
  set decisao = p_decisao, comentario = p_comentario, decidida_em = now()
  where id = v_aprov.id;

  select t.* into v_tipo
  from public.pedidos p join public.tipos_pedido t on t.id = p.tipo_id
  where p.id = v_aprov.pedido_id;

  v_novo := case when p_decisao = 'aprovado' then 'aberto' else 'recusado' end;

  insert into public.pedido_eventos (pedido_id, tipo, texto, autor)
  values (v_aprov.pedido_id, 'aprovacao',
          case when p_decisao = 'aprovado' then 'Aprovado' else 'Recusado' end
            || coalesce(': ' || p_comentario, ''),
          v_aprov.aprovador_email);

  update public.pedidos
  set status = v_novo,
      prazo  = case when v_novo = 'aberto' then current_date + v_tipo.prazo_dias else prazo end
  where id = v_aprov.pedido_id;

  return jsonb_build_object('pedido_id', v_aprov.pedido_id, 'status', v_novo);
end;
$$;

-- Funções do portal: só a rota do servidor (service_role) chama.
revoke all on function public.portal_opcoes()                         from public, anon, authenticated;
revoke all on function public.criar_pedido(bigint, bigint, jsonb)     from public, anon, authenticated;
revoke all on function public.consultar_pedido(text, text)            from public, anon, authenticated;
revoke all on function public.decidir_aprovacao(text, text, text)     from public, anon, authenticated;
revoke all on function public.gerar_token()                           from public, anon, authenticated;
revoke all on function public.hash_token(text)                        from public, anon, authenticated;
grant execute on function public.portal_opcoes()                      to service_role;
grant execute on function public.criar_pedido(bigint, bigint, jsonb)  to service_role;
grant execute on function public.consultar_pedido(text, text)         to service_role;
grant execute on function public.decidir_aprovacao(text, text, text)  to service_role;

-- Acesso da equipe (com login): vê e atende tudo.
alter table public.setores         enable row level security;
alter table public.tipos_pedido    enable row level security;
alter table public.solicitantes    enable row level security;
alter table public.pedidos         enable row level security;
alter table public.pedido_eventos  enable row level security;
alter table public.aprovacoes      enable row level security;

create policy "equipe lê setores"      on public.setores      for select to authenticated using (public.eh_equipe());
create policy "admin edita setores"    on public.setores      for all    to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "equipe lê tipos"        on public.tipos_pedido for select to authenticated using (public.eh_equipe());
create policy "admin edita tipos"      on public.tipos_pedido for all    to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "equipe lê solicitantes" on public.solicitantes for select to authenticated using (public.eh_equipe());
create policy "admin edita solicitantes" on public.solicitantes for all  to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy "equipe lê pedidos"      on public.pedidos for select to authenticated using (public.eh_equipe());
create policy "equipe atende pedidos"  on public.pedidos for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
-- Na tela, a equipe só muda status, responsável e prazo.
revoke update on public.pedidos from authenticated;
grant update (status, responsavel_id, prazo) on public.pedidos to authenticated;

create policy "equipe lê histórico"    on public.pedido_eventos for select to authenticated using (public.eh_equipe());
create policy "equipe comenta"         on public.pedido_eventos for insert to authenticated
  with check (public.eh_equipe() and tipo = 'comentario');

create policy "equipe lê aprovações"   on public.aprovacoes for select to authenticated using (public.eh_equipe());

-- Fila em tempo real: pedidos novos aparecem na tela da equipe sem recarregar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end;
$$;
