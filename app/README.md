# app

Site da central (Next.js 16 + Supabase), publicado na Vercel.

## Telas

| Endereço | Quem usa | O que faz |
|---|---|---|
| `/portal` | Todos os colaboradores, sem login | Abrir pedido: setor → tipo → campos → protocolo |
| `/consulta?p=…&t=…` | Quem abriu o pedido | Acompanhar pelo link do e-mail |
| `/aprovacao?t=…` | Gestor, sem login | Ver o pedido e aprovar/recusar (abrir o link não decide nada) |
| `/entrar` | Equipe da central | Login com e-mail e senha |
| `/pedidos`, `/pedidos/[id]` | Equipe | Fila por setor (tempo real), atendimento, comentários |
| `/painel` | Equipe | Painel de faturamento (lê a view `painel_faturamento`) |

## Rodar no computador

```bash
cd app
npm install
cp ../.env.example .env.local   # preencher com as chaves do projeto central-teste
npm run dev
```

## Publicar na Vercel

1. Importar o repositório `lz7-energia/central-lz7`, **Root Directory: `app`**.
2. Variáveis de ambiente (as do `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, SMTP do Titan e, quando houver, as chaves do Turnstile.
3. Sem SMTP configurado o site funciona, só não manda e-mail (fica registrado no log).

## Supabase (uma vez por projeto)

- Aplicar as migrações de `supabase/migrations` e o `seed.sql`.
- Authentication → URL Configuration: Site URL = endereço da Vercel.
- Authentication → Email Templates (convite e troca de senha): trocar o link por
  `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha`
  (no modelo de troca de senha, `type=recovery`).
- Criar os 4 da equipe: convidar o e-mail em Authentication → Users e inserir a linha em `public.perfis`
  (mesmo `id` do usuário, `papel` = `equipe` ou `admin`).
- Cadastrar e-mails dos setores (`setores.email_responsavel`), a lista de `solicitantes` e os gestores.
