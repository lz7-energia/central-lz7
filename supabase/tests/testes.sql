-- Testes das regras da fase 1. Rodar depois do stub, das migrações e do seed.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
-- (o Supabase dá esses grants por padrão; o RLS é quem restringe)
revoke update on public.pedidos, public.pedidos_venda from authenticated;
grant update (status, responsavel_id, prazo) on public.pedidos to authenticated;
grant update (responsavel) on public.pedidos_venda to authenticated;

-- Dados de teste
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.perfis (id, nome, email, papel) values
  ('11111111-1111-1111-1111-111111111111', 'Ana', 'ana@lz7.com.br', 'equipe');
insert into public.solicitantes (nome, email, gestor_email) values ('Colaborador 1', 'c1@lz7.com.br', 'gestor@lz7.com.br');

insert into public.pedidos_venda (flow_id, numero, codigo_projeto, cliente, valor_total) values
  ('PV1', '1001', 'SP000001ABC', 'Cliente A', 10000),
  ('PV2', '1002', 'SP000002ABC', 'Cliente B', 20000),
  ('PV3', '1003', 'SP000003ABC', 'Cliente C', 30000),
  ('PV4', '1004', 'SP000004ABC', 'Cliente D', 40000),
  ('PV5', '1005', 'SP000005ABC', 'Cliente E', 50000),
  ('PV6', '1006', 'SP000006ABC', 'Cliente F', 60000);
insert into public.ordens_servico (flow_id, pedido_flow_id, status, status_desde) values
  ('OS1', 'PV1', 'Instalando',          now() - interval '2 days'),
  ('OS2', 'PV2', 'Obra concluída.', now() - interval '7 days'),
  ('OS3', 'PV3', 'Obra concluída.', now() - interval '9 days'),
  ('OS4', 'PV4', 'Obra concluída.', now() - interval '20 days'),
  ('OS5', 'PV5', 'Obra concluída.', now() - interval '3 days'),
  ('OS6', 'PV6', 'Cancelado',       now() - interval '1 day');
insert into public.notas_fiscais (flow_id, pedido_flow_id, numero, situacao) values
  ('NF3', 'PV3', '8820', 'autorizada'),
  ('NF4', 'PV4', '8821', 'autorizada'),
  ('NF5', 'PV5', '8822', 'cancelada');
insert into public.titulos_receber (flow_id, pedido_flow_id, valor, valor_recebido) values
  ('T3a', 'PV3', 15000, 15000), ('T3b', 'PV3', 15000, 0),
  ('T4a', 'PV4', 20000, 20000), ('T4b', 'PV4', 20000, 20000);

-- 1) Colunas do painel
select numero, coluna, pct_recebido, dias_parado from public.painel_faturamento order by numero;
do $$
declare r record;
begin
  for r in select numero, coluna, pct_recebido, dias_parado from public.painel_faturamento loop
    if (r.numero, r.coluna) not in (('1001','em_execucao'),('1002','pronto_faturar'),('1003','faturado'),
                                    ('1004','recebido'),('1005','pronto_faturar')) then
      raise exception 'coluna errada: % %', r.numero, r.coluna;
    end if;
  end loop;
  if (select pct_recebido from public.painel_faturamento where numero='1003') <> 50 then raise exception 'pct 1003'; end if;
  if (select dias_parado from public.painel_faturamento where numero='1002') <> 7 then raise exception 'dias 1002'; end if;
  if exists (select 1 from public.painel_faturamento where numero='1006') then raise exception 'OS cancelada apareceu no painel'; end if;
  raise notice 'OK painel';
end $$;

-- 2) Portal: criar pedido sem aprovação e com aprovação (como service_role)
-- A aprovação vem desligada no catálogo; liga num tipo só para testar o fluxo.
update public.tipos_pedido set exige_aprovacao = true where nome = 'Compra ou contratação de serviço';
set role service_role;
select public.criar_pedido((select id from public.tipos_pedido where nome='Emissão de nota fiscal'),
                           (select id from public.solicitantes limit 1),
                           '{"codigo_projeto":"SP000002ABC"}') as sem_aprovacao \gset
select public.criar_pedido((select id from public.tipos_pedido where nome='Compra ou contratação de serviço'),
                           (select id from public.solicitantes limit 1),
                           '{"descricao":"Notebook para o comercial","valor_estimado":"4500"}') as com_aprovacao \gset
reset role;

do $$
begin
  begin
    perform public.criar_pedido((select id from public.tipos_pedido where nome='Reembolso de despesa'),
                                (select id from public.solicitantes limit 1), '{"valor":"1"}');
    raise exception 'deveria exigir campo obrigatório';
  exception when sqlstate '22023' then raise notice 'OK campo obrigatório';
  end;
end $$;

select :'sem_aprovacao'::jsonb->>'status' as s1, :'com_aprovacao'::jsonb->>'status' as s2;

