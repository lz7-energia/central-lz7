import type { NextRequest } from "next/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { mergeSettings, type Tarefa } from "@/lib/planner/regras";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

/* eslint-disable @typescript-eslint/no-explicit-any */
const lista = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.entries(v).map(([id, x]: any) => ({ id, ...x })) : []);

/**
 * Importa o planner antigo. Aceita: uma lista de tasks; ou { tasks, events?, settings?, sync? }
 * (tasks/events também podem vir como objeto { id: {...} }). Junta por id; nada é apagado.
 * Tarefas com clickupId continuam ligadas à mesma tarefa do ClickUp; se já existir uma cópia "cu<id>" importada
 * pela sincronização, ela é trocada pela do arquivo (sem duplicar).
 * Tarefas sem vínculo NÃO são enviadas ao ClickUp sozinhas (ficam com o botão "Enviar ao ClickUp").
 */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const corpo = await req.json().catch(() => null);
  if (!corpo) return ok({ erro: "Arquivo não é um JSON válido." });
  const raiz = Array.isArray(corpo) ? { tasks: corpo } : corpo;
  const tarefas = lista(raiz.tasks).filter((t) => t && ID.test(String(t.id || "")) && typeof t.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(t.start || "")));
  const eventos = lista(raiz.events).filter((e) => e && ID.test(String(e.id || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || "")));
  if (!tarefas.length && !eventos.length) return ok({ erro: "Não encontrei tarefas no arquivo (cada uma precisa de id, title e start)." });

  const d = new DadosPlanner(p.id);
  const atual = await d.estado();
  const porCu = new Map(atual.tasks.filter((t) => t.clickupId).map((t) => [String(t.clickupId), t.id]));
  let trocadas = 0;
  for (const t of tarefas as Tarefa[]) {
    const dup = t.clickupId ? porCu.get(String(t.clickupId)) : undefined;
    if (dup && dup !== t.id) { await d.apagarTarefa(dup); trocadas++; }
    const limpa: Tarefa = { subs: [], done: {}, subDone: {}, files: [], comments: [], rec: { type: "none" }, ...t };
    // Anexos do planner antigo apontam para o armazenamento do Claude: mantém nome e link, sem envio ao ClickUp.
    limpa.files = (limpa.files || []).map((f: any) => ({ ...f, cuPending: false }));
    limpa.updatedAt = limpa.updatedAt || Date.now();
    await d.gravarTarefa(limpa);
  }
  for (const e of eventos) {
    await d.sb.from("planner_events").upsert({ user_id: p.id, id: e.id,
      data: { id: e.id, title: String(e.title || ""), date: e.date, kind: e.kind === "holiday" ? "holiday" : "important", yearly: !!e.yearly } });
  }
  if (raiz.settings && typeof raiz.settings === "object") {
    await d.sb.from("planner_settings").upsert({ user_id: p.id, data: mergeSettings(raiz.settings) });
  }
  // Listas de controle da sincronização antiga (baseline, deleted, noPush) e trava contra envio das tarefas importadas.
  const s0 = raiz.sync && typeof raiz.sync === "object" ? raiz.sync : {};
  await d.mudarSync((s: any) => ({
    ...s,
    baseline: [...new Set([...(s.baseline || []), ...(s0.baseline || [])])],
    deleted: [...new Set([...(s.deleted || []), ...(s0.deleted || [])])],
    noPush: [...new Set([...(s.noPush || []), ...(s0.noPush || [])])],
    activatedAt: s.activatedAt ? Math.max(s.activatedAt, Date.now()) : s.activatedAt ?? null,
  }));
  return ok({ tarefas: tarefas.length, eventos: eventos.length, trocadas });
}
