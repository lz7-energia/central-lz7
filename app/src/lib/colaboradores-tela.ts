// Marcação da plataforma de colaboradores (igual ao original; sem senha própria nem troca de perfil).
// Gerado a partir de plataforma_colaboradores.html — mudar só se a plataforma original mudar.
export const TELA = `
<div id="lock" class="wrap">
  <form class="lockcard" id="lockForm" autocomplete="off">
    <div class="lockmark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
    <div><h1>LZ7 Energia</h1><p class="muted" style="margin:4px 0 0">Controle de Colaboradores · acesso restrito ao RH</p></div>
    <input id="lockPass" type="hidden"><div class="err" id="lockErr" hidden></div>
    <div class="note" id="lockStatus">Conectando ao banco de dados…</div>
  </form>
</div>

<div id="app" hidden>
  <header class="top"><div class="wrap topin">
    <a class="brand" href="/inicio" title="Voltar para a Central"><img class="logo-img" src="/logo-lz7-branco.png" alt="LZ7"><span class="mod">Colaboradores e folha</span></a>
    <span class="topbtn" id="perfilBtn" title="Usuário logado na Central" style="display:flex;align-items:center;gap:6px"></span>
    <a class="topbtn" href="/inicio" style="margin-left:6px;text-decoration:none">‹ Central</a>
    <nav class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="colab" aria-selected="true">Colaboradores</button>
      <button class="tab" role="tab" data-tab="pag" aria-selected="false">Pagamentos</button>
      <button class="tab" role="tab" data-tab="folha" aria-selected="false">Folha</button>
      <button class="tab" role="tab" data-tab="eventos" aria-selected="false">Eventos</button>
      <button class="tab" role="tab" data-tab="setores" aria-selected="false">Setores</button>
      <button class="tab" role="tab" data-tab="estoque" aria-selected="false">Estoque</button>
      <button class="tab" role="tab" data-tab="hist" aria-selected="false">Movimentações</button>
      <button class="tab" role="tab" data-tab="audit" aria-selected="false">Histórico</button>
      <button class="tab" role="tab" data-tab="cfg" aria-selected="false">Configurações</button>
    </nav>
  </div></header>
  <main class="wrap">
    <section id="v-colab"></section>
    <section id="v-pag" hidden></section>
    <section id="v-folha" hidden></section>
    <section id="v-eventos" hidden></section>
    <section id="v-setores" hidden></section>
    <section id="v-estoque" hidden></section>
    <section id="v-hist" hidden></section>
    <section id="v-audit" hidden></section>
    <section id="v-cfg" hidden></section>
  </main>
</div>
<input type="file" id="fileImport" accept=".xlsx,.xls,.csv" hidden>
<div id="layers"></div>
<div id="toast" aria-live="polite"></div>
`;
