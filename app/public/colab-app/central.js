/* Central LZ7 — adaptador da plataforma de colaboradores.
 * Fornece window.claude.use("db" | "assets" | "downloads" | "user") com a MESMA interface do runtime do artifact,
 * em cima do Supabase (tabela plat_docs + tempo real) e das rotas do site. O código da plataforma não muda.
 *
 * Semântica reproduzida:
 *  - doc.set(d): substitui o documento inteiro.
 *  - doc.update(patch): mescla mapas aninhados campo a campo e substitui listas (função plat_atualizar no banco,
 *    numa única operação: duas pessoas mexendo na mesma folha não apagam a alteração uma da outra).
 *  - onSnapshot: chama na hora com o que já tem e de novo a cada mudança (sua ou de outra pessoa).
 */
(function () {
  "use strict";
  const C = window.__CENTRAL;
  const COLECOES = ["colab", "setores", "produtos", "itens", "entregas", "eventos", "folhas", "config", "log"];
  let token = C.token, tokenExp = C.tokenExp || 0;

  async function tokenAtual() {
    if (Date.now() / 1000 < tokenExp - 120) return token;
    try {
      const r = await fetch("/colaboradores/api/token", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); if (j.token) { token = j.token; tokenExp = j.exp || 0; } }
      else if (r.status === 401) { location.href = "/entrar?volta=/colaboradores"; }
    } catch (_) {}
    return token;
  }
  const sb = window.supabase.createClient(C.url, C.anon, { accessToken: tokenAtual, realtime: { params: { eventsPerSecond: 20 } } });

  /* ---------- utilidades ---------- */
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const ehMapa = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  function fundir(a, b) { // igual a public.jsonb_fundir
    if (!ehMapa(a) || !ehMapa(b)) return clone(b);
    const out = clone(a);
    for (const k of Object.keys(b)) out[k] = k in a ? fundir(a[k], b[k]) : clone(b[k]);
    return out;
  }
  function novoId() { const c = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(20)); for (const n of r) s += c[n % 36]; return s; }
  function erro(e, padrao) {
    const msg = (e && (e.message || e.details)) || String(e || "erro");
    const err = new Error(msg);
    err.code = /not-found/.test(msg) ? "not-found" : /permission|row-level|RLS|401|403|JWT/i.test(msg + " " + (e && e.code)) ? "permission-denied" : padrao || "unavailable";
    return err;
  }
  function separa(path) {
    const p = String(path).split("/").filter(Boolean);
    if (p.length !== 2 || !COLECOES.includes(p[0])) throw Object.assign(new Error("Caminho inválido: " + path), { code: "invalid-argument" });
    return { col: p[0], id: p[1] };
  }

  /* ---------- cache por coleção + ouvintes ---------- */
  const cache = {};      // col -> Map(id -> data)
  const carregando = {}; // col -> Promise
  const ouvintes = new Set(); // { col, id?, query?, cb, erro }

  async function lerColecao(col) {
    const linhas = [];
    if (col === "log") { // só os últimos registros (a tela usa orderBy("em","desc").limit(500))
      const { data, error } = await sb.from("plat_docs").select("id,data").eq("colecao", "log").order("data->>em", { ascending: false }).limit(1000);
      if (error) throw erro(error);
      linhas.push(...data);
    } else {
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("plat_docs").select("id,data").eq("colecao", col).order("id").range(de, de + 999);
        if (error) throw erro(error);
        linhas.push(...data);
        if (data.length < 1000) break;
      }
    }
    const m = new Map();
    for (const l of linhas) m.set(l.id, l.data);
    cache[col] = m;
    return m;
  }
  function garantir(col) {
    if (cache[col]) return Promise.resolve(cache[col]);
    if (!carregando[col]) carregando[col] = lerColecao(col).finally(() => { delete carregando[col]; });
    return carregando[col];
  }

  function snapDoc(col, id) {
    const d = cache[col] && cache[col].get(id);
    return { id, ref: { id, path: col + "/" + id }, exists: d !== undefined, data: () => clone(d) };
  }
  function snapCol(col, q) {
    let ids = [...(cache[col] || new Map()).keys()];
    let docs = ids.map((id) => ({ id, exists: true, ref: { id, path: col + "/" + id }, data: () => clone(cache[col].get(id)) }));
    if (q) {
      for (const w of q.where) docs = docs.filter((d) => {
        const v = d.data()[w.campo];
        switch (w.op) { case "==": return v === w.valor; case "!=": return v !== w.valor; case "<": return v < w.valor; case "<=": return v <= w.valor;
          case ">": return v > w.valor; case ">=": return v >= w.valor; case "in": return (w.valor || []).includes(v); case "array-contains": return Array.isArray(v) && v.includes(w.valor); default: return true; }
      });
      for (const o of [...q.orderBy].reverse()) docs.sort((a, b) => {
        const x = a.data()[o.campo], y = b.data()[o.campo];
        const r = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1;
        return o.dir === "desc" ? -r : r;
      });
      if (q.limit != null) docs = docs.slice(0, q.limit);
    }
    return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
  }
  function avisar(col) {
    for (const o of ouvintes) if (o.col === col) {
      try { o.cb(o.id !== undefined ? snapDoc(col, o.id) : snapCol(col, o.query)); } catch (e) { console.error(e); }
    }
  }
  function ouvir(col, id, query, cb, aoErro) {
    const o = { col, id, query, cb, erro: aoErro };
    ouvintes.add(o);
    garantir(col).then(() => { if (ouvintes.has(o)) cb(id !== undefined ? snapDoc(col, id) : snapCol(col, query)); })
      .catch((e) => { if (aoErro) aoErro(e.code ? e : erro(e)); });
    return () => ouvintes.delete(o);
  }

  /* ---------- tempo real ---------- */
  let pendentes = new Set(), timer = null;
  function agendar(col) { pendentes.add(col); if (!timer) timer = setTimeout(() => { const s = pendentes; pendentes = new Set(); timer = null; s.forEach(avisar); }, 60); }
  sb.channel("plat_docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "plat_docs" }, (p) => {
      const linha = p.eventType === "DELETE" ? p.old : p.new;
      if (!linha || !linha.colecao || !cache[linha.colecao]) return;
      if (p.eventType === "DELETE") cache[linha.colecao].delete(linha.id);
      else cache[linha.colecao].set(linha.id, linha.data);
      agendar(linha.colecao);
    })
    .subscribe((status) => { if (status === "SUBSCRIBED") recarregar(); });
  let ultimaRecarga = 0;
  async function recarregar() { // ao reconectar ou voltar para a aba: relê o que está aberto, para não ficar desatualizado
    if (Date.now() - ultimaRecarga < 3000) return;
    ultimaRecarga = Date.now();
    for (const col of Object.keys(cache)) { try { await lerColecao(col); avisar(col); } catch (_) {} }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recarregar(); });
  setInterval(recarregar, 5 * 60 * 1000);

  /* ---------- gravações ---------- */
  function local(col, id, f) { if (!cache[col]) return; f(cache[col]); agendar(col); }
  async function gravarSet(col, id, d) {
    const data = clone(d) || {};
    const { error } = await sb.from("plat_docs").upsert({ colecao: col, id, data, atualizado_em: new Date().toISOString() });
    if (error) throw erro(error);
    local(col, id, (m) => m.set(id, data));
  }
  async function gravarUpdate(col, id, patch) {
    const p = clone(patch) || {};
    const { error } = await sb.rpc("plat_atualizar", { p_colecao: col, p_id: id, p_patch: p });
    if (error) throw erro(error);
    local(col, id, (m) => { if (m.has(id)) m.set(id, fundir(m.get(id), p)); });
  }
  async function gravarDelete(col, id) {
    const { error } = await sb.from("plat_docs").delete().eq("colecao", col).eq("id", id);
    if (error) throw erro(error);
    local(col, id, (m) => m.delete(id));
  }

  /* ---------- interface estilo Firestore ---------- */
  function docRef(col, id) {
    return {
      id, path: col + "/" + id,
      get: async () => { await garantir(col); return snapDoc(col, id); },
      set: (d) => gravarSet(col, id, d),
      update: (d) => gravarUpdate(col, id, d),
      delete: () => gravarDelete(col, id),
      onSnapshot: (cb, aoErro) => ouvir(col, id, undefined, cb, aoErro),
      collection: () => { throw Object.assign(new Error("Subcoleções não são usadas"), { code: "unimplemented" }); },
      acquire: async () => ({ release: async () => {} }),
    };
  }
  function consulta(col, q) {
    return {
      where: (campo, op, valor) => consulta(col, { ...q, where: [...q.where, { campo, op, valor }] }),
      orderBy: (campo, dir) => consulta(col, { ...q, orderBy: [...q.orderBy, { campo, dir: dir || "asc" }] }),
      limit: (n) => consulta(col, { ...q, limit: n }),
      get: async () => { await garantir(col); return snapCol(col, q); },
      onSnapshot: (cb, aoErro) => ouvir(col, undefined, q, cb, aoErro),
    };
  }
  function colRef(col) {
    if (!COLECOES.includes(col)) throw Object.assign(new Error("Coleção desconhecida: " + col), { code: "invalid-argument" });
    const base = consulta(col, { where: [], orderBy: [], limit: null });
    return {
      ...base, path: col,
      doc: (id) => docRef(col, id || novoId()),
      add: async (d) => { const id = novoId(); await gravarSet(col, id, d); return docRef(col, id); },
    };
  }
  const db = { doc: (p) => { const { col, id } = separa(p); return docRef(col, id); }, collection: (p) => colRef(String(p)) };

  /* ---------- anexos (bucket colab-anexos; o assetId é o nome do arquivo) ---------- */
  const assets = {
    upload: async (file) => {
      const r = await fetch("/colaboradores/api/anexo", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: file.name, tamanho: file.size, tipo: file.type }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw Object.assign(new Error(j.erro || "Não foi possível enviar o arquivo."), { code: "unavailable" });
      const up = await fetch(j.url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file });
      if (!up.ok) throw Object.assign(new Error("Falhou o envio do arquivo."), { code: "unavailable" });
      return { id: j.id };
    },
    delete: async (id) => { await fetch("/colaboradores/api/anexo?id=" + encodeURIComponent(id), { method: "DELETE" }); },
  };

  /* ---------- download normal do navegador ---------- */
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : String(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "arquivo"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };

  const user = { id: C.usuario.id, name: C.usuario.nome, email: C.usuario.email };
  window.claude = { use: async (nome) => ({ db, assets, downloads, user })[nome] || null };
})();
