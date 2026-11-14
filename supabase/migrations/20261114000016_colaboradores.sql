-- Plataforma "Controle de Colaboradores" (cadastro, setores, estoque, eventos, folha, recibos), migrada do artifact do Claude.
-- O código da plataforma fala com um banco estilo Firestore (coleção/documento). Para não mexer nas regras de cálculo,
-- cada documento vira uma linha (colecao, id, data jsonb) e um adaptador no navegador reproduz a mesma interface.

create table if not exists public.plat_docs (
  colecao        text not null check (colecao in ('colab','setores','produtos','itens','entregas','eventos','folhas','config','log')),
  id             text not null check (char_length(id) between 1 and 120),
  data           jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (colecao, id)
);
comment on table public.plat_docs is 'Plataforma de colaboradores: um documento por linha, no formato da plataforma original (jsonb).';
create index if not exists plat_docs_log_em_idx on public.plat_docs ((data->>'em') desc) where colecao = 'log';

alter table public.plat_docs enable row level security;
drop policy if exists plat_docs_equipe on public.plat_docs;
create policy plat_docs_equipe on public.plat_docs for all using (public.eh_equipe()) with check (public.eh_equipe());
grant select, insert, update, delete on public.plat_docs to authenticated;

-- Fusão profunda igual à do runtime original: mapas são mesclados campo a campo; listas e valores simples são substituídos.
create or replace function public.jsonb_fundir(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((select jsonb_object_agg(k,
                 case when a ? k and b ? k then public.jsonb_fundir(a -> k, b -> k)
                      when b ? k then b -> k else a -> k end)
                from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) ks), '{}'::jsonb)
    else b end
$$;

-- update(): mescla no documento existente numa única operação (duas pessoas mexendo na mesma folha não se apagam).
-- Documento inexistente devolve erro "not-found", como no original.
create or replace function public.plat_atualizar(p_colecao text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'patch inválido' using errcode = '22023'; end if;
  update public.plat_docs set data = public.jsonb_fundir(data, p_patch), atualizado_em = now(), atualizado_por = auth.uid()
   where colecao = p_colecao and id = p_id;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
end $$;
grant execute on function public.plat_atualizar(text, text, jsonb) to authenticated;

-- Tempo real (as telas atualizam sozinhas quando outra pessoa mexe).
alter table public.plat_docs replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'plat_docs') then
    alter publication supabase_realtime add table public.plat_docs;
  end if;
end $$;

-- Anexos (recibos de comissão, NF, holerite, TRCT): bucket privado; o nome do arquivo é o assetId da plataforma.
-- O site entrega por link temporário depois de conferir a permissão (rota /_blob/<id>).
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('colab-anexos', 'colab-anexos', false, 26214400)
    on conflict (id) do nothing;
  end if;
end $$;
