-- Conciliação Bancária (Financeiro, /conciliacao), migrada da plataforma da Controladoria em 20/11/2026 com melhorias.
-- Os documentos têm a mesma forma da plataforma original (coleção / id → jsonb):
--   bancos/<id>, conciliacoes/<id>, resumos/<id> (mesmo id da conciliação), faltas/<bancoId>_<AAAA-MM>, config/geral
-- Melhorias desta versão (o resto das regras é o da plataforma):
--   • versao por documento: a gravação só vale se ninguém salvou a mesma conciliação depois (sem sobrescrever o trabalho de outra pessoa);
--   • auditoria de cada vínculo, exclusão, justificativa, ajuste de saldo, fechamento e troca de arquivos (conc_auditoria);
--   • conciliação fechada não muda (só reabrindo); o encadeamento ainda pode trazer o saldo inicial do mês anterior.
-- Acesso: equipe e admin editam; diretoria só vê (decisão de 20/11/2026).

create table if not exists public.conc_docs (
  colecao        text not null check (colecao in ('bancos', 'conciliacoes', 'resumos', 'faltas', 'config')),
  id             text not null check (length(id) between 1 and 200),
  data           jsonb not null default '{}'::jsonb,
  versao         integer not null default 1,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id) default auth.uid(),
  primary key (colecao, id)
);

create or replace function public.conc_pode_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel in ('equipe', 'admin'));
$$;
grant execute on function public.conc_pode_editar() to authenticated;

-- Carimbo + versão + bloqueio de conciliação fechada.
create or replace function public.conc_docs_antes() returns trigger language plpgsql as $$
declare
  o jsonb; n jsonb;
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.versao := old.versao + 1;
    if new.colecao = 'conciliacoes' and old.data->'fech' is not null and old.data->>'fech' <> 'null'
       and new.data->'fech' is not null and new.data->>'fech' <> 'null' then
      -- Fechada continua fechada: só o saldo inicial (encadeamento) e a data de atualização podem mudar.
      o := old.data - 'atualizadoEm' - 'saldos' - 'auto';
      n := new.data - 'atualizadoEm' - 'saldos' - 'auto';
      if o is distinct from n
         or (coalesce(old.data->'saldos', '{}'::jsonb) - 'eI' - 'fI' - 'origem') is distinct from (coalesce(new.data->'saldos', '{}'::jsonb) - 'eI' - 'fI' - 'origem') then
        raise exception 'Conciliação fechada: reabra para alterar.' using errcode = 'P0001', hint = 'conciliacao_fechada';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists conc_docs_antes on public.conc_docs;
create trigger conc_docs_antes before insert or update on public.conc_docs for each row execute function public.conc_docs_antes();

alter table public.conc_docs enable row level security;
drop policy if exists conc_ler on public.conc_docs;
create policy conc_ler on public.conc_docs for select to authenticated using (public.eh_equipe());
drop policy if exists conc_gravar on public.conc_docs;
create policy conc_gravar on public.conc_docs for insert to authenticated with check (public.conc_pode_editar());
drop policy if exists conc_alterar on public.conc_docs;
create policy conc_alterar on public.conc_docs for update to authenticated using (public.conc_pode_editar()) with check (public.conc_pode_editar());
drop policy if exists conc_apagar on public.conc_docs;
create policy conc_apagar on public.conc_docs for delete to authenticated using (public.conc_pode_editar());
grant select, insert, update, delete on public.conc_docs to authenticated;

-- Gravação condicionada: grava se a versão ainda for a que a pessoa abriu. Devolve a versão nova, ou null se alguém salvou antes.
create or replace function public.conc_gravar(p_colecao text, p_id text, p_data jsonb, p_versao integer)
returns integer language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  if p_versao is null then
    insert into public.conc_docs (colecao, id, data) values (p_colecao, p_id, p_data)
    on conflict (colecao, id) do update set data = excluded.data
    returning versao into v;
    return v;
  end if;
  update public.conc_docs set data = p_data where colecao = p_colecao and id = p_id and versao = p_versao returning versao into v;
  if v is null and not exists (select 1 from public.conc_docs where colecao = p_colecao and id = p_id) then
    insert into public.conc_docs (colecao, id, data) values (p_colecao, p_id, p_data) returning versao into v;
  end if;
  return v;
