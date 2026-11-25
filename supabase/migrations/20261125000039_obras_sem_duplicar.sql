-- Central de Obras: não duplicar obra quando o mesmo projeto tem mais de um pedido no Flow (25/11/2026, relato da equipe de obras).
-- Antes: o 2º pedido do mesmo código de projeto (ex.: produtos e serviços, aditivo) virava uma obra "PV-<pedido>". Agora a importação
-- lê do pedido mais antigo para o mais novo e pula pedido cujo código de projeto já tem obra (pelo código da obra ou pelo pedido ligado) e pedido cuja OS já está numa obra.
-- As duplicadas que já existem saem por um SQL à parte, conferido antes (supabase/limpar-obras-duplicadas.sql).

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
     order by p.flow_id::bigint  -- o 1º pedido do projeto vira a obra; os seguintes só ligam
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
      -- mesmo projeto, outro pedido (produtos × serviços, aditivo): a obra já existe, não cria outra (25/11/2026)
      continue when nullif(btrim(r.codigo_projeto), '') is not null and (
                   exists (select 1 from public.obra_obras x where upper(x.codigo) = upper(btrim(r.codigo_projeto)))
                   or exists (select 1 from public.obra_obras x join public.pedidos_venda p2 on p2.flow_id = x.id_cab_pedido_venda::text
                               where upper(btrim(p2.codigo_projeto)) = upper(btrim(r.codigo_projeto))));
      -- mesma OS já ligada a uma obra
      continue when r.os_id is not null and exists (select 1 from public.obra_obras x where x.os_flow = r.os_id);
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
