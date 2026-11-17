/* Financiamento e confirmação — JavaScript da plataforma original (referencia/financiamento-referencia.html).
 * Únicas trocas, marcadas "Central:": permissão vem do login da Central e o banco (S.db) é o adaptador /fin-app/central-fin.js. */
"use strict";
const MOTIVOS_PADRAO = [
  "Aguardando homologação / vistoria",
  "Problema técnico / geração abaixo do esperado",
  "Financiamento não liberado",
  "Contestação de valor",
  "Acordo / renegociação em andamento",
  "Dificuldade financeira do cliente",
  "Sem contato / não responde",
  "Outro"
].map((nome, i) => ({id: "m" + (i+1), nome}));
const FAIXAS = [
  {k:"av",  label:"A vencer",    min:-1e9, max:0,   cor:"--ok"},
  {k:"1",   label:"1–30 dias",   min:1,    max:30,  cor:"--b1"},
  {k:"31",  label:"31–60 dias",  min:31,   max:60,  cor:"--b2"},
  {k:"61",  label:"61–90 dias",  min:61,   max:90,  cor:"--b3"},
  {k:"91",  label:"91–180 dias", min:91,   max:180, cor:"--b4"},
  {k:"181", label:"Acima de 180",min:181,  max:1e9, cor:"--b5"}
];
// linha compacta: [id, numero, situacao, parcela, valor, cliente, emissao, vencNom, vencReal, baixa]
const C = {id:0,num:1,sit:2,parc:3,val:4,cli:5,emi:6,vn:7,vr:8,bx:9};

// Central: quem edita vem do login (equipe e administrador; diretoria só vê) e o banco é o adaptador da Central.
const S = {rows:[], meta:null, demo:false, local:false, notas:{}, canWrite:!!(window.__CENTRAL && window.__CENTRAL.podeEditar), db:window.__FIN_DB || null, ready:window.__FIN_READY, dl:null, motivos:MOTIVOS_PADRAO.slice(),
  f:{q:"",faixa:"",motivo:"",ordem:"valor"}, open:null, loadedImport:null, calc:null};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const brl0 = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const fmt = v => brl.format(v||0);
const fmtK = v => Math.abs(v) >= 100000 ? brl0.format(v) : brl.format(v||0);
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const pad = n => String(n).padStart(2,"0");
const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const hojeYmd = () => ymdOf(new Date());
const br = ymd => ymd ? `${ymd.slice(8,10)}/${ymd.slice(5,7)}/${ymd.slice(0,4)}` : "—";
const dias = (a, b) => Math.round((Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10)) - Date.UTC(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8,10))) / 864e5);
const addDias = (ymd, n) => { const d = new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10)+n); return ymdOf(d); };
const chave = nome => (norm(nome).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,150)) || "sem-nome";
const faixaDe = d => FAIXAS.find(f => d >= f.min && d <= f.max) || FAIXAS[0];
const rid = r => r[C.id] || `${r[C.num]}_${r[C.parc]}`;
const motivoKey = n => (n && (n.motivoId || n.motivo)) || "";
const motivoNome = n => {
  if (!n) return "";
  if (n.motivoId){ const m = S.motivos.find(x => x.id === n.motivoId); if (m) return m.nome; return n.motivo ? n.motivo + " (removido)" : ""; }
  return n.motivo || "";
};
const temRegistro = n => !!(n && (motivoKey(n) || n.observacao || n.previsao || (n.ajustes && Object.keys(n.ajustes).length)));

function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,2600); }
function banner(msg, kind){ const b=$("banner"); if(!msg){b.hidden=true;return;} b.innerHTML=msg; b.dataset.kind=kind||""; b.hidden=false; }

