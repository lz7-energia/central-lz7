# Central LZ7

Central empresarial interna da LZ7 Energia, com quatro áreas: **Fiscal, Financeiro, RH e ADM**.

A central funciona por cima do ERP Flow (Everflow), só lendo dados pela API, e organiza rotinas,
prazos, alertas, conferências e pedidos entre áreas. Ela não substitui o ERP.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/` | Aplicação web (front-end), publicada na Vercel |
| `supabase/` | Banco de dados: migrações, regras de acesso e rotinas agendadas |
| `docs/` | Decisões e documentação do projeto |

## Fase 1

1. Painel de faturamento (pedido de venda + OS + NF-e + contas a receber, vindos do Flow)
2. Portal de pedidos (formulário aberto pros colaboradores, fila por setor pra equipe da central)

## Segurança

Nenhuma senha, token ou chave entra neste repositório. Os valores ficam nas variáveis de ambiente
da Vercel e do Supabase. O arquivo `.env.example` lista só os nomes das variáveis.
