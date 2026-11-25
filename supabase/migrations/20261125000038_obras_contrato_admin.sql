-- Central de Obras: o administrador anexa o contrato e preenche "Particularidades e benefícios" da obra (25/11/2026, pedido do usuário).
-- O resto da obra continua só com o perfil obras (Letícia, Caio, Adalto por área).

alter table public.obra_obras add column if not exists particularidades text
  check (particularidades is null or length(particularidades) <= 2000);

create or replace function public.obra_pode_contrato()
returns boolean language sql stable security definer set search_path = public as $$
  select public.obra_pode_editar() or public.eh_admin();
$$;
grant execute on function public.obra_pode_contrato() to authenticated;

-- Grava só contrato (arquivo e nome) e particularidades.
create or replace function public.obra_salvar_contrato(p_codigo text, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare sets text;
begin
  if not public.obra_pode_contrato() then raise exception 'Sem permissão para o contrato desta obra.' using errcode = '42501'; end if;
  select string_agg(format('%I = (jsonb_populate_record(null::public.obra_obras, $1)).%I', k, k), ', ')
    into sets from jsonb_object_keys(p_patch) k where k in ('contrato_path', 'contrato_nome', 'particularidades');
  if sets is null then return; end if;
  execute format('update public.obra_obras set %s where codigo = $2', sets) using p_patch, p_codigo;
  if not found then raise exception 'Obra % não encontrada.', p_codigo; end if;
end $$;
grant execute on function public.obra_salvar_contrato(text, jsonb) to authenticated;

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists "obra contratos grava" on storage.objects;
    create policy "obra contratos grava" on storage.objects for insert to authenticated
      with check (bucket_id = 'obra-contratos' and (select public.obra_pode_contrato()));
    drop policy if exists "obra contratos apaga" on storage.objects;
    create policy "obra contratos apaga" on storage.objects for delete to authenticated
      using (bucket_id = 'obra-contratos' and (select public.obra_pode_contrato()));
  end if;
end $$;
