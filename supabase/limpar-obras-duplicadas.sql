-- Obras duplicadas pela importação do Flow (25/11/2026). Rode o PASSO 1, confira; depois o PASSO 2.
-- Duplicada = obra que veio do Flow cujo pedido é do mesmo projeto (ou da mesma OS) de outra obra mais antiga.

-- PASSO 1: ver quais saem (nada é apagado)
with o as (
  select x.codigo, x.cliente, x.nome_card, x.criado_em, x.origem, x.os_flow, x.id_cab_pedido_venda,
         upper(btrim(coalesce(p.codigo_projeto, ''))) as projeto
    from public.obra_obras x left join public.pedidos_venda p on p.flow_id = x.id_cab_pedido_venda::text
), d as (
  select o.*, (select m.codigo from o m
                where m.codigo <> o.codigo and m.criado_em <= o.criado_em
                  and ((o.projeto <> '' and (upper(m.codigo) = o.projeto or m.projeto = o.projeto)) or (o.os_flow is not null and m.os_flow = o.os_flow))
                order by m.criado_em limit 1) as fica
    from o where o.origem = 'flow'
)
select d.codigo as sai, d.fica, d.cliente, d.nome_card, d.criado_em,
       (x.inicio_previsto is not null or x.material_previsto is not null or x.material_entregue is not null or x.equipe_id is not null
        or cardinality(x.tags) > 0 or jsonb_array_length(coalesce(x.pagamentos, '[]')) > 0 or x.contrato_path is not null
        or coalesce(x.observacoes, '') <> '' or coalesce(x.particularidades, '') <> '') as alguem_mexeu
  from d join public.obra_obras x on x.codigo = d.codigo
 where d.fica is not null
 order by d.cliente;

-- PASSO 2: apagar só as duplicadas em que ninguém mexeu (as com alguem_mexeu = true ficam para conferir à mão)
-- with o as ( ...igual ao passo 1... ) — descomente o bloco abaixo e rode:
/*
with o as (
  select x.codigo, x.criado_em, x.origem, x.os_flow, upper(btrim(coalesce(p.codigo_projeto, ''))) as projeto
    from public.obra_obras x left join public.pedidos_venda p on p.flow_id = x.id_cab_pedido_venda::text
), d as (
  select o.codigo from o
   where o.origem = 'flow' and exists (select 1 from o m where m.codigo <> o.codigo and m.criado_em <= o.criado_em
           and ((o.projeto <> '' and (upper(m.codigo) = o.projeto or m.projeto = o.projeto)) or (o.os_flow is not null and m.os_flow = o.os_flow)))
)
delete from public.obra_obras x using d
 where x.codigo = d.codigo
   and x.inicio_previsto is null and x.material_previsto is null and x.material_entregue is null and x.equipe_id is null
   and cardinality(x.tags) = 0 and jsonb_array_length(coalesce(x.pagamentos, '[]')) = 0 and x.contrato_path is null
   and coalesce(x.observacoes, '') = '' and coalesce(x.particularidades, '') = ''
returning x.codigo, x.cliente;
*/
