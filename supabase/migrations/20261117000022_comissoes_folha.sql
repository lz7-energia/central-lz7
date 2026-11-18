-- Comissões LZ7 × Colaboradores e folha: cadastro único dos vendedores (decisão de 17/11/2026).
-- A folha (plat_docs, coleção colab) é a fonte de nome, CPF, chave Pix, admissão e desligamento de quem é do setor Comercial.
--   • Colaborador do Comercial já nas Comissões (mesmo colab_id, ou mesmo CPF, ou mesmo nome): nome, CPF e Pix passam a vir da folha;
--     data de início só é preenchida se estiver vazia (ela define o 1º/2º/3º mês da meta: diferença vai para a conferência);
--     desligado na folha → desligado nas Comissões (mesma regra do botão Desligar: vínculo de desligamento no dia seguinte e
--     responsabilidade de unidade encerrada na data).
--   • Colaborador do Comercial que não está nas Comissões → entra como "pendente de cargo": sem vínculo e sem "Nomes no Flow"
--     (os pedidos dele seguem como "vendedor não cadastrado" até alguém escolher unidade e cargo no cadastro).
-- Roda sozinho a cada gravação de colaborador na folha (gatilho) e quando a página das Comissões abre (com_sincronizar_folha).
-- Cargo, regra, unidade, salário base, "Nomes no Flow" e isenção da cooperativa continuam só nas Comissões.

create or replace function public.com_chave(t text) returns text language sql immutable as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'));
$$;

create or replace function public.com_agora() returns text language sql stable as $$
  select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- Tipo da chave Pix da folha → tipo das Comissões (cpf, cnpj, email, telefone, aleatoria). Fora disso: null (não copia).
create or replace function public.com_pix_tipo(t text) returns text language sql immutable as $$
  select case public.com_chave(t)
    when 'cpf' then 'cpf' when 'cnpj' then 'cnpj' when 'e-mail' then 'email' when 'email' then 'email'
    when 'telefone' then 'telefone' when 'chave aleatoria' then 'aleatoria' when 'aleatoria' then 'aleatoria' else null end;
$$;

