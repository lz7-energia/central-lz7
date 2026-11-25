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
| Diretoria | Sim | Tudo, como a equipe (acesso total desde 14/11/2026; perfil `diretoria`) |
| Obras (Letícia e equipe de obras/logística) | Sim | **Só a Central de Obras** (perfil `obras`, desde 20/11/2026); área em `perfis.area_obras`: `obras` (Letícia) ou `logistica` (Adalto) |
| Colaboradores (40–50) | **Não** | Só o formulário do portal e a consulta do próprio pedido por protocolo |

Regras de acesso aplicadas no banco (Row Level Security), não só na interface. `eh_equipe()` = Central Administrativa = perfil ativo que
não é `obras` (equipe, admin, diretoria); `eh_obras()` = qualquer perfil ativo (Central de Obras e planner).

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

Sincronização: Edge Function `flow-sincronizar` (no central-teste publicada com o nome automático `hyper-function`; só GET no Flow) copia os dados para o banco da central a cada
30 min (8h–00h de Brasília, seg–sáb; `supabase/agendar-sincronizacao.sql`); as telas leem do banco. Detalhes em `supabase/README.md`.
Rodadas **leves** a cada 30 min (23/11/2026): não releem `clientes/` (usam a cópia em `clientes_flow`) nem `pedidosVenda/itens` (só se
apareceu pedido novo; pedido existente mantém o `valor_total` gravado). Com pedido novo, a leve lê `clientes/{id}` do cliente dele
(até 30) e grava em `clientes_flow`; quando lê os itens, guarda `pedidos_venda.itens` ([{descricao, quantidade, total}]). No fim chama
`obra_importar_flow()` (Central de Obras; resumo em `obras`). **Completa** todo dia às 3h10 com corpo `{"completo": true}`
(`supabase/agendar-sincronizacao-completa.sql`); sem cópia do cadastro, a leve vira completa. O resumo da rodada traz `modo`.

## Fase 1

### Notas a emitir (antigo Painel de faturamento, `/painel`)

- Entrou no lugar do quadro de 4 colunas em 22/11/2026 (migração `20261122000030_notas_a_emitir.sql`): aba **A emitir** (view
  `notas_a_emitir`, mais parado primeiro), **Emitidas** (faturado/recebido do `painel_faturamento`, por mês, com % recebido) e **Ocultos**.
- Fontes da lista: `flow` (coluna pronto_faturar abaixo), `cronograma` (obra com `fim_real` no Cronograma cujo pedido com o mesmo código
  ainda está em execução no Flow; aviso "falta mudar a OS") e `sem_pedido` (obra concluída nos últimos 60 dias sem pedido com o código;
  ocultar em `notas_ocultas_obra`). A view só responde à Central Administrativa (e ao servidor).
- "Tarefas no planner de" (`notas_config.responsavel`, começa em ninguém): tarefa `nf-<chave>` "Emitir nota: <cliente>" por item, data =
  desde quando está pronto, categoria FIS (`lib/notas-planner.ts`); refeita a cada ação da tela e pelo agendador do planner (15 min);
  some quando a nota aparece, o card é ocultado ou "Já tem nota". Link `/painel?busca=<código>`.
- Card "Canceladas e cartas de correção" saiu (decisão do usuário: não vão ter).

Regras do pedido de venda (base das fontes `flow` e Emitidas):

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
- Pedido novo ("Aberto") mostra **Aceitar / Recusar** na fila e na página do pedido: aceitar pede a **previsão de conclusão**
  (vira o `prazo`, que o solicitante vê como "Previsão") e põe quem aceitou como responsável; recusar exige motivo
  (vai por e-mail e aparece na consulta do solicitante). Ação `responderPedido`.
- Aprovação do gestor por link no e-mail: **desligada em todos os tipos** (decisão de 10/11/2026; aprovações são raras e combinadas direto com os gestores). O recurso existe e pode ser religado por tipo (`tipos_pedido.exige_aprovacao`).
- Proteção do formulário aberto: limite de envios e verificação anti-robô.
- **Tipos de pedido** (`/pedidos/tipos`): a equipe cria, edita e exclui tipos e as perguntas de cada um (texto curto/longo, valor, data,
  lista de opções, anexo). Chave da pergunta antiga é mantida. Excluir (`excluir_tipo_pedido`): sem pedidos apaga; com pedidos só sai do portal ("Voltar ao portal").
- **Concluir e link de acompanhamento** (página do pedido): "Marcar como feito e pronto" conclui e manda e-mail com link ao solicitante;
  "Gerar link" cria um link extra (`pedido_links`, `gerar_link_consulta`) para copiar/WhatsApp/e-mail. O link do e-mail de confirmação continua valendo.

### Recebíveis e inadimplência (Financeiro)

- Títulos do Contas a Receber do Flow: vencidos, a vencer e recebidos; nome e apelido vêm do cadastro `/clientes/` (pelo `idCliente`).
- Nome principal = **apelido** do cliente no Flow (`cliente.apelido` / `destinatarioRemetente.apelido`), razão social embaixo (também no painel).
- Situações de cobrança configuráveis pela equipe (`cobranca_situacoes`), cada uma num grupo: inadimplente, em negociação,
  aguardando terceiro, outro. "Panorama dos vencidos": barras por situação (cor do grupo) e por faixa de atraso, com filtros.
- Aba "A vencer": sem colunas de cobrança; filtros de período (hoje, semana até domingo, mês, ano, tudo) com o total previsto;
  gráfico "Previsão de recebimentos" pelo vencimento (por dia, mês ou ano; clique filtra) e totais dos próximos 7/30/90 dias.
- A equipe anota em cada título vencido: situação da cobrança, previsão de pagamento e motivo (na tabela: previsão logo abaixo do atraso; motivo em coluna larga, até 3 linhas, clique ou mouse para ler inteiro). "Concluir atualização" registra
  quem/quando e o retrato dos números; todos veem quem/quando editou cada título e a data da última atualização concluída.
- Ajustes manuais por título, só na central (`titulo_ajustes`; o Flow não é alterado e a sincronização não apaga):
  **baixa manual** (data, valor, observação → vai para Recebidos), **excluir** (aba Excluídos, com restaurar) e **nome para exibir**.
