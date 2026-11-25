-- Central de Obras: obra manual de volta (24/11/2026, pedido do usuário: "se a API não puxar, para garantir").
-- A tela volta a ter "+ Obra manual" (perfil obras). Se o pedido aparecer depois no Flow com o mesmo código, obra_importar_flow
-- liga pelo código e só completa o que estiver vazio. Aqui: a logística também não cria obra já com a instalação marcada.

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
    if a = 'logistica' and (new.equipe_id is not null or new.inicio_previsto is not null or new.fim_previsto is not null
         or new.inicio_real is not null or new.fim_real is not null) then
      raise exception 'Seu perfil (logística) não edita a instalação da obra.' using errcode = '42501';
    end if;
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

