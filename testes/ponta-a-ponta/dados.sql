-- Dados de teste para o ponta a ponta
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.perfis (id, nome, email, papel) values ('11111111-1111-1111-1111-111111111111', 'Ana Teste', 'ana@lz7.com.br', 'admin');
update public.setores set email_responsavel = 'fiscal@lz7.com.br' where id = 'fiscal';
insert into public.solicitantes (nome, email, gestor_email) values
  ('Bruno Vendedor', 'bruno@lz7.com.br', 'gestor@lz7.com.br'),
  ('Carla Comercial', 'carla@lz7.com.br', null);
insert into public.pedidos_venda (flow_id, numero, codigo_projeto, cliente, valor_total, responsavel) values
  ('pv1', '1001', 'SP000101RES', 'Mercado Bom Preço', 48500, 'Ana Teste'),
  ('pv2', '1002', 'SP000102COM', 'Padaria Sol', 32100, null),
  ('pv3', '1003', 'MG000103RES', 'João da Silva', 21900, 'Ana Teste'),
  ('pv4', '1004', 'SP000104IND', 'Metalúrgica Forte', 156000, null),
  ('pv5', '1005', 'RJ000105RES', 'Maria Souza', 18700, null);
insert into public.ordens_servico (flow_id, pedido_flow_id, numero, status, status_desde) values
  ('os1', 'pv1', 'OS-1', 'Obra concluída.', now() - interval '8 days'),
  ('os2', 'pv2', 'OS-2', 'Obra concluída.', now() - interval '2 days'),
  ('os3', 'pv3', 'OS-3', 'Concluída', now() - interval '20 days'),
  ('os4', 'pv4', 'OS-4', 'Em instalação', now() - interval '3 days'),
  ('os5', 'pv5', 'OS-5', 'Concluída', now() - interval '40 days');
insert into public.notas_fiscais (flow_id, pedido_flow_id, numero, situacao, valor, emitida_em) values
  ('nf3', 'pv3', '5501', 'autorizada', 21900, now() - interval '15 days'),
  ('nf5', 'pv5', '5420', 'autorizada', 18700, now() - interval '35 days'),
  ('nf2', 'pv2', '5502', 'cancelada', 32100, now() - interval '1 day');
insert into public.titulos_receber (flow_id, pedido_flow_id, codigo_projeto, valor, valor_recebido) values
  ('t1', 'pv3', 'MG000103RES', 10950, 10950), ('t2', 'pv3', 'MG000103RES', 10950, 0),
  ('t3', 'pv5', 'RJ000105RES', 18700, 18700);
insert into public.sincronizacoes (recurso, terminada_em, registros, sucesso) values ('pedidosVenda', now(), 5, true);