create or replace function public.com_auditar(p_acao text, p_pessoa text, p_para jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.com_docs (colecao, id, data)
  values ('auditoria', 'afolha' || replace(gen_random_uuid()::text, '-', ''),
    jsonb_build_object('em', public.com_agora(), 'autor', 'Folha (sincronização)', 'entidade', 'pessoa', 'entidade_id', p_pessoa,
                       'acao', p_acao, 'de', null, 'para', p_para));
$$;

-- Sincroniza um colaborador da folha. Devolve: fora (não é do Comercial), criado, atualizado, desligado, igual, ignorado.
create or replace function public.com_sync_colab(p_id text, c jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text; v_old jsonb; v_new jsonb; v_campos text[] := '{}';
  v_nome text := nullif(trim(regexp_replace(coalesce(c->>'nome', ''), '\s+', ' ', 'g')), '');
  v_cpf text := nullif(regexp_replace(coalesce(c->>'cpf', ''), '\D', '', 'g'), '');
  v_adm text := case when c->>'admissao' ~ '^\d{4}-\d{2}-\d{2}$' then c->>'admissao' end;
  v_desl text := case when c->>'desligamento' ~ '^\d{4}-\d{2}-\d{2}$' then c->>'desligamento' end;
  v_ptipo text := public.com_pix_tipo(c->>'pixTipo');
  v_pchave text := nullif(trim(coalesce(c->>'pixChave', '')), '');
  v_mot text := nullif(trim(coalesce(c->>'motivoDesligamento', '')), '');
  u record; v_resp jsonb;
begin
  if public.com_chave(c->>'setor') not like '%comercial%' or v_nome is null then return 'fora'; end if;
  if v_cpf is not null and length(v_cpf) <> 11 then v_cpf := null; end if;
  if v_ptipo in ('cpf', 'cnpj', 'telefone') then v_pchave := nullif(regexp_replace(coalesce(v_pchave, ''), '\D', '', 'g'), ''); end if;
  if v_ptipo is null then v_pchave := null; end if;

  select id, data into v_id, v_old from public.com_docs where colecao = 'pessoas' and data->>'colab_id' = p_id limit 1;
  if v_id is null and v_cpf is not null then
    select id, data into v_id, v_old from public.com_docs
     where colecao = 'pessoas' and data->>'cpf' = v_cpf and coalesce(data->>'colab_id', '') = '' limit 1;
  end if;
  if v_id is null then
    select id, data into v_id, v_old from public.com_docs
     where colecao = 'pessoas' and public.com_chave(data->>'nome') = public.com_chave(v_nome) and coalesce(data->>'colab_id', '') = '' limit 1;
  end if;

  if v_id is null then
    if v_desl is not null then return 'ignorado'; end if;   -- já saiu da empresa: não cria
    v_id := 'p-folha-' || regexp_replace(p_id, '[^A-Za-z0-9_-]', '', 'g');
    insert into public.com_docs (colecao, id, data) values ('pessoas', v_id, jsonb_build_object(
      'nome', v_nome, 'cpf', v_cpf, 'email', null, 'telefone', null, 'pix_tipo', case when v_pchave is null then null else v_ptipo end, 'pix_chave', v_pchave,
      'supervisor', false, 'isento_cooperativa', false, 'vendedor', true, 'data_inicio', v_adm, 'nomes_flow', '[]'::jsonb,
      'observacoes', 'Veio da folha (setor Comercial) em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
                     || '. Pendente de cargo: escolha a unidade e o cargo para entrar na apuração.',
      'salario_base', null, 'ativo', true, 'desligado_em', null, 'motivo_desligamento', null, 'vinculos', '[]'::jsonb,
      'colab_id', p_id, 'criado_em', public.com_agora(), 'atualizado_em', public.com_agora()))
    on conflict (colecao, id) do nothing;
    if found then perform public.com_auditar('criar', v_id, jsonb_build_object('origem', 'folha', 'pendente_cargo', true)); end if;
    return 'criado';
  end if;

  v_new := v_old || jsonb_build_object('colab_id', p_id);
  if v_old->>'nome' is distinct from v_nome then v_new := v_new || jsonb_build_object('nome', v_nome); v_campos := array_append(v_campos, 'nome'); end if;
  if v_cpf is not null and v_old->>'cpf' is distinct from v_cpf then v_new := v_new || jsonb_build_object('cpf', v_cpf); v_campos := array_append(v_campos, 'cpf'); end if;
  if v_pchave is not null and (v_old->>'pix_chave' is distinct from v_pchave or v_old->>'pix_tipo' is distinct from v_ptipo) then
    v_new := v_new || jsonb_build_object('pix_tipo', v_ptipo, 'pix_chave', v_pchave); v_campos := array_append(v_campos, 'pix');
  end if;
  if v_adm is not null and coalesce(v_old->>'data_inicio', '') = '' then
    v_new := v_new || jsonb_build_object('data_inicio', v_adm); v_campos := array_append(v_campos, 'data_inicio');
  end if;

  if v_desl is not null and coalesce((v_old->>'ativo')::boolean, true) then
    -- Mesma regra do "Desligar" da plataforma.
    v_new := jsonb_set(v_new, '{vinculos}', coalesce(v_new->'vinculos', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', 'vfolha' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'unidade_id', null, 'cargo_id', null,
      'inicio', to_char(v_desl::date + 1, 'YYYY-MM-DD'), 'desligamento', true, 'motivo', v_mot)));
    v_new := v_new || jsonb_build_object('ativo', false, 'desligado_em', v_desl, 'motivo_desligamento', v_mot);
    for u in select id, data from public.com_docs where colecao = 'unidades'
               and exists (select 1 from jsonb_array_elements(coalesce(data->'responsaveis', '[]'::jsonb)) r
                            where r->>'pessoa_id' = v_id and coalesce(r->>'fim', '') = '') loop
      select coalesce(jsonb_agg(case when r->>'pessoa_id' = v_id and coalesce(r->>'fim', '') = '' then r || jsonb_build_object('fim', v_desl) else r end), '[]'::jsonb)
        into v_resp
        from jsonb_array_elements(u.data->'responsaveis') r
       where not (r->>'pessoa_id' = v_id and coalesce(r->>'fim', '') = '' and r->>'inicio' > v_desl);
      update public.com_docs set data = jsonb_set(data, '{responsaveis}', v_resp) where colecao = 'unidades' and id = u.id;
    end loop;
    v_new := v_new || jsonb_build_object('atualizado_em', public.com_agora());
    update public.com_docs set data = v_new where colecao = 'pessoas' and id = v_id;
    perform public.com_auditar('desligar', v_id, jsonb_build_object('origem', 'folha', 'data', v_desl, 'motivo', v_mot));
    return 'desligado';
  end if;

  if v_new = v_old then return 'igual'; end if;
  v_new := v_new || jsonb_build_object('atualizado_em', public.com_agora());
  update public.com_docs set data = v_new where colecao = 'pessoas' and id = v_id;
  if array_length(v_campos, 1) > 0 then
    perform public.com_auditar('alterar', v_id, jsonb_build_object('origem', 'folha', 'campos', to_jsonb(v_campos)));
  end if;
  return 'atualizado';
end $$;
revoke all on function public.com_sync_colab(text, jsonb) from public, anon, authenticated;

-- Gatilho: cada gravação de colaborador na folha atualiza as Comissões. Um erro aqui nunca impede a gravação da folha.
create or replace function public.com_folha_gatilho() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.colecao = 'colab' then
    begin
      perform public.com_sync_colab(new.id, new.data);
    exception when others then
      raise warning 'Comissões: não sincronizou o colaborador % (%)', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists com_folha on public.plat_docs;
create trigger com_folha after insert or update of data on public.plat_docs
  for each row when (new.colecao = 'colab') execute function public.com_folha_gatilho();

-- Passa a folha inteira (a página das Comissões chama ao abrir; a importação chama no fim).
create or replace function public.com_sincronizar_folha() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v text; res jsonb := '{}'::jsonb;
begin
  if auth.uid() is not null and not public.com_pode() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  for r in select id, data from public.plat_docs where colecao = 'colab' order by coalesce(data->>'desligamento', '') desc, id loop
    v := public.com_sync_colab(r.id, r.data);
    res := res || jsonb_build_object(v, coalesce((res->>v)::int, 0) + 1);
  end loop;
  return res;
end $$;
revoke all on function public.com_sincronizar_folha() from public, anon;
grant execute on function public.com_sincronizar_folha() to authenticated;

-- Conferência para a tela /comissoes/folha (sem CPF nem Pix).
create or replace function public.com_conferencia_folha() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.com_pode() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  with pes as (
    select id, data from public.com_docs where colecao = 'pessoas'
  ), col as (
    select id, data from public.plat_docs where colecao = 'colab'
  ), lig as (
    select p.id, p.data p, c.data c from pes p join col c on c.id = p.data->>'colab_id'
  )
  select jsonb_build_object(
    'pendentes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', p->>'nome', 'unidade_folha', c->>'unidade', 'admissao', c->>'admissao') order by p->>'nome')
                   from lig where coalesce((p->>'ativo')::boolean, true)
                     and not exists (select 1 from jsonb_array_elements(coalesce(p->'vinculos', '[]'::jsonb)) x where coalesce(x->>'cargo_id', '') <> '')), '[]'),
    'admissao', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', p->>'nome', 'comissoes', p->>'data_inicio', 'folha', c->>'admissao') order by p->>'nome')
                   from lig where coalesce((p->>'ativo')::boolean, true) and c->>'admissao' ~ '^\d{4}-\d{2}-\d{2}$'
                     and coalesce(p->>'data_inicio', '') <> c->>'admissao'), '[]'),
    'fora_do_comercial', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', p->>'nome', 'setor', c->>'setor') order by p->>'nome')
                   from lig where coalesce((p->>'ativo')::boolean, true) and public.com_chave(c->>'setor') not like '%comercial%'), '[]'),
    'sem_folha', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', data->>'nome') order by data->>'nome')
                   from pes where coalesce((data->>'ativo')::boolean, true) and coalesce(data->>'colab_id', '') = ''), '[]'),
    'vinculados', (select count(*) from lig where coalesce((p->>'ativo')::boolean, true)),
    'comercial_folha', (select count(*) from col where public.com_chave(data->>'setor') like '%comercial%' and coalesce(data->>'desligamento', '') = '')
  ) into v;
  return v;
