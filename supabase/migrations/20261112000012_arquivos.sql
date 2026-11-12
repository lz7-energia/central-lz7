-- Central de arquivos (ADM): documentos da empresa por empresa → unidade → tipo (decisão de 11/11/2026).
-- Empresas: Eletroposto (cinza), Energia (verde), Mob (azul clarinho), Pandora (preto), em ordem alfabética.
-- Energia: Matriz – Wenceslau Braz, Londrina, Ponta Grossa · Mob: Londrina, Wenceslau Braz · Pandora e Eletroposto: unidade única.
-- Documento com validade gera uma tarefa no planner do responsável (e, pelo planner, no ClickUp).

create table public.arq_empresas (
  id     text primary key,
  nome   text not null,
  cor    text not null,          -- cor do card
  texto  text not null default '#ffffff',  -- cor do texto sobre o card
  ordem  smallint not null default 0
);

create table public.arq_unidades (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    text not null references public.arq_empresas (id),
  nome          text not null,
  unica         boolean not null default false,   -- empresa sem filiais: os documentos ficam direto na empresa
  cnpj          text,
  ie            text,                              -- inscrição estadual
  im            text,                              -- inscrição municipal
  endereco      text,
  observacao    text,
  ordem         smallint not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Tipos de documento. Restrito = só o administrador vê.
create table public.arq_tipos (
  id        text primary key,
  nome      text not null,
  restrito  boolean not null default false,
  ordem     smallint not null default 0
);

create table public.arq_documentos (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid references public.arq_unidades (id) on delete restrict,  -- nulo = "A classificar"
  tipo_id       text references public.arq_tipos (id),
  titulo        text not null,
  arquivo_path  text not null unique,             -- caminho no bucket privado "arquivos-empresa"
  arquivo_nome  text not null,
  tamanho       bigint,
  mime          text,
  validade      date,
  aviso_dias    smallint not null default 30,     -- quantos dias antes do vencimento o alerta começa
  restrito      boolean not null default false,   -- além do tipo: documento específico só para o admin
  observacao    text,
  responsavel_id uuid references public.perfis (id),  -- recebe a tarefa de renovação no planner
  enviado_por   uuid references public.perfis (id),
  enviado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.arq_documentos (unidade_id, tipo_id);
create index on public.arq_documentos (validade) where validade is not null;

create trigger arq_documentos_atualizado_em before update on public.arq_documentos
  for each row execute function public.tocar_atualizado_em();
create trigger arq_unidades_atualizado_em before update on public.arq_unidades
  for each row execute function public.tocar_atualizado_em();

-- Quem é administrador (ativo).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo)
$$;

-- O documento é visível para quem está logado? (equipe vê o que não é restrito; admin vê tudo)
create or replace function public.arq_pode_ver(p_restrito boolean, p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_admin()
      or (public.eh_equipe() and not p_restrito
          and not coalesce((select restrito from public.arq_tipos where id = p_tipo), false))
$$;

alter table public.arq_empresas   enable row level security;
alter table public.arq_unidades   enable row level security;
alter table public.arq_tipos      enable row level security;
alter table public.arq_documentos enable row level security;

create policy "equipe lê empresas" on public.arq_empresas for select to authenticated using (public.eh_equipe());
create policy "equipe lê tipos"    on public.arq_tipos    for select to authenticated using (public.eh_equipe());
create policy "equipe lê unidades" on public.arq_unidades for select to authenticated using (public.eh_equipe());
create policy "equipe edita unidades" on public.arq_unidades for update to authenticated
  using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe cria unidades" on public.arq_unidades for insert to authenticated with check (public.eh_equipe());
create policy "admin apaga unidades" on public.arq_unidades for delete to authenticated using (public.eh_admin());

create policy "vê documentos permitidos" on public.arq_documentos for select to authenticated
  using (public.arq_pode_ver(restrito, tipo_id));
create policy "envia documentos permitidos" on public.arq_documentos for insert to authenticated
  with check (public.arq_pode_ver(restrito, tipo_id) and enviado_por = auth.uid());
create policy "edita documentos permitidos" on public.arq_documentos for update to authenticated
  using (public.arq_pode_ver(restrito, tipo_id)) with check (public.arq_pode_ver(restrito, tipo_id));
create policy "apaga documentos permitidos" on public.arq_documentos for delete to authenticated
  using (public.arq_pode_ver(restrito, tipo_id));

insert into public.arq_empresas (id, nome, cor, texto, ordem) values
  ('eletroposto', 'Eletroposto', '#6b7280', '#ffffff', 1),
  ('energia',     'Energia',     '#1e7a55', '#ffffff', 2),
  ('mob',         'Mob',         '#a8dcf5', '#0b3a52', 3),
  ('pandora',     'Pandora',     '#111111', '#ffffff', 4)
on conflict (id) do nothing;

insert into public.arq_unidades (empresa_id, nome, unica, ordem) values
  ('eletroposto', 'Eletroposto', true, 1),
  ('energia', 'Matriz – Wenceslau Braz', false, 1),
  ('energia', 'Londrina', false, 2),
  ('energia', 'Ponta Grossa', false, 3),
  ('mob', 'Londrina', false, 1),
  ('mob', 'Wenceslau Braz', false, 2),
  ('pandora', 'Pandora', true, 1)
on conflict (empresa_id, nome) do nothing;

insert into public.arq_tipos (id, nome, restrito, ordem) values
  ('contratos',  'Contratos', false, 1),
  ('certidoes',  'Certidões', false, 2),
  ('licencas',   'Licenças e alvarás', false, 3),
  ('seguros',    'Seguros', false, 4),
  ('veiculos',   'Veículos', false, 5),
  ('certificado','Certificado digital', false, 6),
  ('societario', 'Societário', true, 7),
  ('outros',     'Outros', false, 8)
on conflict (id) do nothing;

-- Bucket privado: o site entrega cada arquivo por link temporário, depois de conferir a permissão no banco.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('arquivos-empresa', 'arquivos-empresa', false, 52428800)
    on conflict (id) do nothing;
  end if;
end;
$$;
