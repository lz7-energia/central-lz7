# Central LZ7 — guia para o Claude

Central empresarial interna da LZ7 Energia, com quatro áreas: Fiscal, Financeiro, RH e ADM.
Funciona **por cima** do ERP Flow (Everflow) e não o substitui: rotinas, prazos, alertas,
conferências e pedidos entre áreas.

A empresa não tem equipe de TI: o Claude constrói e mantém este sistema. O dono das contas
(GitHub, Supabase, Vercel) é o usuário, que aprova cada fase.

## Regras que não mudam

- **A central nunca escreve no Flow.** Só leitura pela API, sem pesar a plataforma e sem risco aos dados do ERP.
- Segredos (token do Flow, chaves do Supabase, senha SMTP) ficam só em variáveis de ambiente do servidor. Nunca no navegador, nunca no repositório.
- Dashboard financeiro e Ciclo comercial (apps já existentes) ficam fora da central por enquanto.
- Textos da interface em português do Brasil.

## Stack

- **Supabase:** Postgres, autenticação, armazenamento de arquivos, rotinas agendadas. Dois projetos, região São Paulo:
  - `central-teste`: `https://ypiudecoofbrqicpwapm.supabase.co`
  - `central-producao`: `https://psfcvqngucsbvfqxdgge.supabase.co`
  - Toda mudança vai primeiro pro teste; produção só depois de aprovada pelo usuário.
- **Vercel:** hospedagem do front-end, conectada a este repositório.
- **E-mail:** Titan, com remetente dedicado (SPF/DKIM configurados no DNS).

## Perfis de acesso

| Perfil | Login | O que vê |
|---|---|---|
| Equipe da central (4 pessoas) | Sim (e-mail Titan) | Tudo, exceto pastas sensíveis |
| Administrador | Sim | Tudo, inclusive pastas sensíveis e permissões |
| Diretoria | Sim | Só os Recebíveis, só leitura (perfil `diretoria`) |
| Colaboradores (40–50) | **Não** | Só o formulário do portal e a consulta do próprio pedido por protocolo |

Regras de acesso aplicadas no banco (Row Level Security), não só na interface.

## API do Flow (mapeada pela própria API em 10/11/2026)

- Base: `https://api.flow2.com.br/v1/`, header `Authorization: Bearer <token>`. Respostas: `{ itens, totalRecords, totalPages, pageSize }`.
- Paginação por deslocamento: `pageSize` + `skip` (skip = quantidade de registros já lidos).
- `/pedidosVenda/`: `id`, `situacao` ("Em digitação", "Aprovado", "Faturado"), `codigoProjeto`, `cliente.nomeRazaoSocial`,
  `dataEmissao`, `dataFaturamento`, `ordemServico.id`, `ordemServicoStatus.descricao`. Totais do cabeçalho e
  `notasFiscaisProdutos` vêm vazios → valor = soma de `/pedidosVenda/itens` (`idPedidoVenda`, `total`).
- `/ordensServico/`: `id`, `idsPedidosVendas[]`, `statusChamado.descricao`, `numerosNotasFiscaisProduto[] {id, numeroNota}`,
  `codigoProjeto`. `dataUltimaAlteracaoStatus` vem sempre vazio → a central marca `status_desde` ela mesma.
- `/statusOrdemServico/`: lista de status. Pipeline "Planejamento e Execução": Adição no Cronograma → Lista de materiais →
  Separação → Entrega → Aguardando instalação → Instalação → **Obra concluída.** → Cancelado.
- `/recebers/`: `situacao` ("A vencer", "Vencido", "Baixado"), `valorBruto`, `valorRecebido`, `idCabPedidoVenda`
  (vínculo com o pedido, ~3/4 dos títulos), `codigoProjeto`, `dataVencimentoReal`, `dataBaixa`.
- `/documentosSaida/`: página "Notas de Produto" (todas as NF-e emitidas, inclusive sem OS/pedido): `id`, `idCliente`
  (= `cliente.id` do pedido), `numeroNota`, `serieNota`, `chaveDanfe`, `dataEmissao`, `dataCancelamento`, `homologacao`,
  `entradaSaida`, `situacaoDocumento`, `idsPedidosVenda[]` (geralmente vazio), `valorTotalNotaFiscal`. `linkDanfe`/`linkDanfeXml` vêm vazios na lista.
- `/clientes/`: cadastro de clientes (`id` = `idCliente` dos títulos e notas, `nomeRazaoSocial`, `apelido`, `cnpjCpf`…). A sincronização usa como fonte final de nome/apelido.
- `/pagars/` existe (não usado ainda). `/nfes` responde 405 a GET. **Download de XML/PDF da NF-e ainda não mapeado** (testar `documentosSaida/{id}`).
- `developers.everflow.io` é outra empresa (marketing), não é este ERP.

