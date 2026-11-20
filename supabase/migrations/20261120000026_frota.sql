-- Frota (ADM, /frota), 20/11/2026. Carro → motorista (colaborador da folha, plat_docs colab) → aparece na ficha da pessoa no RH.
-- Documentos com vencimento, manutenção e km, multas (ligadas ao motorista da data) e abastecimento.
-- Tudo da equipe (eh_equipe): ver, criar, alterar e apagar.

create table if not exists public.frota_veiculos (
  id                uuid primary key default gen_random_uuid(),
  placa             text not null,
  modelo            text not null default '',
  marca             text,
  ano               text,
  cor               text,
  renavam           text,
  chassi            text,
  empresa_id        text references public.arq_empresas (id),
  unidade_id        uuid references public.arq_unidades (id) on delete set null,
  motorista_colab_id text,                 -- id do colaborador em plat_docs (colecao 'colab')
  responsavel_id    uuid references public.perfis (id) on delete set null,  -- recebe as tarefas de vencimento no planner
  km_atual          integer,
  km_atualizado_em  date,
  revisao_km        integer,               -- próxima revisão por km
  revisao_data      date,                  -- próxima revisão por data
  ativo             boolean not null default true,
  obs               text,
  alterado_por      text,
  alterado_em       timestamptz not null default now()
);
create unique index if not exists frota_veiculos_placa on public.frota_veiculos (upper(replace(placa, '-', '')));

create table if not exists public.frota_motoristas (
  id          bigint generated always as identity primary key,
  veiculo_id  uuid not null references public.frota_veiculos (id) on delete cascade,
  colab_id    text not null,
  de          date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ate         date
);
create index if not exists frota_motoristas_veiculo on public.frota_motoristas (veiculo_id, de);
create index if not exists frota_motoristas_colab on public.frota_motoristas (colab_id);

create table if not exists public.frota_documentos (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references public.frota_veiculos (id) on delete cascade,
  tipo        text not null,               -- Licenciamento, Seguro, IPVA, Outro
  descricao   text,
  vencimento  date,
  aviso_dias  smallint not null default 30,
  valor       numeric(12,2),
  obs         text,
  alterado_por text,
  alterado_em timestamptz not null default now()
);
create index if not exists frota_documentos_veiculo on public.frota_documentos (veiculo_id);

create table if not exists public.frota_manutencoes (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references public.frota_veiculos (id) on delete cascade,
  data        date not null,
  km          integer,
  tipo        text not null,               -- Revisão, Troca de óleo, Pneus, Freios, Outro
  descricao   text,
  oficina     text,
  valor       numeric(12,2),
  alterado_por text,
  alterado_em timestamptz not null default now()
);
create index if not exists frota_manutencoes_veiculo on public.frota_manutencoes (veiculo_id, data desc);

create table if not exists public.frota_multas (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references public.frota_veiculos (id) on delete cascade,
  data_infracao date not null,
  colab_id     text,                       -- motorista na data (preenchido sozinho pelo histórico, pode trocar)
  descricao    text,
  valor        numeric(12,2),
  vencimento   date,
  situacao     text not null default 'pendente' check (situacao in ('pendente', 'paga', 'recorrida', 'cancelada')),
  obs          text,
  alterado_por text,
  alterado_em  timestamptz not null default now()
);
create index if not exists frota_multas_veiculo on public.frota_multas (veiculo_id, data_infracao desc);
create index if not exists frota_multas_colab on public.frota_multas (colab_id);

create table if not exists public.frota_abastecimentos (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references public.frota_veiculos (id) on delete cascade,
  data        date not null,
  litros      numeric(10,3),
  valor       numeric(12,2),
  km          integer,
  colab_id    text,
  posto       text,
  alterado_por text,
  alterado_em timestamptz not null default now()
);
create index if not exists frota_abastecimentos_veiculo on public.frota_abastecimentos (veiculo_id, data desc);

