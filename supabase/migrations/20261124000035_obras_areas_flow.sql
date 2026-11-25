-- Central de Obras: áreas separadas (Logística e Obras), tags, previsão original × atual e obras vindas do Flow (24/11/2026).
-- * Cada pessoa do perfil "obras" tem uma área (perfis.area_obras): Letícia = obras, Adalto = logística.
--   Todos veem tudo. Logística edita entrega/material e dados do cliente; Obras edita tudo isso e mais a instalação
--   (equipe, início/fim previsto, início/fim realizado). A regra fica no gatilho, vale para qualquer caminho de gravação.
-- * Tags livres por obra (retrofit, híbrido…): qualquer perfil ativo marca (obra_salvar_tags).
-- * Previsões mudam sem precisar de motivo (o motivo vira opcional); a primeira previsão de entrega e de instalação fica
--   guardada (baseline_material, baseline_inicio/fim) para o relatório previsto × realizado.
-- * Obra nova entra sozinha quando o pedido de venda do Flow fica "Aprovado" ou "Faturado" (obra_importar_flow, chamada no
--   fim de cada sincronização do Flow). Os dados do Flow se atualizam enquanto ninguém mexe no campo na Central.

-- ------------------------------------------------------------------- área
alter table public.perfis add column if not exists area_obras text check (area_obras in ('obras', 'logistica'));
update public.perfis set area_obras = 'obras' where papel::text = 'obras' and area_obras is null;

create or replace function public.obra_area()
returns text language sql stable security definer set search_path = public as $$
  select case when papel::text = 'obras' then coalesce(area_obras, 'obras') end
    from public.perfis where id = auth.uid() and ativo;
$$;
grant execute on function public.obra_area() to authenticated;

-- ----------------------------------------------------------- colunas novas
alter table public.pedidos_venda add column if not exists itens jsonb;  -- [{descricao, quantidade, total}] (sincronização)

alter table public.obra_obras
  add column if not exists tags                 text[] not null default '{}',
  add column if not exists baseline_material    date,              -- 1ª previsão de entrega (nunca muda)
  add column if not exists telefone             text,
  add column if not exists flow_situacao        text,              -- situação do pedido no Flow (Aprovado, Faturado, Em digitação…)
  add column if not exists os_flow              text,
  add column if not exists os_status            text,              -- status da OS no Flow (só leitura)
  add column if not exists os_coordenador       text,
  add column if not exists flow_info            text,              -- "complemento" da OS (informações do projeto)
  add column if not exists flow_valores         jsonb not null default '{}'::jsonb,  -- último valor do Flow de cada campo
  add column if not exists flow_editado         text[] not null default '{}',        -- campos que alguém mudou na Central
  add column if not exists flow_sincronizado_em timestamptz,
  add column if not exists codigo_provisorio    boolean not null default false;      -- pedido sem código de projeto no padrão

-- 1ª previsão de entrega das obras que já existem: o primeiro valor do histórico, senão a previsão atual.
update public.obra_obras o
   set baseline_material = coalesce(
         (select coalesce(h.de, h.para)::date from public.obra_historico h
           where h.obra = o.codigo and h.campo = 'material_previsto' order by h.em, h.id limit 1),
         o.material_previsto)
 where baseline_material is null;

insert into public.obra_config (chave, valor) values ('flow_desde', '"2026-11-01"'::jsonb) on conflict (chave) do nothing;