- Aba Recebidos com **todo o histórico** do Flow (o número na aba é o total; abre em "Este ano") e períodos hoje / semana (seg–dom) / mês / ano / tudo / escolher datas (de–até); gráfico "Recebimentos"
  por dia, mês ou ano (clique filtra). Todas as colunas principais ordenáveis (clique no título; sem data vai para o fim).
- O Supabase devolve no máximo 1000 linhas por consulta: telas usam `lib/paginar.ts` (`todasAsLinhas`) e a sincronização `lerTudo`.
- Caixa de edição na tabela (Atualizar, Dar baixa, Excluir, Editar nome) fica na largura visível e parada ao rolar para o lado;
  motivo em campo de várias linhas, cursor já no motivo, Ctrl+Enter salva.
- **Pago por financiamento** (`titulo_ajustes.financiamento`): marcado no título (vencidos/a vencer).
- Planilha: `/recebiveis/exportar?aba=vencidos|a_vencer|recebidos&periodo=dia|semana|mes|ano|todos|personalizado[&de=&ate=]` (CSV, padrão Excel pt-BR).

### Clientes (`/clientes`, menu do topo)

- **Projetos** (aba padrão, 22/11/2026, migração `20261122000031_projetos_fechamento.sql`): um por pedido de venda (view `projetos_fechamento`
  sobre o `painel_faturamento`): % recebido e quanto falta, nota (em obra / falta emitir / emitida) e **indicador** (não informado / sem /
  a pagar / pago, com nome, valor, data e observação em `projeto_fechamento`, só na central). **Fechado** = recebido 100% + nota emitida +
  indicador pago ou sem indicador; "Fechar mesmo assim" exige motivo ("Reabrir" desfaz). Abas Em aberto / Fechados / Todos, filtro por
  pendência e "Marcar como sem indicador" em lote. Ações em `app/(equipe)/clientes/acoes.ts`. A ficha mostra o fechamento de cada pedido.
- **Buscar cliente** (`?aba=clientes`): a busca antiga, abaixo.

- Ficha do cliente (20/11/2026), só leitura do que já está no banco: `lib/clientes.ts`. Chave = id do cliente no Flow
  (`clientes_flow.flow_id` = `titulos_receber.id_cliente` = `pedidos_venda.bruto->cliente->>id`).
- Busca por nome, apelido, CPF/CNPJ (5+ dígitos) ou código do projeto; sem termo, os clientes com títulos em aberto (mais vencido primeiro).
- Ficha: contato (WhatsApp), em aberto / vencido / recebido, pedidos com a situação do painel (OS, nota, % recebido), cards do
  Financiamento (casa pelo código do projeto no início do título do card ou pelo nome) e títulos com a anotação de cobrança.
- O nome do cliente nos Recebíveis abre a ficha.

### Régua de cobrança: apagada

- Apagada de vez em 20/11/2026 (decisão do usuário), junto com os cards "Central de boletos" (DDA) e "Agenda de entrevistas".
  Ficaram `clientes_flow` (cadastro do Flow com contato, usado pela sincronização) e o "Pago por financiamento" dos Recebíveis.

### Conciliação bancária (Financeiro, `/conciliacao`)

- Migrada da plataforma da Controladoria em 20/11/2026 (pacote `Conciliacao_LZ7_exportacao_2026-11-20`: ESPECIFICACAO.md, app,
  dados_completos.json, conversores). **Regras de conciliação, saldos, encadeamento, relatórios e PDFs são os da especificação.**
  O Flow continua entrando pelo Excel de Movimento Bancário (API do Flow para isso fica para depois, decisão do usuário).
- Página própria (`app/conciliacao/route.ts`): `public/conc-app/conciliacao.css|js` = CSS/JS do original; só 15 linhas originais
  mudaram, todas marcadas "Central:". `central-conc.js` = adaptador `claude.use("db"|"user"|"downloads")` sobre `conc_docs
  (colecao, id, data jsonb, versao)` com as coleções do original (bancos, conciliacoes, resumos, faltas, config); tempo real
  (menos conciliações, lidas ao abrir).
- Melhorias (seção 21 da especificação, menos a API): FITID do OFX guardado no lançamento do extrato (4º campo de `E`) e usado
  primeiro ao "Atualizar arquivos" (`remapE`; sem FITID vale a chave antiga); gravação condicionada à versão aberta (`conc_gravar`:
  se outra pessoa salvou, code `conflict`, nada é sobrescrito e a pessoa reabre); auditoria por gatilho (`conc_auditoria`: vínculos,
  exclusões, justificativas, ajustes e saldos, fechar/reabrir, troca de arquivos, título; painel "Histórico de alterações");
  lotes do mesmo dia encaixados juntos antes do passo 3 original (`autoMatch` passo 3a); conciliação fechada bloqueada até "Reabrir"
  (tela + gatilho no banco; o encadeamento ainda traz o saldo inicial); sem o corte do histórico do Flow em 60 caracteres.
- PDF do banco no próprio envio (`public/conc-app/conc-pdf.js`): tradução dos conversores Sicoob, BB, Cresol e PagueVeloz
  (pdf.js montando linhas como o `pdftotext -layout`); histórico e FITID iguais ao OFX gerado pelos conversores; recusa o arquivo se
  os saldos diários/final não baterem. Testado com PDFs montados em cada layout (idêntico aos conversores); falta conferir com PDFs reais.
- **Relatório por conta e mês** (25/11/2026): no Histórico, filtros **Conta** e **Mês** (além de busca e situação); "Exportar resumo em PDF"
  (original) sai com o filtro e "Exportar planilha" (`public/conc-app/conc-relatorio.js`, `exportarPlanilhaHist`) gera Excel com as abas
  Resumo (uma linha por conciliação) e Lançamentos (extrato e Flow com situação conciliado/justificado/pendente/excluído, tipo ou motivo e
  observação). Só lê; nome do arquivo com a conta e o mês. Linhas novas no `conciliacao.js` marcadas "Central:".
- Acesso: todos os perfis ativos veem; equipe e admin editam; diretoria só vê (`conc_pode_editar`, RLS; tela em somente leitura).
- Migração única: `/conciliacao/importar` (só admin) lê o `dados_completos.json` no navegador. Teste (20/11/2026): as 36 conciliações
  abrem com situação, pendentes, diferença em aberto e saldos finais iguais aos resumos da plataforma original, sem regravar nada.

