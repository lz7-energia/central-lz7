/* Central LZ7 — adaptador do módulo Financiamento e confirmação.
 * Fornece window.__FIN_DB com a mesma interface (estilo Firestore) que a plataforma original usa:
 *   db.doc("pendentes/base").set(d) / .onSnapshot(cb)
 *   db.collection("situacoes").doc(chave).set(d) / .delete()
 *   db.collection("status").onSnapshot(cb)
 * em cima do Supabase: tabela fin_docs (colecao, id, data jsonb) + tempo real. Quem pode gravar é decidido no banco (RLS).
 */
(function () {
  "use strict";
  const C = window.__CENTRAL;
  const COLECOES = ["pendentes", "situacoes", "config", "status"];
  let token = C.token, tokenExp = C.tokenExp || 0;

  async function tokenAtual() {
    if (Date.now() / 1000 < tokenExp - 120) return token;
    try {
      const r = await fetch("/financiamento/api/token", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); if (j.token) { token = j.token; tokenExp = j.exp || 0; } }
      else if (r.status === 401) { location.href = "/entrar?volta=/financiamento"; }
    } catch (_) {}
    return token;
  }
  const sb = window.supabase.createClient(C.url, C.anon, { accessToken: tokenAtual });

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  function erro(e) {
    const err = new Error((e && (e.message || e.details)) || String(e || "erro"));
    err.code = /permission|row-level|RLS|401|403|JWT/i.test(err.message + " " + (e && e.code)) ? "permission-denied" : "unavailable";
    return err;
  }
  function separa(path) {
    const p = String(path).split("/").filter(Boolean);
    if (p.length !== 2 || !COLECOES.includes(p[0])) throw Object.assign(new Error("Caminho inválido: " + path), { code: "invalid-argument" });
    return { col: p[0], id: p[1] };
  }

  /* ---------- cache por coleção + ouvintes ---------- */
  const cache = {}, carregando = {}, ouvintes = new Set();
  async function lerColecao(col) {
    const m = new Map();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("fin_docs").select("id,data").eq("colecao", col).order("id").range(de, de + 999);
      if (error) throw erro(error);
      data.forEach((l) => m.set(l.id, l.data));
      if (data.length < 1000) break;
    }
    cache[col] = m;
    return m;
  }
  function garantir(col) {
    if (cache[col]) return Promise.resolve(cache[col]);
    if (!carregando[col]) carregando[col] = lerColecao(col).finally(() => { delete carregando[col]; });
    return carregando[col];
  }
  const snapDoc = (col, id) => { const d = cache[col] && cache[col].get(id); return { id, exists: d !== undefined, data: () => clone(d) }; };
  function snapCol(col) {
    const docs = [...(cache[col] || new Map()).keys()].map((id) => ({ id, exists: true, data: () => clone(cache[col].get(id)) }));
    return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
  }
  function avisar(col) {
    for (const o of ouvintes) if (o.col === col) { try { o.cb(o.id !== undefined ? snapDoc(col, o.id) : snapCol(col)); } catch (e) { console.error(e); } }
  }
  function ouvir(col, id, cb, aoErro) {
    const o = { col, id, cb };
    ouvintes.add(o);
    garantir(col).then(() => { if (ouvintes.has(o)) cb(id !== undefined ? snapDoc(col, id) : snapCol(col)); })
      .catch((e) => { if (aoErro) aoErro(e.code ? e : erro(e)); });
    return () => ouvintes.delete(o);
  }

  /* ---------- tempo real ---------- */
  let pend = new Set(), timer = null;
  function agendar(col) { pend.add(col); if (!timer) timer = setTimeout(() => { const s = pend; pend = new Set(); timer = null; s.forEach(avisar); }, 60); }
  sb.channel("fin_docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "fin_docs" }, (p) => {
      const linha = p.eventType === "DELETE" ? p.old : p.new;
      if (!linha || !linha.colecao || !cache[linha.colecao]) return;
      if (p.eventType === "DELETE") { if (linha.id) cache[linha.colecao].delete(linha.id); else { recarregar(true); return; } }
      else cache[linha.colecao].set(linha.id, linha.data);
      agendar(linha.colecao);
    })
    .subscribe((status) => { if (status === "SUBSCRIBED") recarregar(); });
  let ultima = 0;
  async function recarregar(forcar) {
    if (!forcar && Date.now() - ultima < 3000) return;
    ultima = Date.now();
    for (const col of Object.keys(cache)) { try { await lerColecao(col); avisar(col); } catch (_) {} }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recarregar(); });
  setInterval(recarregar, 5 * 60 * 1000);

  /* ---------- gravações ---------- */
  function local(col, f) { if (!cache[col]) return; f(cache[col]); agendar(col); }
  async function gravarSet(col, id, d) {
    const data = clone(d) || {};
    const { error } = await sb.from("fin_docs").upsert({ colecao: col, id, data });
    if (error) throw erro(error);
    local(col, (m) => m.set(id, data));
  }
  async function gravarDelete(col, id) {
    const { error } = await sb.from("fin_docs").delete().eq("colecao", col).eq("id", id);
    if (error) throw erro(error);
    local(col, (m) => m.delete(id));
  }

  function docRef(col, id) {
    return {
      id, path: col + "/" + id,
      get: async () => { await garantir(col); return snapDoc(col, id); },
      set: (d) => gravarSet(col, id, d),
      delete: () => gravarDelete(col, id),
      onSnapshot: (cb, aoErro) => ouvir(col, id, cb, aoErro),
    };
  }
  function colRef(col) {
    if (!COLECOES.includes(col)) throw Object.assign(new Error("Coleção desconhecida: " + col), { code: "invalid-argument" });
    return {
      path: col,
      doc: (id) => docRef(col, String(id)),
      get: async () => { await garantir(col); return snapCol(col); },
      onSnapshot: (cb, aoErro) => ouvir(col, undefined, cb, aoErro),
    };
  }
  window.__FIN_DB = { doc: (p) => { const { col, id } = separa(p); return docRef(col, id); }, collection: (p) => colRef(String(p)) };
  // A tela espera os dados antes de ligar os ouvintes: lê tudo de uma vez (são poucos documentos).
  window.__FIN_READY = Promise.all(COLECOES.map(garantir)).catch((e) => console.error("Financiamento: não foi possível ler o banco", e));
})();
