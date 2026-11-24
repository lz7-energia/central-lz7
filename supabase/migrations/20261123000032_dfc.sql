-- Financeiro: DFC realizado (pedido do usuário, 23/11/2026). Só o que está BAIXADO no Flow, exatamente como no Flow,
-- com o rateio por natureza e centro de custo. Saldo inicial vem da conciliação (resumos em conc_docs).
-- A Edge Function dfc-sincronizar (só GET no Flow) preenche estas tabelas; a tela só lê.

create table if not exists public.dfc_naturezas (
  id        bigint primary key,
  descricao text not null,
  grupo_id  bigint,
  grupo     text,
  pagar     boolean,
  sincronizado_em timestamptz not null default now()
);
create table if not exists public.dfc_centros (
  id        bigint primary key,
  codigo    text,
  descricao text not null,
  sincronizado_em timestamptz not null default now()
);

-- Um título baixado do contas a pagar (saída) ou a receber (entrada).
create table if not exists public.dfc_titulos (
  tipo            text not null check (tipo in ('pagar', 'receber')),
  flow_id         text not null,
  numero          text,
  parcela         integer,
  data_baixa      date not null,
  data_vencimento date,
  competencia     text,            -- "2026-10"
  valor           numeric(14,2),   -- valor do título
  valor_pago      numeric(14,2),   -- o que saiu/entrou de fato (valor pago / recebido)
  juros           numeric(14,2),
  multa           numeric(14,2),
  desconto        numeric(14,2),
  pessoa_id       text,
  pessoa          text,            -- apelido do fornecedor/cliente
  pessoa_razao    text,
  descricao       text,            -- histórico de emissão / observação
  historico_baixa text,
  natureza_id     bigint,
  centro_id       bigint,
  banco           text,
  os              text,
  codigo_projeto  text,
  tem_rateio      boolean not null default false,
  detalhado       boolean not null default false,  -- o detalhe do título já foi lido (pagar precisa: valor pago, juros, OS, rateio)
  assinatura      text,            -- o que muda na lista do Flow; diferente = ler o detalhe de novo
  bruto           jsonb not null default '{}'::jsonb,
  sincronizado_em timestamptz not null default now(),
  primary key (tipo, flow_id)
);
create index if not exists dfc_titulos_baixa on public.dfc_titulos (data_baixa);

create table if not exists public.dfc_rateios (
  tipo        text not null,
  flow_id     text not null,       -- id do rateio no Flow
  titulo_id   text not null,
  valor       numeric(14,2) not null,
  natureza_id bigint,
  centro_id   bigint,
  primary key (tipo, flow_id),
  foreign key (tipo, titulo_id) references public.dfc_titulos (tipo, flow_id) on delete cascade
);
create index if not exists dfc_rateios_titulo on public.dfc_rateios (tipo, titulo_id);

do $$ declare t text; begin
  foreach t in array array['dfc_naturezas', 'dfc_centros', 'dfc_titulos', 'dfc_rateios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipe lê %s" on public.%I', t, t);
    execute format('create policy "equipe lê %s" on public.%I for select to authenticated using (public.eh_equipe())', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Uma linha por parte do dinheiro: cada rateio do título (ou o título inteiro, sem rateio).
-- Se o valor pago difere da soma do rateio (juros, multa, desconto), a diferença vira uma linha própria,
-- na natureza e no centro do título, para o total bater com o que saiu/entrou de fato.
create or replace view public.dfc_lancamentos with (security_invoker = true) as
with partes as (
  select t.tipo, t.flow_id as titulo_id, r.flow_id as rateio_id, r.valor, r.natureza_id, r.centro_id, 'rateio'::text as parte
  from public.dfc_titulos t join public.dfc_rateios r on r.tipo = t.tipo and r.titulo_id = t.flow_id
  union all
  select t.tipo, t.flow_id, null, coalesce(t.valor_pago, t.valor), t.natureza_id, t.centro_id, 'titulo'
  from public.dfc_titulos t
  where not exists (select 1 from public.dfc_rateios r where r.tipo = t.tipo and r.titulo_id = t.flow_id)
  union all
  select t.tipo, t.flow_id, null, coalesce(t.valor_pago, t.valor) - s.soma, t.natureza_id, t.centro_id, 'diferenca'
  from public.dfc_titulos t
  join (select tipo, titulo_id, sum(valor) as soma from public.dfc_rateios group by 1, 2) s on s.tipo = t.tipo and s.titulo_id = t.flow_id
  where round(coalesce(t.valor_pago, t.valor) - s.soma, 2) <> 0
)
select p.tipo || '-' || p.titulo_id || '-' || coalesce(p.rateio_id, p.parte) as chave,
       p.tipo, case when p.tipo = 'receber' then 'entrada' else 'saida' end as sentido,
       p.titulo_id, p.rateio_id, p.parte, round(p.valor, 2) as valor,
       case when p.tipo = 'receber' then round(p.valor, 2) else -round(p.valor, 2) end as valor_sinal,
       t.data_baixa, t.competencia, t.numero, t.parcela,
       coalesce(t.pessoa, cf.apelido, cf.nome) as pessoa, coalesce(t.pessoa_razao, cf.nome) as pessoa_razao, t.descricao, t.historico_baixa,
       t.banco, t.os, t.codigo_projeto, t.juros, t.multa, t.desconto, t.valor as valor_titulo, t.valor_pago as valor_pago_titulo,
       p.natureza_id, n.descricao as natureza, n.grupo as natureza_grupo, p.centro_id, c.descricao as centro
from partes p
join public.dfc_titulos t on t.tipo = p.tipo and t.flow_id = p.titulo_id
left join public.dfc_naturezas n on n.id = p.natureza_id
left join public.dfc_centros c on c.id = p.centro_id
left join public.clientes_flow cf on t.tipo = 'receber' and cf.flow_id = t.pessoa_id
where public.eh_equipe() or current_user in ('service_role', 'postgres');
grant select on public.dfc_lancamentos to authenticated;