### Fluxo de caixa — DFC realizado (Financeiro, `/dfc`)

- Pedido de 23/11/2026: **só o realizado, só do Flow**, exatamente como lá: títulos **baixados** do contas a pagar (saídas) e a receber
  (entradas), na data da baixa, **com o rateio**. Saldo inicial = saldo final do extrato (`sFinE`, **em centavos** na conciliação) da última conciliação de cada banco que
  termina antes do período (`conc_docs` resumos); saldo final = inicial + entradas − saídas. Migração `20261123000032_dfc.sql`.
- Sincronização: Edge Function `dfc-sincronizar` (no central-teste publicada como `super-function`; só GET; `supabase/agendar-dfc.sql`).
  Endereços (explorador de 23/11/2026): lista `pagars/` com `carregarValor/Fornecedor/Natureza/CentroCusto/Banco` (a lista não traz valor pago,
  juros, OS nem rateio) + detalhe `pagars/{id}` (`valorpago`, `juros`, `multa`, `desconto`, `idOrdemServico`, `codigoProjeto`,
  `historicoEmissaoObservacao`, `rateios[] {id, valor, idNatureza, idCentroCusto}`); `recebers/` com `carregarCliente/Natureza/CentroCusto/Banco`
  (já traz `valorRecebido`; detalhe só se `temRateio`); `naturezas/` (com grupo) e `centrosCusto/`. O Flow **não filtra por data** na lista:
  cada rodada lê as listas inteiras e só abre o detalhe de título novo ou mudado (`assinatura`), até 80 s por rodada; a primeira carga leva
  algumas rodadas. Título que deixa de estar baixado sai do DFC. `movimentosBancarios/` existe (PG/RC/MB por banco) e não é usado.
- `dfc_titulos`, `dfc_rateios`, `dfc_naturezas`, `dfc_centros`; view `dfc_lancamentos` = uma linha por parte do rateio (ou o título inteiro);
  diferença entre valor pago e soma do rateio (juros/multa/desconto) vira linha própria na natureza/centro do título. Nome do cliente que
  não vier na lista sai do `clientes_flow`. RLS `eh_equipe()`.
- Tela: período (este mês / mês passado / este ano / datas), saldo inicial por banco (avisa conciliação atrasada), "Por natureza"
  (grupo → natureza, clique filtra), filtros por valor, fornecedor/cliente, descrição, centro de custo, grupo, natureza, OS, código do
  projeto e banco; planilha CSV. Base para o DRE futuro.
- Filtros com vários valores (23/11/2026): centro de custo, grupo, natureza e banco em lista com caixas de marcar (`MultiSelecao`, com busca);
  fornecedor, descrição, OS e código do projeto aceitam vários termos separados por vírgula. Botão **Números / Gráficos** (lembrado no
  navegador): `dfc/Graficos.tsx`, SVG próprio seguindo o skill de dataviz — entradas × saídas por dia (até 62 dias) ou mês (azul `#2a78d6`
  × vermelho `#e34948`, validados), saldo dia a dia a partir da conciliação, e rankings (10 maiores + Outros) de saídas/entradas por
  natureza e centro de custo; clique no ranking acrescenta o filtro. Os gráficos usam os lançamentos já filtrados.

### Financiamento e confirmação de pagamento (Financeiro, `/financiamento`)

- Migrado da aba "Financiamento e confirmação" da plataforma Contas a Receber LZ7 em 17/11/2026 (pacote `central-lz7-financiamento`:
  ESPECIFICACAO.md, referência HTML, dados-atuais.json, PENDENTES_modelo.xlsx). **Regras, cálculos, filtros, cores e textos não mudam.**
- Página própria (`app/financiamento/route.ts` + `lib/financiamento-tela.ts`): `public/fin-app/financiamento.css|js` são o CSS/JS da
  referência; únicas trocas marcadas "Central:" (permissão do login e `S.db`). `public/fin-app/central-fin.js` = adaptador estilo
  Firestore sobre a tabela `fin_docs (colecao, id, data jsonb)` com os mesmos documentos do original: `pendentes/base`,
  `situacoes/<chave>`, `config/motivosFunil`, `status/financiamento`; tempo real. XLSX do `colab-app/vendor`.
- Importação aditiva, card que passa de Financiamento para Confirmação, removidos que não voltam, observação editada que vale sempre,
  "Concluir atualização" sempre como **Victor**: tudo no JS original.
- Acesso: todos os perfis ativos veem; **só equipe e admin editam; diretoria só vê** (decisão de 17/11/2026), no banco (`fin_pode_editar`, RLS).
- Migração única: `/financiamento/importar` (só admin) lê o `dados-atuais.json` no navegador; nomes de clientes nunca vão ao repositório.
- Teste (17/11/2026): 47 cards / R$ 1.663.842,30 e 6 / R$ 280.544,94; planilha modelo = 0 cards novos; diretoria sem botões e o banco recusa gravação.

## Central de Obras (`/obras`)

- Pedido dos diretores (20/11/2026): **mesmo sistema, mesmo banco e mesmo login**, com duas centrais. Migração `20261120000027_central_obras.sql`
  (perfil `obras` no enum `papel`; `eh_equipe`/`ve_recebiveis` excluem `obras`; `eh_obras()`; planner e `tela_ordem` liberados a todo perfil ativo).
- Login → `/escolher` (Administrativa ou Obras) para quem vê as duas; perfil `obras` vai direto para `/obras` e qualquer página da
  Administrativa o manda de volta (layouts `(equipe)`/`(gestao)` com `veAdm`; páginas próprias com checagem de papel). `lib/centrais.ts`.
- Topo com `central="obras"` (menu Início, Compras, Logística, Obras, Planner; botão ↔ para trocar de central). `/perfil` em `(conta)`, vale para as duas.
- Início de Obras: Meu dia (só planner: `meuDia(id, { soPlanner: true })`, componentes em `components/MeuDia.tsx`) e cards
  das áreas `lib/areas-obras.tsx` (Compras, Logística, Obras), reorganizáveis (`tela_ordem.ordem.obras`, módulos em `modulos["obras-<área>"]`).
