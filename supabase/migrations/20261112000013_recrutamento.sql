-- RH: recrutamento e seleção (decisões de 12/11/2026).
-- A recrutadora cria as vagas; cada vaga tem um funil: inscrito → triagem (entrevista da recrutadora, com perguntas)
-- → aprovação do gestor → aprovado / não aprovado (com motivo e a etapa onde parou).
-- Perguntas, motivos, canais e mensagens de WhatsApp são listas que a equipe mesma mantém.
-- Entrevista marcada vira tarefa no planner da recrutadora; indicação aprovada gera lembrete do bônus em 3 meses.

create table public.rh_perguntas (
  id       bigint generated always as identity primary key,
  texto    text not null,
  tipo     text not null default 'sim_nao' check (tipo in ('sim_nao', 'escolha', 'numero', 'texto')),
  opcoes   text[] not null default '{}',     -- para tipo "escolha"
  padrao   boolean not null default false,   -- já vem marcada em vaga nova
  ativo    boolean not null default true,
  ordem    smallint not null default 0
);

create table public.rh_motivos (
  id     bigint generated always as identity primary key,
  texto  text not null unique,
  ativo  boolean not null default true,
  ordem  smallint not null default 0
);

create table public.rh_canais (
  id     bigint generated always as identity primary key,
  nome   text not null unique,
  eh_indicacao boolean not null default false,  -- pede "quem indicou" e controla o bônus
  ativo  boolean not null default true,
  ordem  smallint not null default 0
);

create table public.rh_mensagens (
  id     bigint generated always as identity primary key,
  titulo text not null,
  texto  text not null,                    -- aceita {nome}, {vaga}, {cidade}, {entrevista}
  ativo  boolean not null default true,
  ordem  smallint not null default 0
);

