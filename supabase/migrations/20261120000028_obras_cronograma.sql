-- Central de Obras — Cronograma de instalação (20/11/2026).
-- Base: schema.sql do briefing "Cronograma de Obras LZ7" (baseline protegida, motivo obrigatório na reprogramação, histórico por
-- gatilho, status/atraso/prazo calculados na view). Adaptado para o banco da Central: prefixo obra_, perfis da Central
-- (só o perfil "obras" edita; todo perfil ativo vê), obra entra pelo contrato (nome do contrato, nome do card, dados do contrato)
-- e tópicos configuráveis. As obras da planilha entram por um arquivo à parte (dados de cliente não vão para o repositório).

-- ------------------------------------------------------------------ acesso
create or replace function public.obra_pode_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel::text = 'obras');
$$;
grant execute on function public.obra_pode_editar() to authenticated;

-- --------------------------------------------------------------- cadastros
create table if not exists public.obra_filiais (
  sigla text primary key check (sigla ~ '^[A-Z]{2}$'),
  nome  text not null
);
create table if not exists public.obra_estruturas (
  nome  text primary key,
  ativa boolean not null default true,
  ordem int not null default 0
);
create table if not exists public.obra_equipes (
  id             text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  nome           text not null,
  base           text,
  filial         text references public.obra_filiais (sigla),
  membros        text,                -- quem é da equipe (texto livre)
  matiz          int  not null default 210 check (matiz between 0 and 359),
  capacidade_dia int  not null default 1 check (capacidade_dia between 1 and 9),
  ativa          boolean not null default true
);
create table if not exists public.obra_config (
  chave text primary key,
  valor jsonb not null
);
-- Tópicos que a equipe cria (aparecem em todas as obras). Valores ficam em obra_obras.topicos ({id: valor}).
create table if not exists public.obra_topicos (
  id         text primary key default substr(md5(random()::text), 1, 10),
  nome       text not null,
  tipo       text not null default 'simnao' check (tipo in ('simnao','texto','numero','data','lista')),
  opcoes     text[] not null default '{}',
  importante boolean not null default false,
  ordem      int not null default 0,
  ativo      boolean not null default true
);

insert into public.obra_filiais (sigla, nome) values ('WB','Wenceslau Braz'), ('LD','Londrina'), ('PG','Ponta Grossa')
on conflict do nothing;
insert into public.obra_estruturas (nome, ordem) values
  ('Colonial',1),('Fibromadeira',2),('Fibrometal',3),('Fibrocimento',4),('Metálico',5),('Solo',6),('Carport',7),('Kalhetão',8),('Laje',9)
on conflict do nothing;
insert into public.obra_config (chave, valor) values
  ('metas', '{"meta_dias": 30, "limite_dias": 45, "folga_dias": 1}'::jsonb),
  ('motivos_reprogramacao', '["Chuva","Material atrasou","Cliente pediu","Equipe indisponível","Obra anterior atrasou","Outro"]'::jsonb)
on conflict (chave) do nothing;
insert into public.obra_topicos (id, nome, tipo, importante, ordem) values
  ('beneficiaria', 'Tem unidade beneficiária?', 'simnao', true, 1)
on conflict do nothing;

