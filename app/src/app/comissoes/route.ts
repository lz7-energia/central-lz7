import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaCom } from "@/lib/comissoes";
import { perfilAtual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Página própria com o CSS e o JS da plataforma Comissões LZ7 (sem mudar regras, cálculos nem recibos), fora do layout
// da Central. As bibliotecas vêm de /colab-app/vendor (mesmas versões do CDN original) e o adaptador
// /com-app/central-com.js liga ao Supabase (tabela com_docs).
const VERSAO = "2";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export async function GET(req: Request) {
  const p = await pessoaCom();
  if (!p) {
    if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar?volta=/comissoes", req.url));
    return paginaAviso("Sem acesso", "As comissões são vistas só pela equipe principal da Central.", 403);
  }
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir o módulo. Clique em \"Entrar de novo\" e tente outra vez.");
  const central = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    token: t.token, tokenExp: t.exp, podeEditar: true, usuario: { id: p.id, nome: p.nome },
  };
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Comissões LZ7 · Central LZ7</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/com-app/comissoes.css?v=${VERSAO}">
<style>.voltar-central{display:block;margin:10px 14px 0;padding:6px 10px;border:1px solid var(--linha);border-radius:8px;color:var(--tinta-2);text-decoration:none;font-weight:600;font-size:12.5px;text-align:center}
.voltar-central:hover{color:var(--acento);border-color:var(--acento)}
.conferir-folha{margin-top:6px;font-weight:500}</style>
</head>
<body>
<div id="app"></div>
<div id="camada"></div>
<div id="avisos" aria-live="polite"></div>
<script src="/colab-app/vendor/xlsx.full.min.js"></script>
<script src="/colab-app/vendor/jspdf.umd.min.js"></script>
<script src="/colab-app/vendor/jspdf.plugin.autotable.min.js"></script>
<script src="/colab-app/vendor/supabase.js"></script>
<script>window.__CENTRAL=${json(central)};</script>
<script src="/com-app/central-com.js?v=${VERSAO}"></script>
<script src="/com-app/comissoes.js?v=${VERSAO}"></script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
