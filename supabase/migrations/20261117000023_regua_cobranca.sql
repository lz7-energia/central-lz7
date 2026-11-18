-- Central LZ7 — Régua de cobrança (Financeiro, /cobranca), 17/11/2026.
-- WhatsApp semiautomático: a Central monta a mensagem de cada etapa, a pessoa clica, o WhatsApp abre com o texto e o envio
-- fica registrado. E-mail automático entra quando o Titan estiver configurado (canal 'email' já previsto).
-- A régua para sozinha quando o título é recebido (Flow ou baixa manual), excluído, marcado como financiamento,
-- ou quando a situação de cobrança pausa a régua (negociação, aguardando terceiro, jurídico — configurável).

-- 1) Cadastro de clientes do Flow com contato (preenchido pela sincronização; o bruto fica guardado).
create table if not exists public.clientes_flow (
  flow_id          text primary key,
  nome             text,
  apelido          text,
  cnpj_cpf         text,
  telefone         text,
  email            text,
  bruto            jsonb not null default '{}'::jsonb,
  sincronizado_em  timestamptz not null default now()
);
alter table public.clientes_flow enable row level security;
drop policy if exists "equipe lê clientes" on public.clientes_flow;
create policy "equipe lê clientes" on public.clientes_flow for select to authenticated using (public.eh_equipe());

-- 2) Contato informado pela equipe (vale no lugar do contato do Flow).
create table if not exists public.cliente_contatos (
  id_cliente    text primary key,
  telefone      text,
  email         text,
  alterado_por  text,
  alterado_em   timestamptz not null default now()
);
drop trigger if exists cliente_contatos_carimbo on public.cliente_contatos;
create trigger cliente_contatos_carimbo before insert or update on public.cliente_contatos
  for each row execute function public.carimbar_ajuste();
alter table public.cliente_contatos enable row level security;
drop policy if exists "equipe lê contatos" on public.cliente_contatos;
create policy "equipe lê contatos" on public.cliente_contatos for select to authenticated using (public.eh_equipe());
drop policy if exists "equipe grava contatos" on public.cliente_contatos;
create policy "equipe grava contatos" on public.cliente_contatos for insert to authenticated with check (public.eh_equipe());
drop policy if exists "equipe altera contatos" on public.cliente_contatos;
create policy "equipe altera contatos" on public.cliente_contatos for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- 3) Título pago por financiamento (marcado na tela de Recebíveis): fica fora da régua.
alter table public.titulo_ajustes add column if not exists financiamento boolean not null default false;

-- 4) Situação de cobrança que pausa a régua.
alter table public.cobranca_situacoes add column if not exists pausa_regua boolean not null default false;
update public.cobranca_situacoes set pausa_regua = true where grupo in ('negociacao', 'aguardando') or id = 'juridico';

-- 5) Etapas da régua (dias depois do vencimento; 0 = no dia). Textos editáveis pela equipe.
--    Variáveis: {nome} {lista} {total} {dias} {vencimento}
create table if not exists public.cobranca_regua_etapas (
  id            text primary key,
  dias          integer not null check (dias between 0 and 365),
  nome          text not null,
  texto         text not null,
  ativo         boolean not null default true,
  alterado_por  text,
  alterado_em   timestamptz not null default now()
);
drop trigger if exists cobranca_regua_etapas_carimbo on public.cobranca_regua_etapas;
create trigger cobranca_regua_etapas_carimbo before insert or update on public.cobranca_regua_etapas
  for each row execute function public.carimbar_ajuste();

insert into public.cobranca_regua_etapas (id, dias, nome, texto) values
  ('d0', 0, 'No dia do vencimento',
   E'Olá, {nome}! Tudo bem? Aqui é da LZ7 Energia.\nPassando para lembrar que hoje vence:\n{lista}\nSe o pagamento já foi feito, pode desconsiderar esta mensagem. Qualquer dúvida, estamos à disposição!'),
  ('d3', 3, '3 dias de atraso',
   E'Olá, {nome}! Aqui é da LZ7 Energia.\nAinda não identificamos o pagamento de:\n{lista}\nPode ter sido só um esquecimento. Se precisar da segunda via ou de outra forma de pagamento, é só responder por aqui. Se já pagou, por favor nos envie o comprovante.'),
  ('d7', 7, '7 dias de atraso',
   E'Olá, {nome}. Aqui é da LZ7 Energia.\nSeguem em aberto:\n{lista}\nTotal: {total}.\nPodemos ajudar a regularizar? Responda esta mensagem para combinarmos a melhor forma de pagamento.'),
  ('d15', 15, '15 dias de atraso',
   E'Olá, {nome}. Aqui é da LZ7 Energia.\nAinda não recebemos o pagamento de:\n{lista}\nTotal em aberto: {total}, com {dias} dias de atraso.\nPrecisamos regularizar essa pendência. Podemos conversar hoje para encontrar uma solução?'),
  ('d30', 30, '30 dias de atraso (aviso final)',
   E'{nome}, aqui é da LZ7 Energia.\nO valor de {total} está em aberto há {dias} dias:\n{lista}\nEsta é a nossa última tentativa de resolver de forma amigável, antes de encaminharmos para as próximas etapas de cobrança. Por favor, responda esta mensagem para regularizarmos.')
on conflict (id) do nothing;

