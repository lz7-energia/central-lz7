-- Central de Obras: pendências, avisos entre logística e obras e tags padronizadas (24/11/2026, pedido do usuário).
-- * Avisos (obra_avisos) para a área de obras quando a logística mexe no material:
--   - a previsão de entrega mudou numa obra com instalação marcada → "confira a data da instalação";
--   - o material foi entregue → "material entregue" (agende ou confira a instalação).
--   Somem sozinhos quando resolvidos (instalação remarcada, iniciada ou concluída) ou com "Ciente" (obra_aviso_ciente).
--   As outras pendências (obra nova sem previsão de entrega, entrega atrasada, obra a agendar, instalação atrasada) são
--   calculadas na hora a partir da obra e somem quando a obra é preenchida.
-- * Tags padronizadas: catálogo obra_tags (nome único sem diferença de maiúscula, cor). Marcar uma tag que não existe cria no
--   catálogo; "retrofit" vira a "Retrofit" que já existe.

-- ------------------------------------------------------------------- tags
create table if not exists public.obra_tags (
  nome      text primary key check (length(btrim(nome)) between 1 and 30),
  cor       int not null default 160 check (cor between 0 and 359),
  criado_em timestamptz not null default now()
);
create unique index if not exists obra_tags_nome_ci on public.obra_tags (lower(nome));
alter table public.obra_tags enable row level security;
drop policy if exists "obras lê" on public.obra_tags;
create policy "obras lê" on public.obra_tags for select to authenticated using ((select public.eh_obras()));

-- tags que já existem nas obras entram no catálogo (a primeira grafia vence) e as obras passam a usar a grafia do catálogo
insert into public.obra_tags (nome, cor)
select distinct on (lower(t)) t, (abs(hashtext(lower(t))) % 360)
  from public.obra_obras, unnest(tags) t order by lower(t), t
on conflict do nothing;
update public.obra_obras o set tags = (
  select coalesce(array_agg(distinct c.nome order by c.nome), '{}') from unnest(o.tags) t join public.obra_tags c on lower(c.nome) = lower(t))
 where cardinality(tags) > 0;

