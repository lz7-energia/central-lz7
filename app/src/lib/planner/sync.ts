import "server-only";
// Sincronização do planner com o ClickUp, em mão dupla, no servidor da Central.
// Porta fiel de runSync/syncPull/syncPushAll do planner-index.html, trocando o conector (MCP) pela API REST.
// Garantias:
//  - uma sincronização por pessoa de cada vez (trava no banco);
//  - antes de criar no ClickUp, a tarefa é marcada com cuCreating no banco; com a marca, nunca tenta criar de novo
//    (só libera se o ClickUp RECUSOU a criação — aí é certo que nada foi criado — e a pessoa clicar "Enviar ao ClickUp").
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CAT2LIST, CLOSED, ClickUp, ErroClickUp, LIST2CAT, PRIO_NUM, mensagemDeErro } from "./clickup";
import { DadosPlanner } from "./dados";
import { Regras, addDays, dueMs, msDate, todayS, type Tarefa } from "./regras";

const DAY = 86400000;
const normT = (x: unknown) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
const prioDe = (c: any): string | undefined => (typeof c?.priority === "string" ? c.priority : c?.priority?.priority) || undefined;
const rDesc = (g: any) => (g ? g.markdown_description || g.text_content || g.description || "" : "");

export type Porque = "cron" | "edit" | "manual" | "send" | "load" | "focus" | "timer";
export type Resultado = { ok: boolean; ocupado?: boolean; desligado?: boolean; mensagem: string; avisos: string[]; em?: number };

class Rodada {
  avisos: string[] = [];
  tasks = new Map<string, Tarefa>();
  R!: Regras;
  sync: any = {};
  uid!: number;
  constructor(public d: DadosPlanner, public cu: ClickUp) {}

  noPush = (t: Tarefa) => !!(this.sync.noPush || []).includes(t.clickupId);
  async mudar(id: string, fn: (t: Tarefa) => Tarefa | null) {
    const n = await this.d.mudarTarefa(id, fn);
    if (n) this.tasks.set(id, n);
    return n;
  }
  byCu() { const m: Record<string, Tarefa> = {}; for (const t of this.tasks.values()) if (t.clickupId) m[t.clickupId] = t; return m; }