/* ---------- Leitura da planilha ---------- */
function parseData(v){
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return ymdOf(new Date(v.getTime() + 12*3600e3));
  if (typeof v === "number" && v > 20000 && v < 80000){ const p = XLSX.SSF.parse_date_code(v); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m){ let y=+m[3]; if (y<100) y+=2000; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function parseValor(v){
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).replace(/[R$\s ]/g,"");
  if (s.includes(",")) s = s.replace(/\./g,"").replace(",",".");
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
/* ================= Abas e "Concluir atualização" ================= */
const ABAS = ["financiamento", "inadimplencia"];
const UPD = {};
const RESPONSAVEL = "Victor";
const dataHora = iso => { const d = new Date(iso); return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`; };

function abrirAba(t, salvar){
  if (!ABAS.includes(t)) t = "financiamento";
  document.querySelectorAll(".tab").forEach(s => s.hidden = s.id !== "tab-" + t);
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  if (salvar){
    try { history.replaceState(null, "", "#" + t); } catch(_) {}
    try { localStorage.setItem("lz7-aba", t); } catch(_) {}
  }
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => abrirAba(b.dataset.tab, true));
(() => {
  let t = (location.hash || "").slice(1);
  if (!ABAS.includes(t)){ try { t = localStorage.getItem("lz7-aba") || ""; } catch(_) { t = ""; } }
  abrirAba(t, false);
})();

function renderUpd(){
  document.querySelectorAll("[data-upd]").forEach(el => {
    const u = UPD[el.dataset.upd];
    if (!u){ el.innerHTML = `<span class="dot"></span>Atualização ainda não concluída`; return; }
    const hoje = new Date(u.em).toDateString() === new Date().toDateString();
    el.innerHTML = `<span class="dot ${hoje ? "ok" : "warn"}"></span>Atualizado por <b>${esc(u.por)}</b> em ${dataHora(u.em)}`;
  });
  document.querySelectorAll("[data-concluir]").forEach(b => b.hidden = !S.canWrite);
}
document.querySelectorAll("[data-concluir]").forEach(b => b.onclick = async () => {
  const t = b.dataset.concluir, u = {por: RESPONSAVEL, em: new Date().toISOString()};
  b.disabled = true;
  try {
    if (S.db) await S.db.doc("status/" + t).set(u);
    UPD[t] = u; renderUpd(); toast("Atualização concluída");
  } catch(e){ toast("Não foi possível registrar a conclusão. Tente de novo."); }
  b.disabled = false;
});

/* ================= Financiamento e confirmação de pagamento ================= */
const COLUNAS = {
  fin:  {nome:"Financiamento", sla:15, faixas:[[0,15,"Até 15 dias (prazo)","--ok"],[16,30,"16–30 dias","--b1"],[31,60,"31–60 dias","--b2"],[61,120,"61–120 dias","--b4"],[121,1e9,"Acima de 120 dias","--b5"]]},
  conf: {nome:"Confirmação de pagamento", sla:2, faixas:[[0,2,"Até 2 dias (prazo)","--ok"],[3,5,"3–5 dias","--b1"],[6,10,"6–10 dias","--b2"],[11,20,"11–20 dias","--b4"],[21,1e9,"Acima de 20 dias","--b5"]]}
};
const P = {base:null, view:"fin", f:{q:"", vend:"", faixa:"", sit:"", ordem:"dias_desc"}, abertas:new Set(), tags:{}, tagAberta:null};
const SITUACOES = [
  {k:"liberando", nome:"Prestes a liberar", desc:"aprovado ou com liberação próxima", cor:"--ok"},
  {k:"andamento", nome:"Em andamento", desc:"negociação ativa, cliente respondendo", cor:"--accent"},
  {k:"travado", nome:"Travado", desc:"sem avanço ou sem retorno do cliente", cor:"--b2"},
  {k:"perda", nome:"Risco de perda", desc:"cliente pode desistir", cor:"--b4"}
];
const chaveCard = x => x.cod || chave(x.t);
const MOTIVOS_FUNIL_PADRAO = ["Aguardando liberação do banco","Crédito reprovado","Documentação pendente","Troca de titularidade","Homologação / Copel","Aguardando pagamento da entrada","Cliente sem retorno","Cliente avaliando desistência","Outro"].map((nome, i) => ({id:"mf" + (i+1), nome}));
P.motivos = MOTIVOS_FUNIL_PADRAO.slice(); P.editando = null;
const motFunil = id => id ? ((P.motivos.find(m => m.id === id) || {}).nome || "Motivo removido") : "";
const tagDe = x => P.tags[chaveCard(x)] || {};
// observação editada vale até chegar uma planilha importada depois da edição
const obsDe = x => { const t = tagDe(x); return t.obsEm ? {txt:t.obs || "", editada:t.obsEm} : {txt:x.obs, editada:null}; };
const chaveLinha = r => partesTitulo(r.t).cod || chave(r.t);
const sitDe = x => (P.tags[chaveCard(x)] || {}).sit || "";

function partesTitulo(t){
  const m = String(t).match(/^\s*([A-Z]{2}\d{5,7}[A-Z]{0,4})\s*-\s*(.*)$/i);
  let cod = "", resto = String(t).trim();
  if (m){ cod = m[1].toUpperCase(); resto = m[2].trim(); }
  let kwp = "";
  const k = resto.match(/\(\s*([\d.,]*)\s*kwp\s*\)\s*$/i);
  if (k){ kwp = k[1] ? k[1].replace(".", ",") + " kWp" : ""; resto = resto.slice(0, k.index).trim(); }
  return {cod, nome: resto || String(t).trim(), kwp};
}
function faixaP(col, d){ return COLUNAS[col].faixas.findIndex(f => d >= f[0] && d <= f[1]); }
function lerPendentes(buf){
  const wb = XLSX.read(buf, {type:"array", cellDates:true});
  const out = {};
  for (const nomeAba of wb.SheetNames){
    const n = norm(nomeAba);
    const tipo = n.includes("confirm") ? "conf" : n.includes("financ") ? "fin" : null;
    if (!tipo) continue;
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {header:1, raw:true, defval:null});
    const hi = aoa.findIndex(r => r && r.some(c => norm(c).startsWith("titulo")));
    if (hi < 0) continue;
    const h = aoa[hi].map(norm);
    const ix = k => h.findIndex(x => x.startsWith(k));
    const iT = ix("titulo"), iV = ix("valor"), iVe = ix("vendedor"), iE = ix("entrada"), iD = ix("dias"), iO = ix("observ");
    const rows = [];
    for (let k = hi + 1; k < aoa.length; k++){
      const r = aoa[k]; if (!r) continue;
      const t = r[iT];
      if (t == null || String(t).trim() === "" || norm(t) === "total") continue;
      let ent = iE >= 0 ? parseData(r[iE]) : null;
      if (!ent && iD >= 0 && typeof r[iD] === "number") ent = addDias(hojeYmd(), -Math.round(r[iD]));
      rows.push({t:String(t).trim(), v:Math.round(parseValor(iV >= 0 ? r[iV] : 0)*100)/100, vend:String((iVe >= 0 ? r[iVe] : "") ?? "").trim(), ent: ent || "", obs:String((iO >= 0 ? r[iO] : "") ?? "").trim()});
    }
    out[tipo] = rows;
  }
  if (!out.fin && !out.conf) throw new Error("Não encontrei as abas Financiamento e Confirmação de pagamento com a coluna Título do card.");
  return out;
}
function itensP(col){
  const hoje = hojeYmd();
  return ((P.base && P.base[col]) || []).map((r, i) => ({...r, i, d: r.ent ? Math.max(0, dias(hoje, r.ent)) : 0, ...partesTitulo(r.t)}));
}
function renderP(){
  const b = P.base;
  $("pBase").textContent = b ? `Base: ${b.arquivo || "planilha"} · importada em ${dataHora(b.importadoEm)}` : "Nenhuma planilha importada";
  $("pImport").hidden = !S.canWrite;
  const fin = itensP("fin"), conf = itensP("conf");
  const soma = l => l.reduce((s, x) => s + x.v, 0);
  $("pSeg").innerHTML = [["fin", fin], ["conf", conf]].map(([k, l]) =>
    `<button role="tab" data-v="${k}" aria-selected="${P.view === k}">${COLUNAS[k].nome}<small class="num">${l.length} cards · ${fmt(soma(l))}</small></button>`).join("");
  $("pSeg").querySelectorAll("button").forEach(bt => bt.onclick = () => { P.view = bt.dataset.v; P.f.faixa = ""; P.f.vend = ""; renderP(); });

  const col = P.view, cfg = COLUNAS[col], todos = col === "fin" ? fin : conf;
  const tot = soma(todos);
  const media = todos.length ? todos.reduce((s, x) => s + x.d, 0) / todos.length : 0;
  const fora = todos.filter(x => x.d > cfg.sla);
  const velho = todos.reduce((a, x) => x.d > (a ? a.d : -1) ? x : a, null);
  $("pKpis").innerHTML = `
    <div class="kpi"><span class="lbl">Cards na coluna</span><span class="v num">${todos.length}</span><span class="s">${cfg.nome}</span></div>
    <div class="kpi"><span class="lbl">Valor dos projetos</span><span class="v num">${fmtK(tot)}</span><span class="s num">média de ${fmt(todos.length ? tot / todos.length : 0)} por card</span></div>
    <div class="kpi"><span class="lbl">Tempo médio parado</span><span class="v num">${Math.round(media)} dias</span><span class="s num">prazo da coluna: ${cfg.sla} dias</span></div>
    <div class="kpi alert"><span class="lbl">Fora do prazo</span><span class="v num">${fora.length}</span><span class="s num">${fmt(soma(fora))}${velho ? ` · mais antigo: ${velho.d} dias` : ""}</span></div>`;

  $("pSla").textContent = "desde a entrada na coluna";
  const fx = cfg.faixas.map((f, i) => { const l = todos.filter(x => faixaP(col, x.d) === i); return {i, f, n:l.length, v:soma(l)}; });
  const maxN = Math.max(1, ...fx.map(x => x.n));
  $("pFaixas").innerHTML = fx.map(x => `
    <button class="ag-row" data-fx="${x.i}" aria-pressed="${P.f.faixa === String(x.i)}" title="Filtrar a lista por esta faixa">
      <span>${x.f[2]}</span><span class="ag-bar"><i style="width:${(x.n / maxN * 100).toFixed(1)}%;background:var(${x.f[3]})"></i></span>
      <span class="val num">${fmt(x.v)}</span><span class="pct num">${x.n}</span></button>`).join("");
  $("pFaixas").querySelectorAll("button").forEach(bt => bt.onclick = () => { P.f.faixa = P.f.faixa === bt.dataset.fx ? "" : bt.dataset.fx; renderP(); });

  const porV = {};
  todos.forEach(x => { const k = x.vend || "Sem vendedor"; (porV[k] = porV[k] || {n:0, v:0}); porV[k].n++; porV[k].v += x.v; });
  const vs = Object.entries(porV).sort((a, b) => b[1].v - a[1].v);
  const maxV = Math.max(1, ...vs.map(v => v[1].v));
  $("pVend").innerHTML = vs.length ? vs.map(([k, o]) => `
    <button class="vrow" data-vend="${esc(k)}" aria-pressed="${P.f.vend === k}"><span class="nm">${esc(k)}</span><span class="num muted" style="text-align:right">${o.n}</span><span class="num" style="text-align:right;font-weight:600">${fmt(o.v)}</span>
      <span class="bar"><i style="width:${(o.v / maxV * 100).toFixed(1)}%"></i></span></button>`).join("") : `<div class="sem">Sem cards nesta coluna.</div>`;
  $("pVend").querySelectorAll("button").forEach(bt => bt.onclick = () => { P.f.vend = P.f.vend === bt.dataset.vend ? "" : bt.dataset.vend; renderP(); });

  $("pVendSel").innerHTML = `<option value="">Todos os vendedores</option>` + vs.map(([k]) => `<option${P.f.vend === k ? " selected" : ""}>${esc(k)}</option>`).join("");
  $("pFaixaSel").innerHTML = `<option value="">Qualquer tempo parado</option>` + cfg.faixas.map((f, i) => `<option value="${i}"${P.f.faixa === String(i) ? " selected" : ""}>${f[2]}</option>`).join("");
  $("pOrdem").value = P.f.ordem;

  const sitRows = [...SITUACOES, {k:"__sem", nome:"Sem situação", cor:"--line"}].map(st => { const ls = todos.filter(x => (sitDe(x) || "__sem") === st.k); return {...st, n:ls.length, v:soma(ls)}; });
  const maxS = Math.max(1, ...sitRows.map(x => x.n));
  $("pSit").innerHTML = sitRows.map(x => `
    <button class="ag-row" data-sit="${x.k}" aria-pressed="${P.f.sit === x.k}" title="${esc(x.desc || "")}">
      <span>${x.nome}</span><span class="ag-bar"><i style="width:${(x.n / maxS * 100).toFixed(1)}%;background:var(${x.cor})"></i></span>
      <span class="val num">${fmt(x.v)}</span><span class="pct num">${x.n}</span></button>`).join("");
  $("pSit").querySelectorAll("button").forEach(bt => bt.onclick = () => { P.f.sit = P.f.sit === bt.dataset.sit ? "" : bt.dataset.sit; renderP(); });
  $("pMotivos").hidden = !S.canWrite;
  $("pMotSel").innerHTML = `<option value="">Todos os motivos</option><option value="__sem">Sem motivo</option>` + P.motivos.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("");
  $("pMotSel").value = P.f.mot || "";
  const nRota = todos.filter(x => tagDe(x).rota).length;
  $("pSitSel").innerHTML = `<option value="">Qualquer situação</option>` + sitRows.map(x => `<option value="${x.k}"${P.f.sit === x.k ? " selected" : ""}>${x.nome}</option>`).join("") + `<option value="__rota"${P.f.sit === "__rota" ? " selected" : ""}>Rota necessária (${nRota})</option>`;
  const q = norm(P.f.q);
  let l = todos.filter(x => (!P.f.vend || (x.vend || "Sem vendedor") === P.f.vend) && (P.f.faixa === "" || faixaP(col, x.d) === +P.f.faixa)
    && (!P.f.sit || (P.f.sit === "__rota" ? !!tagDe(x).rota : (sitDe(x) || "__sem") === P.f.sit))
    && (!P.f.mot || (tagDe(x).motivo || "__sem") === P.f.mot)
    && (!q || norm(x.t + " " + obsDe(x).txt + " " + x.vend + " " + motFunil(tagDe(x).motivo)).includes(q)));
  const o = P.f.ordem;
  l.sort((a, b) => o === "dias_asc" ? a.d - b.d || b.v - a.v : o === "valor_desc" ? b.v - a.v : o === "valor_asc" ? a.v - b.v : b.d - a.d || b.v - a.v);
  $("pSum").textContent = `${l.length} cards · ${fmt(soma(l))}`;
  if (!b){ $("pList").innerHTML = `<div class="empty">${S.canWrite ? "Importe a planilha de pendências (abas Financiamento e Confirmação de pagamento) para ver os cards." : "A planilha de pendências ainda não foi importada."}</div>`; return; }
  if (!l.length){ $("pList").innerHTML = `<div class="empty">Nenhum card corresponde aos filtros.</div>`; return; }
  $("pList").innerHTML = l.map(x => {
    const fi = faixaP(col, x.d), cor = cfg.faixas[fi] ? cfg.faixas[fi][3] : "--ok";
    const key = col + x.i, aberta = P.abertas.has(key);
    const ck = chaveCard(x), sk = sitDe(x), st = SITUACOES.find(z => z.k === sk);
    const tagHtml = st ? `<span class="sit" style="--c:var(${st.cor})">${st.nome}</span>` : (S.canWrite ? `<span class="sit vazia">Definir situação</span>` : "");
    const temRota = !!tagDe(x).rota;
    const rotaHtml = S.canWrite ? `<button type="button" class="rota-btn" data-rota="${esc(ck)}" aria-pressed="${temRota}" title="${temRota ? "Tirar a tag Rota necessária" : "Marcar Rota necessária"}"><span class="rota${temRota ? "" : " off"}">${temRota ? "Rota necessária" : "+ Rota necessária"}</span></button>` : (temRota ? `<span class="rota">Rota necessária</span>` : "");
    const tagBtn = S.canWrite ? `<button type="button" class="sit-btn" data-ck="${esc(ck)}" aria-expanded="${P.tagAberta === ck}" title="Alterar situação">${tagHtml}</button>` : tagHtml;
    const opcoes = S.canWrite && P.tagAberta === ck ? `<div class="sit-opts" role="group" aria-label="Situação do card">${SITUACOES.map(z => `<button type="button" data-ck="${esc(ck)}" data-set="${z.k}" aria-pressed="${sk === z.k}" style="--c:var(${z.cor})"><b>${z.nome}</b><small>${z.desc}</small></button>`).join("")}${sk ? `<button type="button" data-ck="${esc(ck)}" data-set="" class="limpar">Tirar situação</button>` : ""}</div>` : "";
    return `<article class="pitem${st ? " s-" + st.k : ""}">
      <div style="min-width:0;display:flex;flex-direction:column;gap:3px">
        <div class="tt">${x.cod ? `<span class="chip">${esc(x.cod)}</span>` : ""}<span class="nm">${esc(x.nome)}</span>${x.kwp ? `<span class="chip kwp">${esc(x.kwp)}</span>` : ""}${tagBtn}${rotaHtml}</div>
        <div class="meta">${esc(x.vend || "Sem vendedor")} · entrou em ${br(x.ent)}</div>
        ${tagDe(x).motivo ? `<div class="motivo-t" style="margin-top:2px">${esc(motFunil(tagDe(x).motivo))}</div>` : ""}
      </div>
      <div class="rt"><span class="val num">${fmt(x.v)}</span><span class="pill atraso num" style="background:var(${cor})">${x.d} ${x.d === 1 ? "dia" : "dias"} parado</span></div>
      ${opcoes}
      ${P.editando === ck ? editorCard(x, ck) : (() => { const o = obsDe(x);
        return (o.txt ? `<div class="obs${aberta ? "" : " clamp"}" data-key="${key}" title="${aberta ? "" : "Clique para ler tudo"}">${esc(o.txt)}</div>` : `<div class="obs vazia">Sem observação.</div>`)
          + `<div class="obs-rodape">${o.editada ? `<span>Editado em ${dataHora(o.editada)}</span>` : (x.obs ? "<span>Observação da planilha</span>" : "<span></span>")}${S.canWrite ? `<button type="button" class="link-btn" data-edit="${esc(ck)}">Editar motivo e observação</button>` : ""}</div>`; })()}
    </article>`;
  }).join("");
  $("pList").querySelectorAll(".rota-btn").forEach(bt => bt.onclick = async () => { bt.disabled = true; const ck = bt.dataset.rota; if (await salvarCard(ck, {rota: (P.tags[ck] || {}).rota ? "" : true})) renderP(); else bt.disabled = false; });
  $("pList").querySelectorAll(".sit-btn").forEach(bt => bt.onclick = () => { P.tagAberta = P.tagAberta === bt.dataset.ck ? null : bt.dataset.ck; renderP(); });
  $("pList").querySelectorAll(".sit-opts button").forEach(bt => bt.onclick = () => salvarSit(bt.dataset.ck, bt.dataset.set));
  $("pList").querySelectorAll("[data-edit]").forEach(bt => bt.onclick = () => { P.editando = bt.dataset.edit; renderP(); const t = $("ceObs"); if (t) t.focus(); });
  const fe = $("ceForm");
  if (fe){
    $("ceCancel").onclick = () => { P.editando = null; renderP(); };
    $("ceDel").onclick = async () => {
      const b = $("ceDel");
      if (b.dataset.conf !== "1"){ b.dataset.conf = "1"; b.textContent = "Confirmar exclusão"; return; }
      const col = P.view, i = +fe.dataset.i, lista = (P.base && P.base[col]) || [];
      if (!lista[i] || lista[i].t !== fe.dataset.t){ toast("A lista mudou. Abra o card de novo."); P.editando = null; renderP(); return; }
      b.disabled = true;
      const rem = [...((P.base && P.base.removidos) || []).filter(z => !(z.k === chaveLinha(lista[i]) && z.col === col)), {k:chaveLinha(lista[i]), col, t:lista[i].t, em:new Date().toISOString()}];
      const nova = {...P.base, [col]: lista.filter((_, k) => k !== i), removidos: rem};
      try { if (S.db) await S.db.doc("pendentes/base").set(nova); P.base = nova; P.editando = null; renderP(); toast("Card excluído"); }
      catch(e){ b.disabled = false; toast("Não foi possível excluir. Tente de novo."); }
    };
    fe.onsubmit = async e => { e.preventDefault(); const b = $("ceSalvar"); b.disabled = true;
      if (await salvarCard(fe.dataset.ck, {motivo:$("ceMot").value, obs:$("ceObs").value.trim(), obsEm:new Date().toISOString()})){ P.editando = null; renderP(); toast("Card atualizado"); }
      else b.disabled = false; };
  }
  $("pList").querySelectorAll(".obs[data-key]").forEach(el => el.onclick = () => { const k = el.dataset.key; P.abertas.has(k) ? P.abertas.delete(k) : P.abertas.add(k); el.classList.toggle("clamp"); });
}
{ let t; $("pQ").oninput = e => { clearTimeout(t); t = setTimeout(() => { P.f.q = e.target.value; renderP(); }, 150); }; }
$("pVendSel").onchange = e => { P.f.vend = e.target.value; renderP(); };
$("pFaixaSel").onchange = e => { P.f.faixa = e.target.value; renderP(); };
$("pSitSel").onchange = e => { P.f.sit = e.target.value; renderP(); };
async function salvarCard(ck, patch){
  const doc = {...(P.tags[ck] || {}), ...patch, em:new Date().toISOString()};
  Object.keys(doc).forEach(k => { if (doc[k] === "" || doc[k] == null) delete doc[k]; });
  const vazio = !doc.sit && !doc.motivo && !doc.obsEm && !doc.rota;
  try {
    if (S.db){ const ref = S.db.collection("situacoes").doc(ck); if (vazio) await ref.delete(); else await ref.set(doc); }
    if (vazio) delete P.tags[ck]; else P.tags[ck] = doc;
    return true;
  } catch(e){ toast("Não foi possível salvar. Tente de novo."); return false; }
}
async function salvarSit(ck, sit){ if (await salvarCard(ck, {sit})){ P.tagAberta = null; renderP(); } }
function editorCard(x, ck){
  const t = tagDe(x), o = obsDe(x);
  const orfao = t.motivo && !P.motivos.some(m => m.id === t.motivo);
  return `<form class="form card-ed" id="ceForm" data-ck="${esc(ck)}" data-i="${x.i}" data-t="${esc(x.t)}">
    <label>Motivo<select id="ceMot"><option value="">Sem motivo</option>${P.motivos.map(m => `<option value="${esc(m.id)}"${t.motivo === m.id ? " selected" : ""}>${esc(m.nome)}</option>`).join("")}${orfao ? `<option value="${esc(t.motivo)}" selected>Motivo removido</option>` : ""}</select></label>
    <label>Observação<textarea id="ceObs" maxlength="2000">${esc(o.txt)}</textarea></label>
    ${x.obs && o.editada ? `<details class="muted" style="font-size:12px"><summary>Ver observação original da planilha</summary><p style="white-space:pre-wrap;margin:6px 0 0">${esc(x.obs)}</p></details>` : ""}
    <div class="foot"><button type="submit" class="primary" id="ceSalvar">Salvar</button><button type="button" id="ceCancel">Cancelar</button><button type="button" class="danger" id="ceDel">Excluir card</button>
      <span class="st">Motivo, situação e observação ficam como você deixar, mesmo após novas importações.</span></div>
  </form>`;
}
function abrirMotivosP(){
  let lista = P.motivos.map(m => ({...m}));
  const uso = id => Object.values(P.tags).filter(t => t.motivo === id).length;
  const desenhar = () => {
    $("dlgBody").innerHTML = `<p class="muted" style="margin:8px 0 12px">Motivos usados nos cards de Financiamento e Confirmação de pagamento. Renomear atualiza todos os cards que já usam o motivo.</p>
      <div class="mot-list">${lista.map((m, i) => `<div class="mot-row"><input data-i="${i}" id="mp-${esc(m.id)}" value="${esc(m.nome)}" aria-label="Nome do motivo" maxlength="80"><span class="muted num">${uso(m.id)}</span>
        <button type="button" data-up="${i}" aria-label="Mover para cima" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-del="${i}">Remover</button></div>`).join("") || `<div class="sem">Nenhum motivo cadastrado.</div>`}</div>
      <div class="mot-row" style="margin-top:12px"><input id="mpNovo" placeholder="Novo motivo" maxlength="80"><button type="button" id="mpAdd">Adicionar</button></div>`;
    $("dlgBody").querySelectorAll("input[data-i]").forEach(inp => inp.oninput = () => { lista[+inp.dataset.i].nome = inp.value; });
    $("dlgBody").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { lista.splice(+b.dataset.del, 1); desenhar(); });
    $("dlgBody").querySelectorAll("[data-up]").forEach(b => b.onclick = () => { const i = +b.dataset.up; [lista[i-1], lista[i]] = [lista[i], lista[i-1]]; desenhar(); });
    const add = () => { const v = $("mpNovo").value.trim(); if (!v) return; if (lista.some(m => norm(m.nome) === norm(v))){ toast("Esse motivo já existe"); return; }
      lista.push({id:"mf" + Date.now().toString(36), nome:v}); desenhar(); $("mpNovo").focus(); };
    $("mpAdd").onclick = add; $("mpNovo").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } };
  };
  dialogo("Motivos do funil", "", `<button type="button" id="dCancel">Cancelar</button><button type="button" class="primary" id="dOk">Salvar motivos</button>`);
  desenhar();
  $("dOk").onclick = async () => {
    lista = lista.map(m => ({id:m.id, nome:m.nome.trim()})).filter(m => m.nome);
    const ns = lista.map(m => norm(m.nome)); if (ns.some((n, i) => ns.indexOf(n) !== i)){ toast("Há motivos com o mesmo nome"); return; }
    $("dOk").disabled = true;
    try { if (S.db) await S.db.doc("config/motivosFunil").set({lista, atualizadoEm:new Date().toISOString()}); P.motivos = lista; renderP(); $("dlg").close(); toast("Motivos salvos"); }
    catch(e){ $("dOk").disabled = false; toast("Não foi possível salvar. Tente de novo."); }
  };
}
$("pMotivos").onclick = abrirMotivosP;
$("pMotSel").onchange = e => { P.f.mot = e.target.value; renderP(); };
$("pOrdem").onchange = e => { P.f.ordem = e.target.value; renderP(); };

function arquivoPara(onFile){
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
  inp.onchange = () => { const f = inp.files[0]; if (f) onFile(f); };
  inp.click();
}
function dialogo(titulo, corpo, botoes, wide){
  const d = $("dlg"); d.classList.toggle("wide", !!wide);
  $("dlgTitle").textContent = titulo; $("dlgBody").innerHTML = corpo; $("dlgFoot").innerHTML = botoes;
  const c = $("dCancel"); if (c) c.onclick = () => d.close();
  if (!d.open) d.showModal();
  return d;
}
function abrirImportP(){
  dialogo("Importar pendências",
    `<p class="muted" style="margin:8px 0 12px">Use a planilha com as abas <b>Financiamento</b> e <b>Confirmação de pagamento</b> (colunas Título do card, Valor do projeto, Vendedor, Entrada e Observação). Só os cards novos entram; os que já estão na plataforma ficam como estão.</p>
     <div class="drop" id="pDrop">Arraste o arquivo aqui ou <button type="button" id="pPick">escolha o arquivo</button></div>`,
    `<button type="button" id="dCancel">Cancelar</button>`);
  $("pPick").onclick = () => arquivoPara(processarP);
  const dr = $("pDrop");
  dr.ondragover = e => { e.preventDefault(); dr.classList.add("over"); };
  dr.ondragleave = () => dr.classList.remove("over");
  dr.ondrop = e => { e.preventDefault(); dr.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) processarP(f); };
}
async function processarP(file){
  let dados;
  try { dados = lerPendentes(new Uint8Array(await file.arrayBuffer())); }
  catch(err){ $("dlgBody").insertAdjacentHTML("beforeend", `<p style="color:var(--b4);margin-top:12px">${esc(err.message || "Não consegui ler o arquivo.")}</p>`); return; }
  const atual = {fin:(P.base && P.base.fin) || [], conf:(P.base && P.base.conf) || []};
  const removidos = (P.base && P.base.removidos) || [];
  const chaves = col => new Set(atual[col].map(chaveLinha));
  const ex = {fin:chaves("fin"), conf:chaves("conf")};
  const plano = {};
  for (const col of ["fin", "conf"]){
    const linhas = dados[col] || [];
    const vistos = new Set(linhas.map(chaveLinha));
    const novos = [], excluidos = [];
    for (const r of linhas){
      const k = chaveLinha(r);
      if (ex[col].has(k) || novos.some(n => chaveLinha(n) === k)) continue;
      if (removidos.some(z => z.k === k && z.col === col)){ excluidos.push(r); continue; }
      novos.push(r);
    }
    const outra = col === "fin" ? "conf" : "fin";
    const passaram = col === "conf" ? novos.filter(r => ex.fin.has(chaveLinha(r))) : [];
    const foraDaPlanilha = dados[col] ? atual[col].filter(r => !vistos.has(chaveLinha(r))) : [];
    plano[col] = {lida: !!dados[col], novos, excluidos, passaram, foraDaPlanilha, outra};
  }
  const nomeCol = {fin:"Financiamento", conf:"Confirmação de pagamento"};
  const bloco = col => { const p = plano[col];
    if (!p.lida) return `<div class="imp-col"><b>${nomeCol[col]}</b><span class="muted">aba não encontrada na planilha: nada muda</span></div>`;
    return `<div class="imp-col"><b>${nomeCol[col]}</b>
      <span><b class="num">${p.novos.length}</b> cards novos serão adicionados${p.novos.length ? ` · ${fmt(p.novos.reduce((s, x) => s + x.v, 0))}` : ""}</span>
      ${p.novos.length ? `<ul class="imp-lista">${p.novos.slice(0, 8).map(r => `<li>${esc(r.t)}</li>`).join("")}${p.novos.length > 8 ? `<li class="muted">e mais ${p.novos.length - 8}</li>` : ""}</ul>` : ""}
      <span class="muted"><span class="num">${atual[col].length}</span> cards que já estão na plataforma ficam como estão</span>
      ${p.excluidos.length ? `<span class="muted"><span class="num">${p.excluidos.length}</span> cards que você excluiu continuam fora</span>` : ""}
      ${p.foraDaPlanilha.length ? `<span style="color:var(--b2)"><span class="num">${p.foraDaPlanilha.length}</span> cards da plataforma não estão mais nesta planilha. Eles continuam no painel; exclua manualmente se já saíram da coluna.</span>` : ""}
    </div>`; };
  const passaram = plano.conf.passaram;
  const temNovos = plano.fin.novos.length + plano.conf.novos.length;
  dialogo("Confirmar importação", `<p class="muted" style="margin:8px 0 12px">${esc(file.name)}</p>
    <div class="imp-cols">${bloco("fin")}${bloco("conf")}</div>
    ${passaram.length ? `<label class="imp-chk"><input type="checkbox" id="pMover" checked> Tirar de Financiamento os ${passaram.length} cards que agora aparecem em Confirmação de pagamento (motivo, situação e observação continuam com o card)</label>` : ""}`,
    `<button type="button" id="dCancel">Cancelar</button><button type="button" class="primary" id="dOk"${temNovos ? "" : " disabled"}>${temNovos ? `Adicionar ${temNovos} cards` : "Nenhum card novo"}</button>`, true);
  $("dOk").onclick = async () => {
    $("dOk").disabled = true; $("dOk").textContent = "Salvando…";
    const mover = passaram.length && $("pMover") && $("pMover").checked ? new Set(passaram.map(chaveLinha)) : null;
    const nova = {...(P.base || {}), arquivo:file.name, importadoEm:new Date().toISOString(),
      fin: [...atual.fin.filter(r => !mover || !mover.has(chaveLinha(r))), ...plano.fin.novos],
      conf: [...atual.conf, ...plano.conf.novos], removidos};
    try { if (S.db) await S.db.doc("pendentes/base").set(nova); P.base = nova; renderP(); $("dlg").close(); toast(`${temNovos} cards adicionados`); }
    catch(e){ $("dOk").disabled = false; $("dOk").textContent = `Adicionar ${temNovos} cards`; toast("Não foi possível salvar. Tente de novo."); }
  };
}
$("pImport").onclick = abrirImportP;

/* ================= Início ================= */
renderUpd(); renderP();
(S.ready || Promise.resolve()).then(() => {
  renderUpd(); renderP();
  const db = S.db; if (!db) return;
  db.collection("status").onSnapshot(qs => { qs.docs.forEach(d => { UPD[d.id] = d.data(); }); renderUpd(); }, () => {});
  db.doc("pendentes/base").onSnapshot(snap => { P.base = snap.exists ? snap.data() : null; renderP(); }, () => {});
  db.collection("situacoes").onSnapshot(qs => { const m = {}; qs.docs.forEach(d => { m[d.id] = d.data(); }); P.tags = m; if (!P.editando) renderP(); }, () => {});
  db.doc("config/motivosFunil").onSnapshot(snap => { const l = snap.exists && Array.isArray(snap.data().lista) ? snap.data().lista : null; if (l){ P.motivos = l.filter(m => m && m.id && m.nome); if (!P.editando) renderP(); } }, () => {});

});
