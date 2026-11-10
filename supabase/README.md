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
