/* Central LZ7 — adaptador da plataforma Comissões LZ7.
 * Fornece window.claude.use("db" | "user" | "downloads") com a mesma interface que a plataforma usava no artifact:
 *   db.collection(col).onSnapshot(cb, aoErro)                       → snap.docs[{ id, data() }]
 *   db.collection("auditoria").orderBy("em", "desc").limit(200).onSnapshot(...)
 *   db.doc("col/id").set(dados) / .delete()
 *   user.me() → { id, name } · user.can("data.write") · user.profiles([ids]) → { id: { name } }
 *   downloads.save({ filename, data })
 * em cima do Supabase: tabela com_docs (colecao, id, data jsonb) + tempo real. Quem lê e grava é decidido no banco (RLS).
 * O id de usuário segue o formato da plataforma ("u_<id>") para os nomes aparecerem na auditoria e nos registros.
 */
(function () {
  "use strict";
  const C = window.__CENTRAL;
  const COLECOES = ["cfg", "unidades", "cargos", "pessoas", "pedidos", "ajustes", "apuracoes", "lancamentos", "fechamentos", "recibos", "pagamentos", "auditoria"];
  let token = C.token, tokenExp = C.tokenExp || 0;

  async function tokenAtual(forcar) {
    if (!forcar && Date.now() / 1000 < tokenExp - 120) return token;
    try {
      const r = await fetch("/comissoes/api/token", { cache: "no-store", redirect: "manual" });
      if (r.ok) { const j = await r.json(); if (j.token) { token = j.token; tokenExp = j.exp || 0; window.centralSessao?.voltou(); } }
      else if (r.status === 401 || r.type === "opaqueredirect") { window.centralSessao?.expirou("/comissoes"); }
    } catch (_) {}
    return token;
  }
  const sb = window.supabase.createClient(C.url, C.anon, { accessToken: tokenAtual });
  window.centralSessao?.manterVivo(tokenAtual);

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  function erro(e) {
    const msg = (e && (e.message || e.details)) || String(e || "erro");
    const err = new Error(msg);
    // A plataforma trata "invalid_argument" como acesso só de leitura.
    err.code = /permission|row-level|RLS|401|403|JWT|42501/i.test(msg + " " + (e && e.code)) ? "invalid_argument" : "unavailable";
    return err;
  }
  function separa(path) {
    const p = String(path).split("/").filter(Boolean);
    if (p.length !== 2 || !COLECOES.includes(p[0])) throw Object.assign(new Error("Caminho inválido: " + path), { code: "invalid_argument" });
    return { col: p[0], id: p[1] };
  }

  /* ---------- cache por coleção + ouvintes ---------- */
  const cache = {}, carregando = {}, ouvintes = new Set();
  async function lerColecao(col) {
    const m = new Map();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("com_docs").select("id,data").eq("colecao", col).order("id").range(de, de + 999);
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
  function snapCol(col, q) {
    let ids = [...(cache[col] || new Map()).keys()];
    if (q && q.ordem) {
      const { campo, dir } = q.ordem, s = dir === "desc" ? -1 : 1;
      const v = (id) => { const x = cache[col].get(id); return x == null ? null : x[campo]; };
      ids.sort((a, b) => { const x = v(a), y = v(b); if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return x < y ? -s : s; });
    }
    if (q && q.limite) ids = ids.slice(0, q.limite);
    const docs = ids.map((id) => ({ id, exists: true, data: () => clone(cache[col].get(id)) }));
    return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
  }
  function avisar(col) {
    for (const o of ouvintes) if (o.col === col) { try { o.cb(snapCol(col, o.q)); } catch (e) { console.error(e); } }
  }
  function ouvir(col, q, cb, aoErro) {
    const o = { col, q, cb };
    ouvintes.add(o);
    garantir(col).then(() => { if (ouvintes.has(o)) cb(snapCol(col, q)); })
      .catch((e) => { if (aoErro) aoErro(e.code ? e : erro(e)); });
    return () => ouvintes.delete(o);
  }

  /* ---------- tempo real ---------- */
  let pend = new Set(), timer = null;
  function agendar(col) { pend.add(col); if (!timer) timer = setTimeout(() => { const s = pend; pend = new Set(); timer = null; s.forEach(avisar); }, 60); }
  sb.channel("com_docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "com_docs" }, (p) => {
      const linha = p.eventType === "DELETE" ? p.old : p.new;
      if (!linha || !linha.colecao || !cache[linha.colecao]) { if (p.eventType === "DELETE") recarregar(true); return; }
      if (p.eventType === "DELETE") cache[linha.colecao].delete(linha.id);
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
    const { error } = await sb.from("com_docs").upsert({ colecao: col, id, data });
    if (error) throw erro(error);
    local(col, (m) => m.set(id, data));
  }
  async function gravarDelete(col, id) {
    const { error } = await sb.from("com_docs").delete().eq("colecao", col).eq("id", id);
    if (error) throw erro(error);
    local(col, (m) => m.delete(id));
  }

  function docRef(col, id) {
    return {
      id, path: col + "/" + id,
      get: async () => { await garantir(col); const d = cache[col].get(id); return { id, exists: d !== undefined, data: () => clone(d) }; },
      set: (d) => gravarSet(col, id, d),
      delete: () => gravarDelete(col, id),
    };
  }
  function consulta(col, q) {
    return {
      orderBy: (campo, dir) => consulta(col, { ...q, ordem: { campo, dir: dir || "asc" } }),
      limit: (n) => consulta(col, { ...q, limite: n }),
      get: async () => { await garantir(col); return snapCol(col, q); },
      onSnapshot: (cb, aoErro) => ouvir(col, q, cb, aoErro),
    };
  }
  function colRef(col) {
    if (!COLECOES.includes(col)) throw Object.assign(new Error("Coleção desconhecida: " + col), { code: "invalid_argument" });
    return { ...consulta(col, {}), path: col, doc: (id) => docRef(col, String(id)) };
  }
  const db = { doc: (p) => { const { col, id } = separa(p); return docRef(col, id); }, collection: (p) => colRef(String(p)) };

  /* ---------- usuário logado (login do site) ---------- */
  const UUID = /^u_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const user = {
    me: async () => ({ id: "u_" + C.usuario.id, name: C.usuario.nome }),
    can: async (o) => (o === "data.write" ? !!C.podeEditar : false),
    profiles: async (ids) => {
      const uuids = [...new Set((ids || []).map((x) => (UUID.exec(String(x)) || [])[1]).filter(Boolean))];
      const r = {};
      if (!uuids.length) return r;
      const { data } = await sb.from("perfis").select("id,nome").in("id", uuids);
      for (const p of data || []) r["u_" + p.id] = { name: p.nome };
      return r;
    },
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

  // Cadastro único com a folha: antes de a plataforma ler o banco, traz nome, CPF, Pix, admissão e desligamento
  // dos colaboradores do setor Comercial (com_sincronizar_folha). Se falhar, a plataforma abre do mesmo jeito.
  const sincronizado = Promise.race([
    sb.rpc("com_sincronizar_folha").then(({ error }) => { if (error) console.warn("Comissões: sincronização com a folha falhou", error.message); }),
    new Promise((r) => setTimeout(r, 8000)),
  ]).catch(() => {});

  window.claude = { use: async (nome) => { if (nome === "db") await sincronizado; return ({ db, user, downloads })[nome] || null; } };

  /* ---------- link de volta para a Central, no menu lateral (fora do script da plataforma) ---------- */
  const poe = () => {
    const marca = document.querySelector(".lateral .marca");
    if (!marca || document.querySelector(".voltar-central")) return !!marca;
    const a = document.createElement("a");
    a.href = "/inicio"; a.className = "voltar-central"; a.textContent = "‹ Central"; a.title = "Voltar para a Central";
    const f = document.createElement("a");
    f.href = "/comissoes/folha"; f.className = "voltar-central conferir-folha"; f.textContent = "Conferir com a folha";
    f.title = "Vendedores do Comercial na folha × cadastro das Comissões";
    marca.insertAdjacentElement("afterend", a);
    a.insertAdjacentElement("afterend", f);
    return true;
  };
  const obs = new MutationObserver(() => { if (poe()) obs.disconnect(); });
  document.addEventListener("DOMContentLoaded", () => { if (!poe()) obs.observe(document.body, { childList: true, subtree: true }); });
})();