create table public.rh_vagas (
  id              bigint generated always as identity primary key,
  cargo           text not null,                 -- "Vendedor"
  area            text not null default 'Comercial',
  local           text,                          -- "WB", "Londrina"…
  quantidade      smallint not null default 1 check (quantidade between 1 and 200),
  gestor          text,
  contrato        text not null default 'PJ',    -- PJ, cooperativa…
  descricao       text,
  aberta_em       date not null default current_date,
  previsao        date,                          -- previsão de fechamento
  fechada_em      date,
  perguntas       bigint[] not null default '{}',-- ids de rh_perguntas usadas nesta vaga, na ordem
  criada_por      uuid references public.perfis (id),
  criada_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table public.rh_candidatos (
  id                 bigint generated always as identity primary key,
  vaga_id            bigint not null references public.rh_vagas (id) on delete cascade,
  nome               text not null,
  whatsapp           text,
  email              text,
  cidade             text,
  canal_id           bigint references public.rh_canais (id),
  indicado_por       text,
  curriculo_path     text,                       -- bucket privado "rh-curriculos"
  curriculo_nome     text,
  etapa              text not null default 'inscrito'
                       check (etapa in ('inscrito', 'triagem', 'gestor', 'aprovado', 'reprovado')),
  parou_em           text check (parou_em in ('inscrito', 'triagem', 'gestor')),   -- onde estava quando não foi aprovado
  motivo_id          bigint references public.rh_motivos (id),
  respostas          jsonb not null default '{}'::jsonb,   -- { "<id da pergunta>": valor }
  nota               smallint check (nota between 1 and 5),
  observacao         text,
  consideracao_gestor text,
  entrevista_em      timestamptz,
  recrutador_id      uuid references public.perfis (id),   -- quem marcou a entrevista (recebe no planner)
  contratado_em      date,
  bonus_pago_em      date,
  lgpd_autorizou     boolean not null default false,
  lgpd_em            timestamptz,
  criado_por         uuid references public.perfis (id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  -- só dígitos / minúsculas, para achar candidato repetido
  whatsapp_norm      text generated always as (nullif(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), '')) stored,
  email_norm         text generated always as (nullif(lower(btrim(coalesce(email, ''))), '')) stored
);
create index on public.rh_candidatos (vaga_id, etapa);
create index on public.rh_candidatos (whatsapp_norm);
create index on public.rh_candidatos (email_norm);

create trigger rh_vagas_atualizado_em before update on public.rh_vagas
  for each row execute function public.tocar_atualizado_em();
create trigger rh_candidatos_atualizado_em before update on public.rh_candidatos
  for each row execute function public.tocar_atualizado_em();

alter table public.rh_perguntas  enable row level security;
alter table public.rh_motivos    enable row level security;
alter table public.rh_canais     enable row level security;
alter table public.rh_mensagens  enable row level security;
alter table public.rh_vagas      enable row level security;
alter table public.rh_candidatos enable row level security;

-- Equipe da central (não a diretoria) vê e mexe em tudo do recrutamento.
create policy "equipe: perguntas"  on public.rh_perguntas  for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe: motivos"    on public.rh_motivos    for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe: canais"     on public.rh_canais     for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe: mensagens"  on public.rh_mensagens  for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe: vagas"      on public.rh_vagas      for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "equipe: candidatos" on public.rh_candidatos for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Listas iniciais (a equipe edita depois em Configurações do recrutamento).
insert into public.rh_perguntas (texto, tipo, opcoes, padrao, ordem) values
  ('Já trabalhou com vendas?', 'sim_nao', '{}', true, 1),
  ('Quanto tempo de experiência em vendas?', 'escolha', '{"Nenhuma","Menos de 1 ano","1 a 3 anos","Mais de 3 anos"}', true, 2),
  ('Já vendeu energia solar ou serviço parecido?', 'sim_nao', '{}', true, 3),
  ('Aceita contrato PJ / cooperativa com remuneração por comissão?', 'sim_nao', '{}', true, 4),
  ('Tem CNPJ (MEI) ou topa abrir?', 'escolha', '{"Já tem","Topa abrir","Não"}', true, 5),
  ('Tem carro e CNH?', 'sim_nao', '{}', true, 6),
  ('Disponibilidade para começar', 'escolha', '{"Imediata","Em 15 dias","Em 30 dias","Mais de 30 dias"}', true, 7),
  ('Expectativa de ganho por mês (R$)', 'numero', '{}', true, 8);

insert into public.rh_motivos (texto, ordem) values
  ('Sem experiência para a vaga', 1), ('Não aceita contrato PJ / comissão', 2), ('Sem disponibilidade', 3),
  ('Não respondeu / não compareceu', 4), ('Expectativa de ganho acima da vaga', 5), ('Gestor optou por outro candidato', 6),
  ('Desistiu do processo', 7), ('Outro', 99);

insert into public.rh_canais (nome, eh_indicacao, ordem) values
  ('Indicação', true, 1), ('Instagram', false, 2), ('Indeed', false, 3), ('LinkedIn', false, 4),
  ('Facebook', false, 5), ('Placa / panfleto', false, 6), ('Outro', false, 99);

insert into public.rh_mensagens (titulo, texto, ordem) values
  ('Convite para entrevista', 'Olá, {nome}! Tudo bem? Aqui é da LZ7 Energia. Recebemos seu currículo para a vaga de {vaga} e gostaríamos de marcar uma conversa. Qual o melhor dia e horário para você?', 1),
  ('Confirmação da entrevista', 'Olá, {nome}! Confirmando nossa entrevista para a vaga de {vaga}: {entrevista}. Qualquer imprevisto, é só avisar por aqui.', 2),
  ('Retorno: aprovado', 'Olá, {nome}! Temos uma ótima notícia: você foi aprovado(a) para a vaga de {vaga}. Em breve entramos em contato com os próximos passos.', 3),
  ('Retorno: não seguiremos', 'Olá, {nome}! Agradecemos seu interesse na vaga de {vaga}. Neste momento seguiremos com outros candidatos, mas seu currículo fica em nosso banco para próximas oportunidades.', 4);

-- Currículos: bucket privado; o site entrega por link temporário depois de conferir a permissão.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('rh-curriculos', 'rh-curriculos', false, 20971520)
    on conflict (id) do nothing;
  end if;
end;
$$;