- **Telas separadas** (24/11/2026, pedido da diretoria): Início de Obras = card grande **Cronograma de instalação** no topo (semana e obras em
  aberto, `lib/obras-resumo.ts`), planner e Meu dia embaixo, depois Compras (em breve), Logística e Obras com os pendentes no card.
  Logística: Entregas pendentes (`#entregas`), Indicadores da logística (`#ind-logistica`). Obras: Instalações pendentes (`#pendentes`),
  Equipes (`#equipes`), Indicadores de obras (`#indicadores`), Configurações (`#config`). Cada tela abre sozinha, sem menu lateral,
  com "‹ volta" para a área (endereços antigos `#fila`, `#alertas`, `#relatorios` ainda funcionam).
- **Pendências e Meu dia de Obras** (24/11/2026; migração `20261124000037_obras_pendencias_tags.sql`): na Início, cada um vê as pendências
  da sua área (`obra_area`; quem não é do perfil obras vê as duas), calculadas em `lib/obras-resumo.ts` e que somem quando a obra é preenchida:
  logística = obra nova sem previsão de entrega, entrega atrasada; obras = avisos da logística, obra para agendar a instalação (material
  previsto ou entregue, sem data), instalação atrasada. **Avisos** (`obra_avisos`, gatilho `obra_gerar_avisos`): previsão de entrega mudou
  numa obra com instalação marcada, e material entregue; um aviso aberto por obra e tipo (atualiza o texto); resolvem sozinhos quando a
  instalação é remarcada/iniciada/concluída ou com **Ciente** (`obra_aviso_ciente`; na Início, em Instalações pendentes e na ficha).
  Início enxuta (pedido do usuário): Cronograma no topo, depois **Pendências** (uma linha por tipo que abre ao clicar; avisos já abertos) e
  **Meu dia** (planner numa caixa só: `MeuDia` com `planner` e `avisos`, link "Abrir planner →"), depois os cards das áreas. Sem agenda de obras do dia.
- **Tags padronizadas**: catálogo `obra_tags` (nome único sem diferença de maiúscula, cor); `obra_salvar_tags` usa a grafia do catálogo e cria
  a que faltar; renomear/cor/excluir em Configurações (`obra_tag_editar`, `obra_tag_excluir`; perfil obras ou admin).
- **Filtros** no cronograma (todas as telas menos Equipes/Configurações): Tags, Cidade, Filial, Equipe e Etapa, vários ao mesmo tempo
  (dentro de um filtro vale qualquer um; entre filtros, todos), com "Limpar filtros". Homologação na Copel saiu da lista (é do Leandro, depois).
- Esqueleto: módulos sem endereço ainda "em breve". Ideias aprovadas e prioridades no doc `claude/central-lz7-ideias.md` do projeto ADM
  (o mais importante: Cronograma de instalação; integração: pagamento na entrega/instalação → planner do Financeiro).
- Cadastrar alguém só de Obras: criar o usuário no Supabase (Authentication) e pôr `papel = 'obras'` no perfil.

### Cronograma de instalação (`/obras/cronograma`)

- Base: briefing "Cronograma de Obras LZ7" (schema, 189 obras, protótipo `index.html`) adaptado à Central (20/11/2026). Decisões no doc
  `claude/central-obras-cronograma.md` do projeto ADM. Migração `20261120000028_obras_cronograma.sql`.
- Banco: `obra_obras` (código obrigatório `WB260500COL`, nome do card, nome do contrato, dados do contrato, linha do tempo, tópicos),
  `obra_historico` (gatilho), `obra_equipes` (cor, base, filial, membros, capacidade/dia), `obra_config` (metas, motivos), `obra_estruturas`,
  `obra_topicos`; view `obra_v_obras` (status, dias em aberto, atraso, faixa de prazo). Gatilho `obra_antes_de_gravar`: **previsão original**
  gravada uma vez e protegida (instalação `baseline_inicio/fim` no 1º agendamento; entrega `baseline_material` na 1ª previsão). Mudar a
  previsão **não pede motivo** (24/11/2026, pedido da Letícia); motivo opcional vai para o histórico (`app.motivo`, instalação e entrega).
  Gravação pela tela = `obra_salvar(codigo, patch, motivo)`.
  RLS: todo perfil ativo lê (`eh_obras`); **só o perfil `obras` grava** (`obra_pode_editar`), e por área (`obra_area()`, migração
  `20261124000035_obras_areas_flow.sql`): `logistica` edita entrega/material/dados do cliente, `obras` edita isso e a instalação (equipe,
  início/fim previsto e realizado; o gatilho recusa a logística), equipes, configurações e excluir obra. **Tags** (`obra_obras.tags`,
  `obra_salvar_tags`): qualquer perfil ativo. Bucket privado `obra-contratos`.
- **Obra nova vem do Flow** (24/11/2026): `obra_importar_flow()` (só service_role; chamada no fim da `flow-sincronizar`) lê a cópia do Flow.
  Pedido "Aprovado"/"Faturado" aprovado desde `obra_config.flow_desde` (2026-11-01), sem obra, com OS que não está concluída nem cancelada →
  obra `origem = 'flow'`: nome do card = apelido do cliente no Flow (kWp tirado de "(x kWp)"), cliente, CPF/CNPJ, endereço/CEP/cidade e
  telefone (`clientes_flow`), valor e equipamentos (itens do pedido), financiamento (campo adicional "Tipo de Financiamento"), entrada =
  data de aprovação. Código = código do projeto se no padrão `AA000000AAA`; senão `PV-<pedido>` com `codigo_provisorio` (troca sozinho
  quando corrigirem no Flow). Ligação pelo `id_cab_pedido_venda`; obra antiga liga pelo código e só recebe o que estiver vazio.
  Toda rodada atualiza `flow_situacao`, `os_flow`, `os_status`, `os_coordenador`, `flow_info` (complemento da OS) e `flow_valores`; campo
  mudado por alguém na Central entra em `flow_editado` e o Flow não sobrescreve mais (a ficha mostra "Diferente do Flow"). Avisos na ficha:
  código provisório, pedido que saiu de aprovado, obra concluída com OS ainda aberta.
- **Obra manual** (de volta em 24/11/2026, para quando a API não puxar): "+ Obra manual" no cronograma e em Instalações pendentes (perfil obras;
  a logística não vê nem pode gravar os campos da instalação, migração `20261124000036_obras_manual.sql`). Pedido que aparecer depois no
  Flow com o mesmo código liga sozinho e só completa o vazio.
