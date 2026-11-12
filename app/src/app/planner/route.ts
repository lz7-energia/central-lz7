import { NextResponse, type NextRequest } from "next/server";
import { pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";

// O planner é uma página própria (HTML + CSS + JS do planner-index.html), fora do layout da Central,
// para manter telas, cores e temas idênticos. Os dados vêm das rotas /planner/api/*.
const VERSAO = "1";
const HTML = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="normal">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Planner Eisenhower</title>
<link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/planner-app/planner.css?v=${VERSAO}">
</head>
<body>
<div id="app">
  <header class="top">
    <div class="brand"><a class="back" href="/inicio" title="Voltar para a Central">‹ Central</a>Planner <span>Eisenhower</span></div>
    <div class="top-actions">
      <button id="syncpill" data-action="sync-now" title="Sincronizar com o ClickUp">⟳ ClickUp</button>
      <button class="primary" data-action="new-task">+ Tarefa</button>
      <button data-action="new-event">+ Evento</button>
      <button data-action="settings" aria-label="Configurações">⚙ Configurações</button>
    </div>
  </header>
  <div class="tabs" id="tabs"></div>
  <div id="notice"></div>
  <div id="alerts"></div>
  <div class="toolbar" id="toolbar">
    <div class="seg" id="modes">
      <button data-action="mode" data-mode="all">Atual</button>
      <button data-action="mode" data-mode="day">Dia</button>
      <button data-action="mode" data-mode="week">Semana</button>
      <button data-action="mode" data-mode="month">Mês</button>
    </div>
    <div class="nav" id="nav"></div>
    <button id="fbtn" data-action="toggle-filters">Filtros</button>
  </div>
  <div id="counters"></div>
  <main id="view"><div class="loading">Carregando seu planner…</div></main>
</div>
<div id="modal-root"></div>
<div id="toast"></div>
<script src="/planner-app/planner.js?v=${VERSAO}"></script>
</body>
</html>`;

export async function GET(req: NextRequest) {
  const p = await pessoa();
  if (!p) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "?volta=/planner";
    return NextResponse.redirect(url);
  }
  return new NextResponse(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
