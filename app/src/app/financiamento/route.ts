import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaFin } from "@/lib/financiamento";
import { perfilAtual } from "@/lib/supabase/server";
import { TELA } from "@/lib/financiamento-tela";

export const dynamic = "force-dynamic";

// Página própria (HTML + CSS + JS da plataforma original), fora do layout da Central, para manter telas, regras e cálculos
// idênticos. O adaptador /fin-app/central-fin.js liga ao Supabase (tabela fin_docs).
const VERSAO = "3";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export async function GET(req: Request) {
  const p = await pessoaFin();
  if (!p) {
    const quem = await perfilAtual();
    if (!quem) return NextResponse.redirect(new URL("/entrar?volta=/financiamento", req.url));
    return paginaAviso("Sem acesso", "Seu perfil não tem acesso a este módulo.", 403);
  }
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir o módulo. Clique em \"Entrar de novo\" e tente outra vez.");
  const central = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    token: t.token, tokenExp: t.exp, podeEditar: p.podeEditar, usuario: { id: p.id, nome: p.nome },
  };
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Financiamento e confirmação · Central LZ7</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;700;800&family=Public+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/fin-app/financiamento.css?v=${VERSAO}">
<style>[hidden]{display:none!important}body{margin:0}
.voltar-central{margin-left:auto;color:var(--muted);text-decoration:none;font-weight:600;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--surface)}
.voltar-central:hover{color:var(--accent);border-color:var(--accent)}</style>
</head>
<body>
${TELA}
<script src="/colab-app/vendor/xlsx.full.min.js"></script>
<script src="/colab-app/vendor/supabase.js"></script>
<script src="/sessao.js?v=1"></script>
<script>window.__CENTRAL=${json(central)};</script>
<script src="/fin-app/central-fin.js?v=${VERSAO}"></script>
<script src="/fin-app/financiamento.js?v=${VERSAO}"></script>
<script src="/tarefa-app/tarefa.js?v=1" data-flutuante></script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
