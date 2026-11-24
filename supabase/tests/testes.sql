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

-- 7) Recebíveis: equipe anota e conclui; diretoria tem acesso total desde 14/11/2026
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
  if (select count(*) from public.perfis) < 2 then raise exception 'diretoria deveria ver a equipe'; end if;
  begin
    insert into public.cobranca_notas (titulo_flow_id, situacao) values ('T4a', 'cobrado');
    raise exception 'ok_desfaz';
  exception when others then
    if sqlerrm <> 'ok_desfaz' then raise exception 'diretoria não conseguiu anotar: %', sqlerrm; end if;
  end;
  begin
    insert into public.cobranca_atualizacoes (observacao) values ('x');
    raise exception 'ok_desfaz';
  exception when others then
    if sqlerrm <> 'ok_desfaz' then raise exception 'diretoria não conseguiu concluir: %', sqlerrm; end if;
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
    raise exception 'ok_desfaz';
  exception when others then
    if sqlerrm <> 'ok_desfaz' then raise exception 'diretoria não criou situação: %', sqlerrm; end if;
  end;
  raise notice 'OK diretoria edita situações';
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
    if not found then raise exception 'diretoria não alterou ajuste'; end if;
    raise exception 'ok_desfaz';
  exception when others then
    if sqlerrm <> 'ok_desfaz' then raise; end if;
  end;
  raise notice 'OK diretoria edita ajustes';
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

-- 11) Planner: cada um vê só o próprio; diretoria não vê; trava de sincronização
insert into public.perfis (id, nome, email, papel) values ('22222222-2222-2222-2222-222222222222', 'Bia', 'bia@lz7.com.br', 'equipe')
  on conflict (id) do nothing;
insert into public.planner_tasks (user_id, id, data) values
  ('11111111-1111-1111-1111-111111111111', 't1', '{"id":"t1","title":"Apuração"}'),
  ('22222222-2222-2222-2222-222222222222', 't2', '{"id":"t2","title":"De outra pessoa"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.planner_events (user_id, id, data) values ('11111111-1111-1111-1111-111111111111', 'e1', '{"id":"e1"}');
do $$ begin
  if (select count(*) from public.planner_tasks) <> 1 then raise exception 'planner mostra tarefa de outra pessoa'; end if;
  begin
    insert into public.planner_tasks (user_id, id, data) values ('22222222-2222-2222-2222-222222222222', 'x', '{}');
    raise exception 'gravou no planner de outra pessoa';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.planner_sync_state (user_id) values ('11111111-1111-1111-1111-111111111111');
    raise exception 'navegador gravou o estado de sincronização';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if exists (select 1 from public.planner_tasks) then raise exception 'diretoria vê planner'; end if;
end $$;
reset role;
do $$ begin
  if not public.planner_travar_sync('11111111-1111-1111-1111-111111111111') then raise exception 'não travou'; end if;
  if public.planner_travar_sync('11111111-1111-1111-1111-111111111111') then raise exception 'travou duas vezes'; end if;
  raise notice 'OK planner';
end $$;

-- 12) Arquivos: equipe não vê Societário nem restrito; admin vê tudo
insert into auth.users values ('44444444-4444-4444-4444-444444444444');
insert into public.perfis (id, nome, email, papel) values ('44444444-4444-4444-4444-444444444444', 'Admin', 'adm@lz7.com.br', 'admin');
insert into public.arq_documentos (unidade_id, tipo_id, titulo, arquivo_path, arquivo_nome, restrito) values
  ((select id from public.arq_unidades where empresa_id='energia' and nome='Londrina'), 'contratos', 'Locação Londrina', 'a/1.pdf', '1.pdf', false),
  ((select id from public.arq_unidades where empresa_id='energia' and nome='Londrina'), 'societario', 'Contrato social', 'a/2.pdf', '2.pdf', false),
  ((select id from public.arq_unidades where empresa_id='pandora'), 'outros', 'Procuração', 'a/3.pdf', '3.pdf', true);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if (select count(*) from public.arq_documentos) <> 1 then raise exception 'equipe vê documento restrito'; end if;
  begin
    insert into public.arq_documentos (tipo_id, titulo, arquivo_path, arquivo_nome, enviado_por)
      values ('societario', 'x', 'a/4.pdf', '4.pdf', '11111111-1111-1111-1111-111111111111');
    raise exception 'equipe gravou documento restrito';
  exception when insufficient_privilege then null;
  end;
  insert into public.arq_documentos (tipo_id, titulo, arquivo_path, arquivo_nome, enviado_por)
    values (null, 'A classificar', 'a/5.pdf', '5.pdf', '11111111-1111-1111-1111-111111111111');
end $$;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$ begin
  if (select count(*) from public.arq_documentos) <> 4 then raise exception 'admin não vê tudo'; end if;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if not exists (select 1 from public.arq_empresas) then raise exception 'diretoria não vê arquivos'; end if;
  if (select count(*) from public.arq_documentos) >= 4 then raise exception 'diretoria vê documento restrito'; end if;
end $$;
reset role;
do $$ begin raise notice 'OK arquivos'; end $$;

-- 13) Recrutamento: equipe usa; diretoria não vê; repetido por telefone normalizado
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.rh_vagas (cargo, local, quantidade) values ('Vendedor', 'WB', 3);
insert into public.rh_candidatos (vaga_id, nome, whatsapp) values ((select max(id) from public.rh_vagas), 'Joaquim', '(43) 99999-1111');
insert into public.rh_candidatos (vaga_id, nome, whatsapp) values ((select max(id) from public.rh_vagas), 'Joaquim 2', '43999991111');
do $$ begin
  if (select count(distinct whatsapp_norm) from public.rh_candidatos) <> 1 then raise exception 'telefone não normalizou'; end if;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if not exists (select 1 from public.rh_vagas) then raise exception 'diretoria não vê recrutamento'; end if;
end $$;
reset role;
do $$ begin raise notice 'OK recrutamento'; end $$;