- **Contrato e "Particularidades e benefícios"** (`obra_obras.particularidades`, 25/11/2026): o **admin** também anexa/troca/remove o
  contrato e escreve as particularidades (`obra_pode_contrato`, `obra_salvar_contrato`, migração `20261125000038_obras_contrato_admin.sql`);
  o resto da obra continua só do perfil obras. Particularidades aparecem em destaque no topo da ficha.
- Contrato: anexar o PDF lê e compara com a obra (cliente, CPF/CNPJ, cidade, kWp, módulos, estrutura, valor, financiamento); "Preencher
  os vazios com o contrato" só completa o que está vazio.
- **Lista de projetos**: botão Calendário | Lista no cronograma (lembrado no navegador): uma linha por obra com etapa, status da OS,
  entrega e instalação (com a previsão original), equipe e tags; filtro em aberto/finalizadas/todas e Excel. Filtro por tag no topo.
- Tela própria (`app/(obras)/obras/cronograma/route.ts` + `public/obras-app/cronograma.js|css`): regras e telas portadas do protótipo
  (calendário mês/equipe, fila com sugestão, alertas, relatórios previsto × realizado + Excel, validações), dados direto no Supabase com o
  token da sessão (`/obras/api/token`), tempo real em `obra_obras`. Telas por hash (ver "Telas separadas" acima). Indicadores mostram a
  previsão original × realizado, remarcações por obra e os motivos (os sem motivo contam à parte).
- **Leitura do contrato** (antes era "Nova obra pelo contrato"; a obra agora vem do Flow): PDF vai direto ao bucket (link assinado, `/obras/api/contrato` acao `url`); `acao: "ler"` lê com unpdf e
  `lib/obras-contrato.ts` (`lerTextoContrato`, modelo padrão Clicksign: cliente, CPF/CNPJ, endereço, cidade/zona/CEP, kWp, geração,
  equipamentos, módulos, estrutura pela "junto a estrutura X", valor, forma de pagamento, financiamento, data da assinatura do cliente,
  e-mail). Nome do contrato e sugestão do nome do card vêm do nome do arquivo (`1114_Fabiano_8_de_Abril` → "1114", "Fabiano – 8 de Abril").
  Código obrigatório (o contrato não traz). Abrir contrato: `/obras/contrato/[codigo]` (link de 5 min).
- Tópicos: fixos (`obra_topicos`, valores em `obra_obras.topicos`) e só da obra (`topicos_extra`); importantes aparecem em destaque.
- `fora_indicadores` (PE-54-2024, licitação) fica no cronograma e sai dos indicadores. As 189 obras da planilha entram por um SQL à parte
  (não vai ao repositório); WB260267SGL teve a entrada ajustada para 29/06 (material chegou antes da entrada).
- **Pagamento condicionado** (20/11/2026, migração `20261120000029_obras_pagamentos.sql`): `obra_obras.pagamentos` = lista
  `[{id, etapa: entrega|instalacao|conclusao, valor, obs, avisar, recebido_em}]` (`pagamento_na` ficou só como registro antigo).
  Marcam: perfil obras, equipe e admin (`obra_pode_pagamento`, `obra_salvar_pagamentos`, rota `/obras/api/pagamento`); diretoria só vê.
  "Avisar" = pessoa da Central Administrativa: tarefa "Receber: <obra>" no planner dela (`lib/obras-planner.ts`, ids `obra-<código>-<id>`,
  categoria CR) na data da etapa (realizada, senão prevista); a tela chama `refletir` quando a obra muda de data ou é excluída e o
  agendador do planner (15 min) acerta tudo; "Recebido em" tira a tarefa. Link `/obras/cronograma#obra=<código>` abre a obra.
- Ainda não: integração com o Flow.

## Planner Eisenhower (`/planner`)

- Recriado do `planner-index.html` (especificação de 11/11/2026, no projeto ADM). Página própria, fora do layout React:
  `app/src/app/planner/route.ts` (casca HTML) + `app/public/planner-app/planner.css|planner.js` (CSS e JS do original).
  Telas, textos, cores, temas e regras de datas idênticos ao original; só troca `claude.use` pelas rotas `/planner/api/*`.
- Um planner por pessoa (equipe, admin e diretoria). Tabelas `planner_tasks`, `planner_events`, `planner_settings`,
  `planner_sync_state` (jsonb com os mesmos campos do original); anexos no bucket privado `planner-anexos` (pasta = id da pessoa).
- Regras de datas existem em dois lugares: `public/planner-app/planner.js` (tela) e `lib/planner/regras.ts` (servidor). Mudou uma, mude a outra
  e rode `npm run test:regras` (`app/testes/regras-planner.ts`: carrega o bloco de regras do planner.js e compara feriados e ocorrências com o servidor, 400 casos).
- ClickUp pela API REST, só no servidor (`lib/planner/sync.ts`, `CLICKUP_API_TOKEN`, time `CLICKUP_TEAM_ID`=90171579328):
  mão dupla com as tarefas abertas atribuídas à pessoa; categoria ↔ lista; quadrante ↔ prioridade; vale a última edição.
  Roda logo depois de cada edição (navegador chama `/planner/api/sync`) e a cada 15 min (pg_cron → `/planner/api/sync/cron`
  com `x-cron-secret` = `PLANNER_CRON_SECRET`). Trava por pessoa (`planner_travar_sync`).
- **Nunca duplicar no ClickUp:** `cuCreating` é gravado no banco antes de criar; com ele, não cria de novo (só se o ClickUp
  recusou — `cuErro` — e a pessoa clicar "Enviar ao ClickUp"). Campos `cu*`/`clickupId` são do servidor: o navegador não os sobrescreve.