Sincronização: Edge Function `flow-sincronizar` (só GET no Flow) copia os dados para o banco da central a cada
30 min (7h–20h, seg–sáb); as telas leem do banco. Detalhes em `supabase/README.md`.

## Fase 1

### Painel de faturamento

- Base: **pedido de venda**. Todo pedido de venda tem OS, e toda OS tem pedido.
- Colunas: Em execução → Pronto pra faturar → Faturado → Recebido.
- "Pronto pra faturar": OS vinculada com status **"Obra concluída."** (decisão de 10/11/2026; não existe "Aguardando vistoria" no Flow) e pedido sem NF-e. Mostra dias parado (contados desde que a central viu o status pela primeira vez).
- "Faturado": nota ligada ao pedido, nesta ordem: (a) nota de `documentosSaida` que informa o pedido; (b) NF-e que vem na OS;
  (c) nota de `documentosSaida` sem pedido, do **mesmo cliente** (`idCliente`), emitida depois do pedido, para pedido ainda sem nota
  — com mais de um candidato decide pelo valor (±2%), sem certeza não liga; (d) pedido com situação "Faturado" (nota sem número).
  Notas canceladas e de homologação são ignoradas.
- OS "Cancelado" some do painel (`status_os_faturamento.oculta_no_painel`).
- Recebido proporcional: soma dos títulos recebidos ÷ total dos títulos do projeto no contas a receber. O card mostra o %. Vai para "Recebido" só com 100%.
- NF-e cancelada → volta para "Pronto pra faturar".

### Portal de pedidos

- Formulário aberto, sem login: setor → tipo de pedido → campos do tipo → protocolo.
- Pedido grava direto no banco e aparece na fila do setor na hora; aviso por e-mail ao responsável.
- Consulta por protocolo + link; identificação por lista fechada de nomes (`solicitantes`).
- Aprovação do gestor por link no e-mail: **desligada em todos os tipos** (decisão de 10/11/2026; aprovações são raras e combinadas direto com os gestores). O recurso existe e pode ser religado por tipo (`tipos_pedido.exige_aprovacao`).
- Proteção do formulário aberto: limite de envios e verificação anti-robô.

### Recebíveis e inadimplência (Financeiro)

- Títulos do Contas a Receber do Flow: vencidos, a vencer e recebidos; nome e apelido vêm do cadastro `/clientes/` (pelo `idCliente`).
- Nome principal = **apelido** do cliente no Flow (`cliente.apelido` / `destinatarioRemetente.apelido`), razão social embaixo (também no painel).
- Situações de cobrança configuráveis pela equipe (`cobranca_situacoes`), cada uma num grupo: inadimplente, em negociação,
  aguardando terceiro, outro. "Panorama dos vencidos": barras por situação (cor do grupo) e por faixa de atraso, com filtros.
- Aba "A vencer": sem colunas de cobrança; filtros de período (hoje, semana até domingo, mês, ano, tudo) com o total previsto;
  gráfico "Previsão de recebimentos" pelo vencimento (por dia, mês ou ano; clique filtra) e totais dos próximos 7/30/90 dias.
- A equipe anota em cada título vencido: situação da cobrança, previsão de pagamento e motivo. "Concluir atualização" registra
  quem/quando e o retrato dos números; a diretoria vê a data da última atualização concluída.
- Ajustes manuais por título, só na central (`titulo_ajustes`; o Flow não é alterado e a sincronização não apaga):
  **baixa manual** (data, valor, observação → vai para Recebidos), **excluir** (aba Excluídos, com restaurar) e **nome para exibir**.
- Aba Recebidos com **todo o histórico** do Flow (o número na aba é o total; abre em "Este ano") e períodos hoje / semana (seg–dom) / mês / ano / tudo / escolher datas (de–até); gráfico "Recebimentos"
  por dia, mês ou ano (clique filtra). Todas as colunas principais ordenáveis (clique no título; sem data vai para o fim).
- O Supabase devolve no máximo 1000 linhas por consulta: telas usam `lib/paginar.ts` (`todasAsLinhas`) e a sincronização `lerTudo`.
- Planilha: `/recebiveis/exportar?aba=vencidos|a_vencer|recebidos&periodo=dia|semana|mes|ano|todos|personalizado[&de=&ate=]` (CSV, padrão Excel pt-BR).

## Planner Eisenhower (`/planner`)

- Recriado do `planner-index.html` (especificação de 11/11/2026, no projeto ADM). Página própria, fora do layout React:
  `app/src/app/planner/route.ts` (casca HTML) + `app/public/planner-app/planner.css|planner.js` (CSS e JS do original).
  Telas, textos, cores, temas e regras de datas idênticos ao original; só troca `claude.use` pelas rotas `/planner/api/*`.