-- 14) Avisos do planner: cada um só vê os seus
insert into public.planner_avisos (user_id, de_id, texto) values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'para ana'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'para outro');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if (select count(*) from public.planner_avisos) <> 1 then raise exception 'aviso de outra pessoa visível'; end if;
end $$;
update public.planner_avisos set lido_em = now();
reset role;
do $$ begin
  if (select count(*) from public.planner_avisos where lido_em is not null) <> 1 then raise exception 'marcou aviso de outro como lido'; end if;
end $$;
do $$ begin raise notice 'OK avisos'; end $$;

-- 15) Plataforma de colaboradores: fusão profunda (mapas mesclam, listas substituem), not-found, RLS só equipe
insert into public.plat_docs (colecao, id, data) values ('folhas', '2026-10', '{"status":"aberta","linhas":{"a":{"pronto":false,"x":[1,2]},"b":{"pronto":false}}}');
select public.plat_atualizar('folhas', '2026-10', '{"linhas":{"a":{"pronto":true,"x":[9]}}}');
select public.plat_atualizar('folhas', '2026-10', '{"linhas":{"b":{"pago":true}}}');
do $$ declare d jsonb; begin
  select data into d from public.plat_docs where colecao = 'folhas' and id = '2026-10';
  if d #>> '{linhas,a,pronto}' <> 'true' or d #> '{linhas,a,x}' <> '[9]'::jsonb or d #>> '{linhas,b,pago}' <> 'true'
     or d #>> '{linhas,b,pronto}' <> 'false' or d ->> 'status' <> 'aberta' then raise exception 'fusão errada: %', d; end if;
  begin perform public.plat_atualizar('folhas', 'nao-existe', '{}'); raise exception 'devia dar not-found';
  exception when sqlstate 'P0002' then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria
do $$ begin if (select count(*) from public.plat_docs) <> 1 then raise exception 'diretoria não vê a folha'; end if; end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin if (select count(*) from public.plat_docs) <> 1 then raise exception 'equipe não vê a folha'; end if; end $$;
reset role;
delete from public.plat_docs;
do $$ begin raise notice 'OK colaboradores'; end $$;

-- 16) Fiscal: decisão na pendência e leitura só para a equipe
insert into public.fiscal_notas (origem, flow_id, numero, tipo_doc, direcao, status, competencia, valor_total, icms_xml)
values ('recebida', 't1', '93753', 'resumo', 'entrada', 'pendente', '2026-10', 5000, 120);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.fiscal_decidir((select id from public.fiscal_notas where flow_id = 't1'), 'modelo');
reset role;
do $$ declare n public.fiscal_notas; begin
  select * into n from public.fiscal_notas where flow_id = 't1';
  if n.categoria <> 'entrada_produtos' or n.pis <> 82.50 or n.cofins <> 380.00 or n.icms <> 120 or n.status <> 'ok' or n.decidido_por is null
    then raise exception 'decisão errada: % % % %', n.categoria, n.pis, n.cofins, n.status; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin if (select count(*) from public.fiscal_notas) <> 1 then raise exception 'diretoria não vê o fiscal'; end if; end $$;
reset role;
delete from public.fiscal_log; delete from public.fiscal_notas;
do $$ begin raise notice 'OK fiscal'; end $$;

-- 17) Fiscal: toma / não toma crédito e relatórios do escritório
insert into public.fiscal_notas (origem, flow_id, numero, tipo_doc, direcao, status, categoria, competencia, valor_total, base_credito, credito, credito_origem, pis, cofins, xml_completo)
values ('recebida', 'c1', '513', 'nfe', 'entrada', 'ok', 'entrada_produtos', '2026-10', 11765.50, 11387.50, false, 'regra', 0, 0, true),
       ('recebida', 'c2', '777', 'nfe', 'entrada', 'pendente', null, '2026-10', 100, 90, null, null, null, null, true),
       ('saida_produto', 's1', '964', 'nfe', 'saida', 'ok', 'saida_produtos', '2026-10', 1000, null, null, null, 16.5, 76, true);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if public.fiscal_marcar_credito(array(select id from public.fiscal_notas where flow_id in ('c1', 'c2', 's1')), true, 'escritorio') <> 2
    then raise exception 'marcar crédito: deveria mexer só nas duas entradas'; end if;
end $$;
select public.fiscal_importar_escritorio('{"relacoes":[{"tributo":"pis","competencia":"2026-10","direcao":"entrada","notas":[{"dia":"28","numero":"513","cfop":"1101","emitente":"NDF","valor_contabil":11765.5,"base":11387.5,"valor":187.89}]}],
  "memorias":[{"tributo":"pis","competencia":"2026-10","debito_nc":27553.08,"credito":12180.25,"nc_a_pagar":15372.83,"cumulativo_a_pagar":133.11,"total_a_pagar":15505.94}],
  "darfs":[{"competencia":"2026-10","vencimento":"25/11/2026","itens":[{"codigo":"6912","tributo":"pis","regime":"nc","valor":15372.83}]}]}'::jsonb);
reset role;
do $$ declare n public.fiscal_notas; a public.fiscal_escritorio_apuracao; begin
  select * into n from public.fiscal_notas where flow_id = 'c1';
  if not n.credito or n.credito_origem <> 'escritorio' or n.pis <> 187.89 or n.cofins <> 865.45 then raise exception 'crédito c1 errado: % % %', n.credito, n.pis, n.cofins; end if;
  select * into n from public.fiscal_notas where flow_id = 'c2';
  if n.status <> 'ok' or n.categoria <> 'entrada_produtos' or n.pis <> 1.49 then raise exception 'pendente com crédito errada: % % %', n.status, n.categoria, n.pis; end if;
  select * into n from public.fiscal_notas where flow_id = 's1';
  if n.credito is not null or n.pis <> 16.5 then raise exception 'saída não devia mudar'; end if;
  select * into a from public.fiscal_escritorio_apuracao where competencia = '2026-10' and tributo = 'pis';
  if a.nc_a_pagar <> 15372.83 or a.darf_nc <> 15372.83 or a.credito <> 12180.25 then raise exception 'apuração do escritório errada'; end if;
  if (select count(*) from public.fiscal_escritorio_notas) <> 1 then raise exception 'relação do escritório errada'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if (select count(*) from public.fiscal_escritorio_notas) <> 1 then raise exception 'diretoria não vê o escritório'; end if;
