# supabase

Banco de dados da central: migrações (tabelas), regras de acesso por perfil (Row Level Security)
e rotinas agendadas (sincronização com o Flow).

Projetos (região São Paulo):
- `central-teste`: https://ypiudecoofbrqicpwapm.supabase.co
- `central-producao`: https://psfcvqngucsbvfqxdgge.supabase.co

## Estrutura

- `migrations/`: tabelas, regras de acesso e funções, em ordem
- `seed.sql`: catálogo inicial de setores e tipos de pedido
- `tests/`: testes das regras da fase 1 num Postgres local (`bash supabase/tests/rodar.sh`, rodando como usuário sem privilégio de root)

## Sincronização com o Flow

- `functions/flow-sincronizar/`: Edge Function que lê do Flow (só GET) pedidos de venda, itens, OS e contas a
  receber, e grava nas tabelas espelho. Segredo necessário (Edge Functions → Secrets): `FLOW_API_TOKEN`.
- **Verify JWT desligado** na função: o agendamento chama sem chave. A própria função recusa chamadas com menos
  de 10 minutos de intervalo, então chamar o endereço repetidas vezes não pesa o Flow.
- `agendar-sincronizacao.sql`: agenda no pg_cron (a cada 30 min, 7h–20h, segunda a sábado). Em produção, trocar a URL.
- Cada execução fica registrada em `sincronizacoes` (recurso `flow`); o painel avisa quando a última falhou.