create or replace function public.obra_salvar_tags(p_codigo text, p_tags text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare limpas text[]; t text; paleta int[] := array[160, 210, 25, 280, 340, 45, 190, 120, 0, 250];
begin
  if not public.eh_obras() then raise exception 'Sem acesso à Central de Obras.' using errcode = '42501'; end if;
  for t in select distinct left(btrim(regexp_replace(x, '\s+', ' ', 'g')), 30) from unnest(coalesce(p_tags, '{}')) x loop
    continue when t = '';
    if not exists (select 1 from public.obra_tags where lower(nome) = lower(t)) then
      insert into public.obra_tags (nome, cor) values (t, paleta[1 + (select count(*) from public.obra_tags) % 10]);
    end if;
  end loop;
  select coalesce(array_agg(distinct c.nome order by c.nome), '{}') into limpas
    from unnest(coalesce(p_tags, '{}')) x join public.obra_tags c on lower(c.nome) = lower(left(btrim(regexp_replace(x, '\s+', ' ', 'g')), 30));
  if cardinality(limpas) > 15 then raise exception 'No máximo 15 tags por obra.' using errcode = '22023'; end if;
  update public.obra_obras set tags = limpas where codigo = p_codigo and tags is distinct from limpas;
  if not found and not exists (select 1 from public.obra_obras where codigo = p_codigo) then
    raise exception 'Obra % não encontrada.', p_codigo;
  end if;
  return limpas;
end $$;

-- Renomear, trocar a cor ou excluir uma tag do catálogo (perfil obras ou administrador). Renomear/excluir acerta as obras.
create or replace function public.obra_tag_editar(p_nome text, p_novo text, p_cor int)
returns void language plpgsql security definer set search_path = public as $$
declare novo text := left(btrim(regexp_replace(coalesce(p_novo, ''), '\s+', ' ', 'g')), 30);
begin
  if not (public.obra_pode_editar() or public.eh_admin()) then raise exception 'Sem permissão para editar as tags.' using errcode = '42501'; end if;
  if novo = '' then raise exception 'Informe o nome da tag.' using errcode = '22023'; end if;
  if exists (select 1 from public.obra_tags where lower(nome) = lower(novo) and nome <> p_nome) then
    raise exception 'Já existe a tag %.', novo using errcode = '23505';
  end if;
  update public.obra_tags set nome = novo, cor = coalesce(p_cor, cor) % 360 where nome = p_nome;
  if not found then raise exception 'Tag % não encontrada.', p_nome; end if;
  if novo <> p_nome then
    update public.obra_obras set tags = (select array_agg(distinct case when x = p_nome then novo else x end order by case when x = p_nome then novo else x end) from unnest(tags) x)
     where p_nome = any (tags);
  end if;
end $$;
create or replace function public.obra_tag_excluir(p_nome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.obra_pode_editar() or public.eh_admin()) then raise exception 'Sem permissão para editar as tags.' using errcode = '42501'; end if;
  update public.obra_obras set tags = array_remove(tags, p_nome) where p_nome = any (tags);
  delete from public.obra_tags where nome = p_nome;
end $$;
grant execute on function public.obra_tag_editar(text, text, int), public.obra_tag_excluir(text) to authenticated;

-- ----------------------------------------------------------------- avisos
create table if not exists public.obra_avisos (
  id            bigserial primary key,
  obra          text not null references public.obra_obras (codigo) on update cascade on delete cascade,
  para          text not null check (para in ('obras', 'logistica')),
  tipo          text not null check (tipo in ('entrega_mudou', 'material_entregue')),
  texto         text not null,
  criado_em     timestamptz not null default now(),
  resolvido_em  timestamptz,
  resolvido_por uuid references auth.users (id),
  como          text            -- ciente | resolvido (a própria obra resolveu)
);
create index if not exists obra_avisos_abertos on public.obra_avisos (para, criado_em) where resolvido_em is null;
create unique index if not exists obra_avisos_um_aberto on public.obra_avisos (obra, tipo) where resolvido_em is null;
alter table public.obra_avisos enable row level security;
drop policy if exists "obras lê" on public.obra_avisos;
create policy "obras lê" on public.obra_avisos for select to authenticated using ((select public.eh_obras()));

create or replace function public.obra_gerar_avisos() returns trigger
language plpgsql security definer set search_path = public as $$
declare br text;
begin
  -- resolvidos pela própria obra
  if new.fim_real is not null or (new.inicio_real is not null and old.inicio_real is null) then
    update public.obra_avisos set resolvido_em = now(), resolvido_por = auth.uid(), como = 'resolvido'
     where obra = new.codigo and resolvido_em is null;
    return null;
  end if;
  if new.inicio_previsto is distinct from old.inicio_previsto or new.fim_previsto is distinct from old.fim_previsto then
    update public.obra_avisos set resolvido_em = now(), resolvido_por = auth.uid(), como = 'resolvido'
     where obra = new.codigo and resolvido_em is null and tipo = 'entrega_mudou';
  end if;
  if new.material_entregue is null and old.material_entregue is not null then
    update public.obra_avisos set resolvido_em = now(), resolvido_por = auth.uid(), como = 'resolvido'
     where obra = new.codigo and resolvido_em is null and tipo = 'material_entregue';
  end if;

  -- previsão de entrega mudou numa obra com instalação marcada (e material ainda não entregue)
  if old.material_previsto is not null and new.material_previsto is distinct from old.material_previsto
     and new.material_previsto is not null and new.material_entregue is null and new.inicio_previsto is not null then
    br := to_char(old.material_previsto, 'DD/MM') || ' para ' || to_char(new.material_previsto, 'DD/MM');
    insert into public.obra_avisos (obra, para, tipo, texto)
    values (new.codigo, 'obras', 'entrega_mudou',
            'A entrega do material mudou de ' || br || '. Instalação marcada para ' || to_char(new.inicio_previsto, 'DD/MM')
            || case when new.material_previsto > new.inicio_previsto then ': o material chega depois. Remarque a instalação.' else ': confira a data.' end)
    on conflict (obra, tipo) where resolvido_em is null
      do update set texto = excluded.texto, criado_em = now();
  end if;

  -- material entregue
  if new.material_entregue is not null and old.material_entregue is null then
    update public.obra_avisos set resolvido_em = now(), resolvido_por = auth.uid(), como = 'resolvido'
     where obra = new.codigo and resolvido_em is null and tipo = 'entrega_mudou';
    insert into public.obra_avisos (obra, para, tipo, texto)
    values (new.codigo, 'obras', 'material_entregue',
            'Material entregue em ' || to_char(new.material_entregue, 'DD/MM') || '. '
            || case when new.inicio_previsto is null then 'Agende a instalação.'
                    else 'Instalação marcada para ' || to_char(new.inicio_previsto, 'DD/MM') || ': confira se pode adiantar.' end)
    on conflict (obra, tipo) where resolvido_em is null
      do update set texto = excluded.texto, criado_em = now();
  end if;
  return null;
end $$;
drop trigger if exists obra_avisos_tg on public.obra_obras;
create trigger obra_avisos_tg after update on public.obra_obras for each row execute function public.obra_gerar_avisos();

create or replace function public.obra_aviso_ciente(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_obras() then raise exception 'Sem acesso à Central de Obras.' using errcode = '42501'; end if;
  update public.obra_avisos set resolvido_em = now(), resolvido_por = auth.uid(), como = 'ciente'
   where id = p_id and resolvido_em is null;
end $$;
grant execute on function public.obra_aviso_ciente(bigint) to authenticated;