end $$;
reset role;
delete from public.fiscal_escritorio_notas; delete from public.fiscal_escritorio_apuracao; delete from public.fiscal_log; delete from public.fiscal_notas;
do $$ begin raise notice 'OK fiscal crédito'; end $$;

-- 18) Tipos de pedido pela equipe, link extra de acompanhamento e inativo (sem login) sem acesso
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria também pode
insert into public.tipos_pedido (setor_id, nome, campos) values ((select id from public.setores limit 1), 'Tipo de teste', '[{"chave":"cor","rotulo":"Cor","tipo":"lista","opcoes":["Azul","Verde"],"obrigatorio":true}]');
do $$ declare v_id bigint; v jsonb; begin
  select id into v_id from public.tipos_pedido where nome = 'Tipo de teste';
  if public.excluir_tipo_pedido(v_id) <> 'apagado' then raise exception 'tipo sem pedidos deveria ser apagado'; end if;
  select id into v_id from public.pedidos limit 1;
  if v_id is not null then
    v := public.gerar_link_consulta(v_id);
    if v->>'token' is null then raise exception 'link não gerado'; end if;
    if public.excluir_tipo_pedido((select tipo_id from public.pedidos where id = v_id)) <> 'desativado' then raise exception 'tipo usado deveria só sair do portal'; end if;
  end if;
end $$;
reset role;
do $$ declare v_id bigint; v_tok text; v jsonb; begin
  select p.id into v_id from public.pedidos p join public.pedido_links l on l.pedido_id = p.id limit 1;
  if v_id is not null then
    -- o link novo abre a consulta (o token em si não fica guardado; gera outro aqui como a equipe faria)
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
    set local role authenticated;
    v := public.gerar_link_consulta(v_id);
    reset role;
    if public.consultar_pedido(v->>'protocolo', v->>'token') is null then raise exception 'consulta pelo link novo falhou'; end if;
    if public.consultar_pedido(v->>'protocolo', 'token-falso') is not null then raise exception 'consulta aceitou token falso'; end if;
  end if;
  update public.tipos_pedido set ativo = true;
end $$;
update public.perfis set ativo = false where id = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin if public.eh_equipe() then raise exception 'perfil inativo continua com acesso'; end if; end $$;
reset role;
update public.perfis set ativo = true where id = '33333333-3333-3333-3333-333333333333';
do $$ begin raise notice 'OK tipos de pedido e links'; end $$;

-- 19) Financiamento e confirmação: todos veem; equipe/admin gravam; diretoria só vê
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- equipe
insert into public.fin_docs (colecao, id, data) values ('pendentes', 'base', '{"fin":[{"t":"WB260028SGL - MAURI (5 KWp)","v":12760.15}],"conf":[],"removidos":[]}');
insert into public.fin_docs (colecao, id, data) values ('situacoes', 'WB260028SGL', '{"sit":"travado","rota":true}');
update public.fin_docs set data = '{"sit":"andamento"}' where colecao = 'situacoes' and id = 'WB260028SGL';
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria
do $$ begin
  if (select count(*) from public.fin_docs) <> 2 then raise exception 'diretoria não vê o financiamento'; end if;
  if public.fin_pode_editar() then raise exception 'diretoria poderia editar o financiamento'; end if;
  begin
    insert into public.fin_docs (colecao, id, data) values ('status', 'financiamento', '{"por":"Victor"}');
    raise exception 'diretoria gravou no financiamento';
  exception when insufficient_privilege then null;
  end;
  update public.fin_docs set data = '{}' where colecao = 'situacoes';
  if found then raise exception 'diretoria alterou situação'; end if;
  delete from public.fin_docs where colecao = 'situacoes';
  if found then raise exception 'diretoria apagou situação'; end if;
end $$;
reset role;
do $$ begin
  if (select data->>'sit' from public.fin_docs where colecao = 'situacoes') <> 'andamento' then raise exception 'situação mudou'; end if;
  if (select atualizado_por from public.fin_docs where colecao = 'situacoes') <> '11111111-1111-1111-1111-111111111111' then raise exception 'carimbo'; end if;
  begin insert into public.fin_docs (colecao, id) values ('outra', 'x'); raise exception 'aceitou coleção desconhecida'; exception when check_violation then null; end;
end $$;
delete from public.fin_docs;
do $$ begin raise notice 'OK financiamento'; end $$;

-- 20) Comissões LZ7: só equipe e admin veem e gravam; diretoria não vê nada
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- equipe
insert into public.com_docs (colecao, id, data) values ('pessoas', 'p1', '{"nome":"Fulana","cpf":"00000000000","salario_base":7000}');
insert into public.com_docs (colecao, id, data) values ('cfg', 'geral', '{"inicio_apuracao":"2026-10"}');
update public.com_docs set data = '{"inicio_apuracao":"2026-10","semeado":true}' where colecao = 'cfg' and id = 'geral';
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria
do $$ begin
  if (select count(*) from public.com_docs) <> 0 then raise exception 'diretoria vê as comissões'; end if;
  if public.com_pode() then raise exception 'diretoria teria acesso às comissões'; end if;
  begin
    insert into public.com_docs (colecao, id, data) values ('lancamentos', 'x', '{}');
    raise exception 'diretoria gravou nas comissões';
  exception when insufficient_privilege then null;
  end;
  update public.com_docs set data = '{}' where colecao = 'pessoas';
  if found then raise exception 'diretoria alterou colaborador'; end if;
  delete from public.com_docs where colecao = 'pessoas';
  if found then raise exception 'diretoria apagou colaborador'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- equipe
