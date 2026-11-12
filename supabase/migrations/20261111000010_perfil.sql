-- Perfil de cada pessoa com login: foto, cargo e telefone, editados por ela mesma.
-- Papel e "ativo" continuam só com o administrador.

alter table public.perfis
  add column if not exists cargo         text,
  add column if not exists telefone      text,
  add column if not exists foto_caminho  text,
  add column if not exists atualizado_em timestamptz not null default now();

comment on column public.perfis.foto_caminho is
  'Caminho da foto no bucket público "fotos-perfil" (<id da pessoa>/<arquivo>).';

-- Cada um edita só os próprios dados pessoais (nunca papel nem ativo).
create or replace function public.atualizar_meu_perfil(
  p_nome text, p_cargo text, p_telefone text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para editar o perfil.';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Informe o nome.';
  end if;
  update public.perfis
     set nome = left(btrim(p_nome), 120),
         cargo = nullif(left(btrim(coalesce(p_cargo, '')), 80), ''),
         telefone = nullif(left(btrim(coalesce(p_telefone, '')), 30), ''),
         atualizado_em = now()
   where id = auth.uid();
end;
$$;

-- Troca (ou tira, com null) a foto. Só aceita caminho dentro da pasta da própria pessoa.
create or replace function public.trocar_minha_foto(p_caminho text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para trocar a foto.';
  end if;
  if p_caminho is not null and split_part(p_caminho, '/', 1) <> auth.uid()::text then
    raise exception 'Foto fora da sua pasta.';
  end if;
  update public.perfis set foto_caminho = p_caminho, atualizado_em = now() where id = auth.uid();
end;
$$;

revoke all on function public.atualizar_meu_perfil(text, text, text) from public, anon;
revoke all on function public.trocar_minha_foto(text) from public, anon;
grant execute on function public.atualizar_meu_perfil(text, text, text) to authenticated;
grant execute on function public.trocar_minha_foto(text) to authenticated;

-- Fotos: bucket público para leitura (só quem tem o link do arquivo), escrita só na própria pasta.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fotos-perfil', 'fotos-perfil', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy "cada um vê a própria pasta de fotos" on storage.objects
        for select to authenticated
        using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "cada um envia a própria foto" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "cada um troca a própria foto" on storage.objects
        for update to authenticated
        using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy "cada um apaga a própria foto" on storage.objects
        for delete to authenticated
        using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end;
$$;
