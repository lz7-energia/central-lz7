-- Central LZ7 — dados iniciais do portal (catálogo a validar com o usuário).
-- E-mails dos setores, aprovadores e lista de solicitantes: pendentes.

insert into public.setores (id, nome, ordem) values
  ('financeiro', 'Financeiro', 1),
  ('fiscal',     'Fiscal',     2),
  ('rh',         'RH',         3),
  ('adm',        'ADM',        4)
on conflict (id) do nothing;

insert into public.tipos_pedido (setor_id, nome, exige_aprovacao, prazo_dias, ordem, campos) values
  ('financeiro', 'Solicitação de pagamento', true, 3, 1, '[
    {"chave":"favorecido","rotulo":"Favorecido","tipo":"texto","obrigatorio":true},
    {"chave":"valor","rotulo":"Valor (R$)","tipo":"numero","obrigatorio":true},
    {"chave":"vencimento","rotulo":"Vencimento","tipo":"data","obrigatorio":true},
    {"chave":"codigo_projeto","rotulo":"Código do projeto (se houver)","tipo":"texto","obrigatorio":false},
    {"chave":"motivo","rotulo":"Motivo","tipo":"texto_longo","obrigatorio":true},
    {"chave":"anexo","rotulo":"Boleto ou nota","tipo":"arquivo","obrigatorio":false}]'),
  ('financeiro', 'Reembolso de despesa', true, 5, 2, '[
    {"chave":"valor","rotulo":"Valor (R$)","tipo":"numero","obrigatorio":true},
    {"chave":"data_despesa","rotulo":"Data da despesa","tipo":"data","obrigatorio":true},
    {"chave":"motivo","rotulo":"Motivo","tipo":"texto_longo","obrigatorio":true},
    {"chave":"comprovante","rotulo":"Comprovante","tipo":"arquivo","obrigatorio":true}]'),
  ('financeiro', 'Adiantamento', true, 3, 3, '[
    {"chave":"valor","rotulo":"Valor (R$)","tipo":"numero","obrigatorio":true},
    {"chave":"motivo","rotulo":"Motivo","tipo":"texto_longo","obrigatorio":true}]'),
  ('financeiro', 'Segunda via de boleto ou comprovante', false, 2, 4, '[
    {"chave":"descricao","rotulo":"O que você precisa","tipo":"texto_longo","obrigatorio":true}]'),
  ('financeiro', 'Cadastro de fornecedor', false, 3, 5, '[
    {"chave":"razao_social","rotulo":"Razão social","tipo":"texto","obrigatorio":true},
    {"chave":"cnpj","rotulo":"CNPJ","tipo":"texto","obrigatorio":true},
    {"chave":"contato","rotulo":"Contato","tipo":"texto","obrigatorio":false}]'),

  ('fiscal', 'Emissão de nota fiscal', false, 2, 1, '[
    {"chave":"codigo_projeto","rotulo":"Código do projeto","tipo":"texto","obrigatorio":true},
    {"chave":"observacao","rotulo":"Observação","tipo":"texto_longo","obrigatorio":false}]'),
  ('fiscal', 'Autorização de faturamento (AF)', true, 2, 2, '[
    {"chave":"codigo_projeto","rotulo":"Código do projeto","tipo":"texto","obrigatorio":true},
    {"chave":"observacao","rotulo":"Observação","tipo":"texto_longo","obrigatorio":false}]'),
  ('fiscal', 'Cancelamento ou carta de correção', false, 1, 3, '[
    {"chave":"numero_nf","rotulo":"Número da NF","tipo":"texto","obrigatorio":true},
    {"chave":"motivo","rotulo":"Motivo","tipo":"texto_longo","obrigatorio":true}]'),
  ('fiscal', 'XML ou PDF de uma nota', false, 1, 4, '[
    {"chave":"numero_nf","rotulo":"Número da NF ou código do projeto","tipo":"texto","obrigatorio":true}]'),

  ('rh', 'Abertura de vaga', true, 5, 1, '[
    {"chave":"area","rotulo":"Área","tipo":"texto","obrigatorio":true},
    {"chave":"cargo","rotulo":"Cargo","tipo":"texto","obrigatorio":true},
    {"chave":"quantidade","rotulo":"Quantidade","tipo":"numero","obrigatorio":true},
    {"chave":"justificativa","rotulo":"Justificativa","tipo":"texto_longo","obrigatorio":true}]'),
  ('rh', 'Substituição de quem saiu', true, 5, 2, '[
    {"chave":"quem_saiu","rotulo":"Quem saiu","tipo":"texto","obrigatorio":true},
    {"chave":"cargo","rotulo":"Cargo","tipo":"texto","obrigatorio":true}]'),
  ('rh', 'Declaração ou documento', false, 3, 3, '[
    {"chave":"descricao","rotulo":"O que você precisa","tipo":"texto_longo","obrigatorio":true}]'),

  ('adm', 'Compra ou contratação de serviço', true, 5, 1, '[
    {"chave":"descricao","rotulo":"O que comprar ou contratar","tipo":"texto_longo","obrigatorio":true},
    {"chave":"valor_estimado","rotulo":"Valor estimado (R$)","tipo":"numero","obrigatorio":false}]'),
  ('adm', 'Manutenção de veículo ou equipamento', false, 3, 2, '[
    {"chave":"item","rotulo":"Veículo ou equipamento","tipo":"texto","obrigatorio":true},
    {"chave":"problema","rotulo":"Problema","tipo":"texto_longo","obrigatorio":true}]'),
  ('adm', 'Notebook, celular ou acesso a sistema', false, 3, 3, '[
    {"chave":"descricao","rotulo":"O que você precisa","tipo":"texto_longo","obrigatorio":true}]'),
  ('adm', 'Documento da empresa', false, 2, 4, '[
    {"chave":"documento","rotulo":"Qual documento","tipo":"texto","obrigatorio":true},
    {"chave":"finalidade","rotulo":"Pra que vai usar","tipo":"texto_longo","obrigatorio":false}]')
on conflict (setor_id, nome) do nothing;
