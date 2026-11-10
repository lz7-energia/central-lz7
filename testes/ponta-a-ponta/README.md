# Teste ponta a ponta (local)

Simula o Supabase sem Docker: Postgres 16 local + PostgREST + um gateway falso de login
(`gateway.mjs`), e roda o site de verdade contra eles com um navegador automatizado (`telas.py`).

Cobre: portal (envio, campo obrigatório, isca anti-robô), consulta por protocolo, aprovação pelo
link, login (senha errada, usuário sem perfil), fila, detalhe (status, responsável, comentário)
e painel de faturamento. Não cobre anexos (armazenamento) nem tempo real.

Passos (resumo do que foi feito em 10/11/2026):
1. Postgres na porta 5433 com `tests/stub_supabase.sql`, as migrações, o `seed.sql` e `dados.sql`
   (antes das migrações: `auth.uid()` lendo `request.jwt.claims`, papel `authenticator` e
   `alter default privileges` para anon/authenticated/service_role, como no Supabase).
2. PostgREST 12 na porta 3001 com o mesmo `jwt-secret` do gateway.
3. `JWT_SECRET=... node gateway.mjs` (porta 54321) e o site com `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`.
4. `python3 telas.py` (tira as capturas de tela).
