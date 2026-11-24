-- Telas mais rápidas (23/11/2026): as regras de acesso chamavam eh_equipe()/eh_obras()/… uma vez POR LINHA lida.
-- Com "(select função())" o Postgres calcula uma vez por consulta (InitPlan). Mesma regra, mesmo resultado; só mais rápido.
-- Medido localmente com 4.000 pedidos: quadro de faturamento de ~150 ms para ~45 ms.
-- Vale para toda política cujo USING / WITH CHECK é exatamente uma chamada de função sem argumentos (ex.: eh_equipe()).
do $$
declare
  p record;
  usar text;
  checar text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (qual ~ '^[a-z_]+\(\)$' or with_check ~ '^[a-z_]+\(\)$')
  loop
    usar   := case when p.qual       ~ '^[a-z_]+\(\)$' then format('(select %s)', p.qual) end;
    checar := case when p.with_check ~ '^[a-z_]+\(\)$' then format('(select %s)', p.with_check) end;
    execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
                   coalesce('using (' || usar || ')', ''), coalesce('with check (' || checar || ')', ''));
  end loop;
end $$;