- **Tarefas e calls entre a equipe** (`lib/planner/equipe.ts`): no formulário, "Para quem" = só para mim / passar tarefa /
  call (uma ou mais pessoas; call exige hora). Entra direto no planner de cada um como cópia `eq-<tarefa>-<pessoa>` (campos
  `de`, `origem`, `origemHash`), com aviso em `planner_avisos` (faixa no topo do planner e no atalho da Início).
  Tarefa passada: a original vira acompanhamento (`soCentral`, não vai ao ClickUp; mostra concluiu / pendente / recusou).
  Call: fica no planner (e no ClickUp) de todos. Quem recebe pode **Recusar** com motivo (`paraRecusas`, aviso a quem mandou);
  concluir avisa quem mandou; editar a original atualiza as cópias; excluir a original some das outras pessoas.
  Opção **"Para os 4 principais da equipe"** (20/11/2026): passa a tarefa de uma vez para todos os perfis `equipe` ativos (menos quem cria);
  a lista vem marcada e pode ser ajustada (`principal` na equipe de `/planner/api/estado`, `eqPrinc` só na tela).
- **Criar tarefa de qualquer tela** (20/11/2026): `public/tarefa-app/tarefa.js` (`window.centralTarefa.abrir({titulo, obs, link})`,
  um só formulário para todo o site) → `POST /api/tarefa` → `lib/tarefa-ligada.ts` (`criarTarefaLigada`: tarefa `lig-<id>` no planner de
  quem cria, campo `link {href, rotulo}` só com caminho interno; "Passar para…" usa o mesmo `distribuir` do "Para quem").
  Botão "+ Tarefa" no topo (link = tela atual), botão flutuante nas páginas próprias (colaboradores, comissões, financiamento, conciliação;
  `data-flutuante`) e botões com título pronto: título dos Recebíveis (link `/recebiveis?aba=&busca=`, abre filtrado), pedido, candidato,
  documento (`components/BotaoTarefa.tsx`). O planner mostra "↗ Abrir na Central" (`linkCentral`, marcado "Central:") e o link vai na descrição para o ClickUp.
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

## Frota (ADM, `/frota`)

- Criada em 20/11/2026 (decisão do usuário: frota nova no ADM, não o estoque "Veículo" da folha). Migração `20261120000026_frota.sql`.
- `frota_veiculos` (placa única sem hífen, modelo, empresa/unidade de `arq_*`, **motorista = colaborador da folha** `plat_docs` colab,
  responsável na Central, km, próxima revisão por km/data, em uso ou não), `frota_motoristas` (histórico por gatilho ao trocar o motorista),
  `frota_documentos` (licenciamento, seguro, IPVA… com vencimento e aviso), `frota_manutencoes`, `frota_multas` (motorista da data preenchido
  pelo histórico, `frota_motorista_em`), `frota_abastecimentos` (motorista do dia; o maior km vira o km do carro). RLS `eh_equipe()`.
- Alertas (`lib/frota.ts`, `alertasDoVeiculo`): documento vencido/vencendo, revisão por data (15 dias) ou km (1.000 km), multa pendente.
- Planner do responsável (`lib/frota-planner.ts`, ids `frota-<carro8>-d|r|m-<registro8>`, refeito a cada mudança): renovar documento,
  revisão por data e multa pendente com vencimento, com link para o carro.
- **Ficha do colaborador no RH** mostra o carro e as multas pendentes dele: `central.js` lê a frota e `plataforma.js` chama
  `window.centralFrotaHtml(c)` (linha marcada "Central:").

## Fiscal: PIS e COFINS (`/fiscal`)

- Notas do Flow a partir de 10/2026, sincronizadas pela Edge Function `fiscal-sincronizar` (só GET; `supabase/agendar-fiscal.sql`):
  recebidas = `documentosEntrada/eventos/` (sem `/v1`; `dataEmissaoMaiorOuIgual`) + XML por `documentosEntrada/eventos/obterArquivosNotasRecebidas`
  (ou `…Nfse`) `?chavesNotas=<chave>&enviaXml=true&enviaPdf=false` (devolve o XML puro, apesar do content-type zip);
  produto emitidas = `v1/documentosSaida/` + detalhe `v1/documentosSaida/{id}` (valorTotalPis/Cofins); serviço emitidas =
  `v1/notasFiscaisServico/` + `linkDownloadXml`. Endereços confirmados em 14/11/2026 (tela do Flow + explorador v7).
- Regras (planilha "PIS E COFINS - Outubro.xlsx"), no `index.ts` da função (testáveis com tsx): Tabela 1 saída produtos e 3 entrada
  produtos = valor total × 1,65% / 7,60%; 2 saída serviços = × 0,65% / 3,00% sempre; 4 entrada serviços = só o informado;
  6 despesas = CFOP atípico (remessa/retorno conserto, à ordem, devolução); 5 apuração (ver crédito abaixo).
  Só resumo/DANFE → **pendente** (fora dos totais).
  Divergente = calculado × informado > R$ 0,01 (só sinaliza). CC-e anexada à nota (texto vem na lista); cancelada sai dos totais com log.
  Deduplicação: mesmo número + mesmo emitente na mesma categoria. Campo ausente = null ("Não informado").
  Saídas: só nota autorizada. Documento "FINALIZADO" do Flow (nunca transmitido, às vezes com o mesmo número de uma autorizada) é retirado
  (`situacaoDocumento`: vale "Autorizado…", "Aguardando aprovação/cancelamento", "Erro cancelamento"; "Cancelado" cancela;
  "Em digitação", "Finalizado", "Rejeitada", "Aguardando autorização" ficam fora). Datas no horário de Brasília (`dataSP`).
- Decisão na pendência (`fiscal_decidir`): lançar pelo modelo fixo / aguardar XML / mover para Despesas, com quem e quando; XML completo
  que chega depois volta a valer a regra. Tabelas `fiscal_notas`, `fiscal_xml` (XML original), `fiscal_log`; só leitura para a equipe.
- **Crédito como o escritório** (relatórios de 10/2026): não cumulativo = vendas de produtos × 1,65% / 7,60% − crédito das compras
  marcadas "toma crédito"; serviços emitidos = cumulativo (0,65% / 3,00%, guia separada). Crédito nota a nota (`fiscal_notas.credito`,
  base = soma dos itens `base_credito`): compra de mercadoria (CFOP do fornecedor 5101/5102/6101/6102/54xx/64xx) toma; combustível,
  consumo e consumidor final (5929, 5656, 6106, 6108…) não toma; fora das listas → pendente. O PIS destacado pelo fornecedor não decide
  (o escritório credita compra de Simples). Decisão da equipe ou do escritório (`credito_origem` manual/escritorio) nunca é sobrescrita
  e vira sugestão para o mesmo fornecedor (`historico`). Serviços recebidos não tomam crédito.