-- ---------------------------------------------------------------- gatilhos
create or replace function public.obra_antes_de_gravar() returns trigger
language plpgsql set search_path = public as $$
declare
  a text := public.obra_area();
  c text;
  campos_flow text[] := array['nome_card','cliente','cpf_cnpj','endereco','cep','cidade','telefone','email_cliente','kwp',
                              'equipamentos','valor','financiamento'];
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if new.filial is null and substr(new.codigo, 1, 2) in (select sigla from public.obra_filiais) then
    new.filial := substr(new.codigo, 1, 2);
  end if;
  if tg_op = 'INSERT' then
    if new.inicio_previsto is not null and new.baseline_inicio is null then
      new.baseline_inicio := new.inicio_previsto;
      new.baseline_fim    := coalesce(new.fim_previsto, new.inicio_previsto);
    end if;
    if new.material_previsto is not null and new.baseline_material is null then
      new.baseline_material := new.material_previsto;
    end if;
    return new;
  end if;

  -- previsão original (instalação e entrega): gravada uma vez, nunca alterada
  if new.inicio_previsto is not null and old.inicio_previsto is null and old.baseline_inicio is null then
    new.baseline_inicio := new.inicio_previsto;
    new.baseline_fim    := coalesce(new.fim_previsto, new.inicio_previsto);
  else
    new.baseline_inicio := old.baseline_inicio;
    new.baseline_fim    := old.baseline_fim;
  end if;
  if old.baseline_material is null and new.material_previsto is not null then
    new.baseline_material := coalesce(old.material_previsto, new.material_previsto);
  else
    new.baseline_material := old.baseline_material;
  end if;

  -- logística não mexe na instalação
  if a = 'logistica' and (new.equipe_id is distinct from old.equipe_id or new.inicio_previsto is distinct from old.inicio_previsto
       or new.fim_previsto is distinct from old.fim_previsto or new.inicio_real is distinct from old.inicio_real
       or new.fim_real is distinct from old.fim_real) then
    raise exception 'Seu perfil (logística) não edita a instalação da obra.' using errcode = '42501';
  end if;

  -- campo do Flow mudado por uma pessoa: daqui em diante vale o da Central
  if auth.uid() is not null then
    foreach c in array campos_flow loop
      if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c and not (c = any (new.flow_editado)) then
        new.flow_editado := new.flow_editado || c;
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.obra_registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c text;
  m text := nullif(current_setting('app.motivo', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.obra_historico (obra, campo, para, usuario) values (new.codigo, 'criada', new.origem, auth.uid());
    return new;
  end if;
  foreach c in array array['entrada','material_previsto','material_entregue','inicio_previsto','fim_previsto','inicio_real',
                           'fim_real','equipe_id','contrato_nome','nome_card','pagamento_na','tags','codigo'] loop
    if to_jsonb(old) ->> c is distinct from to_jsonb(new) ->> c then
      insert into public.obra_historico (obra, campo, de, para, motivo, usuario)
      values (new.codigo, c,
              case when c = 'tags' then array_to_string(old.tags, ', ') else to_jsonb(old) ->> c end,
              case when c = 'tags' then array_to_string(new.tags, ', ') else to_jsonb(new) ->> c end,
              case when c in ('inicio_previsto','fim_previsto','material_previsto') then m end, auth.uid());
    end if;
  end loop;
  return new;
end $$;

-- Gravar campos de uma obra (a tela manda só o que mudou; o motivo da mudança de data é opcional).
create or replace function public.obra_salvar(p_codigo text, p_patch jsonb, p_motivo text default null)
returns void language plpgsql set search_path = public as $$
declare
  editaveis text[] := array['nome_card','nome_contrato','cliente','filial','cidade','zona','kwp','modulos','estrutura','envio',
    'cpf_cnpj','endereco','cep','email_cliente','telefone','geracao_kwh','equipamentos','valor','forma_pagamento','financiamento',
    'assinado_em','pagamento_na','pedido_flow','entrada','material_previsto','material_entregue','kit_comprado','equipe_id',
    'inicio_previsto','fim_previsto','inicio_real','fim_real','observacoes','topicos','topicos_extra','fora_indicadores',
    'contrato_path','contrato_nome'];
  sets text;
begin
  if not public.obra_pode_editar() then raise exception 'Seu perfil só pode consultar o cronograma.' using errcode = '42501'; end if;
  select string_agg(format('%I = (jsonb_populate_record(null::public.obra_obras, $1)).%I', k, k), ', ')
    into sets from jsonb_object_keys(p_patch) k where k = any (editaveis);
  if sets is null then return; end if;
  perform set_config('app.motivo', left(coalesce(p_motivo, ''), 200), true);
  execute format('update public.obra_obras set %s where codigo = $2', sets) using p_patch, p_codigo;
  if not found then raise exception 'Obra % não encontrada.', p_codigo; end if;
end $$;

-- Tags: qualquer perfil ativo marca (até 15 tags de até 30 letras).
create or replace function public.obra_salvar_tags(p_codigo text, p_tags text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare limpas text[];
begin
  if not public.eh_obras() then raise exception 'Sem acesso à Central de Obras.' using errcode = '42501'; end if;
  select coalesce(array_agg(t order by t), '{}') into limpas
    from (select distinct left(btrim(regexp_replace(x, '\s+', ' ', 'g')), 30) t from unnest(coalesce(p_tags, '{}')) x) s
   where t <> '';
  if cardinality(limpas) > 15 then raise exception 'No máximo 15 tags por obra.' using errcode = '22023'; end if;
  update public.obra_obras set tags = limpas where codigo = p_codigo and tags is distinct from limpas;
  if not found and not exists (select 1 from public.obra_obras where codigo = p_codigo) then
    raise exception 'Obra % não encontrada.', p_codigo;
  end if;
  return limpas;
end $$;
grant execute on function public.obra_salvar_tags(text, text[]) to authenticated;

-- ------------------------------------------------------------------- acesso
-- Equipes de instalação: só a área de obras grava. Obras: só a área de obras exclui.
drop policy if exists "obras grava" on public.obra_equipes;
create policy "obras grava" on public.obra_equipes for all to authenticated
  using ((select public.obra_area()) = 'obras') with check ((select public.obra_area()) = 'obras');
drop policy if exists "obras grava" on public.obra_obras;
drop policy if exists "obras cria" on public.obra_obras;
drop policy if exists "obras altera" on public.obra_obras;
drop policy if exists "obras exclui" on public.obra_obras;
create policy "obras cria" on public.obra_obras for insert to authenticated with check ((select public.obra_pode_editar()));
create policy "obras altera" on public.obra_obras for update to authenticated
  using ((select public.obra_pode_editar())) with check ((select public.obra_pode_editar()));
create policy "obras exclui" on public.obra_obras for delete to authenticated using ((select public.obra_area()) = 'obras');

-- ------------------------------------------------------ obras vindas do Flow
-- Lê a cópia do Flow que a sincronização já fez (pedidos_venda, ordens_servico, clientes_flow): não chama o Flow.
-- Pedido "Aprovado"/"Faturado" aprovado desde obra_config.flow_desde, sem obra e com OS que não está concluída nem
-- cancelada → obra nova (origem flow). Código = código do projeto do Flow; fora do padrão (ex.: "Adilson") ou já usado
-- por outra obra → código provisório PV-<pedido> até corrigirem no Flow. Obra ligada → atualiza situação/OS e os campos
-- do Flow: obra do Flow troca o campo enquanto ninguém mexeu nele na Central; obra antiga (planilha/contrato) só preenche vazios.
create or replace function public.obra_importar_flow()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  desde date := coalesce((select (valor #>> '{}')::date from public.obra_config where chave = 'flow_desde'), date '2026-11-01');
  r record;
  o public.obra_obras;
  v jsonb; fl jsonb; patch jsonb; k text; sets text;
  cod text; situ text; ap text; kw text; entrada date;
  criadas int := 0; ligadas int := 0; atualizadas int := 0; renomeadas int := 0;
begin
  for r in
    select p.flow_id, p.codigo_projeto, p.bruto b, p.itens, p.valor_total,
           os.flow_id as os_id, os.status as os_status, os.bruto as osb,
           c.bruto as cb, c.telefone as ctel, c.email as cemail
      from public.pedidos_venda p
      left join lateral (select * from public.ordens_servico x where x.pedido_flow_id = p.flow_id
                          order by (x.bruto ? 'id') desc, x.sincronizado_em desc limit 1) os on true
      left join public.clientes_flow c on c.flow_id = p.bruto -> 'cliente' ->> 'id'
     where p.flow_id ~ '^\d+$'
  loop
    situ := r.b ->> 'situacao';
    ap := coalesce(r.cb ->> 'apelido', r.b -> 'cliente' ->> 'apelido');
    kw := replace((regexp_match(coalesce(ap, ''), '\(\s*([0-9]+(?:[.,][0-9]+)?)\s*kwp', 'i'))[1], ',', '.');
    v := jsonb_strip_nulls(jsonb_build_object(
      'nome_card',     ap,
      'cliente',       upper(coalesce(r.cb ->> 'nomeRazaoSocial', r.b -> 'cliente' ->> 'nomeRazaoSocial')),
      'cpf_cnpj',      coalesce(r.cb ->> 'cnpjCpf', r.b -> 'cliente' ->> 'cnpjCpf'),
      'endereco',      nullif(concat_ws(', ',
                         coalesce(r.cb ->> 'enderecoEntrega', r.cb ->> 'enderecoAdministrativo'),
                         coalesce(r.cb ->> 'numeroEnderecoEntrega', r.cb ->> 'numeroEnderecoAdministrativo'),
                         coalesce(r.cb ->> 'bairroEnderecoEntrega', r.cb ->> 'bairroEnderecoAdministrativo')), ''),
      'cep',           coalesce(r.cb ->> 'cepEnderecoEntrega', r.cb ->> 'cepEnderecoAdministrativo'),
      'cidade',        coalesce(r.cb -> 'cidadeEnderecoEntrega' ->> 'nomeCidade', r.cb ->> 'cidadeNomeEnderecoAdministrativo',
                                nullif(split_part(coalesce(r.osb ->> 'clienteCidadeEnderecoAdministrativo', ''), ' - ', 1), '')),
      'telefone',      r.ctel,
      'email_cliente', coalesce(r.cemail, r.cb ->> 'email'),
      'kwp',           case when kw ~ '^[0-9]+(\.[0-9]+)?$' and kw::numeric > 0 then kw::numeric end,
      'valor',         case when r.valor_total > 0 then r.valor_total end,
      'equipamentos',  case when jsonb_typeof(r.itens) = 'array' and jsonb_array_length(r.itens) > 0 then
                         (select jsonb_agg(jsonb_build_object('produto', i ->> 'descricao', 'quantidade', (i ->> 'quantidade')::numeric))
                            from jsonb_array_elements(r.itens) i where i ->> 'descricao' is not null) end,
      'financiamento', case when jsonb_typeof(r.b -> 'camposAdicionais' -> 'Tipo de Financiamento') = 'array'
                             and jsonb_array_length(r.b -> 'camposAdicionais' -> 'Tipo de Financiamento') > 0 then true end));
    fl := jsonb_build_object(
      'flow_situacao', situ, 'os_flow', r.os_id, 'os_status', r.os_status,
      'os_coordenador', r.osb -> 'coordenador' ->> 'nome', 'flow_info', nullif(btrim(coalesce(r.osb ->> 'complemento', '')), ''),
      'pedido_flow', r.flow_id, 'flow_valores', v);

    select * into o from public.obra_obras where id_cab_pedido_venda = r.flow_id::bigint;
    if not found and r.codigo_projeto ~ '^[A-Z]{2}[0-9]{6}[A-Z]{3}$' then
      select * into o from public.obra_obras where codigo = r.codigo_projeto and id_cab_pedido_venda is null;
      if found then
        update public.obra_obras set id_cab_pedido_venda = r.flow_id::bigint where codigo = o.codigo;
        ligadas := ligadas + 1;
      end if;
    end if;

    if o.codigo is null then
      -- obra nova
      entrada := coalesce(left(r.b ->> 'dataAprovacao', 10), left(r.b ->> 'dataEmissao', 10))::date;
      continue when situ not in ('Aprovado', 'Faturado') or entrada is null or entrada < desde
                 or coalesce(r.os_status, '') in ('Obra concluída.', 'Cancelado');
      cod := case when r.codigo_projeto ~ '^[A-Z]{2}[0-9]{6}[A-Z]{3}$'
                   and not exists (select 1 from public.obra_obras where codigo = r.codigo_projeto)
                  then r.codigo_projeto else 'PV-' || r.flow_id end;
      continue when exists (select 1 from public.obra_obras where codigo = cod);
      insert into public.obra_obras (codigo, codigo_provisorio, origem, entrada, id_cab_pedido_venda, pedido_flow, cliente,
             nome_card, cpf_cnpj, endereco, cep, cidade, telefone, email_cliente, kwp, valor, equipamentos, financiamento,
             flow_situacao, os_flow, os_status, os_coordenador, flow_info, flow_valores, flow_sincronizado_em)
      values (cod, cod like 'PV-%', 'flow', greatest(entrada, date '2024-01-01'), r.flow_id::bigint, r.flow_id,
             coalesce(v ->> 'cliente', 'SEM NOME NO FLOW'), v ->> 'nome_card', v ->> 'cpf_cnpj', v ->> 'endereco', v ->> 'cep',
             v ->> 'cidade', v ->> 'telefone', v ->> 'email_cliente', (v ->> 'kwp')::numeric, (v ->> 'valor')::numeric,
             coalesce(v -> 'equipamentos', '[]'::jsonb), (v ->> 'financiamento')::boolean,
             fl ->> 'flow_situacao', fl ->> 'os_flow', fl ->> 'os_status', fl ->> 'os_coordenador', fl ->> 'flow_info', v, now());
      criadas := criadas + 1;
      continue;
    end if;

    -- obra já ligada: campos do Flow
    patch := '{}'::jsonb;
    for k in select jsonb_object_keys(v) loop
      if o.origem = 'flow' then
        if not (k = any (o.flow_editado)) and to_jsonb(o) -> k is distinct from v -> k then patch := patch || jsonb_build_object(k, v -> k); end if;
      elsif to_jsonb(o) -> k is null or to_jsonb(o) -> k = 'null'::jsonb or to_jsonb(o) -> k = '[]'::jsonb then
        patch := patch || jsonb_build_object(k, v -> k);
      end if;
    end loop;
    for k in select jsonb_object_keys(fl) loop
      if to_jsonb(o) -> k is distinct from fl -> k then patch := patch || jsonb_build_object(k, fl -> k); end if;
    end loop;
    if patch <> '{}'::jsonb then
      patch := patch || jsonb_build_object('flow_sincronizado_em', now());
      select string_agg(format('%I = (jsonb_populate_record(null::public.obra_obras, $1)).%I', x, x), ', ')
        into sets from jsonb_object_keys(patch) x;
      execute format('update public.obra_obras set %s where codigo = $2', sets) using patch, o.codigo;
      atualizadas := atualizadas + 1;
    end if;

    -- código provisório corrigido no Flow
    if o.codigo_provisorio and r.codigo_projeto ~ '^[A-Z]{2}[0-9]{6}[A-Z]{3}$'
       and not exists (select 1 from public.obra_obras where codigo = r.codigo_projeto) then
      update public.obra_obras set codigo = r.codigo_projeto, codigo_provisorio = false where codigo = o.codigo;
      renomeadas := renomeadas + 1;
    end if;
    o := null;
  end loop;
  return jsonb_build_object('criadas', criadas, 'ligadas', ligadas, 'atualizadas', atualizadas, 'codigos_corrigidos', renomeadas);
end $$;
revoke all on function public.obra_importar_flow() from public, anon, authenticated;
grant execute on function public.obra_importar_flow() to service_role;

-- ------------------------------------------------------------------- view
drop view if exists public.obra_v_obras;
create view public.obra_v_obras with (security_invoker = true) as
with m as (
  select coalesce((select (valor->>'meta_dias')::int   from public.obra_config where chave = 'metas'), 30) as meta,
         coalesce((select (valor->>'limite_dias')::int from public.obra_config where chave = 'metas'), 45) as limite
)
select o.*,
  case
    when o.fim_real is not null then 'finalizada'
    when o.inicio_real is not null
      or (o.inicio_previsto is not null and o.inicio_previsto <= (now() at time zone 'America/Sao_Paulo')::date and o.material_entregue is not null) then 'em_instalacao'
    when o.inicio_previsto is not null then 'agendada'
    when o.material_entregue is not null then 'pronta_para_agendar'
    else 'aguardando_material'
  end as status,
  (coalesce(o.fim_real, (now() at time zone 'America/Sao_Paulo')::date) - o.entrada) as dias_em_aberto,
  case when o.baseline_fim is not null
       then coalesce(o.fim_real, greatest((now() at time zone 'America/Sao_Paulo')::date, o.baseline_fim)) - o.baseline_fim end as atraso_dias,
  case
    when (coalesce(o.fim_real, (now() at time zone 'America/Sao_Paulo')::date) - o.entrada) <= (select meta from m)   then 'ok'
    when (coalesce(o.fim_real, (now() at time zone 'America/Sao_Paulo')::date) - o.entrada) <= (select limite from m) then 'atencao'
    else 'critico'
  end as faixa_prazo
from public.obra_obras o;
grant select on public.obra_v_obras to authenticated;