end $$;
revoke all on function public.com_conferencia_folha() from public, anon;
grant execute on function public.com_conferencia_folha() to authenticated;

-- "Usar a admissão da folha" como data de início (decisão da equipe, porque muda o 1º/2º/3º mês da meta).
create or replace function public.com_usar_admissao_folha(p_pessoa text) returns text
language plpgsql security definer set search_path = public as $$
declare v_adm text; v_ant text;
begin
  if not public.com_pode() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select c.data->>'admissao', p.data->>'data_inicio' into v_adm, v_ant
    from public.com_docs p join public.plat_docs c on c.colecao = 'colab' and c.id = p.data->>'colab_id'
   where p.colecao = 'pessoas' and p.id = p_pessoa;
  if v_adm is null or v_adm !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A folha não tem data de admissão para esta pessoa.'; end if;
  update public.com_docs set data = data || jsonb_build_object('data_inicio', v_adm, 'atualizado_em', public.com_agora())
   where colecao = 'pessoas' and id = p_pessoa;
  insert into public.com_docs (colecao, id, data)
  values ('auditoria', 'afolha' || replace(gen_random_uuid()::text, '-', ''),
    jsonb_build_object('em', public.com_agora(), 'autor', 'u_' || auth.uid(), 'entidade', 'pessoa', 'entidade_id', p_pessoa,
                       'acao', 'alterar', 'de', jsonb_build_object('data_inicio', v_ant), 'para', jsonb_build_object('data_inicio', v_adm, 'origem', 'admissão da folha')));
  return v_adm;
end $$;
revoke all on function public.com_usar_admissao_folha(text) from public, anon;
grant execute on function public.com_usar_admissao_folha(text) to authenticated;
