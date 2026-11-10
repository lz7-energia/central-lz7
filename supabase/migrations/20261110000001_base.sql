-- Central LZ7 — base: extensões, perfis da equipe e funções de acesso.
-- Regra do projeto: a central só LÊ do Flow. Estas tabelas são da própria central.

create extension if not exists pgcrypto with schema extensions;

-- Papéis de quem tem login (só a equipe da central e o administrador).
create type public.papel as enum ('equipe', 'admin');

create table public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  email       text not null unique,
  papel       public.papel not null default 'equipe',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

comment on table public.perfis is
  'Pessoas com login na central: os 4 da equipe e o administrador. Colaboradores não têm login.';

-- Funções usadas pelas regras de acesso (RLS).
create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo
  );
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo and papel = 'admin'
  );
$$;

alter table public.perfis enable row level security;

create policy "equipe vê os perfis"
  on public.perfis for select
  to authenticated
  using (public.eh_equipe());

create policy "admin gerencia os perfis"
  on public.perfis for all
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- Atualiza colunas atualizado_em automaticamente.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