-- carimbo de quem alterou
do $$ declare t text; begin
  foreach t in array array['frota_veiculos','frota_documentos','frota_manutencoes','frota_multas','frota_abastecimentos'] loop
    execute format('drop trigger if exists %1$s_carimbo on public.%1$s', t);
    execute format('create trigger %1$s_carimbo before insert or update on public.%1$s for each row execute function public.carimbar_ajuste()', t);
  end loop;
end $$;

-- Troca de motorista: fecha o anterior e abre o novo no histórico (base para a multa achar quem dirigia).
create or replace function public.frota_trocar_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'UPDATE' and new.motorista_colab_id is not distinct from old.motorista_colab_id then return new; end if;
  update public.frota_motoristas set ate = hoje where veiculo_id = new.id and ate is null;
  if new.motorista_colab_id is not null then
    insert into public.frota_motoristas (veiculo_id, colab_id, de) values (new.id, new.motorista_colab_id, hoje);
  end if;
  return new;
end $$;
drop trigger if exists frota_veiculos_motorista on public.frota_veiculos;
create trigger frota_veiculos_motorista after insert or update of motorista_colab_id on public.frota_veiculos
  for each row execute function public.frota_trocar_motorista();

-- Quem dirigia o carro numa data (o mais recente que começou até a data; senão o atual).
create or replace function public.frota_motorista_em(p_veiculo uuid, p_data date) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select colab_id from public.frota_motoristas where veiculo_id = p_veiculo and de <= p_data and (ate is null or ate >= p_data)
      order by de desc, id desc limit 1),
    (select motorista_colab_id from public.frota_veiculos where id = p_veiculo));
$$;

create or replace function public.frota_multa_motorista() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.colab_id is null then new.colab_id := public.frota_motorista_em(new.veiculo_id, new.data_infracao); end if;
  return new;
end $$;
drop trigger if exists frota_multas_motorista on public.frota_multas;
create trigger frota_multas_motorista before insert on public.frota_multas for each row execute function public.frota_multa_motorista();

-- Abastecimento: motorista do dia, e o km mais alto vira o km atual do carro.
create or replace function public.frota_km() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'frota_abastecimentos' and new.colab_id is null then
    new.colab_id := public.frota_motorista_em(new.veiculo_id, new.data);
  end if;
  if new.km is not null then
    update public.frota_veiculos set km_atual = new.km, km_atualizado_em = new.data
      where id = new.veiculo_id and (km_atual is null or km_atual < new.km);
  end if;
  return new;
end $$;
drop trigger if exists frota_abastecimentos_km on public.frota_abastecimentos;
create trigger frota_abastecimentos_km before insert or update on public.frota_abastecimentos for each row execute function public.frota_km();
drop trigger if exists frota_manutencoes_km on public.frota_manutencoes;
create trigger frota_manutencoes_km before insert or update on public.frota_manutencoes for each row execute function public.frota_km();

-- Acesso: equipe
do $$ declare t text; begin
  foreach t in array array['frota_veiculos','frota_motoristas','frota_documentos','frota_manutencoes','frota_multas','frota_abastecimentos'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "equipe lê" on public.%s', t);
    execute format('create policy "equipe lê" on public.%s for select to authenticated using (public.eh_equipe())', t);
    execute format('drop policy if exists "equipe grava" on public.%s', t);
    execute format('create policy "equipe grava" on public.%s for insert to authenticated with check (public.eh_equipe())', t);
    execute format('drop policy if exists "equipe altera" on public.%s', t);
    execute format('create policy "equipe altera" on public.%s for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe())', t);
    execute format('drop policy if exists "equipe apaga" on public.%s', t);
    execute format('create policy "equipe apaga" on public.%s for delete to authenticated using (public.eh_equipe())', t);
    execute format('grant select, insert, update, delete on public.%s to authenticated', t);
  end loop;
end $$;
