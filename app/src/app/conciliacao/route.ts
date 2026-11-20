import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaConc } from "@/lib/conciliacao";

export const dynamic = "force-dynamic";

// Página própria com o CSS e o JS da plataforma de Conciliação Bancária (regras iguais; melhorias marcadas "Central:" no JS),
// fora do layout da Central. Bibliotecas de /colab-app/vendor (mesmas versões do CDN original); adaptador /conc-app/central-conc.js.
const VERSAO = "1";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export async function GET(req: Request) {
  const p = await pessoaConc();
  if (!p) return NextResponse.redirect(new URL("/entrar?volta=/conciliacao", req.url));
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir o módulo. Clique em \"Entrar de novo\" e tente outra vez.");
  const central = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    token: t.token, tokenExp: t.exp, podeEditar: p.podeEditar, usuario: { id: p.id, nome: p.nome },
  };
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Conciliação Bancária · Central LZ7</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/conc-app/conciliacao.css?v=${VERSAO}">
<style>.voltar-central{color:inherit;text-decoration:none;font-weight:600}.voltar-central:hover{text-decoration:underline}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <div class="brand"><span><a href="/area/financeiro" class="voltar-central">‹ Central</a> · LZ7 Energia · Controladoria</span><h1>Conciliação Bancária</h1></div>
    <nav class="tabs" role="tablist">
      <button class="tab" role="tab" id="tab-conc" data-act="tab" data-tab="conc" aria-selected="true">Conciliar</button>
      <button class="tab" role="tab" id="tab-hist" data-act="tab" data-tab="hist" aria-selected="false">Histórico</button>
      <button class="tab" role="tab" id="tab-bancos" data-act="tab" data-tab="bancos" aria-selected="false">Bancos</button>
    </nav>
    <div class="savechip" id="savechip">Conectando…</div>
  </div>
</header>

<main class="wrap">
  <div id="view-conc"></div>
  <div id="view-hist" hidden></div>
  <div id="view-bancos" hidden></div>
</main>
<div class="selbar" id="selbar" hidden></div>
<script src="/colab-app/vendor/xlsx.full.min.js"></script>
<script src="/colab-app/vendor/jspdf.umd.min.js"></script>
<script src="/colab-app/vendor/jspdf.plugin.autotable.min.js"></script>
<script src="/colab-app/vendor/pdf.min.js"></script>
<script src="/colab-app/vendor/supabase.js"></script>
<script>window.__CENTRAL=${json(central)};</script>
<script src="/conc-app/central-conc.js?v=${VERSAO}"></script>
<script src="/conc-app/conc-pdf.js?v=${VERSAO}"></script>
<script src="/conc-app/conciliacao.js?v=${VERSAO}"></script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