-- ------------------------------------------------------------------- obras
create table if not exists public.obra_obras (
  codigo            text primary key check (codigo ~ '^[A-Z0-9][A-Z0-9-]{3,30}$'),  -- WB260500COL (obrigatório)
  nome_card         text,             -- nome que aparece no cronograma (editável)
  nome_contrato     text,             -- ex.: "1114" (nome do arquivo do contrato)
  cliente           text not null,
  filial            text references public.obra_filiais (sigla),
  cidade            text,
  zona              text check (zona in ('Urbano','Rural')),
  kwp               numeric(8,2) check (kwp > 0),
  modulos           int check (modulos > 0),
  estrutura         text references public.obra_estruturas (nome) on update cascade,
  envio             text check (envio in ('Estoque','Distribuidora')),

  -- dados do contrato
  cpf_cnpj          text,
  endereco          text,
  cep               text,
  email_cliente     text,
  geracao_kwh       numeric(10,2),
  equipamentos      jsonb not null default '[]'::jsonb,   -- [{produto, quantidade}]
  valor             numeric(12,2),
  forma_pagamento   text,
  financiamento     boolean,
  assinado_em       date,
  pagamento_na      text check (pagamento_na in ('entrega','instalacao')),  -- pagamento vinculado (avisa o Financeiro)

  -- vínculo com o Flow (fase seguinte)
  pedido_flow         text,
  id_cab_pedido_venda bigint unique,

  -- linha do tempo
  entrada           date not null,
  material_previsto date,
  material_entregue date,
  kit_comprado      boolean not null default false,
  equipe_id         text references public.obra_equipes (id) on update cascade,
  inicio_previsto   date,
  fim_previsto      date,
  baseline_inicio   date,             -- programação original: gravada no 1º agendamento e nunca mais alterada
  baseline_fim      date,
  inicio_real       date,
  fim_real          date,

  observacoes       text,
  topicos           jsonb not null default '{}'::jsonb,   -- {id_do_topico: valor}
  topicos_extra     jsonb not null default '[]'::jsonb,   -- [{id, nome, valor, importante}] só desta obra
  fora_indicadores  boolean not null default false,       -- ex.: PE-54-2024 (licitação)
  contrato_path     text,             -- bucket privado obra-contratos
  contrato_nome     text,
  origem            text not null default 'manual' check (origem in ('manual','contrato','flow','planilha')),

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid references auth.users (id),

  constraint obra_fim_previsto_coerente   check (fim_previsto is null or inicio_previsto is null or fim_previsto >= inicio_previsto),
  constraint obra_baseline_coerente       check (baseline_fim is null or baseline_inicio is null or baseline_fim >= baseline_inicio),
  constraint obra_fim_real_coerente       check (fim_real is null or inicio_real is null or fim_real >= inicio_real),
  constraint obra_material_apos_entrada   check (material_entregue is null or material_entregue >= entrada),
  constraint obra_fim_apos_entrada        check (fim_real is null or fim_real >= entrada),
  constraint obra_finalizada_tem_material check (fim_real is null or material_entregue is not null),
  constraint obra_agenda_completa         check (inicio_previsto is null or equipe_id is not null),
  constraint obra_datas_no_intervalo      check (entrada between '2024-01-01' and '2030-12-31'
                                                 and coalesce(inicio_previsto, entrada) <= '2030-12-31')
);
create index if not exists obra_obras_inicio_idx  on public.obra_obras (inicio_previsto) where fim_real is null;
create index if not exists obra_obras_equipe_idx  on public.obra_obras (equipe_id, inicio_previsto);
create index if not exists obra_obras_fim_idx     on public.obra_obras (fim_real);
create index if not exists obra_obras_entrada_idx on public.obra_obras (entrada);

-- --------------------------------------------------------------- histórico
create table if not exists public.obra_historico (
  id      bigserial primary key,
  obra    text not null references public.obra_obras (codigo) on update cascade on delete cascade,
  campo   text not null,
  de      text,
  para    text,
  motivo  text,
  usuario uuid references auth.users (id),
  em      timestamptz not null default now()
);
create index if not exists obra_historico_obra_idx on public.obra_historico (obra, em desc);

-- ------------------------------------------------------- regras automáticas
-- Grava a baseline no primeiro agendamento e a protege; exige motivo quando a obra já agendada tem a data mexida.
create or replace function public.obra_antes_de_gravar() returns trigger
language plpgsql set search_path = public as $$
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
    return new;
  end if;

  if new.inicio_previsto is not null and old.inicio_previsto is null and old.baseline_inicio is null then
    new.baseline_inicio := new.inicio_previsto;
    new.baseline_fim    := coalesce(new.fim_previsto, new.inicio_previsto);
  else
    new.baseline_inicio := old.baseline_inicio;   -- baseline não se altera depois de gravada
    new.baseline_fim    := old.baseline_fim;
  end if;

  if old.inicio_previsto is not null
     and (new.inicio_previsto is distinct from old.inicio_previsto or new.fim_previsto is distinct from old.fim_previsto)
     and coalesce(current_setting('app.motivo', true), '') = '' then
    raise exception 'Informe o motivo da reprogramação antes de mudar as datas da obra %.', new.codigo
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists obra_antes_de_gravar_tg on public.obra_obras;
create trigger obra_antes_de_gravar_tg before insert or update on public.obra_obras
  for each row execute function public.obra_antes_de_gravar();

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
                           'fim_real','equipe_id','contrato_nome','nome_card','pagamento_na'] loop
    if to_jsonb(old) ->> c is distinct from to_jsonb(new) ->> c then
      insert into public.obra_historico (obra, campo, de, para, motivo, usuario)
      values (new.codigo, c, to_jsonb(old) ->> c, to_jsonb(new) ->> c,
              case when c in ('inicio_previsto','fim_previsto') then m end, auth.uid());
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists obra_historico_tg on public.obra_obras;
create trigger obra_historico_tg after insert or update on public.obra_obras
  for each row execute function public.obra_registrar_historico();

