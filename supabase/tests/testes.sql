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
