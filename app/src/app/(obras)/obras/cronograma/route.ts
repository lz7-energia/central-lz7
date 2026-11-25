import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaObras } from "@/lib/obras";
import { supabaseServico } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";

// Cronograma de instalação (Central de Obras): página própria com a lógica do protótipo "Cronograma de Obras LZ7"
// (public/obras-app/cronograma.js|css) falando direto com o banco, sujeito ao RLS (só o perfil obras grava).
// Cada tela abre sozinha pelo hash (#calendario, #entregas, #pendentes…), vinda do card da Início ou da área; sem menu lateral.
const VERSAO = "11";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export async function GET(req: Request) {
  const p = await pessoaObras();
  if (!p) return NextResponse.redirect(new URL("/entrar?volta=/obras/cronograma", req.url));
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir o módulo. Clique em \"Entrar de novo\" e tente outra vez.");
  const { data: perfis } = await supabaseServico().from("perfis").select("id, nome, papel, ativo");
  const central = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    token: t.token, tokenExp: t.exp, podeEditar: p.podeEditar, area: p.area, admin: p.papel === "admin", podePagamento: ["obras", "equipe", "admin"].includes(String(p.papel)), usuario: { id: p.id, nome: p.nome }, perfis: perfis ?? [],
  };
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cronograma de instalação · Central de Obras</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/obras-app/cronograma.css?v=${VERSAO}">
</head>
<body>
<div class="app solo">
  <div class="main">
    <div id="banner"></div>
    <header class="top">
      <a class="voltar" id="voltar" href="/obras">‹ Início de Obras</a>
      <h1 id="titulo">Cronograma de instalação</h1>
      <input type="search" id="fq" placeholder="Buscar cliente, código, contrato ou cidade" aria-label="Buscar" style="width:250px">
    </header>
    <div class="filtros" id="filtros"></div>
    <main class="view" id="view"><div class="empty">Carregando obras…</div></main>
  </div>
</div>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="Detalhes da obra"></aside>
<div class="modal" id="modal"><div class="mb" id="mb"></div></div>
<div class="toast" id="toast" role="status"></div>
<script src="/colab-app/vendor/xlsx.full.min.js"></script>
<script src="/colab-app/vendor/supabase.js"></script>
<script src="/sessao.js?v=1"></script>
<script>window.__CENTRAL=${json(central)};</script>
<script src="/obras-app/cronograma.js?v=${VERSAO}"></script>
<script src="/tarefa-app/tarefa.js?v=1" data-flutuante></script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