delete from public.com_docs where colecao = 'pessoas' and id = 'p1';
reset role;
do $$ begin
  if (select count(*) from public.com_docs) <> 1 then raise exception 'equipe não apagou'; end if;
  if (select data->>'semeado' from public.com_docs where colecao = 'cfg') <> 'true' then raise exception 'cfg não atualizou'; end if;
  if (select atualizado_por from public.com_docs where colecao = 'cfg') <> '11111111-1111-1111-1111-111111111111' then raise exception 'carimbo'; end if;
  begin insert into public.com_docs (colecao, id) values ('outra', 'x'); raise exception 'aceitou coleção desconhecida'; exception when check_violation then null; end;
end $$;
delete from public.com_docs;
do $$ begin raise notice 'OK comissoes'; end $$;

-- 21) Comissões × folha: cadastro único dos vendedores do Comercial
insert into public.com_docs (colecao, id, data) values
  ('pessoas', 'p1', '{"nome":"Fulana de Tal","cpf":"52998224725","data_inicio":"2022-02-02","ativo":true,"nomes_flow":["Fulana"],"vinculos":[{"id":"v1","unidade_id":"u3","cargo_id":"c6","inicio":"2000-01-01","desligamento":false}]}'),
  ('pessoas', 'p2', '{"nome":"Representante Externo","ativo":true,"nomes_flow":["Rep"],"vinculos":[{"id":"v2","unidade_id":"u4","cargo_id":"c5","inicio":"2000-01-01","desligamento":false}]}'),
  ('unidades', 'u3', '{"nome":"Wenceslau Braz","responsaveis":[{"id":"r3","pessoa_id":"p1","inicio":"2026-10-14","fim":null}]}');
insert into public.plat_docs (colecao, id, data) values
  ('colab', 'c1', '{"nome":"FULANA DE TAL SOUZA","cpf":"529.982.247-25","setor":"Comercial","unidade":"Wenceslau Braz","admissao":"2022-03-01","pixTipo":"Telefone","pixChave":"(43) 99999-0000","desligamento":""}'),
  ('colab', 'c2', '{"nome":"Novo Vendedor","cpf":"11144477735","setor":"COMERCIAL","unidade":"Londrina","admissao":"2026-11-03","pixTipo":"E-mail","pixChave":"novo@x.com","desligamento":""}'),
  ('colab', 'c3', '{"nome":"Pessoa do Financeiro","cpf":"39053344705","setor":"Financeiro","admissao":"2025-01-01","desligamento":""}');
do $$ declare p jsonb; n jsonb; begin
  select data into p from public.com_docs where colecao = 'pessoas' and id = 'p1';
  if p->>'colab_id' <> 'c1' or p->>'nome' <> 'FULANA DE TAL SOUZA' then raise exception 'não casou pelo CPF: %', p; end if;
  if p->>'pix_tipo' <> 'telefone' or p->>'pix_chave' <> '43999990000' then raise exception 'pix: %', p; end if;
  if p->>'data_inicio' <> '2022-02-02' then raise exception 'trocou a data de início sozinha'; end if;
  if p->'nomes_flow' <> '["Fulana"]'::jsonb or p->'vinculos'->0->>'cargo_id' <> 'c6' then raise exception 'mexeu no que é das Comissões'; end if;
  select data into n from public.com_docs where colecao = 'pessoas' and id = 'p-folha-c2';
  if n is null or n->'vinculos' <> '[]'::jsonb or n->'nomes_flow' <> '[]'::jsonb or n->>'data_inicio' <> '2026-11-03' or n->>'pix_tipo' <> 'email' then raise exception 'novo pendente: %', n; end if;
  if exists (select 1 from public.com_docs where colecao = 'pessoas' and data->>'colab_id' = 'c3') then raise exception 'trouxe gente fora do Comercial'; end if;
  if (select count(*) from public.com_docs where colecao = 'auditoria' and data->>'autor' = 'Folha (sincronização)') <> 2 then raise exception 'auditoria da sincronização'; end if;
end $$;
-- desligado na folha → desligado nas Comissões, com a regra do botão Desligar
update public.plat_docs set data = data || '{"desligamento":"2026-11-10","motivoDesligamento":"Pedido de demissão"}' where colecao = 'colab' and id = 'c1';
do $$ declare p jsonb; u jsonb; begin
  select data into p from public.com_docs where colecao = 'pessoas' and id = 'p1';
  if (p->>'ativo')::boolean or p->>'desligado_em' <> '2026-11-10' then raise exception 'não desligou: %', p; end if;
  if p->'vinculos'->1->>'inicio' <> '2026-11-11' or not (p->'vinculos'->1->>'desligamento')::boolean then raise exception 'vínculo de desligamento: %', p->'vinculos'; end if;
  select data into u from public.com_docs where colecao = 'unidades' and id = 'u3';
  if u->'responsaveis'->0->>'fim' <> '2026-11-10' then raise exception 'responsável da unidade não encerrou: %', u; end if;
end $$;
-- gravar de novo a folha não duplica nem desliga duas vezes
update public.plat_docs set data = data || '{"obs":"x"}' where colecao = 'colab' and id = 'c1';
do $$ begin
  if jsonb_array_length((select data->'vinculos' from public.com_docs where colecao = 'pessoas' and id = 'p1')) <> 2 then raise exception 'desligou duas vezes'; end if;
end $$;
-- erro na sincronização nunca impede a gravação da folha
update public.plat_docs set data = data || '{"admissao":"data-ruim"}' where colecao = 'colab' and id = 'c2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- equipe
do $$ declare r jsonb; c jsonb; begin
  r := public.com_sincronizar_folha();
  if (r->>'fora')::int <> 1 or (r->>'criado') is not null then raise exception 'sincronizar tudo: %', r; end if;
  c := public.com_conferencia_folha();
  if jsonb_array_length(c->'pendentes') <> 1 or c->'pendentes'->0->>'nome' <> 'Novo Vendedor' then raise exception 'pendentes: %', c; end if;
  if jsonb_array_length(c->'sem_folha') <> 1 or c->'sem_folha'->0->>'nome' <> 'Representante Externo' then raise exception 'sem folha: %', c; end if;
  if c::text ~ '52998224725|11144477735' then raise exception 'conferência expôs CPF'; end if;