- Um planner por pessoa da equipe (diretoria não tem). Tabelas `planner_tasks`, `planner_events`, `planner_settings`,
  `planner_sync_state` (jsonb com os mesmos campos do original); anexos no bucket privado `planner-anexos` (pasta = id da pessoa).
- Regras de datas existem em dois lugares: `public/planner-app/planner.js` (tela) e `lib/planner/regras.ts` (servidor). Mudou uma, mude a outra.
- ClickUp pela API REST, só no servidor (`lib/planner/sync.ts`, `CLICKUP_API_TOKEN`, time `CLICKUP_TEAM_ID`=90171579328):
  mão dupla com as tarefas abertas atribuídas à pessoa; categoria ↔ lista; quadrante ↔ prioridade; vale a última edição.
  Roda logo depois de cada edição (navegador chama `/planner/api/sync`) e a cada 15 min (pg_cron → `/planner/api/sync/cron`
  com `x-cron-secret` = `PLANNER_CRON_SECRET`). Trava por pessoa (`planner_travar_sync`).
- **Nunca duplicar no ClickUp:** `cuCreating` é gravado no banco antes de criar; com ele, não cria de novo (só se o ClickUp
  recusou — `cuErro` — e a pessoa clicar "Enviar ao ClickUp"). Campos `cu*`/`clickupId` são do servidor: o navegador não os sobrescreve.
- Importar: Configurações → Dados → Importar tarefas (JSON: lista de tasks ou `{tasks, events, settings, sync}`); importar antes de ligar o ClickUp.

## Central de arquivos (ADM, `/arquivos`)

- Documentos da empresa por **empresa → unidade → tipo** (decisão de 11/11/2026). Empresas em ordem alfabética, com cor:
  Eletroposto (cinza), Energia (verde), Mob (azul clarinho), Pandora (preto). Energia: Matriz – Wenceslau Braz, Londrina, Ponta Grossa;
  Mob: Londrina, Wenceslau Braz; Pandora e Eletroposto: unidade única (`arq_unidades.unica`). "+ unidade" cria outras.
- Cada unidade tem dados para copiar (CNPJ, IE, IM, endereço). Tipos: Contratos, Certidões, Licenças e alvarás, Seguros, Veículos,
  Certificado digital, Societário (restrito ao admin), Outros. Documento também pode ser marcado restrito (só admin).
- Arquivos no bucket privado `arquivos-empresa`; envio direto do navegador por link assinado (até 50 MB); abrir/baixar por
  `/arquivos-abrir/[id]` (o banco confere a permissão e o site redireciona para um link de 5 min). "A classificar" = sem unidade.
- Validade com aviso (dias antes): selo vencido/vencendo, lista "Vencendo ou vencidos" e **tarefa "Renovar: …" no planner do
  responsável** (`lib/arquivos-planner.ts`, id `doc-<id>`), que a sincronização do planner leva ao ClickUp.

## Visual e perfil

- Cor da marca `#124735` (verde do logo); logo branco em `app/public/logo-lz7-branco.png`, ícone do site em `app/src/app/icon.png`.
- Cada área e cada módulo tem ícone próprio (`lib/areas.tsx`: `IconeArea`, `IconeModulo`).
- Página `/perfil` (equipe e diretoria): foto (bucket público `fotos-perfil`, pasta = id da pessoa, reduzida no navegador),
  nome, cargo, telefone e troca de senha. Papel e e-mail só o administrador muda (`atualizar_meu_perfil`, `trocar_minha_foto`).

## Site (`app/`)

- Next.js 16 (App Router, Turbopack). A documentação da versão instalada está em
  `app/node_modules/next/dist/docs/`: consultar antes de usar uma API do Next que mudou (ex.: `proxy.ts` substitui `middleware.ts`).
- Equipe: cliente com a sessão do usuário (`lib/supabase/server.ts`), sujeito ao RLS.
- Portal, consulta e aprovação: rotas do servidor com a chave de serviço (`lib/supabase/servico.ts`), só chamando as funções do banco.
- Funções da Vercel na região `gru1` (São Paulo, `app/vercel.json`), perto do Supabase; `perfilAtual` usa `cache` (layout e página dividem a leitura).
- `Referrer-Policy: same-origin` (os links de consulta/aprovação têm token; `no-referrer` quebra as Server Actions).
- Testes: `bash supabase/tests/rodar.sh` (banco) e `testes/ponta-a-ponta/` (site inteiro, sem Docker).

## Documentos de referência

O planejamento completo está no projeto "ADM" do usuário no claude.ai:
handoff do projeto, decisões de 10/11/2026 e os resumos de cada área.
