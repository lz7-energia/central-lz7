-- Financiamento e confirmação de pagamento (Financeiro, /financiamento), migrado da plataforma Contas a Receber LZ7.
-- Os documentos têm a mesma forma da plataforma original:
--   pendentes/base          { arquivo, importadoEm, fin: Card[], conf: Card[], removidos: [{k, col, t, em}] }
--   situacoes/<chave>       { sit?, motivo?, obs?, obsEm?, rota?, em }
--   config/motivosFunil     { lista: [{id, nome}], atualizadoEm }
--   status/financiamento    { por: "Victor", em }
-- Quem vê: qualquer perfil ativo. Quem grava: equipe e administrador. Diretoria só vê (decisão de 17/11/2026).

create table if not exists public.fin_docs (
  colecao text not null check (colecao in ('pendentes', 'situacoes', 'config', 'status')),
  id text not null check (length(id) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id) default auth.uid(),
  primary key (colecao, id)
);

create or replace function public.fin_pode_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel in ('equipe', 'admin'));
$$;
grant execute on function public.fin_pode_editar() to authenticated;

create or replace function public.fin_docs_carimbo() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists fin_docs_carimbo on public.fin_docs;
create trigger fin_docs_carimbo before insert or update on public.fin_docs for each row execute function public.fin_docs_carimbo();

alter table public.fin_docs enable row level security;
drop policy if exists fin_docs_ler on public.fin_docs;
create policy fin_docs_ler on public.fin_docs for select to authenticated using (public.eh_equipe());
drop policy if exists fin_docs_gravar on public.fin_docs;
create policy fin_docs_gravar on public.fin_docs for insert to authenticated with check (public.fin_pode_editar());
drop policy if exists fin_docs_alterar on public.fin_docs;
create policy fin_docs_alterar on public.fin_docs for update to authenticated using (public.fin_pode_editar()) with check (public.fin_pode_editar());
drop policy if exists fin_docs_apagar on public.fin_docs;
create policy fin_docs_apagar on public.fin_docs for delete to authenticated using (public.fin_pode_editar());
grant select, insert, update, delete on public.fin_docs to authenticated;

-- Tempo real (duas pessoas com a tela aberta veem a mesma coisa).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fin_docs') then
    alter publication supabase_realtime add table public.fin_docs;
  end if;
end $$;