end $$;
reset role;
update public.com_docs set data = data || '{"data_inicio":"2026-11-01"}' where colecao = 'pessoas' and id = 'p-folha-c2';
update public.plat_docs set data = data || '{"admissao":"2026-11-03"}' where colecao = 'colab' and id = 'c2';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ declare c jsonb; begin
  c := public.com_conferencia_folha();
  if jsonb_array_length(c->'admissao') <> 1 then raise exception 'diferença de admissão: %', c; end if;
  perform public.com_usar_admissao_folha('p-folha-c2');
  if (select data->>'data_inicio' from public.com_docs where colecao = 'pessoas' and id = 'p-folha-c2') <> '2026-11-03' then raise exception 'usar admissão'; end if;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria
do $$ begin
  begin perform public.com_conferencia_folha(); raise exception 'diretoria abriu a conferência'; exception when insufficient_privilege then null; end;
  begin perform public.com_sincronizar_folha(); raise exception 'diretoria sincronizou'; exception when insufficient_privilege then null; end;
end $$;
-- diretoria grava na folha (tem acesso a ela) e a sincronização roda mesmo assim
update public.plat_docs set data = data || '{"nome":"Novo Vendedor Silva"}' where colecao = 'colab' and id = 'c2';
reset role;
do $$ begin
  if (select data->>'nome' from public.com_docs where colecao = 'pessoas' and id = 'p-folha-c2') <> 'Novo Vendedor Silva' then raise exception 'folha gravada pela diretoria não sincronizou'; end if;
end $$;
delete from public.com_docs; delete from public.plat_docs where colecao = 'colab' and id in ('c1', 'c2', 'c3');
do $$ begin raise notice 'OK comissoes x folha'; end $$;

-- 22) Régua apagada; ordem dos cards: cada pessoa só vê e grava a própria
do $$ begin
  if to_regclass('public.cobranca_envios') is not null or to_regclass('public.cobranca_regua_etapas') is not null then raise exception 'régua ainda existe'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.tela_ordem (ordem) values ('{"areas":["rh","fiscal"]}');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if exists (select 1 from public.tela_ordem) then raise exception 'viu a ordem de outra pessoa'; end if;
  begin
    insert into public.tela_ordem (perfil_id, ordem) values ('11111111-1111-1111-1111-111111111111', '{}');
    raise exception 'gravou a ordem de outra pessoa';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select ordem->'areas'->>0 from public.tela_ordem where perfil_id = '11111111-1111-1111-1111-111111111111') <> 'rh' then raise exception 'ordem não gravou'; end if;
end $$;
delete from public.tela_ordem;
do $$ begin raise notice 'OK ordem dos cards'; end $$;

-- 23) Conciliação bancária
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- equipe
do $$ declare v1 int; v2 int; v3 int; begin
  v1 := public.conc_gravar('conciliacoes', 'c1', '{"id":"c1","titulo":"Itaú · Out/2026","E":[["2026-10-01",100,"PIX"]],"F":[],"links":[],"exc":{},"mot":{},"saldos":{"eI":0},"fech":null}', null);
  if v1 <> 1 then raise exception 'versão inicial %', v1; end if;
  v2 := public.conc_gravar('conciliacoes', 'c1', '{"id":"c1","titulo":"Itaú · Out/2026","E":[["2026-10-01",100,"PIX"]],"F":[["2026-10-01",100,"Fulano","",""]],"links":[["l1",["e0"],["f0"],"exato",0,""]],"exc":{},"mot":{},"saldos":{"eI":0},"fech":null}', v1);
  if v2 <> 2 then raise exception 'versão 2: %', v2; end if;
  -- outra aba com a versão antiga não sobrescreve
  v3 := public.conc_gravar('conciliacoes', 'c1', '{"id":"c1","titulo":"velho"}', v1);
  if v3 is not null then raise exception 'sobrescreveu com versão antiga'; end if;
  if (select data->>'titulo' from public.conc_docs where id = 'c1') <> 'Itaú · Out/2026' then raise exception 'perdeu o trabalho'; end if;
  -- fechar
  perform public.conc_gravar('conciliacoes', 'c1', (select data || '{"fech":{"manual":true,"por":"VICTOR"},"justif":"ok"}' from public.conc_docs where id = 'c1'), 2);
  -- fechada: não muda vínculos
  begin
    perform public.conc_gravar('conciliacoes', 'c1', (select data || '{"links":[]}' from public.conc_docs where id = 'c1'), 3);
    raise exception 'alterou conciliação fechada';
  exception when raise_exception then
    if sqlerrm not like 'Conciliação fechada%' then raise; end if;
  end;
  -- fechada: encadeamento traz o saldo inicial
  perform public.conc_mesclar('conciliacoes', 'c1', (select jsonb_build_object('saldos', data->'saldos' || '{"eI":500,"origem":{"eI":"final de Set/2026"}}') from public.conc_docs where id = 'c1'));
  if (select (data->'saldos'->>'eI')::int from public.conc_docs where id = 'c1') <> 500 then raise exception 'encadeamento bloqueado'; end if;
  -- reabrir é permitido
  perform public.conc_gravar('conciliacoes', 'c1', (select data || '{"fech":null}' from public.conc_docs where id = 'c1'), (select versao from public.conc_docs where id = 'c1'));
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- diretoria: só vê
do $$ begin
  if (select count(*) from public.conc_docs) <> 1 then raise exception 'diretoria não vê'; end if;
  begin perform public.conc_gravar('bancos', 'b1', '{"nome":"x"}', null); raise exception 'diretoria gravou'; exception when insufficient_privilege then null; end;
  update public.conc_docs set data = '{}' where id = 'c1';
  if found then raise exception 'diretoria alterou'; end if;