-- Gravar campos de uma obra (a tela manda só o que mudou; o motivo da reprogramação vai junto).
create or replace function public.obra_salvar(p_codigo text, p_patch jsonb, p_motivo text default null)
returns void language plpgsql set search_path = public as $$
declare
  editaveis text[] := array['nome_card','nome_contrato','cliente','filial','cidade','zona','kwp','modulos','estrutura','envio',
    'cpf_cnpj','endereco','cep','email_cliente','geracao_kwh','equipamentos','valor','forma_pagamento','financiamento','assinado_em',
    'pagamento_na','pedido_flow','entrada','material_previsto','material_entregue','kit_comprado','equipe_id','inicio_previsto',
    'fim_previsto','inicio_real','fim_real','observacoes','topicos','topicos_extra','fora_indicadores','contrato_path','contrato_nome'];
  sets text;
begin
  if not public.obra_pode_editar() then raise exception 'Seu perfil só pode consultar o cronograma.' using errcode = '42501'; end if;
  select string_agg(format('%I = (jsonb_populate_record(null::public.obra_obras, $1)).%I', k, k), ', ')
    into sets from jsonb_object_keys(p_patch) k where k = any (editaveis);
  if sets is null then return; end if;
  perform set_config('app.motivo', coalesce(p_motivo, ''), true);
  execute format('update public.obra_obras set %s where codigo = $2', sets) using p_patch, p_codigo;
  if not found then raise exception 'Obra % não encontrada.', p_codigo; end if;
end $$;
grant execute on function public.obra_salvar(text, jsonb, text) to authenticated;

-- ------------------------------------------------------------------- views
create or replace view public.obra_v_obras with (security_invoker = true) as
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

-- --------------------------------------------------------------------- RLS
do $$ declare t text; begin
  foreach t in array array['obra_filiais','obra_estruturas','obra_equipes','obra_config','obra_topicos','obra_obras','obra_historico'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "obras lê" on public.%s', t);
    execute format('create policy "obras lê" on public.%s for select to authenticated using (public.eh_obras())', t);
    if t <> 'obra_historico' then
      execute format('drop policy if exists "obras grava" on public.%s', t);
      execute format('create policy "obras grava" on public.%s for all to authenticated using (public.obra_pode_editar()) with check (public.obra_pode_editar())', t);
    end if;
    execute format('grant select on public.%s to authenticated', t);
  end loop;
end $$;
grant insert, update, delete on public.obra_filiais, public.obra_estruturas, public.obra_equipes, public.obra_config,
  public.obra_topicos, public.obra_obras to authenticated;
grant select on public.obra_v_obras to authenticated;
grant usage on sequence public.obra_historico_id_seq to authenticated;

-- Tempo real: o calendário de todo mundo atualiza sozinho.
do $$ begin
  begin alter publication supabase_realtime add table public.obra_obras; exception when others then null; end;
  begin alter publication supabase_realtime add table public.obra_equipes; exception when others then null; end;
end $$;

-- --------------------------------------------------------------- contratos
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('obra-contratos', 'obra-contratos', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
    drop policy if exists "obra contratos lê" on storage.objects;
    create policy "obra contratos lê" on storage.objects for select to authenticated
      using (bucket_id = 'obra-contratos' and public.eh_obras());
    drop policy if exists "obra contratos grava" on storage.objects;
    create policy "obra contratos grava" on storage.objects for insert to authenticated
      with check (bucket_id = 'obra-contratos' and public.obra_pode_editar());
    drop policy if exists "obra contratos apaga" on storage.objects;
    create policy "obra contratos apaga" on storage.objects for delete to authenticated
      using (bucket_id = 'obra-contratos' and public.obra_pode_editar());
  end if;
end $$;