  /* ---------- receber ---------- */
  async pull() {
    const remote = await this.cu.atribuidas(this.uid), local = this.byCu(), today = todayS();
    const baseline = new Set(this.sync.baseline || []), deleted = new Set(this.sync.deleted || []);
    const seen = new Set<string>(); const newBase: string[] = [];
    for (const c of remote) {
      seen.add(c.id);
      const t = local[c.id], cuU = +c.date_updated || 0;
      if (t) {
        const localChanged = (t.updatedAt || 0) > (t.syncedAt || 0), remoteChanged = cuU > (t.cuUpdated || 0) + 1500;
        if (remoteChanged && (!localChanged || cuU > (t.updatedAt || 0))) {
          try { await this.pullApply(t, c); } catch (e) { if (!(e instanceof ErroClickUp && e.recusado)) throw e; }
        }
        continue;
      }
      if (baseline.has(c.id) || deleted.has(c.id)) continue;
      const twin = [...this.tasks.values()].find((x) => !x.clickupId && !x.cuRemoved && normT(x.title) === normT(c.name) &&
        (x.cuCreating || (x.createdAt || 0) > (this.sync.activatedAt || Infinity)));
      if (twin) {
        await this.mudar(twin.id, (cur) => ({ ...cur, clickupId: c.id, clickupUrl: c.url || "https://app.clickup.com/t/" + c.id, cuCreating: null,
          cuErro: null, cuUpdated: +c.date_updated || Date.now(), cuName: c.name, cuPrio: prioDe(c), cuDue: msDate(c.due_date), syncedAt: cur.updatedAt }));
        local[c.id] = this.tasks.get(twin.id)!;
        continue;
      }
      const due = msDate(c.due_date);
      if (due && due < today) { newBase.push(c.id); continue; }
      try { await this.importRemote(c); } catch (e) { if (!(e instanceof ErroClickUp && e.recusado)) throw e; }
    }
    if (newBase.length) this.sync = await this.d.mudarSync((s: any) => ({ ...s, baseline: [...(s.baseline || []), ...newBase] }));
    if (Date.now() - (this.sync.lastMissingAt || 0) > DAY) {
      this.sync = await this.d.mudarSync({ lastMissingAt: Date.now() });
      for (const t of Object.values(this.byCu())) if (!seen.has(t.clickupId) && !this.noPush(t)) await this.checkMissing(t);
    }
  }
  async pullApply(t: Tarefa, c: any) {
    const g = await this.cu.tarefa(c.id);
    await this.mudar(t.id, (cur) => {
      const nt: Tarefa = { ...cur };
      nt.title = g.name || c.name || cur.title;
      const d = rDesc(g); if (d !== (cur.cuDesc || "")) nt.desc = d;
      const pr = prioDe(g) || prioDe(c);
      if (pr && pr !== cur.cuPrio && !(cur.rec && cur.rec.type === "daily")) nt.important = pr === "urgent" || pr === "high";
      const due = msDate(g.due_date || c.due_date);
      if (due && (!cur.rec || cur.rec.type === "none") && due !== (cur.cuDue || "").slice(0, 10)) nt.start = due;
      const lc = LIST2CAT[g.list?.id || c.list?.id]; if (lc) nt.cat = lc;
      nt.updatedAt = Date.now(); nt.syncedAt = nt.updatedAt;
      nt.cuUpdated = +g.date_updated || +c.date_updated || Date.now(); nt.cuDesc = d; nt.cuPrio = pr || cur.cuPrio; nt.cuDue = due || cur.cuDue;
      return nt;
    });
  }
  async importRemote(c: any) {
    const g = await this.cu.tarefa(c.id), today = todayS();
    let start = msDate(g.due_date || c.due_date);
    if (!start) { start = today; let i = 0; while (!this.R.isBiz(start) && i++ < 10) start = addDays(start, 1); }
    const pr = prioDe(g) || prioDe(c), d = rDesc(g), now = Date.now();
    const t: Tarefa = { id: "cu" + c.id, title: g.name || c.name, desc: d, cat: LIST2CAT[g.list?.id || c.list?.id] || "GER", rec: { type: "none" },
      start, time: "", important: pr === "urgent" || pr === "high", dailyQ: 1, urgentDays: null, subs: [], done: {}, subDone: {}, files: [], comments: [],
      clickupId: c.id, clickupUrl: c.url || g.url || "https://app.clickup.com/t/" + c.id, createdAt: now, updatedAt: now, syncedAt: now,
      cuUpdated: +g.date_updated || +c.date_updated || now, cuDesc: d, cuPrio: pr, cuDue: start };
    await this.d.gravarTarefa(t);
    this.tasks.set(t.id, t);
    this.avisos.push("Nova tarefa do ClickUp: " + t.title);
  }
  async checkMissing(t: Tarefa) {
    let g: any;
    try { g = await this.cu.tarefa(t.clickupId); }
    catch (e) {
      if (e instanceof ErroClickUp && e.naoEncontrada) {
        await this.mudar(t.id, (cur) => { const nt: Tarefa = { ...cur }; delete nt.clickupId; delete nt.clickupUrl; nt.cuRemoved = true; nt.syncedAt = nt.updatedAt; return nt; });
        this.avisos.push("“" + t.title + "” foi excluída no ClickUp e ficou só no planner");
        return;
      }
      if (e instanceof ErroClickUp && e.recusado) return;
      throw e;
    }
    const st = String(g.status?.status || g.status || "").toLowerCase();
    if (!(CLOSED.includes(st) || g.date_closed)) return;
    const o = this.R.curOcc(t); if (!o || o.done) return;
    await this.mudar(t.id, (cur) => {
      const nt: Tarefa = { ...cur, done: { ...(cur.done || {}), [o.date]: true }, updatedAt: Date.now() };
      nt.cuNeedReopen = !!(cur.rec && cur.rec.type !== "none");
      nt.cuDone = !nt.cuNeedReopen; nt.syncedAt = nt.cuNeedReopen ? 0 : nt.updatedAt;
      return nt;
    });
    this.avisos.push("Concluída no ClickUp: " + t.title);
  }