end $$;
grant execute on function public.conc_gravar(text, text, jsonb, integer) to authenticated;

-- Atualização parcial (merge raso de primeiro nível, como o update da plataforma original): usada pelo encadeamento.
create or replace function public.conc_mesclar(p_colecao text, p_id text, p_campos jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare v integer;
begin
  update public.conc_docs set data = data || p_campos where colecao = p_colecao and id = p_id returning versao into v;
  if v is null then raise exception 'Documento não encontrado: %/%', p_colecao, p_id using errcode = 'P0002'; end if;
  return v;
end $$;
grant execute on function public.conc_mesclar(text, text, jsonb) to authenticated;

-- Auditoria: o que mudou em cada gravação.
create table if not exists public.conc_auditoria (
  id          bigint generated always as identity primary key,
  colecao     text not null,
  doc_id      text not null,
  em          timestamptz not null default now(),
  por         text,
  por_id      uuid,
  acao        text not null,
  detalhe     jsonb not null default '{}'::jsonb
);
create index if not exists conc_auditoria_doc on public.conc_auditoria (doc_id, em desc);
alter table public.conc_auditoria enable row level security;
drop policy if exists conc_aud_ler on public.conc_auditoria;
create policy conc_aud_ler on public.conc_auditoria for select to authenticated using (public.eh_equipe());

create or replace function public.conc_docs_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then old.data else '{}'::jsonb end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then new.data else '{}'::jsonb end;
  col text := coalesce(new.colecao, old.colecao);
  did text := coalesce(new.id, old.id);
  quem text := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
  aud jsonb := '[]'::jsonb;
  x jsonb; k text;
begin
  if col = 'resumos' then return null; end if;   -- espelho da conciliação: não precisa auditar
  if tg_op = 'INSERT' then
    aud := aud || jsonb_build_object('acao', 'criar', 'detalhe', jsonb_build_object('titulo', n->>'titulo', 'nome', n->>'nome'));
  elsif tg_op = 'DELETE' then
    aud := aud || jsonb_build_object('acao', 'excluir', 'detalhe', jsonb_build_object('titulo', o->>'titulo', 'nome', o->>'nome'));
  elsif col = 'conciliacoes' then
    -- vínculos (por id do vínculo)
    for x in select l from jsonb_array_elements(coalesce(n->'links', '[]')) l
              where not exists (select 1 from jsonb_array_elements(coalesce(o->'links', '[]')) m where m->>0 = l->>0) loop
      aud := aud || jsonb_build_object('acao', 'vincular', 'detalhe', jsonb_build_object('extrato', x->1, 'flow', x->2, 'tipo', x->>3, 'dif', x->4, 'nota', x->>5));
    end loop;
    for x in select l from jsonb_array_elements(coalesce(o->'links', '[]')) l
              where not exists (select 1 from jsonb_array_elements(coalesce(n->'links', '[]')) m where m->>0 = l->>0) loop
      aud := aud || jsonb_build_object('acao', 'desvincular', 'detalhe', jsonb_build_object('extrato', x->1, 'flow', x->2, 'tipo', x->>3));
    end loop;
    -- exclusões
    for k in select jsonb_object_keys(coalesce(n->'exc', '{}')) except select jsonb_object_keys(coalesce(o->'exc', '{}')) loop
      aud := aud || jsonb_build_object('acao', 'excluir_lancamento', 'detalhe', jsonb_build_object('item', k, 'motivo', n->'exc'->k->>'m', 'obs', n->'exc'->k->>'o'));
    end loop;
    for k in select jsonb_object_keys(coalesce(o->'exc', '{}')) except select jsonb_object_keys(coalesce(n->'exc', '{}')) loop
      aud := aud || jsonb_build_object('acao', 'restaurar_lancamento', 'detalhe', jsonb_build_object('item', k, 'motivo', o->'exc'->k->>'m'));
    end loop;
    -- justificativas por lançamento
    for k in select key from jsonb_each(coalesce(n->'mot', '{}'))
              where (n->'mot'->key->>'m') is distinct from (o->'mot'->key->>'m') loop
      aud := aud || jsonb_build_object('acao', 'justificar', 'detalhe', jsonb_build_object('item', k, 'motivo', n->'mot'->k->>'m', 'de', o->'mot'->k->>'m'));
    end loop;
    -- ajustes de saldo
    for x in select a from jsonb_array_elements(coalesce(n->'saldos'->'aj', '[]')) a
              where not exists (select 1 from jsonb_array_elements(coalesce(o->'saldos'->'aj', '[]')) b where b->>'id' = a->>'id') loop
      aud := aud || jsonb_build_object('acao', 'ajuste_saldo', 'detalhe', jsonb_build_object('lado', x->>'lado', 'valor', x->'v', 'justificativa', x->>'j'));
    end loop;
    for x in select a from jsonb_array_elements(coalesce(o->'saldos'->'aj', '[]')) a
              where not exists (select 1 from jsonb_array_elements(coalesce(n->'saldos'->'aj', '[]')) b where b->>'id' = a->>'id') loop
      aud := aud || jsonb_build_object('acao', 'remover_ajuste', 'detalhe', jsonb_build_object('lado', x->>'lado', 'valor', x->'v', 'justificativa', x->>'j'));
    end loop;
    -- saldos informados
    for k in select unnest(array['eI', 'fI', 'eF', 'fF']) loop
      if (o->'saldos'->k) is distinct from (n->'saldos'->k) then
        aud := aud || jsonb_build_object('acao', 'saldo', 'detalhe', jsonb_build_object('campo', k, 'de', o->'saldos'->k, 'para', n->'saldos'->k, 'origem', n->'saldos'->'origem'->>k));
      end if;
    end loop;
    -- fechamento
    if coalesce(o->>'fech', 'null') = 'null' and coalesce(n->>'fech', 'null') <> 'null' then
      aud := aud || jsonb_build_object('acao', 'fechar', 'detalhe', jsonb_build_object('justificativa', n->>'justif'));
    elsif coalesce(o->>'fech', 'null') <> 'null' and coalesce(n->>'fech', 'null') = 'null' then
      aud := aud || jsonb_build_object('acao', 'reabrir', 'detalhe', '{}'::jsonb);
    end if;
    if (o->>'justif') is distinct from (n->>'justif') and coalesce(n->>'fech', 'null') = 'null' then
      aud := aud || jsonb_build_object('acao', 'justificativa_fechamento', 'detalhe', jsonb_build_object('texto', n->>'justif'));
    end if;
    -- troca de arquivos
    if jsonb_array_length(coalesce(n->'atualizacoes', '[]')) > jsonb_array_length(coalesce(o->'atualizacoes', '[]')) then
      aud := aud || jsonb_build_object('acao', 'atualizar_arquivos', 'detalhe', n->'atualizacoes'->-1);
    end if;
    if (o->>'titulo') is distinct from (n->>'titulo') then
      aud := aud || jsonb_build_object('acao', 'titulo', 'detalhe', jsonb_build_object('de', o->>'titulo', 'para', n->>'titulo'));
    end if;
  elsif o is distinct from n then
    aud := aud || jsonb_build_object('acao', 'alterar', 'detalhe', jsonb_build_object('de', o, 'para', n));
  end if;

  insert into public.conc_auditoria (colecao, doc_id, por, por_id, acao, detalhe)
  select col, did, quem, auth.uid(), a->>'acao', a->'detalhe' from jsonb_array_elements(aud) a;
  return null;
end $$;
drop trigger if exists conc_docs_auditar on public.conc_docs;
create trigger conc_docs_auditar after insert or update or delete on public.conc_docs for each row execute function public.conc_docs_auditar();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conc_docs') then
    alter publication supabase_realtime add table public.conc_docs;
  end if;
end $$;