- **Conferência com o escritório:** a equipe envia os PDFs (relação de entradas/saídas de PIS e COFINS, memória de cálculo, DARF);
  `lib/fiscal-escritorio.ts` lê o texto (unpdf) → `fiscal_escritorio_notas` / `fiscal_escritorio_apuracao` (`fiscal_importar_escritorio`).
  `conferir()` (`lib/fiscal.ts`) lista as diferenças nota a nota; "Seguir o escritório" = `fiscal_marcar_credito(ids, credito, 'escritorio')`.

## Recrutamento e seleção (RH, `/rh`)

- Vagas em cards ("3 vagas Vendedor · Comercial WB"): aberta em / dias aberta, previsão (vermelho se passou), gestor, contrato,
  preenchidas e contagem por etapa. Abertas / Fechadas. A recrutadora cria as vagas.
- Funil por vaga: Inscritos → Triagem (entrevista da recrutadora: perguntas, nota 1–5, observações) → Aprovação do gestor
  (consideração final) → Aprovados (data de contratação) / Não aprovados (motivo da lista + etapa onde parou, `parou_em`).
- Adicionar candidato: anexa o currículo (bucket privado `rh-curriculos`, link assinado, até 20 MB); PDF com texto é lido
  no servidor (`lib/rh-curriculo.ts`, unpdf) e preenche nome, WhatsApp, e-mail e cidade. A vaga já vem preenchida.
  Aviso de candidato repetido (mesmo e-mail ou últimos 8 dígitos do telefone). Abrir currículo: `/rh-curriculo/[id]` (RLS + link de 5 min).
- Listas configuráveis em `/rh/config`: perguntas (lista geral; cada vaga marca quais usa e pode criar novas na hora),
  motivos, canais (canal "é indicação" pede quem indicou), mensagens de WhatsApp com `{nome} {vaga} {cidade} {entrevista}`.
- Entrevista marcada (data e hora) vira tarefa `rh-ent-<id>` no planner da recrutadora (quem marcou) e vai ao ClickUp;
  some quando o candidato sai do funil. Indicação contratada gera `rh-bonus-<id>` com data = contratação + 3 meses, até
  "Marcar como pago" (`lib/rh-planner.ts`). Lista "Bônus de indicação" na página de vagas.
- Ficha para o gestor: `/rh/candidatos/[id]/ficha` (imprimir / salvar em PDF).
- **Busca ativa:** etapa `abordado` (coluna Abordados: LinkedIn Open to Work, BNE…; `perfil_url`, `contatado_em`) e `sem_interesse`
  (o candidato não quis; motivos `rh_motivos.tipo = 'sem_interesse'`, separados dos de não aprovação). "Topou → Inscritos" ou marcar entrevista.
- **Histórico** (processos antigos da planilha): "Adicionar candidato" → Histórico, com data de inscrição, entrevista, resultado final,
  contratação e bônus já pago; `historico = true` não cria tarefa no planner. Vaga antiga: campo "Fechada em".
- Nomes padronizados ("MARIA DA SILVA" → "Maria da Silva"): `padronizarNome` (`lib/rh.ts`) = `rh_nome_padrao()` no banco.
- Nome do arquivo do currículo sem acento (o armazenamento do Supabase recusa).
- RLS `eh_equipe()`. Vaga pode ser fechada ou **excluída** (`excluirVaga`: apaga candidatos, currículos e as tarefas do planner). Banco de talentos: fora por enquanto.

## Colaboradores e folha (RH, `/colaboradores`)

- Plataforma "Controle de Colaboradores" migrada do artifact do Claude em 14/11/2026 (cadastro, setores, estoque, eventos,
  folha com cooperativa/comissões/diaristas/proporcionais, recibos em PDF, planilha do Flow, rateios, leitura de recibo de comissão, histórico).
- **Regras de cálculo e layout dos recibos não mudam.** `public/colab-app/plataforma.js` é o script original; as únicas trocas
  (marcadas "Central:") são senha própria → login do site, perfil → usuário logado, CDN → `public/colab-app/vendor`
  (copiado do npm por `scripts/copiar-vendor.mjs` no prebuild/predev; xlsx 0.18.5, jspdf 2.5.1, jspdf-autotable 3.8.2,
  pdfjs-dist 3.11.174, pdf-lib 1.17.1, versões fixas). Tela em `lib/colaboradores-tela.ts`, CSS em `plataforma.css` (original) + `central-tema.css` (cores, fonte, cabeçalho e respiro da Central; carregado depois).
- `public/colab-app/central.js` fornece `window.claude.use("db"|"assets"|"downloads"|"user")` com a mesma interface:
  tabela `plat_docs (colecao, id, data jsonb)`, `update` = `plat_atualizar` (fusão profunda no banco: mapas mesclam, listas
  substituem; não perde marcação simultânea), tempo real do Supabase (`plat_docs` na publicação `supabase_realtime`),
  token da sessão do site (`/colaboradores/api/token`; o proxy renova o login a cada pedido de token).
- **Sessão nas páginas próprias** (colaboradores, comissões, financiamento, conciliação, cronograma; 23/11/2026): `public/sessao.js`
  (`window.centralSessao`) pede token novo a cada 20 min e ao voltar para a aba; login acabado (401 ou redirecionamento, `redirect: "manual"`)
  **não** leva para "Entrar": mostra aviso para entrar em outra aba e continuar (o que está na tela não se perde). Mudou um adaptador, suba o `VERSAO` da rota.
- Anexos no bucket privado `colab-anexos`, nome = assetId; `/_blob/<id>` → `/colaboradores/anexo/[id]` (confere equipe e entrega o arquivo).
- Acesso: equipe, admin e diretoria (RLS `eh_equipe()`). Importação única em `/colaboradores/importar` (só admin):
  `dados_plataforma.json` + PDFs; os dados pessoais nunca vão para o repositório.
- Teste de aceite (14/11/2026): planilha, rateios e recibos de outubro idênticos ao original (célula a célula e texto do PDF);
  leitura de recibo idêntica; 40 marcações simultâneas sem perda.

## Comissões LZ7 (RH, `/comissoes`)