  /* ---------- enviar ---------- */
  async pushAll() {
    for (const id of [...this.tasks.keys()]) {
      const t = this.tasks.get(id); if (!t) continue;
      try {
        if (t.clickupId) { if (!this.noPush(t)) await this.pushTask(t); }
        else if (!t.cuRemoved && (t.cuForce || (t.createdAt || 0) > (this.sync.activatedAt || Infinity))) await this.createRemote(t);
      } catch (e) {
        if (e instanceof ErroClickUp && e.recusado) { console.warn("ClickUp recusou", t.title, e.message); continue; }
        throw e;
      }
    }
    for (const t of [...this.tasks.values()]) if (t.clickupId && !this.noPush(t)) { await this.pushComments(t); await this.pushFiles(t); }
    const pend: string[] = this.sync.pendingDeletes || [];
    if (pend.length) {
      const feitos = new Set<string>();
      for (const id of pend) {
        try { await this.cu.excluir(id); feitos.add(id); }
        catch (e) { if (e instanceof ErroClickUp && (e.recusado || e.naoEncontrada)) feitos.add(id); else throw e; }
      }
      this.sync = await this.d.mudarSync((s: any) => ({ ...s, pendingDeletes: (s.pendingDeletes || []).filter((x: string) => !feitos.has(x)) }));
    }
  }
  async pushTask(t: Tarefa) {
    const w = this.R.cuDesired(t), localChanged = (t.updatedAt || 0) > (t.syncedAt || 0);
    const input: any = {}; let any = false;
    if (localChanged && w.name !== t.cuName) { input.name = w.name; any = true; }
    if (localChanged && w.desc !== (t.cuDesc || "")) { input.markdown_content = w.desc || " "; any = true; }
    const isDaily = t.rec && t.rec.type === "daily";
    if (w.due && w.due !== t.cuDue && (!isDaily || localChanged || !t.cuDue)) { Object.assign(input, dueMs(w.due)); any = true; }
    if (w.prio !== t.cuPrio) { input.priority = PRIO_NUM[w.prio]; any = true; }
    if (t.cuNeedReopen) { input.status = "to do"; any = true; }
    else if (!t.rec || t.rec.type === "none") {
      if (w.done !== !!t.cuDone && (localChanged || (t.cuDone === undefined && w.done))) { input.status = w.done ? "complete" : "to do"; any = true; }
    }
    if (!any) {
      if (localChanged) await this.mudar(t.id, (cur) => ((cur.updatedAt || 0) === (t.updatedAt || 0) ? { ...cur, syncedAt: cur.updatedAt } : null));
      return;
    }
    const p = await this.cu.atualizar(t.clickupId, input);
    await this.mudar(t.id, (cur) => {
      const nt: Tarefa = { ...cur, cuName: w.name, cuDesc: w.desc, cuDue: w.due || cur.cuDue, cuPrio: w.prio,
        cuDone: input.status ? input.status === "complete" : cur.cuDone, cuNeedReopen: false,
        cuUpdated: Math.max(+(p?.date_updated) || 0, Date.now() + 3000) };
      if ((cur.updatedAt || 0) === (t.updatedAt || 0)) nt.syncedAt = cur.updatedAt;
      return nt;
    });
  }
  async createRemote(t: Tarefa) {
    // Já marcada: nunca tenta de novo. Única exceção: o ClickUp recusou (nada foi criado) e a pessoa pediu "Enviar ao ClickUp".
    if (t.cuCreating && !(t.cuForce && t.cuErro)) return;
    const w = this.R.cuDesired(t);
    const input: any = { name: w.name, assignees: [this.uid], priority: PRIO_NUM[w.prio] };
    if (w.desc) input.markdown_content = w.desc;
    if (w.due) Object.assign(input, dueMs(w.due));
    // 1) Marca no banco ANTES de chamar o ClickUp.
    const marcada = await this.mudar(t.id, (cur) =>
      cur.clickupId || (cur.cuCreating && !(cur.cuForce && cur.cuErro)) ? null : { ...cur, cuCreating: Date.now(), cuForce: false, cuErro: null });
    if (!marcada) return;
    // 2) Cria uma única vez.
    let r: any;
    try { r = await this.cu.criar(CAT2LIST[t.cat] || CAT2LIST.GER, input); }
    catch (e) {
      if (e instanceof ErroClickUp && e.recusado) {
        await this.mudar(t.id, (cur) => ({ ...cur, cuErro: mensagemDeErro(e) }));
        this.avisos.push("O ClickUp recusou criar “" + t.title + "”");
        return;
      }
      throw e; // resposta incerta: a marca fica e o vínculo vem pelo título na próxima leitura
    }
    const id = r?.id;
    if (!id) return;
    await this.mudar(t.id, (cur) => ({ ...cur, clickupId: String(id), clickupUrl: r.url || "https://app.clickup.com/t/" + id, cuForce: false, cuCreating: null,
      cuErro: null, cuName: w.name, cuDesc: w.desc, cuDue: w.due, cuPrio: w.prio, cuDone: false, cuUpdated: Date.now() + 3000, syncedAt: cur.updatedAt }));
    this.avisos.push("Criada no ClickUp: " + t.title);
  }
  async pushComments(t: Tarefa) {
    const act = this.sync.activatedAt || 0;
    const todo = (t.comments || []).filter((c: any) => !c.cu && c.at > act);
    if (!todo.length) return;
    const done = new Set<string>();
    for (const c of todo) {
      try { await this.cu.comentar(t.clickupId, c.text); done.add(c.id); }
      catch (e) { if (!(e instanceof ErroClickUp && e.recusado)) throw e; }
    }
    if (done.size) await this.mudar(t.id, (cur) => ({ ...cur, comments: (cur.comments || []).map((c: any) => (done.has(c.id) ? { ...c, cu: true } : c)) }));
  }
  async pushFiles(t: Tarefa) {
    const todo = (t.files || []).filter((f: any) => f.cuPending && !f.cu && f.path);
    if (!todo.length) return;
    const res = new Map<string, boolean>();
    for (const f of todo) {
      try {
        const { data, error } = await this.d.sb.storage.from("planner-anexos").download(f.path);
        if (error || !data) { res.set(f.id, false); continue; }
        await this.cu.anexar(t.clickupId, data, f.name);
        res.set(f.id, true);
      } catch (e) {
        if (e instanceof ErroClickUp && e.recusado) res.set(f.id, false); else throw e;
      }
    }
    await this.mudar(t.id, (cur) => ({ ...cur, files: (cur.files || []).map((f: any) =>
      res.has(f.id) ? { ...f, cuPending: false, cu: res.get(f.id) } : f) }));
  }
}

