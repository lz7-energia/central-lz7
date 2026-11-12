// Regras de datas e da matriz viva do Planner Eisenhower, no servidor.
// Cópia fiel das funções do planner-index.html (easter, holidays, isBiz, prevBiz, nthBiz, occDates, mkOcc, curOcc, cuDesired),
// trocando a data "local do navegador" pela data de São Paulo. Se mudar uma regra aqui, mude também em public/planner/planner.js.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Tarefa = Record<string, any> & { id: string; title: string; start: string };
export type Evento = { id: string; title: string; date: string; kind: "important" | "holiday"; yearly?: boolean };
export type Config = Record<string, any>;

export const DEF: Config = {
  theme: "normal", urgentDays: 7, qNames: ["Prioridade máxima", "Importante", "Rápido", "Pode esperar"],
  counters: { quad: true, cat: true, progress: true }, facultativos: true, quintoDiaUtil: true, satCount: true, name: "",
};
export function mergeSettings(s: any): Config {
  s = s || {};
  return { ...structuredClone(DEF), ...s, counters: { ...DEF.counters, ...(s.counters || {}) },
    qNames: Array.isArray(s.qNames) && s.qNames.length === 4 ? s.qNames : DEF.qNames.slice() };
}

const FUSO = "America/Sao_Paulo";
const pad = (n: number) => String(n).padStart(2, "0");
// Datas como texto AAAA-MM-DD; contas em UTC ao meio-dia (não depende do fuso do servidor).
export const ds = (d: Date) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
export const pd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const mk = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12));
export const addDays = (s: string, n: number) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ds(d); };
export const diffDays = (a: string, b: string) => Math.round((pd(b).getTime() - pd(a).getTime()) / 86400000);
export const dow = (s: string) => pd(s).getUTCDay();
/** Data de hoje em São Paulo. */
export const todayS = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
/** Carimbo do ClickUp (ms) → data em São Paulo. */
export const msDate = (ms: any) => (ms ? new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(+ms)) : null);
/** "AAAA-MM-DD" ou "AAAA-MM-DD HH:MM" (horário de Brasília, UTC−3) → ms para o ClickUp. */
export function dueMs(due: string): { due_date: number; due_date_time: boolean } {
  const [d, t] = due.split(" ");
  return { due_date: Date.parse(`${d}T${t || "12:00"}:00-03:00`), due_date_time: !!t };
}

export class Regras {
  private holCache: Record<number, Map<string, { name: string; type: string; id?: string }>> = {};
  constructor(public settings: Config, public events: Evento[]) {}