-- 3) Consulta com token certo e errado
select public.consultar_pedido(:'sem_aprovacao'::jsonb->>'protocolo', :'sem_aprovacao'::jsonb->>'token_consulta') is not null as consulta_ok;
select public.consultar_pedido(:'sem_aprovacao'::jsonb->>'protocolo', 'token-errado') is null as consulta_negada;

-- 4) Aprovação pelo link
select public.decidir_aprovacao(:'com_aprovacao'::jsonb->'aprovacao'->>'token', 'aprovado', 'ok') ->> 'status' as apos_aprovar;
do $$ begin
  begin
    perform public.decidir_aprovacao((select 'x'), 'aprovado');
    raise exception 'token falso aceito';
  exception when sqlstate '22023' then raise notice 'OK token falso recusado';
  end;
end $$;

-- 5) RLS: anon não vê nada nem chama funções; equipe vê; não-equipe logado não vê
set role anon;
select count(*) as anon_ve_pedidos from public.pedidos;
do $$ begin
  begin perform public.portal_opcoes(); raise exception 'anon chamou função';
  exception when insufficient_privilege then raise notice 'OK anon sem acesso às funções'; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as estranho_ve_pedidos from public.pedidos;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as equipe_ve_pedidos from public.pedidos;
select count(*) as equipe_ve_painel from public.painel_faturamento;
update public.pedidos set status = 'em_andamento' where protocolo = :'sem_aprovacao'::jsonb->>'protocolo';
do $$ begin
  begin update public.pedidos set dados = '{}' ; raise exception 'equipe editou dados';
  exception when insufficient_privilege then raise notice 'OK equipe não edita dados do pedido'; end;
end $$;
reset role;

select tipo, de_status, para_status, autor from public.pedido_eventos order by id;

-- 6) Ajustes manuais do painel: ocultar e "já tem nota" sobrevivem à sincronização
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.painel_ajustes (pedido_flow_id, oculto) values ('PV1', true);
insert into public.painel_ajustes (pedido_flow_id, nota_manual, nota_numero) values ('PV2', true, '9999');
reset role;
-- simula a sincronização regravando o pedido
update public.pedidos_venda set cliente = 'Cliente A (Flow)', sincronizado_em = now() where flow_id in ('PV1', 'PV2');
do $$ begin
  if not (select oculto from public.painel_faturamento where numero = '1001') then raise exception 'oculto se perdeu'; end if;
  if (select coluna from public.painel_faturamento where numero = '1002') <> 'faturado' then raise exception 'nota manual não faturou'; end if;
  if (select nf_numero from public.painel_faturamento where numero = '1002') <> '9999' then raise exception 'número da nota manual'; end if;
  if (select alterado_por from public.painel_ajustes where pedido_flow_id = 'PV2') <> 'Ana' then raise exception 'carimbo'; end if;
  raise notice 'OK ajustes manuais';
end $$;
set role anon;
do $$ begin
  if (select count(*) from public.painel_ajustes) > 0 then raise exception 'anon leu ajustes'; end if;
  raise notice 'OK anon sem ajustes';
end $$;
reset role;

-- 7) Recebíveis: equipe anota e conclui; diretoria só lê esta parte
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
insert into public.perfis (id, nome, email, papel) values
  ('33333333-3333-3333-3333-333333333333', 'Diretor', 'diretor@lz7.com.br', 'diretoria');
update public.titulos_receber set vencimento = current_date - 10 where flow_id = 'T3b';
update public.titulos_receber set cliente = 'Cliente C (Flow)' where flow_id = 'T3b';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.cobranca_notas (titulo_flow_id, situacao, previsao, motivo) values ('T3b', 'promessa', current_date + 5, 'Cliente pediu prorrogação');
insert into public.cobranca_atualizacoes (qtd_vencidos, valor_vencido, observacao) values (1, 15000, 'revisão semanal');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if (select estado from public.recebiveis where flow_id = 'T3b') <> 'vencido' then raise exception 'estado do título'; end if;
  if (select dias_atraso from public.recebiveis where flow_id = 'T3b') <> 10 then raise exception 'dias em atraso'; end if;
  if (select cobranca_situacao from public.recebiveis where flow_id = 'T3b') <> 'promessa' then raise exception 'diretoria não vê a anotação'; end if;
  if (select cliente from public.recebiveis where flow_id = 'T3b') <> 'Cliente C (Flow)' then raise exception 'cliente'; end if;
  if (select concluida_por from public.cobranca_atualizacoes order by id desc limit 1) <> 'Ana' then raise exception 'carimbo da atualização'; end if;
  if (select count(*) from public.perfis) <> 1 then raise exception 'diretoria deveria ver só o próprio perfil'; end if;
  if (select count(*) from public.pedidos) > 0 or (select count(*) from public.painel_faturamento) > 0 then
    raise exception 'diretoria vê pedidos ou painel';
  end if;
  begin
    insert into public.cobranca_notas (titulo_flow_id, situacao) values ('T4a', 'cobrado');
    raise exception 'diretoria conseguiu anotar';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cobranca_atualizacoes (observacao) values ('x');
    raise exception 'diretoria conseguiu concluir';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK recebíveis e diretoria';
