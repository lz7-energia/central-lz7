-- Central de Obras: pagamento condicionado a uma parte da obra (entrega do material, início da instalação, conclusão).
-- Cada obra pode ter uma ou mais condições (ex.: 30% na entrega, 70% na conclusão). Quem marca: perfil obras, equipe e admin
-- (diretoria só vê). Cada condição avisa uma pessoa da Central Administrativa: vira tarefa no planner dela, na data da etapa,
-- e acompanha a data quando a obra é reprogramada (o site refaz a tarefa: lib/obras-planner.ts).

alter table public.obra_obras add column if not exists pagamentos jsonb not null default '[]'::jsonb;
  -- [{id, etapa: entrega|instalacao|conclusao, valor, obs, avisar (perfil), recebido_em (date)}]

-- quem tinha "pagamento vinculado" passa a ter uma condição (sem pessoa para avisar: escolhe-se na tela)
update public.obra_obras
   set pagamentos = jsonb_build_array(jsonb_build_object('id', 'p1', 'etapa', pagamento_na))
 where pagamento_na is not null and pagamentos = '[]'::jsonb;

create or replace function public.obra_pode_pagamento()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel::text in ('obras', 'equipe', 'admin'));
$$;
grant execute on function public.obra_pode_pagamento() to authenticated;

-- Grava a lista de condições de pagamento de uma obra (substitui a lista inteira).
create or replace function public.obra_salvar_pagamentos(p_codigo text, p_lista jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  limpa jsonb := '[]'::jsonb;
  antes jsonb;
  resumo text;
begin
  if not public.obra_pode_pagamento() then
    raise exception 'Seu perfil só pode consultar o pagamento da obra.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lista) is distinct from 'array' or jsonb_array_length(p_lista) > 10 then
    raise exception 'Lista de pagamentos inválida.' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_lista) loop
    if coalesce(p->>'etapa', '') not in ('entrega', 'instalacao', 'conclusao') then
      raise exception 'Escolha a parte da obra de cada pagamento.' using errcode = '22023';
    end if;
    if nullif(p->>'avisar', '') is not null and not exists (
         select 1 from public.perfis where id::text = p->>'avisar' and ativo and papel::text <> 'obras') then
      raise exception 'A pessoa avisada precisa ser da Central Administrativa.' using errcode = '22023';
    end if;
    if nullif(p->>'recebido_em', '') is not null and (p->>'recebido_em') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data de recebimento inválida.' using errcode = '22023';
    end if;
    limpa := limpa || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',          coalesce(nullif(left(p->>'id', 20), ''), substr(md5(random()::text), 1, 8)),
      'etapa',       p->>'etapa',
      'valor',       case when (p->>'valor') ~ '^\d+(\.\d+)?$' then round((p->>'valor')::numeric, 2) end,
      'obs',         nullif(left(btrim(coalesce(p->>'obs', '')), 300), ''),
      'avisar',      nullif(p->>'avisar', ''),
      'recebido_em', nullif(p->>'recebido_em', ''))));
  end loop;

  select pagamentos into antes from public.obra_obras where codigo = p_codigo for update;
  if not found then raise exception 'Obra % não encontrada.', p_codigo; end if;
  if antes = limpa then return; end if;

  update public.obra_obras set pagamentos = limpa where codigo = p_codigo;  -- pagamento_na fica só como registro antigo

  select string_agg(case x->>'etapa' when 'entrega' then 'na entrega' when 'instalacao' then 'no início da instalação'
                      else 'na conclusão' end
                    || coalesce(' R$ ' || (x->>'valor'), '')
                    || case when x ? 'recebido_em' then ' (recebido)' else '' end, '; ')
    into resumo from jsonb_array_elements(limpa) x;
  insert into public.obra_historico (obra, campo, para, usuario)
  values (p_codigo, 'pagamentos', coalesce(resumo, 'sem condição'), auth.uid());
end $$;
grant execute on function public.obra_salvar_pagamentos(text, jsonb) to authenticated;

-- a view lista o.*: recriar para incluir a coluna nova (mesma definição da migração 28)
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
