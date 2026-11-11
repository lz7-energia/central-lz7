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

- Títulos do Contas a Receber do Flow: vencidos, a vencer e recebidos no mês; nome do cliente vem dos pedidos e notas (pelo `idCliente`).
- Nome principal = **apelido** do cliente no Flow (`cliente.apelido` / `destinatarioRemetente.apelido`), razão social embaixo (também no painel).
- Situações de cobrança configuráveis pela equipe (`cobranca_situacoes`), cada uma num grupo: inadimplente, em negociação,
  aguardando terceiro, outro. "Panorama dos vencidos": barras por situação (cor do grupo) e por faixa de atraso, com filtros.
- Aba "A vencer": sem colunas de cobrança; filtros de período (hoje, semana até domingo, mês, ano) com o total previsto.
- A equipe anota em cada título vencido: situação da cobrança, previsão de pagamento e motivo. "Concluir atualização" registra
  quem/quando e o retrato dos números; a diretoria vê a data da última atualização concluída.
- Planilha: `/recebiveis/exportar?aba=vencidos|a_vencer|recebidos` (CSV, padrão Excel pt-BR).

## Site (`app/`)

- Next.js 16 (App Router, Turbopack). A documentação da versão instalada está em
  `app/node_modules/next/dist/docs/`: consultar antes de usar uma API do Next que mudou (ex.: `proxy.ts` substitui `middleware.ts`).
- Equipe: cliente com a sessão do usuário (`lib/supabase/server.ts`), sujeito ao RLS.
- Portal, consulta e aprovação: rotas do servidor com a chave de serviço (`lib/supabase/servico.ts`), só chamando as funções do banco.
- `Referrer-Policy: same-origin` (os links de consulta/aprovação têm token; `no-referrer` quebra as Server Actions).
- Testes: `bash supabase/tests/rodar.sh` (banco) e `testes/ponta-a-ponta/` (site inteiro, sem Docker).

## Documentos de referência

O planejamento completo está no projeto "ADM" do usuário no claude.ai:
handoff do projeto, decisões de 10/11/2026 e os resumos de cada área.
