// Marcação do módulo Financiamento e confirmação (igual à referência; só o link "‹ Central" no cabeçalho).
// Gerado a partir de referencia/financiamento-referencia.html — mudar só se a plataforma original mudar.
export const TELA = `
<div class="wrap">
  <header class="app">
    <div class="brand"><h1>Financiamento e confirmação</h1><span class="org">LZ7 Energia</span></div>
    <a class="voltar-central" href="/inicio" title="Voltar para a Central">‹ Central</a>
  </header>
<div class="tab" id="tab-financiamento">
  <div class="toolbar">
    <div class="tb-l">
      <h2 class="tab-h">Financiamento e confirmação de pagamento</h2>
      <div class="base-info" id="pBase">Carregando…</div>
      <div class="upd" data-upd="financiamento"></div>
    </div>
    <div class="actions">
      <button id="pImport" class="primary" hidden>Importar planilha</button>
      <button id="pMotivos" hidden>Motivos</button>
      <button class="concluir" data-concluir="financiamento" hidden>Concluir atualização</button>
    </div>
  </div>
  <div class="seg" id="pSeg" role="tablist" aria-label="Coluna do funil"></div>
  <section class="kpis" id="pKpis" aria-label="Indicadores"></section>
  <section class="duo trio">
    <div class="panel">
      <div class="panel-h"><h2>Tempo parado na coluna</h2><span class="lbl" id="pSla"></span></div>
      <div class="aging" id="pFaixas"></div>
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Por vendedor</h2><span class="lbl">clique para filtrar</span></div>
      <div class="vend" id="pVend"></div>
    </div>
    <div class="panel">
      <div class="panel-h"><h2>Situação dos cards</h2><span class="lbl">clique para filtrar</span></div>
      <div class="aging" id="pSit"></div>
    </div>
  </section>
  <section class="panel" style="padding:0;border:0;background:none">
    <div class="filters">
      <input id="pQ" type="search" placeholder="Buscar cliente, código ou observação">
      <select id="pVendSel" aria-label="Vendedor"></select>
      <select id="pFaixaSel" aria-label="Tempo parado"></select>
      <select id="pSitSel" aria-label="Situação"></select>
      <select id="pMotSel" aria-label="Motivo"></select>
      <select id="pOrdem" aria-label="Ordenar">
        <option value="dias_desc">Mais tempo parado</option>
        <option value="dias_asc">Menos tempo parado</option>
        <option value="valor_desc">Maior valor</option>
        <option value="valor_asc">Menor valor</option>
      </select>
      <span class="sum num" id="pSum"></span>
    </div>
    <div class="plist" id="pList"></div>
  </section>
</div>
</div>

<dialog id="dlg">
  <h2 id="dlgTitle">Importar planilha</h2>
  <div id="dlgBody"></div>
  <div class="foot" id="dlgFoot"></div>
</dialog>
<div class="toast" id="toast" hidden></div>
`;
