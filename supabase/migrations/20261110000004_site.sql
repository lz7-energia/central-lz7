-- Central LZ7 — complementos para o site da fase 1.
-- 1) O gestor precisa ver O QUE está aprovando antes de decidir (a página de aprovação
--    não decide sozinha ao abrir, porque leitores de e-mail costumam abrir os links).
-- 2) Bucket privado para os anexos do portal (boleto, comprovante).

create or replace function public.ver_aprovacao(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'protocolo',   p.protocolo,
    'setor',       s.nome,
    'tipo',        t.nome,
    'campos',      t.campos,
    'dados',       p.dados,
    'solicitante', so.nome,
    'criado_em',   p.criado_em,
    'expira_em',   a.expira_em,
    'decisao',     a.decisao,
    'decidida_em', a.decidida_em,
    'expirada',    a.expira_em < now()
  )
  from public.aprovacoes a
  join public.pedidos p        on p.id = a.pedido_id
  join public.setores s        on s.id = p.setor_id
  join public.tipos_pedido t   on t.id = p.tipo_id
  left join public.solicitantes so on so.id = p.solicitante_id
  where a.token_hash = public.hash_token(p_token);
$$;

revoke all on function public.ver_aprovacao(text) from public, anon, authenticated;
grant execute on function public.ver_aprovacao(text) to service_role;

-- Anexos: só a rota do servidor grava (chave de serviço); a equipe lê por link temporário.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('anexos', 'anexos', false, 10485760)
    on conflict (id) do nothing;

    execute $p$
      create policy "equipe lê anexos" on storage.objects
        for select to authenticated
        using (bucket_id = 'anexos' and public.eh_equipe())
    $p$;
  end if;
end;
$$;
