/* Central LZ7 — adaptador da Conciliação Bancária.
 * Fornece window.claude.use("db" | "user" | "downloads") com a interface que a plataforma usava no artifact:
 *   db.collection(col).onSnapshot(cb, aoErro) → snap.docs[{ id, data() }], snap.metadata.fromCache
 *   db.doc("col/id").get() / .set(dados) / .update(campos) / .delete()
 * sobre a tabela conc_docs (colecao, id, data jsonb, versao). Melhoria: a gravação de uma conciliação só vale se ninguém
 * a salvou depois que ela foi aberta (conc_gravar com a versão); se alguém salvou, o erro tem code "conflict".
 * Conciliação fechada recusada pelo banco: code "conciliacao_fechada". Sem permissão: "invalid_argument" (somente leitura).
 */
(function () {
  "use strict";
  const C = window.__CENTRAL;
  const COLECOES = ["bancos", "conciliacoes", "resumos", "faltas", "config"];
  let token = C.token, tokenExp = C.tokenExp || 0;

  async function tokenAtual(forcar) {
    if (!forcar && Date.now() / 1000 < tokenExp - 120) return token;
    try {
      const r = await fetch("/conciliacao/api/token", { cache: "no-store", redirect: "manual" });
      if (r.ok) { const j = await r.json(); if (j.token) { token = j.token; tokenExp = j.exp || 0; window.centralSessao?.voltou(); } }
      else if (r.status === 401 || r.type === "opaqueredirect") { window.centralSessao?.expirou("/conciliacao"); }
    } catch (_) {}
    return token;
  }
  const sb = window.supabase.createClient(C.url, C.anon, { accessToken: tokenAtual });
  window.centralSessao?.manterVivo(tokenAtual);

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  function erro(e) {
    const msg = (e && (e.message || e.details)) || String(e || "erro");
    const err = new Error(msg);
    if (/Conciliação fechada/i.test(msg) || (e && e.hint === "conciliacao_fechada")) err.code = "conciliacao_fechada";
    else if (/permission|row-level|RLS|401|403|JWT|42501/i.test(msg + " " + (e && e.code))) err.code = "invalid_argument";
    else err.code = "unavailable";
    return err;
  }
  function separa(path) {
    const p = String(path).split("/").filter(Boolean);
    if (p.length !== 2 || !COLECOES.includes(p[0])) throw Object.assign(new Error("Caminho inválido: " + path), { code: "invalid_argument" });
    return { col: p[0], id: p[1] };
  }

  /* ---------- cache por coleção + versões ---------- */
  const cache = {}, carregando = {}, ouvintes = new Set(), versoes = new Map();
  async function lerColecao(col) {
    const m = new Map();
    for (let de = 0; ; de += 500) {
      const { data, error } = await sb.from("conc_docs").select("id,data,versao").eq("colecao", col).order("id").range(de, de + 499);
      if (error) throw erro(error);
      data.forEach((l) => m.set(l.id, l.data));
      if (data.length < 500) break;
    }
    cache[col] = m;
    return m;
  }
  const garantir = (col) => cache[col] ? Promise.resolve(cache[col])
    : (carregando[col] = carregando[col] || lerColecao(col).finally(() => { delete carregando[col]; }));
  function snapCol(col) {
    const docs = [...(cache[col] || new Map()).entries()].map(([id, d]) => ({ id, exists: true, data: () => clone(d) }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, forEach: (f) => docs.forEach(f) };
  }
  function snapDoc(col, id) {
    const d = cache[col] && cache[col].get(id);
    return { id, exists: d !== undefined, data: () => clone(d), metadata: { fromCache: false } };
  }
  function avisar(col) {
    for (const o of ouvintes) if (o.col === col) { try { o.cb(o.id ? snapDoc(col, o.id) : snapCol(col)); } catch (e) { console.error(e); } }
  }
  function ouvir(col, id, cb, aoErro) {
    const o = { col, id, cb };
    ouvintes.add(o);
    garantir(col).then(() => { if (ouvintes.has(o)) cb(id ? snapDoc(col, id) : snapCol(col)); })
      .catch((e) => { if (aoErro) aoErro(e.code ? e : erro(e)); });
    return () => ouvintes.delete(o);
  }

  /* ---------- tempo real (conciliações não são guardadas no cache: são lidas ao abrir) ---------- */
  let pend = new Set(), timer = null;
  const agendar = (col) => { pend.add(col); if (!timer) timer = setTimeout(() => { const s = pend; pend = new Set(); timer = null; s.forEach(avisar); }, 80); };
  sb.channel("conc_docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "conc_docs" }, (p) => {
      const l = p.eventType === "DELETE" ? p.old : p.new;
      if (!l || !l.colecao || l.colecao === "conciliacoes" || !cache[l.colecao]) return;
      if (p.eventType === "DELETE") cache[l.colecao].delete(l.id); else cache[l.colecao].set(l.id, l.data);
      agendar(l.colecao);
    })
    .subscribe((st) => { if (st === "SUBSCRIBED") recarregar(); });
  let ultima = 0;
  async function recarregar() {
    if (Date.now() - ultima < 3000) return;
    ultima = Date.now();
    for (const col of Object.keys(cache)) { try { await lerColecao(col); avisar(col); } catch (_) {} }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recarregar(); });

  /* ---------- documentos ---------- */
  function local(col, f) { if (!cache[col]) return; f(cache[col]); agendar(col); }
  function docRef(col, id) {
    const chave = col + "/" + id;
    return {
      id, path: chave,
      async get() {
        const { data, error } = await sb.from("conc_docs").select("data,versao").eq("colecao", col).eq("id", id).maybeSingle();
        if (error) throw erro(error);
        if (data) versoes.set(chave, data.versao); else versoes.delete(chave);
        return { id, exists: !!data, data: () => clone(data && data.data) };
      },
      async set(d) {
        const corpo = clone(d) || {};
        // Só a conciliação é condicionada à versão aberta; os outros documentos valem pela última gravação, como antes.
        const v = col === "conciliacoes" ? (versoes.has(chave) ? versoes.get(chave) : null) : null;
        const { data, error } = await sb.rpc("conc_gravar", { p_colecao: col, p_id: id, p_data: corpo, p_versao: v });
        if (error) throw erro(error);
        if (data == null) throw Object.assign(new Error("Outra pessoa salvou esta conciliação depois que você a abriu."), { code: "conflict" });
        versoes.set(chave, data);
        local(col, (m) => m.set(id, corpo));
      },
      async update(campos) {
        const { data, error } = await sb.rpc("conc_mesclar", { p_colecao: col, p_id: id, p_campos: clone(campos) || {} });
        if (error) throw erro(error);
        // Encadeamento mexe no mês seguinte: quem estiver com ele aberto terá conflito ao salvar (precisa recarregar).
        local(col, (m) => m.set(id, { ...(m.get(id) || {}), ...clone(campos) }));
        return data;
      },
      async delete() {
        const { error } = await sb.from("conc_docs").delete().eq("colecao", col).eq("id", id);
        if (error) throw erro(error);
        versoes.delete(chave);
        local(col, (m) => m.delete(id));
      },
      onSnapshot: (cb, aoErro) => ouvir(col, id, cb, aoErro),
    };
  }
  const db = {
    doc: (p) => { const { col, id } = separa(p); return docRef(col, id); },
    collection: (col) => {
      if (!COLECOES.includes(col)) throw Object.assign(new Error("Coleção desconhecida: " + col), { code: "invalid_argument" });
      return { path: col, doc: (id) => docRef(col, String(id)), onSnapshot: (cb, aoErro) => ouvir(col, null, cb, aoErro),
               get: async () => { await garantir(col); return snapCol(col); } };
    },
  };

  /* ---------- usuário e downloads ---------- */
  const user = {
    me: async () => ({ id: "u_" + C.usuario.id, name: C.usuario.nome }),
    can: async (o) => (o === "data.write" ? !!C.podeEditar : false),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "arquivo"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };
  window.claude = { use: async (n) => ({ db, user, downloads })[n] || null };

  /* ---------- histórico de alterações (auditoria) para a página ---------- */
  window.__CONC_AUDITORIA = async (docId) => {
    const { data, error } = await sb.from("conc_auditoria").select("em,por,acao,detalhe").eq("doc_id", docId).order("em", { ascending: false }).limit(300);
    if (error) throw erro(error);
    return data || [];
  };
})();