- Plataforma "Comissões LZ7" (apuração mensal, pedidos, lançamentos, bandeiras, vendedores, unidades, cargos e faixas, recibos)
  migrada do artifact do Claude em 17/11/2026 (pacote `comissoes-lz7-central17`). **Regras de cálculo e recibos não mudam**;
  regras completas no doc `claude/comissoes-lz7-regras.md` do projeto ADM. Mudança de cálculo só com pedido e confirmação do usuário (e atualizar o doc).
- Página própria (`app/comissoes/route.ts`): `public/com-app/comissoes.css|js` são o CSS e o script originais, separados do HTML sem
  alteração; única troca marcada "Central:" é o texto do painel Acesso. Bibliotecas do `colab-app/vendor` (mesmas versões do CDN).
  `public/com-app/central-com.js` fornece `window.claude.use("db"|"user"|"downloads")`: tabela `com_docs (colecao, id, data jsonb)`
  com as mesmas coleções do original (cfg, unidades, cargos, pessoas, pedidos/<mês>, ajustes, apuracoes, lancamentos, fechamentos,
  recibos, pagamentos, auditoria), tempo real; usuário = `u_<id do perfil>` (nomes pela tabela `perfis`); também põe o link "‹ Central" no menu.
- Acesso: **só equipe e admin** veem e editam; diretoria não vê (decisão de 17/11/2026: salários, CPF, Pix), no banco (`com_pode`, RLS).
- Migração única: `/comissoes/importar` (só admin) lê o `backup-completo-*.json` no navegador e confere as contagens. Os dados nunca vão ao repositório.
  Importar antes de alguém abrir a plataforma (com banco vazio ela cria cadastros padrão; a importação apaga antes por padrão).
- Teste (17/11/2026, dados reais): outubro/2026 a pagar R$ 25.578,68; Pamela R$ 1.577,57; Thiago R$ 693,90; Ademir R$ 561,40;
  Beatriz R$ 8.715,84; recibo em PDF ok; auditoria com o nome de quem fez; diretoria recebe 403 e o banco não devolve nada.
  Ações antigas da auditoria aparecem como "usuário" (eram de outra conta).
- **Cadastro único com a folha** (decisão de 17/11/2026; `20261117000022_comissoes_folha.sql`): colaborador da folha (`plat_docs` colab)
  com setor que contém "Comercial" é ligado à pessoa das Comissões (`pessoas.colab_id`; casa por colab_id, depois CPF, depois nome).
  Da folha vêm sozinhos: nome, CPF, Pix e desligamento (mesma regra do "Desligar": vínculo de desligamento no dia seguinte e
  responsável de unidade encerrado). Data de início só se estiver vazia (define o 1º/2º/3º mês da meta; diferença vai para a conferência,
  botão "Usar a da folha" = `com_usar_admissao_folha`). Novo no Comercial = pessoa `p-folha-<id>` **pendente de cargo**: sem vínculo e
  sem "Nomes no Flow" (pedidos dele seguem "vendedor não cadastrado" até escolherem unidade e cargo). Cargo, unidade, regra, salário base,
  Nomes no Flow e isenção da cooperativa continuam só nas Comissões. A regra de desligar existe em dois lugares (`com_sync_colab` no banco
  e `desligarPessoa` no `comissoes.js`): mudou uma, mude a outra.
- Roda pelo gatilho `com_folha` (cada gravação de colaborador na folha; erro nunca impede a folha), ao abrir `/comissoes` e no fim da
  importação (`com_sincronizar_folha`). Auditoria com autor "Folha (sincronização)". Conferência em `/comissoes/folha`
  (`com_conferencia_folha`, sem CPF/Pix): pendentes de cargo, admissão diferente, ligados fora do Comercial, sem par na folha.

## Sistema (bastidor do administrador, `/sistema`)

- 23/11/2026, migração `20261123000033_sistema_saude.sql`. Fora dos menus: só um link discreto "Sistema" no fim do `/perfil` do admin;
  outros perfis recebem "não encontrada". `admin_saude()` (só `eh_admin`): últimas 8 rodadas de cada sincronização (`sync_funcoes` +
  `sincronizacoes`), agendamentos do pg_cron (`cron.job` + última execução) e o planner/ClickUp de cada pessoa.
- **Atualizar agora** por sincronização: `admin_disparar_sincronizacao(recurso)` chama a função pelo pg_net (não espera); a trava de
  10 minutos de cada função continua. Endereços em `sync_funcoes` (no teste: hyper-function, fiscal-sincronizar, super-function).
- Duas falhas seguidas de uma sincronização → tarefa `saude-<recurso>` no planner de cada admin (`lib/saude-planner.ts`, `soCentral`,
  não vai ao ClickUp), pelo agendador do planner; some quando volta a dar certo.

## Visual e perfil

- Cor da marca `#124735` (verde do logo); logo branco em `app/public/logo-lz7-branco.png`, ícone do site em `app/src/app/icon.png`.
- Cada área e cada módulo tem ícone próprio (`lib/areas.tsx`: `IconeArea`, `IconeModulo`).
- **Cada pessoa arruma os próprios cards** (áreas na Início, módulos em cada área): botão "Reorganizar" (arrastar ou setas),
  "Voltar ao padrão". Tabela `tela_ordem` (uma linha por pessoa, RLS só a própria), `lib/ordem.ts` (`aplicarOrdem`; módulo novo vai para o fim).
- **Meu dia** na Início (`lib/meu-dia.ts`): tarefas do planner atrasadas e de hoje (pelas mesmas regras `Regras.curOcc`; sem os
  acompanhamentos `soCentral`; com "↗ abrir" quando a tarefa tem `link`), pedidos sob minha responsabilidade com previsão hoje ou vencida,
  pedidos novos esperando aceite e previsões de pagamento combinadas para hoje (Recebíveis, abre a ficha do cliente).
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
- **Regras de acesso rápidas** (migração `20261123000034_rls_rapido.sql`): políticas no formato `(select eh_equipe())` (calculado uma vez por
  consulta, não por linha). Política nova: escreva já assim. Medido: quadro de faturamento com 4.000 pedidos de ~150 ms para ~45 ms.

## Documentos de referência

O planejamento completo está no projeto "ADM" do usuário no claude.ai:
handoff do projeto, decisões de 10/11/2026 e os resumos de cada área.
