-- Comissões LZ7 (RH, /comissoes), migrada do artifact do Claude em 17/11/2026 sem mudar regras nem recibos.
-- Os documentos têm a mesma forma da plataforma original (coleção / id → jsonb):
--   cfg/geral, unidades/<id>, cargos/<id>, pessoas/<id>, pedidos/<AAAA-MM>, ajustes/<pedido>, apuracoes/<AAAA-MM>,
--   lancamentos/<id>, fechamentos/<id>, recibos/<id>, pagamentos/<id>, auditoria/<id>
-- Quem vê e grava: só a equipe principal (perfis equipe e administrador). Diretoria não vê (salários, CPF, chave Pix).

create table if not exists public.com_docs (
  colecao text not null check (colecao in ('cfg', 'unidades', 'cargos', 'pessoas', 'pedidos', 'ajustes', 'apuracoes',
                                           'lancamentos', 'fechamentos', 'recibos', 'pagamentos', 'auditoria')),
  id text not null check (length(id) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id) default auth.uid(),
  primary key (colecao, id)
);

create or replace function public.com_pode()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel in ('equipe', 'admin'));
$$;
grant execute on function public.com_pode() to authenticated;

create or replace function public.com_docs_carimbo() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists com_docs_carimbo on public.com_docs;
create trigger com_docs_carimbo before insert or update on public.com_docs for each row execute function public.com_docs_carimbo();

alter table public.com_docs enable row level security;
drop policy if exists com_docs_ler on public.com_docs;
create policy com_docs_ler on public.com_docs for select to authenticated using (public.com_pode());
drop policy if exists com_docs_gravar on public.com_docs;
create policy com_docs_gravar on public.com_docs for insert to authenticated with check (public.com_pode());
drop policy if exists com_docs_alterar on public.com_docs;
create policy com_docs_alterar on public.com_docs for update to authenticated using (public.com_pode()) with check (public.com_pode());
drop policy if exists com_docs_apagar on public.com_docs;
create policy com_docs_apagar on public.com_docs for delete to authenticated using (public.com_pode());
grant select, insert, update, delete on public.com_docs to authenticated;

-- Tempo real (duas pessoas com a tela aberta veem a mesma coisa).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'com_docs') then
    alter publication supabase_realtime add table public.com_docs;
  end if;
end $$;