/** Sincroniza o planner de uma pessoa. "edit" só envia; os demais também leem (o automático, se a última leitura tem mais de 1 h). */
export async function sincronizar(userId: string, porque: Porque, email?: string): Promise<Resultado> {
  const d = new DadosPlanner(userId);
  if (!(await d.travar())) return { ok: true, ocupado: true, mensagem: "sincronização já em andamento", avisos: [] };
  let cu: ClickUp | null = null;
  const rodar = async (): Promise<Resultado> => {
    let sync = await d.sync();
    if (!sync.enabled) return { ok: true, desligado: true, mensagem: "desligado", avisos: [] };
    const manual = porque === "manual" || porque === "send", now = Date.now();
    if (!manual && (sync.pausedUntil || 0) > now) {
      const h = new Date(sync.pausedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      return { ok: false, mensagem: `limite de chamadas do ClickUp atingido — volto a tentar às ${h}; suas edições ficam guardadas`, avisos: [] };
    }
    cu = new ClickUp();
    const r = new Rodada(d, cu);
    if (!sync.clickupUserId) {
      const eu = (await cu.membros()).find((m) => email && m.email?.toLowerCase() === email.toLowerCase());
      if (!eu) return { ok: false, mensagem: "não achei seu usuário no ClickUp — escolha em Configurações → ClickUp", avisos: [] };
      sync = await d.mudarSync({ clickupUserId: eu.id });
    }
    r.uid = Number(sync.clickupUserId);
    r.sync = sync;
    const est = await d.estado();
    r.R = new Regras(est.settings, est.events);
    for (const t of est.tasks) r.tasks.set(t.id, t);
    const doPull = manual || porque === "cron" || porque === "timer" || now - (sync.lastPullAt || 0) > 60 * 60000;
    if (doPull && porque !== "edit") { await r.pull(); r.sync = await d.mudarSync({ lastPullAt: Date.now() }); }
    await r.pushAll();
    return { ok: true, mensagem: "ok", avisos: r.avisos, em: Date.now() };
  };
  let res: Resultado;
  try {
    try { res = await rodar(); }
    catch (e) {
      if (e instanceof ErroClickUp && e.passageiro) { await new Promise((ok) => setTimeout(ok, 2500)); res = await rodar(); }
      else throw e;
    }
  } catch (e) {
    console.error("planner sync", e);
    if (e instanceof ErroClickUp && e.limite) await d.mudarSync({ pausedUntil: Date.now() + 15 * 60000 }).catch(() => {});
    res = { ok: false, mensagem: mensagemDeErro(e), avisos: [] };
  }
  // Contagem de chamadas das últimas 24 h (config/usage do original).
  const usadas = (cu as ClickUp | null)?.chamadas || 0;
  if (usadas) {
    await d.mudarSync((s: any) => {
      const n = Date.now(), st = ((s.usage && s.usage.stamps) || []).filter((x: number) => n - x < DAY);
      for (let i = 0; i < usadas; i++) st.push(n);
      return { ...s, usage: { stamps: st } };
    }).catch(() => {});
  }
  await d.soltar(res.ok ? "ok" : "erro", res.mensagem);
  return res;
}