  easter(y: number) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return ds(mk(y, mo - 1, da));
  }
  holidays(y: number) {
    if (this.holCache[y]) return this.holCache[y];
    const m = new Map<string, { name: string; type: string; id?: string }>();
    ([["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"], ["09-07", "Independência"],
      ["10-12", "N. Sra. Aparecida"], ["11-02", "Finados"], ["11-15", "Proclamação da República"], ["11-20", "Consciência Negra"],
      ["12-25", "Natal"]] as const).forEach(([md, n]) => m.set(y + "-" + md, { name: n, type: "nacional" }));
    const e = this.easter(y);
    m.set(addDays(e, -2), { name: "Sexta-feira Santa", type: "nacional" });
    if (this.settings.facultativos) {
      m.set(addDays(e, -48), { name: "Carnaval", type: "facultativo" });
      m.set(addDays(e, -47), { name: "Carnaval", type: "facultativo" });
      m.set(addDays(e, 60), { name: "Corpus Christi", type: "facultativo" });
    }
    for (const ev of this.events) {
      if (ev.kind !== "holiday" || !ev.date) continue;
      const d = ev.yearly ? y + ev.date.slice(4) : ev.date;
      if (d.startsWith(y + "-")) m.set(d, { name: ev.title, type: "proprio", id: ev.id });
    }
    return (this.holCache[y] = m);
  }
  isHoliday = (s: string) => this.holidays(+s.slice(0, 4)).get(s);
  isBiz = (s: string) => { const w = dow(s); return w !== 0 && w !== 6 && !this.isHoliday(s); };
  prevBiz = (s: string) => { let i = 0; while (!this.isBiz(s) && i++ < 20) s = addDays(s, -1); return s; };
  nthBiz(y: number, m: number, n: number) {
    const sat = this.settings.satCount !== false;
    let d = ds(mk(y, m, 1)), c = 0;
    while (pd(d).getUTCMonth() === m) {
      const ok = sat ? dow(d) !== 0 && !this.isHoliday(d) : this.isBiz(d);
      if (ok && ++c === n) return dow(d) === 6 ? this.prevBiz(d) : d;
      d = addDays(d, 1);
    }
    return null;
  }
  occDates(t: Tarefa, a: string, b: string) {
    const r = t.rec || { type: "none" }, st = t.start, out: string[] = [];
    if (!st) return out;
    if (r.type === "none") { if (st >= a && st <= b) out.push(st); return out; }
    if (r.type === "daily") { let d = a < st ? st : a; while (d <= b) { if (this.isBiz(d)) out.push(d); d = addDays(d, 1); } return out; }
    if (r.type === "weekly") {
      let d = a; const end = addDays(b, 7);
      while (d <= end) { if (dow(d) === r.weekday && d >= st) { const o = this.prevBiz(d); if (o >= a && o <= b) out.push(o); } d = addDays(d, 1); }
      return out;
    }
    let y = +a.slice(0, 4), m = +a.slice(5, 7) - 1; let ey = +b.slice(0, 4), em = +b.slice(5, 7); if (em > 11) { em = 0; ey++; }
    while (y < ey || (y === ey && m <= em)) {
      let nom: string | null = null; const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (r.type === "monthly") nom = ds(mk(y, m, Math.min(r.day || 1, last)));
      else if (r.type === "bday") nom = this.nthBiz(y, m, r.n || 1);
      else if (r.type === "yearly" && m === +st.slice(5, 7) - 1) nom = ds(mk(y, m, Math.min(+st.slice(8, 10), last)));
      if (nom) { const o = r.type === "bday" ? nom : this.prevBiz(nom); if (o >= a && o <= b && nom >= st) out.push(o); }
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  urgentDays = (t: Tarefa) => (typeof t.urgentDays === "number" && t.urgentDays >= 0 ? t.urgentDays : this.settings.urgentDays || 7);
  mkOcc(t: Tarefa, d: string) {
    const done = !!(t.done && t.done[d]), left = diffDays(todayS(), d);
    let stage: string, q: number;
    if (t.rec && t.rec.type === "daily") { stage = "daily"; q = t.dailyQ || 1; }
    else {
      const U = this.urgentDays(t);
      stage = left < 0 ? "overdue" : left === 0 ? "today" : left <= Math.min(2, U) ? "critical" : left <= U ? "urgent" : left <= Math.max(2 * U, 1) ? "warming" : "calm";
      const u = ["overdue", "today", "critical", "urgent"].includes(stage); q = t.important ? (u ? 1 : 2) : (u ? 3 : 4);
    }
    if (done) stage = "done";
    return { t, date: d, done, left, stage, q };
  }
  curOcc(t: Tarefa) {
    const today = todayS(), r = t.rec || { type: "none" };
    if (r.type === "none") return this.mkOcc(t, t.start);
    if (r.type !== "daily") {
      const from = addDays(today, -90) > t.start ? addDays(today, -90) : t.start;
      if (from < today) { const p = this.occDates(t, from, addDays(today, -1)).find((d) => !(t.done && t.done[d])); if (p) return this.mkOcc(t, p); }
    }
    const n = this.occDates(t, today, addDays(today, 400)).find((d) => !(t.done && t.done[d]));
    return n ? this.mkOcc(t, n) : null;
  }
  /** O que a tarefa deveria ser no ClickUp agora. */
  cuDesired(t: Tarefa) {
    const o = this.curOcc(t), isOne = !t.rec || t.rec.type === "none";
    const Q2PRIO: Record<number, string> = { 1: "urgent", 2: "high", 3: "normal", 4: "low" };
    return {
      name: t.title as string, desc: (t.desc || "") as string,
      due: o ? o.date + (t.time ? " " + t.time : "") : null,
      prio: o ? Q2PRIO[o.q] : t.important ? "high" : "normal",
      done: isOne ? !!(t.done && t.done[t.start]) : false,
    };
  }
}
