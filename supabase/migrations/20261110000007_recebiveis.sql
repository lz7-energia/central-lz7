-- Central LZ7 — Recebíveis e inadimplência (Financeiro), 10/11/2026.
-- Títulos vêm do Flow (titulos_receber, pela sincronização). As anotações de cobrança e as
-- "atualizações concluídas" são da central: a sincronização nunca mexe nelas.
-- Novo perfil "diretoria": só leitura, e só desta página.

alter type public.papel add value if not exists 'diretoria';

-- Dados do título que a tela precisa (preenchidos pela sincronização).
alter table public.titulos_receber
  add column if not exists cliente    text,
  add column if not exists id_cliente text,
  add column if not exists situacao   text;

-- Equipe = quem tem login e não é diretoria. (Comparação por texto: o valor novo do enum
-- não pode ser usado como literal na mesma transação em que foi criado.)
create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo and papel::text <> 'diretoria'
  );
$$;

-- Quem pode ver os recebíveis: equipe ou diretoria.
create or replace function public.ve_recebiveis()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- Cada pessoa sempre enxerga o próprio perfil (a diretoria precisa disso para entrar).
create policy "cada um vê o próprio perfil" on public.perfis
  for select to authenticated using (id = auth.uid());

create policy "diretoria lê títulos" on public.titulos_receber
  for select to authenticated using (public.ve_recebiveis());

-- Anotações de cobrança por título.
create table public.cobranca_notas (
  titulo_flow_id  text primary key references public.titulos_receber (flow_id) on delete cascade,
  situacao        text not null default 'sem_contato'
                  check (situacao in ('sem_contato', 'cobrado', 'negociando', 'promessa', 'juridico', 'outro')),
  previsao        date,
  motivo          text,
  alterado_por    text,
  alterado_em     timestamptz not null default now()
);

create trigger cobranca_notas_carimbo
  before insert or update on public.cobranca_notas
  for each row execute function public.carimbar_ajuste();

-- "Concluir atualização": registro do fechamento da revisão, com o retrato dos números.
create table public.cobranca_atualizacoes (
  id                bigint generated always as identity primary key,
  concluida_por     text,
  concluida_em      timestamptz not null default now(),
  qtd_vencidos      integer not null default 0,
  valor_vencido     numeric(14, 2) not null default 0,
  qtd_sem_previsao  integer not null default 0,
  observacao        text
);

create or replace function public.carimbar_atualizacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.concluida_por := coalesce((select nome from public.perfis where id = auth.uid()), 'Sistema');
  new.concluida_em := now();
  return new;
end;
$$;

create trigger cobranca_atualizacoes_carimbo
  before insert on public.cobranca_atualizacoes
  for each row execute function public.carimbar_atualizacao();

alter table public.cobranca_notas        enable row level security;
alter table public.cobranca_atualizacoes enable row level security;

create policy "lê anotações"        on public.cobranca_notas for select to authenticated using (public.ve_recebiveis());
create policy "equipe anota"        on public.cobranca_notas for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera nota"  on public.cobranca_notas for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "lê atualizações"     on public.cobranca_atualizacoes for select to authenticated using (public.ve_recebiveis());
create policy "equipe conclui"      on public.cobranca_atualizacoes for insert to authenticated with check (public.eh_equipe());

-- Visão da tela: título + anotação + dias em atraso. Títulos cancelados já ficam fora na sincronização.
create or replace view public.recebiveis
with (security_invoker = true)
as
select
  t.flow_id,
  coalesce(t.cliente, p.cliente)              as cliente,
  coalesce(t.codigo_projeto, p.codigo_projeto) as codigo_projeto,
  t.pedido_flow_id,
  t.vencimento,
  t.recebido_em,
  t.valor,
  t.valor_recebido,
  greatest(t.valor - t.valor_recebido, 0)     as valor_aberto,
  t.situacao                                  as situacao_flow,
  case
    when t.recebido_em is not null or t.valor_recebido >= t.valor then 'recebido'
    when t.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
    else 'a_vencer'
  end                                         as estado,
  case
    when t.recebido_em is null and t.valor_recebido < t.valor
         and t.vencimento < (now() at time zone 'America/Sao_Paulo')::date
    then (now() at time zone 'America/Sao_Paulo')::date - t.vencimento
  end                                         as dias_atraso,
  coalesce(n.situacao, 'sem_contato')         as cobranca_situacao,
  n.previsao,
  n.motivo,
  n.alterado_por,
  n.alterado_em
from public.titulos_receber t
left join public.pedidos_venda p on p.flow_id = t.pedido_flow_id
left join public.cobranca_notas n on n.titulo_flow_id = t.flow_id;

revoke all on public.recebiveis from anon;
grant select on public.recebiveis to authenticated;