-- 6) Registro de cada envio (ou etapa pulada), por título.
create table if not exists public.cobranca_envios (
  id              bigint generated always as identity primary key,
  lote            uuid not null default gen_random_uuid(),
  titulo_flow_id  text not null references public.titulos_receber (flow_id) on delete cascade,
  etapa_id        text not null,
  canal           text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  acao            text not null default 'enviado' check (acao in ('enviado', 'pulado')),
  telefone        text,
  texto           text,
  motivo          text,
  por             text,
  por_id          uuid default auth.uid(),
  em              timestamptz not null default now()
);
create index if not exists cobranca_envios_titulo on public.cobranca_envios (titulo_flow_id, etapa_id);
create index if not exists cobranca_envios_em on public.cobranca_envios (em desc);

create or replace function public.carimbar_envio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.por := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
  new.por_id := auth.uid();
  new.em := now();
  return new;
end $$;
drop trigger if exists cobranca_envios_carimbo on public.cobranca_envios;
create trigger cobranca_envios_carimbo before insert on public.cobranca_envios for each row execute function public.carimbar_envio();

alter table public.cobranca_regua_etapas enable row level security;
alter table public.cobranca_envios enable row level security;
drop policy if exists "lê etapas" on public.cobranca_regua_etapas;
create policy "lê etapas" on public.cobranca_regua_etapas for select to authenticated using (public.eh_equipe());
drop policy if exists "equipe cria etapa" on public.cobranca_regua_etapas;
create policy "equipe cria etapa" on public.cobranca_regua_etapas for insert to authenticated with check (public.eh_equipe());
drop policy if exists "equipe altera etapa" on public.cobranca_regua_etapas;
create policy "equipe altera etapa" on public.cobranca_regua_etapas for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
drop policy if exists "equipe apaga etapa" on public.cobranca_regua_etapas;
create policy "equipe apaga etapa" on public.cobranca_regua_etapas for delete to authenticated using (public.eh_equipe());
drop policy if exists "lê envios" on public.cobranca_envios;
create policy "lê envios" on public.cobranca_envios for select to authenticated using (public.eh_equipe());
drop policy if exists "equipe registra envio" on public.cobranca_envios;
create policy "equipe registra envio" on public.cobranca_envios for insert to authenticated with check (public.eh_equipe());
-- Desfazer: só quem registrou, e só no mesmo dia.
drop policy if exists "desfaz o próprio envio" on public.cobranca_envios;
create policy "desfaz o próprio envio" on public.cobranca_envios for delete to authenticated
  using (public.eh_equipe() and por_id = auth.uid() and (em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date);

-- 7) Recebíveis: mesmas colunas de antes + id_cliente e financiamento no fim.
create or replace view public.recebiveis
with (security_invoker = true)
as
with base as (
  select
    t.*,
    p.cliente        as p_cliente,
    p.codigo_projeto as p_codigo,
    p.cliente_apelido as p_apelido,
    n.situacao as n_situacao, n.previsao as n_previsao, n.motivo as n_motivo,
    n.alterado_por as n_por, n.alterado_em as n_em,
    a.baixa_manual, a.baixa_data, a.baixa_valor, a.baixa_obs,
    a.excluido, a.excluido_motivo, a.nome_exibicao, a.financiamento,
    a.alterado_por as a_por, a.alterado_em as a_em,
    case when coalesce(a.baixa_manual, false) then coalesce(a.baixa_data, (a.alterado_em at time zone 'America/Sao_Paulo')::date)
         else t.recebido_em end as rec_em,
    case when coalesce(a.baixa_manual, false) then coalesce(a.baixa_valor, t.valor)
         else t.valor_recebido end as rec_valor,
    (now() at time zone 'America/Sao_Paulo')::date as hoje
  from public.titulos_receber t
  left join public.pedidos_venda p   on p.flow_id = t.pedido_flow_id
  left join public.cobranca_notas n  on n.titulo_flow_id = t.flow_id
  left join public.titulo_ajustes a  on a.titulo_flow_id = t.flow_id
)
select
  flow_id,
  coalesce(cliente, p_cliente)              as cliente,
  coalesce(codigo_projeto, p_codigo)        as codigo_projeto,
  pedido_flow_id,
  vencimento,
  rec_em                                    as recebido_em,
  valor,
  rec_valor                                 as valor_recebido,
  case when coalesce(baixa_manual, false) then 0 else greatest(valor - rec_valor, 0) end as valor_aberto,
  situacao                                  as situacao_flow,
  case
    when coalesce(excluido, false)                         then 'excluido'
    when coalesce(baixa_manual, false)
      or rec_em is not null or rec_valor >= valor          then 'recebido'
    when vencimento < hoje                                 then 'vencido'
    else 'a_vencer'
  end                                       as estado,
  case
    when not coalesce(excluido, false) and not coalesce(baixa_manual, false)
         and rec_em is null and rec_valor < valor and vencimento < hoje
    then hoje - vencimento
  end                                       as dias_atraso,
  coalesce(n_situacao, 'sem_contato')       as cobranca_situacao,
  n_previsao                                as previsao,
  n_motivo                                  as motivo,
  n_por                                     as alterado_por,
  n_em                                      as alterado_em,
  coalesce(nullif(nome_exibicao, ''), nullif(cliente_apelido, ''), nullif(p_apelido, '')) as cliente_apelido,
  coalesce(baixa_manual, false)             as baixa_manual,
  baixa_obs,
  coalesce(excluido, false)                 as excluido,
  excluido_motivo,
  nome_exibicao,
  a_por                                     as ajuste_por,
  a_em                                      as ajuste_em,
  id_cliente,
  coalesce(financiamento, false)            as financiamento
from base;
revoke all on public.recebiveis from anon;
grant select on public.recebiveis to authenticated;