end $$;
reset role;
do $$ declare a text; begin
  select string_agg(acao, ',' order by id) into a from public.conc_auditoria where doc_id = 'c1';
  if a <> 'criar,vincular,fechar,saldo,reabrir' then raise exception 'auditoria: %', a; end if;
  if (select por from public.conc_auditoria where doc_id = 'c1' and acao = 'vincular') <> 'Ana' then raise exception 'quem na auditoria'; end if;
end $$;
delete from public.conc_docs; delete from public.conc_auditoria;
do $$ begin raise notice 'OK conciliação'; end $$;

-- 24) Frota: histórico de motorista, multa acha quem dirigia, abastecimento atualiza o km
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ declare v uuid; begin
  insert into public.frota_veiculos (placa, modelo, motorista_colab_id) values ('ABC1D23', 'Strada', 'colab-a') returning id into v;
  if (select count(*) from public.frota_motoristas where veiculo_id = v and ate is null and colab_id = 'colab-a') <> 1 then raise exception 'histórico inicial'; end if;
  update public.frota_motoristas set de = current_date - 30 where veiculo_id = v;
  update public.frota_veiculos set motorista_colab_id = 'colab-b' where id = v;
  if (select count(*) from public.frota_motoristas where veiculo_id = v) <> 2 then raise exception 'troca de motorista'; end if;
  insert into public.frota_multas (veiculo_id, data_infracao, valor) values (v, current_date - 10, 130.16);
  if (select colab_id from public.frota_multas where veiculo_id = v) <> 'colab-a' then raise exception 'multa não achou o motorista da data: %', (select colab_id from public.frota_multas where veiculo_id = v); end if;
  insert into public.frota_abastecimentos (veiculo_id, data, litros, valor, km) values (v, current_date, 40, 250, 12345);
  if (select km_atual from public.frota_veiculos where id = v) <> 12345 then raise exception 'km não atualizou'; end if;
  if (select colab_id from public.frota_abastecimentos where veiculo_id = v) <> 'colab-b' then raise exception 'abastecimento sem motorista'; end if;
  insert into public.frota_abastecimentos (veiculo_id, data, km) values (v, current_date - 5, 12000);
  if (select km_atual from public.frota_veiculos where id = v) <> 12345 then raise exception 'km voltou para trás'; end if;
  if (select alterado_por from public.frota_veiculos where id = v) <> 'Ana' then raise exception 'carimbo: %', (select alterado_por from public.frota_veiculos where id = v); end if;
  begin
    insert into public.frota_veiculos (placa) values ('abc-1d23');
    raise exception 'placa repetida passou';
  exception when unique_violation then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  if exists (select 1 from public.frota_veiculos) then raise exception 'anon vê a frota'; end if;
exception when insufficient_privilege then null; end $$;
reset role;
delete from public.frota_veiculos;
do $$ begin raise notice 'OK frota'; end $$;

-- 25) Central de Obras: perfil "obras" não vê a Central Administrativa, mas tem o próprio planner
insert into auth.users values ('66666666-6666-6666-6666-666666666666');
insert into public.perfis (id, nome, email, papel) values ('66666666-6666-6666-6666-666666666666', 'Letícia', 'leticia@lz7.com.br', 'obras');
set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  if public.eh_equipe() then raise exception 'obras passou como equipe'; end if;
  if public.ve_recebiveis() then raise exception 'obras vê recebíveis'; end if;
  if not public.eh_obras() then raise exception 'obras sem acesso a Obras'; end if;
  if exists (select 1 from public.pedidos) or exists (select 1 from public.titulos_receber) or exists (select 1 from public.plat_docs)
     or exists (select 1 from public.frota_veiculos) or exists (select 1 from public.com_docs) then raise exception 'obras vê dados da Administrativa'; end if;
  insert into public.planner_tasks (user_id, id, data) values ('66666666-6666-6666-6666-666666666666', 't-obras', '{"id":"t-obras","title":"x","start":"2026-11-20"}');
  insert into public.tela_ordem (ordem) values ('{"obras":["logistica"]}');
  if (select count(*) from public.planner_tasks) <> 1 then raise exception 'planner de obras'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if not public.eh_equipe() or not public.eh_obras() then raise exception 'equipe perdeu acesso'; end if;
  if exists (select 1 from public.planner_tasks where user_id = '66666666-6666-6666-6666-666666666666') then raise exception 'viu o planner da Letícia'; end if;
end $$;
reset role;
delete from public.planner_tasks where user_id = '66666666-6666-6666-6666-666666666666';
delete from public.tela_ordem;
do $$ begin raise notice 'OK central de obras'; end $$;

-- 26) Cronograma de obras: só o perfil obras edita, baseline protegida, motivo obrigatório, histórico
insert into public.obra_equipes (id, nome, filial) values ('eq-teste', 'Equipe Teste', 'WB');
set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  insert into public.obra_obras (codigo, nome_card, cliente, entrada, material_entregue) values ('WB260999COL', 'Teste', 'CLIENTE TESTE', '2026-11-01', '2026-11-05');
  if (select filial from public.obra_obras where codigo = 'WB260999COL') <> 'WB' then raise exception 'filial pelo código'; end if;
  perform public.obra_salvar('WB260999COL', '{"equipe_id":"eq-teste","inicio_previsto":"2026-11-20","fim_previsto":"2026-11-21"}');
  if (select baseline_fim from public.obra_obras where codigo = 'WB260999COL') <> '2026-11-21' then raise exception 'baseline não gravou'; end if;
  begin
    perform public.obra_salvar('WB260999COL', '{"inicio_previsto":"2026-11-25","fim_previsto":"2026-11-25"}');
    raise exception 'reprogramou sem motivo';
  exception when check_violation then null; end;
  perform public.obra_salvar('WB260999COL', '{"inicio_previsto":"2026-11-25","fim_previsto":"2026-11-25","baseline_fim":"2030-01-01"}', 'Chuva');
  if (select baseline_fim from public.obra_obras where codigo = 'WB260999COL') <> '2026-11-21' then raise exception 'baseline mudou'; end if;
  if (select count(*) from public.obra_historico where obra = 'WB260999COL' and motivo = 'Chuva') <> 2 then raise exception 'histórico da reprogramação'; end if;
  if (select status from public.obra_v_obras where codigo = 'WB260999COL') <> 'agendada' then raise exception 'status'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if (select count(*) from public.obra_v_obras) <> 1 then raise exception 'equipe não vê o cronograma'; end if;
  begin
    perform public.obra_salvar('WB260999COL', '{"observacoes":"x"}');
    raise exception 'equipe editou o cronograma';
  exception when insufficient_privilege then null; end;
  update public.obra_obras set observacoes = 'x';
  if (select observacoes from public.obra_obras where codigo = 'WB260999COL') is not null then raise exception 'equipe atualizou direto'; end if;
