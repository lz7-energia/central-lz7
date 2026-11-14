import { NextResponse } from "next/server";
import { paginaAviso, pessoaColab, tokenDaSessao } from "@/lib/colaboradores";
import { perfilAtual } from "@/lib/supabase/server";
import { TELA } from "@/lib/colaboradores-tela";

export const dynamic = "force-dynamic";

// A plataforma de colaboradores é uma página própria (HTML + CSS + JS do original), fora do layout da Central,
// para manter telas, cálculos e recibos idênticos. O adaptador /colab-app/central.js liga ao Supabase.
const VERSAO = "2";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export async function GET(req: Request) {
  const p = await pessoaColab();
  if (!p) {
    const quem = await perfilAtual();
    if (!quem) return NextResponse.redirect(new URL("/entrar?volta=/colaboradores", req.url));
    return paginaAviso("Sem acesso", "A plataforma de colaboradores é só da equipe da Central e do administrador.", 403);
  }
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir a plataforma. Clique em \"Entrar de novo\" e tente outra vez.");
  const central = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    token: t.token, tokenExp: t.exp, usuario: { id: p.id, nome: p.nome, email: p.email },
  };
  const html = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Controle de Colaboradores</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/colab-app/plataforma.css?v=${VERSAO}">
<link rel="stylesheet" href="/colab-app/central-tema.css?v=${VERSAO}">
<style>[hidden]{display:none!important}</style>
</head>
<body>
${TELA}
<script src="/colab-app/vendor/xlsx.full.min.js"></script>
<script src="/colab-app/vendor/jspdf.umd.min.js"></script>
<script src="/colab-app/vendor/jspdf.plugin.autotable.min.js"></script>
<script src="/colab-app/vendor/supabase.js"></script>
<script>window.__CENTRAL=${json(central)};</script>
<script src="/colab-app/central.js?v=${VERSAO}"></script>
<script src="/colab-app/plataforma.js?v=${VERSAO}"></script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