end $$;
reset role;

-- 8) Situações de cobrança configuráveis e apelido
update public.titulos_receber set cliente_apelido = 'Clientinho' where flow_id = 'T3b';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.cobranca_situacoes (id, rotulo, grupo) values ('aguarda_seguro', 'Aguardando seguradora', 'aguardando');
update public.cobranca_notas set situacao = 'aguarda_seguro' where titulo_flow_id = 'T3b';
do $$ begin
  if (select cliente_apelido from public.recebiveis where flow_id = 'T3b') <> 'Clientinho' then raise exception 'apelido'; end if;
  if (select cobranca_situacao from public.recebiveis where flow_id = 'T3b') <> 'aguarda_seguro' then raise exception 'situação personalizada'; end if;
  begin
    update public.cobranca_notas set situacao = 'nao_existe' where titulo_flow_id = 'T3b';
    raise exception 'aceitou situação inexistente';
  exception when foreign_key_violation then null;
  end;
  raise notice 'OK situações personalizadas';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if (select count(*) from public.cobranca_situacoes) < 10 then raise exception 'diretoria não lê situações'; end if;
  begin
    insert into public.cobranca_situacoes (id, rotulo, grupo) values ('x', 'x', 'outro');
    raise exception 'diretoria criou situação';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK diretoria só lê situações';
end $$;
reset role;

-- 9) Ajustes manuais de título: baixa, exclusão e nome
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.titulo_ajustes (titulo_flow_id, baixa_manual, baixa_data, baixa_valor, baixa_obs)
  values ('T3b', true, current_date, 15000, 'PIX recebido');
insert into public.titulo_ajustes (titulo_flow_id, excluido, excluido_motivo) values ('T4a', true, 'Título duplicado');
insert into public.titulo_ajustes (titulo_flow_id, nome_exibicao) values ('T3a', 'Cliente B (apelido manual)');
do $$ begin
  if (select estado from public.recebiveis where flow_id = 'T3b') <> 'recebido' then raise exception 'baixa manual não recebeu'; end if;
  if (select valor_recebido from public.recebiveis where flow_id = 'T3b') <> 15000 then raise exception 'valor da baixa'; end if;
  if (select valor_aberto from public.recebiveis where flow_id = 'T3b') <> 0 then raise exception 'aberto após baixa'; end if;
  if (select estado from public.recebiveis where flow_id = 'T4a') <> 'excluido' then raise exception 'exclusão'; end if;
  if (select cliente_apelido from public.recebiveis where flow_id = 'T3a') <> 'Cliente B (apelido manual)' then raise exception 'nome manual'; end if;
  if (select ajuste_por from public.recebiveis where flow_id = 'T3b') <> 'Ana' then raise exception 'carimbo do ajuste'; end if;
  raise notice 'OK ajustes de título';
end $$;
-- desfazer a baixa volta a ser vencido
update public.titulo_ajustes set baixa_manual = false where titulo_flow_id = 'T3b';
do $$ begin
  if (select estado from public.recebiveis where flow_id = 'T3b') <> 'vencido' then raise exception 'desfazer baixa'; end if;
  raise notice 'OK desfazer baixa';
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if (select count(*) from public.titulo_ajustes) < 3 then raise exception 'diretoria não vê ajustes'; end if;
  begin
    update public.titulo_ajustes set excluido = false where titulo_flow_id = 'T4a';
    if found then raise exception 'diretoria alterou ajuste'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK diretoria só lê ajustes';
end $$;
reset role;

-- 10) Perfil: cada um edita os próprios dados e a foto, sem mexer no papel
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select public.atualizar_meu_perfil('Diretor Novo', 'Diretor financeiro', '(11) 99999-0000');
select public.trocar_minha_foto('33333333-3333-3333-3333-333333333333/foto-1.jpg');
do $$ begin
  begin
    perform public.trocar_minha_foto('11111111-1111-1111-1111-111111111111/foto.jpg');
    raise exception 'aceitou foto de outra pasta';
  exception when raise_exception then
    if sqlerrm = 'aceitou foto de outra pasta' then raise; end if;
  end;
  begin
    update public.perfis set papel = 'admin' where id = auth.uid();
    if found then raise exception 'mudou o próprio papel'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select nome || '|' || cargo || '|' || papel::text || '|' || foto_caminho from public.perfis where id = '33333333-3333-3333-3333-333333333333')
     <> 'Diretor Novo|Diretor financeiro|diretoria|33333333-3333-3333-3333-333333333333/foto-1.jpg' then
    raise exception 'perfil não atualizou como esperado';
  end if;
  raise notice 'OK perfil';
end $$;