end $$;
reset role;
do $$ begin raise notice 'OK cronograma de obras'; end $$;

-- 27) Pagamento condicionado: equipe (Financeiro) e obras marcam; diretoria só vê; pessoa avisada é da Administrativa
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  perform public.obra_salvar_pagamentos('WB260999COL', '[{"id":"a1","etapa":"entrega","valor":"1500.5","avisar":"11111111-1111-1111-1111-111111111111","obs":" 30% "}]');
  if (select pagamentos->0->>'obs' from public.obra_obras where codigo = 'WB260999COL') <> '30%' then raise exception 'pagamento não gravou'; end if;
  if (select (pagamentos->0->>'valor')::numeric from public.obra_obras where codigo = 'WB260999COL') <> 1500.5 then raise exception 'valor'; end if;
  if not exists (select 1 from public.obra_historico where obra = 'WB260999COL' and campo = 'pagamentos') then raise exception 'histórico do pagamento'; end if;
  begin
    perform public.obra_salvar_pagamentos('WB260999COL', '[{"etapa":"qualquer"}]');
    raise exception 'aceitou etapa inválida';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.obra_salvar_pagamentos('WB260999COL', '[{"etapa":"conclusao","avisar":"66666666-6666-6666-6666-666666666666"}]');
    raise exception 'avisou alguém de Obras';
  exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  perform public.obra_salvar_pagamentos('WB260999COL', '[{"id":"a1","etapa":"entrega","avisar":"11111111-1111-1111-1111-111111111111"},{"etapa":"conclusao"}]');
  if (select jsonb_array_length(pagamentos) from public.obra_obras where codigo = 'WB260999COL') <> 2 then raise exception 'obras não marcou'; end if;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if (select jsonb_array_length(pagamentos) from public.obra_obras where codigo = 'WB260999COL') <> 2 then raise exception 'diretoria não vê'; end if;
  begin
    perform public.obra_salvar_pagamentos('WB260999COL', '[]');
    raise exception 'diretoria editou o pagamento';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from public.obra_obras; delete from public.obra_equipes where id = 'eq-teste';
do $$ begin raise notice 'OK pagamento condicionado'; end $$;

-- 28) Notas a emitir: Flow (OS concluída sem nota), cronograma (obra concluída e OS ainda não) e obra sem pedido
insert into public.pedidos_venda (flow_id, numero, codigo_projeto, cliente, valor_total) values
  ('PV9', '1009', 'SP000009ABC', 'Cliente Nove', 9000), ('PV10', '1010', 'SP000010ABC', 'Cliente Dez', 10000);
insert into public.ordens_servico (flow_id, pedido_flow_id, status, status_desde) values
  ('OS9', 'PV9', 'Instalação', now() - interval '1 day'), ('OS10', 'PV10', 'Obra concluída.', now() - interval '4 days');
insert into public.obra_obras (codigo, nome_card, cliente, entrada, material_entregue, inicio_real, fim_real) values
  ('SP000009ABC', 'Nove', 'CLIENTE NOVE', current_date - 30, current_date - 10, current_date - 3, current_date - 2),
  ('SP000077ABC', 'Sem pedido', 'CLIENTE SETE', current_date - 30, current_date - 10, current_date - 6, current_date - 5),
  ('SP000078ABC', 'Antiga', 'CLIENTE ANTIGO', current_date - 300, current_date - 200, current_date - 100, current_date - 90);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if not exists (select 1 from public.notas_a_emitir where chave = 'PV10' and origem = 'flow' and dias = 4) then raise exception 'flow'; end if;
  if not exists (select 1 from public.notas_a_emitir where chave = 'PV9' and origem = 'cronograma' and dias = 2 and aviso like '%Instalação%') then raise exception 'cronograma'; end if;
  if not exists (select 1 from public.notas_a_emitir where chave = 'obra:SP000077ABC' and origem = 'sem_pedido') then raise exception 'sem pedido'; end if;
  if exists (select 1 from public.notas_a_emitir where codigo_projeto = 'SP000078ABC') then raise exception 'obra antiga entrou'; end if;
  if exists (select 1 from public.notas_a_emitir where chave in ('PV3', 'PV4')) then raise exception 'pedido com nota entrou'; end if;
  insert into public.notas_ocultas_obra (codigo) values ('SP000077ABC');
  if exists (select 1 from public.notas_a_emitir where chave = 'obra:SP000077ABC') then raise exception 'ocultar obra'; end if;
  update public.notas_config set responsavel = '11111111-1111-1111-1111-111111111111' where id;
  if (select alterado_por from public.notas_config) is null then raise exception 'carimbo'; end if;
end $$;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  if exists (select 1 from public.notas_a_emitir) or exists (select 1 from public.notas_config) then raise exception 'obras viu notas'; end if;
end $$;
reset role;
delete from public.obra_obras where codigo like 'SP0000%';
do $$ begin raise notice 'OK notas a emitir'; end $$;

