/* Central LZ7 — "Criar tarefa" de qualquer tela. A tarefa vai para o planner (de quem cria ou passada para a equipe)
   com um link de volta para onde foi criada. Uso: window.centralTarefa.abrir({ titulo, obs, link: { href, rotulo } }).
   Nas páginas próprias (colaboradores, comissões, financiamento, conciliação) o script põe um botão flutuante (data-flutuante). */
(function () {
  if (window.centralTarefa) return;
  var css = "\
.ct-fundo{position:fixed;inset:0;background:rgba(10,30,22,.45);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}\
.ct-caixa{background:#fff;color:#1b2b24;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:min(520px,100%);padding:20px 22px;font-size:14px;line-height:1.4}\
.ct-caixa h2{margin:0 0 4px;font-size:18px}\
.ct-de{margin:0 0 14px;color:#5b6b64;font-size:13px}\
.ct-de a{color:#124735}\
.ct-caixa label{display:block;font-weight:600;margin:12px 0 4px;font-size:13px}\
.ct-caixa input[type=text],.ct-caixa input[type=date],.ct-caixa input[type=time],.ct-caixa textarea,.ct-caixa select{width:100%;box-sizing:border-box;border:1px solid #cfd8d4;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;color:inherit}\
.ct-linha{display:flex;gap:10px}.ct-linha>div{flex:1}\
.ct-op{display:flex;gap:16px;flex-wrap:wrap;font-weight:400!important}\
.ct-op label,.ct-check{display:inline-flex!important;gap:6px;align-items:center;font-weight:400!important;margin:0!important;cursor:pointer}\
.ct-pessoas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px;margin-top:8px;padding:8px 10px;border:1px solid #e3e9e6;border-radius:8px}\
.ct-acoes{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}\
.ct-acoes button{border-radius:8px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #124735}\
.ct-ok{background:#124735;color:#fff}.ct-nao{background:#fff;color:#124735}\
.ct-erro{color:#b42318;margin:10px 0 0}\
.ct-flutuante{position:fixed;right:18px;bottom:18px;z-index:2147482000;background:#124735;color:#fff;border:0;border-radius:999px;padding:11px 16px;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}\
.ct-flutuante:hover{background:#0d3627}\
.ct-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#124735;color:#fff;padding:10px 16px;border-radius:8px;z-index:2147483001;font:14px Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25)}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var CATS = { FIS: "Fiscal/Adm", CP: "Contas a Pagar", CR: "Contas a Receber", GER: "Gerencial", RH: "RH" };
  var equipe = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hoje() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
  function catDe(c) {
    if (/^\/(recebiveis|financiamento|conciliacao)/.test(c) || /setor=financeiro/.test(c)) return "CR";
    if (/^\/(rh|colaboradores|comissoes)/.test(c) || /setor=rh/.test(c)) return "RH";
    if (/^\/(fiscal|painel|arquivos)/.test(c) || /setor=(fiscal|adm)/.test(c)) return "FIS";
    return "GER";
  }
  function tituloDaPagina() { return (document.title || "Central").replace(/\s*[·|–-]\s*Central LZ7.*$/i, "").trim() || "Central"; }
  function toast(t) { var d = document.createElement("div"); d.className = "ct-toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500); }

  async function carregarEquipe() {
    if (equipe) return equipe;
    var r = await fetch("/api/tarefa", { credentials: "same-origin" });
    if (!r.ok) throw new Error("login");
    equipe = await r.json(); return equipe;
  }

  async function abrir(o) {
    o = o || {};
    var link = o.link && o.link.href ? o.link : { href: location.pathname + location.search, rotulo: tituloDaPagina() };
    var fundo = document.createElement("div"); fundo.className = "ct-fundo";
    fundo.innerHTML = '<div class="ct-caixa" role="dialog" aria-modal="true" aria-label="Criar tarefa"><h2>Criar tarefa</h2><p class="ct-de">Vai para o planner com o link de volta: <a href="' + esc(link.href) + '">' + esc(link.rotulo) + '</a></p><p>Carregando…</p></div>';
    document.body.appendChild(fundo);
    var fechar = function () { fundo.remove(); document.removeEventListener("keydown", tecla); };
    var tecla = function (e) { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", tecla);
    fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) fechar(); });
    var eq;
    try { eq = await carregarEquipe(); } catch (e) { fundo.querySelector("p:last-child").outerHTML = '<p class="ct-erro">Faça login de novo para criar tarefas.</p>'; return; }
    var outros = eq.equipe.filter(function (p) { return p.id !== eq.eu; });
    var cx = fundo.querySelector(".ct-caixa");
    cx.innerHTML = '<h2>Criar tarefa</h2><p class="ct-de">Vai para o planner com o link de volta: <a href="' + esc(link.href) + '">' + esc(link.rotulo) + '</a></p>' +
      '<label for="ct-titulo">O que precisa ser feito</label><input type="text" id="ct-titulo" maxlength="200" value="' + esc(o.titulo || "") + '">' +
      '<div class="ct-linha"><div><label for="ct-data">Data</label><input type="date" id="ct-data" value="' + esc(o.data || hoje()) + '"></div>' +
      '<div><label for="ct-hora">Hora (opcional)</label><input type="time" id="ct-hora" value="' + esc(o.hora || "") + '"></div></div>' +
      '<div class="ct-linha"><div><label for="ct-cat">Categoria</label><select id="ct-cat">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === (o.cat || catDe(link.href)) ? " selected" : "") + ">" + CATS[k] + "</option>"; }).join("") + '</select></div>' +
      '<div><label>&nbsp;</label><label class="ct-check"><input type="checkbox" id="ct-imp"' + (o.importante ? " checked" : "") + '> Importante</label></div></div>' +
      '<label>Para quem</label><div class="ct-op"><label><input type="radio" name="ct-para" value="eu" checked> Para mim</label><label><input type="radio" name="ct-para" value="outros"> Passar para…</label></div>' +
      '<div class="ct-pessoas" id="ct-pessoas" hidden>' + (outros.length ? outros.map(function (p) { return '<label class="ct-check"><input type="checkbox" value="' + esc(p.id) + '"> ' + esc(p.nome) + "</label>"; }).join("") : '<span>Ninguém mais na equipe.</span>') + "</div>" +
      '<label for="ct-obs">Observação (opcional)</label><textarea id="ct-obs" rows="3">' + esc(o.obs || "") + "</textarea>" +
      '<p class="ct-erro" id="ct-erro" hidden></p><div class="ct-acoes"><button type="button" class="ct-nao">Cancelar</button><button type="button" class="ct-ok">Criar tarefa</button></div>';
    var $ = function (s) { return cx.querySelector(s); };
    $("#ct-titulo").focus(); $("#ct-titulo").select();
    cx.querySelectorAll('input[name="ct-para"]').forEach(function (r) { r.addEventListener("change", function () { $("#ct-pessoas").hidden = r.value !== "outros" || !r.checked; }); });
    $(".ct-nao").addEventListener("click", fechar);
    var enviar = async function () {
      var erro = $("#ct-erro"); erro.hidden = true;
      var passar = cx.querySelector('input[name="ct-para"]:checked').value === "outros";
      var para = passar ? Array.prototype.map.call(cx.querySelectorAll("#ct-pessoas input:checked"), function (i) { return i.value; }) : [];
      if (passar && !para.length) { erro.textContent = "Marque para quem vai a tarefa."; erro.hidden = false; return; }
      var b = $(".ct-ok"); b.disabled = true; b.textContent = "Criando…";
      try {
        var r = await fetch("/api/tarefa", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo: $("#ct-titulo").value, data: $("#ct-data").value, hora: $("#ct-hora").value, cat: $("#ct-cat").value,
            importante: $("#ct-imp").checked, obs: $("#ct-obs").value, para: para, link: link }) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok || j.erro) throw new Error(j.erro || "Não foi possível criar a tarefa.");
        fechar();
        var nomes = eq.equipe.filter(function (p) { return para.indexOf(p.id) >= 0; }).map(function (p) { return p.nome.split(" ")[0]; });
        toast(nomes.length ? "Tarefa passada para " + nomes.join(", ") + "." : "Tarefa criada no seu planner.");
      } catch (e) { erro.textContent = e.message; erro.hidden = false; b.disabled = false; b.textContent = "Criar tarefa"; }
    };
    $(".ct-ok").addEventListener("click", enviar);
    cx.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); });
  }

  window.centralTarefa = { abrir: abrir };
  var eu = document.currentScript;
  if (eu && eu.hasAttribute("data-flutuante")) {
    var colocar = function () {
      var b = document.createElement("button"); b.type = "button"; b.className = "ct-flutuante"; b.textContent = "+ Tarefa";
      b.title = "Criar tarefa no planner com link para esta tela";
      b.addEventListener("click", function () { abrir({}); });
      document.body.appendChild(b);
    };
    if (document.body) colocar(); else document.addEventListener("DOMContentLoaded", colocar);
  }
})();