-- 29) Fechamento do projeto: recebido 100% + nota + indicador (pago ou sem); fechar mesmo assim com motivo
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  -- PV4: nota e 100% recebido, indicador não informado → aberto
  if (select fechado from public.projetos_fechamento where flow_id = 'PV4') then raise exception 'fechou sem indicador'; end if;
  if (select indicador from public.projetos_fechamento where flow_id = 'PV4') <> 'nao_informado' then raise exception 'indicador'; end if;
  insert into public.projeto_fechamento (pedido_flow_id, indicador_nome, indicador_valor) values ('PV4', 'João Indica', 500);
  if (select indicador from public.projetos_fechamento where flow_id = 'PV4') <> 'a_pagar' or (select fechado from public.projetos_fechamento where flow_id = 'PV4') then raise exception 'a pagar'; end if;
  update public.projeto_fechamento set indicador_pago_em = current_date where pedido_flow_id = 'PV4';
  if not (select fechado from public.projetos_fechamento where flow_id = 'PV4') then raise exception 'não fechou'; end if;
  if (select alterado_por from public.projeto_fechamento where pedido_flow_id = 'PV4') is null then raise exception 'carimbo'; end if;
  -- PV3: 50% recebido → aberto mesmo sem indicador; fechar mesmo assim exige motivo
  insert into public.projeto_fechamento (pedido_flow_id, sem_indicador) values ('PV3', true);
  if (select fechado from public.projetos_fechamento where flow_id = 'PV3') then raise exception 'fechou com saldo'; end if;
  if (select falta_receber from public.projetos_fechamento where flow_id = 'PV3') <> 15000 then raise exception 'falta receber'; end if;
  begin
    update public.projeto_fechamento set fechado_manual = true where pedido_flow_id = 'PV3';
    raise exception 'fechou sem motivo';
  exception when check_violation then null; end;
  update public.projeto_fechamento set fechado_manual = true, fechado_motivo = 'Cliente pagou por fora' where pedido_flow_id = 'PV3';
  if not (select fechado from public.projetos_fechamento where flow_id = 'PV3') then raise exception 'fechar mesmo assim'; end if;
  begin
    insert into public.projeto_fechamento (pedido_flow_id, sem_indicador, indicador_nome) values ('PV2', true, 'X');
    raise exception 'sem indicador com nome';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  if exists (select 1 from public.projetos_fechamento) or exists (select 1 from public.projeto_fechamento) then raise exception 'obras viu fechamento'; end if;
end $$;
reset role;
delete from public.projeto_fechamento;
do $$ begin raise notice 'OK fechamento do projeto'; end $$;

-- 30) DFC: rateio vira uma linha por parte; diferença (juros) vira linha própria; equipe lê, obras não
insert into public.dfc_naturezas (id, descricao, grupo) values (44, 'Combustível', 'Despesas operacionais'), (14, 'Pedágio', 'Despesas operacionais'), (2, 'Receita com vendas', 'Receitas operacionais');
insert into public.dfc_centros (id, descricao) values (11, 'Obras'), (19, 'Logística'), (2, 'Comercial');
insert into public.dfc_titulos (tipo, flow_id, data_baixa, valor, valor_pago, juros, natureza_id, centro_id, pessoa, tem_rateio, detalhado) values
  ('pagar', '43', '2026-07-07', 202.74, 210.00, 7.26, 44, 11, 'KATIA PG', true, true),
  ('receber', '24', '2026-07-14', 3000, 3000, 0, 2, 2, 'JAIR', false, false);
insert into public.dfc_rateios (tipo, flow_id, titulo_id, valor, natureza_id, centro_id) values
  ('pagar', '5673', '43', 141.44, 44, 11), ('pagar', '5674', '43', 61.30, 14, 19);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if (select count(*) from public.dfc_lancamentos where titulo_id = '43') <> 3 then raise exception 'linhas do rateio'; end if;
  if (select sum(valor) from public.dfc_lancamentos where titulo_id = '43') <> 210.00 then raise exception 'total pago'; end if;
  if (select valor from public.dfc_lancamentos where titulo_id = '43' and parte = 'diferenca') <> 7.26 then raise exception 'diferença'; end if;
  if (select centro from public.dfc_lancamentos where rateio_id = '5674') <> 'Logística' then raise exception 'centro do rateio'; end if;
  if (select valor_sinal from public.dfc_lancamentos where titulo_id = '24') <> 3000 or (select valor_sinal from public.dfc_lancamentos where rateio_id = '5673') <> -141.44 then raise exception 'sinal'; end if;
  if (select natureza_grupo from public.dfc_lancamentos where titulo_id = '24') <> 'Receitas operacionais' then raise exception 'grupo'; end if;
end $$;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  if exists (select 1 from public.dfc_lancamentos) or exists (select 1 from public.dfc_titulos) then raise exception 'obras viu o DFC'; end if;
end $$;
reset role;
delete from public.dfc_titulos; delete from public.dfc_naturezas; delete from public.dfc_centros;
do $$ begin raise notice 'OK dfc'; end $$;

-- 31) Sistema: só o administrador lê a saúde e dispara; equipe recebe recusa
insert into public.sincronizacoes (recurso, iniciada_em, terminada_em, sucesso, erro) values
  ('flow', now() - interval '40 min', now() - interval '39 min', false, 'HTTP 500'), ('flow', now() - interval '10 min', now() - interval '9 min', false, 'HTTP 502');
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$ declare j jsonb; begin
  j := public.admin_saude();
  if jsonb_array_length(j->'sincronizacoes') <> 3 then raise exception 'saude: %', j; end if;
  if (j->'sincronizacoes'->0->'rodadas'->0->>'erro') <> 'HTTP 502' then raise exception 'rodadas'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin perform public.admin_saude(); raise exception 'equipe viu a saúde'; exception when insufficient_privilege then null; end;
  begin perform public.admin_disparar_sincronizacao('flow'); raise exception 'equipe disparou'; exception when insufficient_privilege then null; end;
  if exists (select 1 from public.sync_funcoes) then raise exception 'equipe leu sync_funcoes'; end if;
end $$;
reset role;
do $$ begin raise notice 'OK sistema'; end $$;
