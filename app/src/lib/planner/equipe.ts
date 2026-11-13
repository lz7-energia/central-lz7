import "server-only";
// Tarefas e calls entre a equipe: quem cria marca "Para quem"; cada pessoa recebe uma cópia no próprio planner
// (id "eq-<tarefa>-<pessoa>") e um aviso. Tarefa passada: a original fica só na Central como acompanhamento (soCentral).
// Call: fica no planner de todos (cada um no seu ClickUp).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "./dados";
import { sincronizar } from "./sync";
import type { Tarefa } from "./regras";

export type Colega = { id: string; nome: string; email: string };
const CAMPOS = ["title", "desc", "cat", "start", "time", "rec", "important", "urgentDays", "dailyQ", "subs"] as const;
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const idCopia = (tarefaId: string, pessoaId: string) => `eq-${tarefaId}-${pessoaId.slice(0, 8)}`;
export const primeiroNome = (n: string) => (n || "").trim().split(/\s+/)[0] || n;
export function quando(t: { start?: string; time?: string }) {
  if (!t.start) return "";
  const [y, m, d] = t.start.split("-").map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}${t.time ? " às " + t.time : ""}`;
}
const hash = (t: Tarefa) => JSON.stringify([...CAMPOS.map((c) => t[c] ?? null), t.tipo || "tarefa", [...(t.para || [])].sort()]);

export async function colegas(): Promise<Colega[]> {
  const { data } = await supabaseServico().from("perfis").select("id, nome, email").eq("ativo", true).in("papel", ["equipe", "admin"]).order("nome");
  return (data || []) as Colega[];
}

export async function avisar(userId: string, deId: string | null, texto: string, tarefaId?: string) {
  await supabaseServico().from("planner_avisos").insert({ user_id: userId, de_id: deId, texto: texto.slice(0, 400), tarefa_id: tarefaId || null });
}

/** Grava (ou apaga, com campos = null) uma tarefa no planner de outra pessoa, preservando o que é dela (feito, comentários, ClickUp). */
async function gravarNoPlanner(userId: string, id: string, campos: any | null) {
  const d = new DadosPlanner(userId);
  const atual = await d.tarefa(id);
  if (!campos) {
    if (!atual) return false;
    const sync = await d.sync();
    if (atual.clickupId && sync.enabled && !(sync.noPush || []).includes(atual.clickupId)) {
      await d.mudarSync((s: any) => ({ ...s, deleted: [...new Set([...(s.deleted || []), atual.clickupId])],
        pendingDeletes: [...new Set([...(s.pendingDeletes || []), atual.clickupId])] }));
    }
    await d.apagarTarefa(id);
    return true;
  }
  const agora = Date.now();
  await d.gravarTarefa({ done: {}, subDone: {}, files: [], comments: [], ...(atual || {}), ...campos, id,
    createdAt: atual?.createdAt || agora, updatedAt: agora });
  return true;
}

function sincronizarDepois(pessoas: Colega[]) {
  if (!pessoas.length) return;
  after(async () => { for (const p of pessoas) await sincronizar(p.id, "edit", p.email).catch(() => {}); });
}

/** Depois de salvar uma tarefa: cria, atualiza ou remove as cópias de quem está em "Para quem". Devolve a tarefa ajustada. */
export async function distribuir(remetente: { id: string; nome: string }, t: Tarefa, anterior: Tarefa | null): Promise<Tarefa> {
  if (t.origem) return t; // é uma cópia recebida: não redistribui
  const time = await colegas();
  const porId = new Map(time.map((c) => [c.id, c]));
  const recusas: Record<string, string> = t.paraRecusas || {};
  const para: string[] = [...new Set<string>((Array.isArray(t.para) ? t.para : []).map(String))].filter((id) => id !== remetente.id && porId.has(id));
  const antes: string[] = (anterior?.para || []).filter((id: string) => porId.has(id));
  if (!para.length && !antes.length) return t;
  const call = t.tipo === "call";
  const nomeDe = porId.get(remetente.id)?.nome || remetente.nome;
  const participantes = [nomeDe, ...para.map((id) => porId.get(id)!.nome)].join(", ");
  const h = hash(t);
  const mexidos: Colega[] = [];

  for (const id of para) {
    if (recusas[id]) continue;
    const c = porId.get(id)!;
    const cid = idCopia(t.id, id);
    const copia = await new DadosPlanner(id).tarefa(cid);
    if (copia && copia.origemHash === h) continue;
    const campos: any = {};
    for (const k of CAMPOS) campos[k] = t[k] ?? null;
    campos.title = `${call ? "📞 " : ""}${t.title} — ${primeiroNome(nomeDe)}`;
    campos.desc = `${call ? `${nomeDe} convidou você para uma call.\nParticipantes: ${participantes}` : `${nomeDe} te passou esta tarefa.`}${t.desc?.trim() ? "\n\n" + t.desc.trim() : ""}`;
    Object.assign(campos, { tipo: call ? "call" : "tarefa", de: { id: remetente.id, nome: nomeDe }, origem: t.id, origemHash: h });
    await gravarNoPlanner(id, cid, campos);
    await avisar(id, remetente.id, copia
      ? `${nomeDe} alterou: ${t.title} · ${quando(t)}`
      : call ? `${nomeDe} convidou você para uma call: ${t.title} · ${quando(t)}` : `${nomeDe} te passou uma tarefa: ${t.title} · ${quando(t)}`, cid);
    mexidos.push(c);
  }
  for (const id of antes) {
    if (para.includes(id)) continue;
    if (await gravarNoPlanner(id, idCopia(t.id, id), null)) {
      await avisar(id, remetente.id, `${nomeDe} tirou você de: ${t.title}`);
      mexidos.push(porId.get(id)!);
    }
  }
  sincronizarDepois(mexidos);

  // Tarefa passada: a original vira só acompanhamento (não vai ao ClickUp de quem mandou). Call: fica normal.
  const soCentral = !call && para.length > 0 && !t.clickupId;
  if (!!t.soCentral !== soCentral) {
    const d = new DadosPlanner(remetente.id);
    return (await d.mudarTarefa(t.id, (cur) => ({ ...cur, soCentral }))) || t;
  }
  return t;
}

/** A original foi excluída: some das outras pessoas também. */
export async function cancelarCopias(remetente: { id: string; nome: string }, t: Tarefa) {
  if (t.origem || !t.para?.length) return;
  const time = await colegas();
  const mexidos: Colega[] = [];
  for (const id of t.para) {
    const c = time.find((x) => x.id === id);
    if (!c) continue;
    if (await gravarNoPlanner(id, idCopia(t.id, id), null)) {
      await avisar(id, remetente.id, `${primeiroNome(remetente.nome)} cancelou: ${t.title}`);
      mexidos.push(c);
    }
  }
  sincronizarDepois(mexidos);
}

/** Quem recebeu recusa: a cópia sai do planner dela e quem mandou recebe o aviso com o motivo. */
export async function recusar(pessoa: { id: string; nome: string; email: string }, copiaId: string, motivo: string) {
  const d = new DadosPlanner(pessoa.id);
  const copia = await d.tarefa(copiaId);
  if (!copia?.origem || !copia.de?.id) return { erro: "Tarefa não encontrada." };
  const m = motivo.trim().slice(0, 300);
  if (!m) return { erro: "Escreva o motivo." };
  await gravarNoPlanner(pessoa.id, copiaId, null);
  const dono = new DadosPlanner(copia.de.id);
  await dono.mudarTarefa(copia.origem, (cur) => ({ ...cur, paraRecusas: { ...(cur.paraRecusas || {}), [pessoa.id]: m } }));
  const titulo = String(copia.title).replace(/^📞 /, "").replace(/ — [^—]+$/, "");
  await avisar(copia.de.id, pessoa.id, `${pessoa.nome} recusou: ${titulo} — ${m}`, copia.origem);
  sincronizarDepois([{ id: pessoa.id, nome: pessoa.nome, email: pessoa.email }]);
  return { ok: true };
}

/** Quem recebeu concluiu (pelo planner): avisa quem mandou. */
export async function avisarConclusao(pessoa: { id: string; nome: string }, t: Tarefa, anterior: Tarefa | null) {
  if (!t.origem || !t.de?.id || t.tipo === "call") return;
  const feita = (x: Tarefa | null) => !!x && Object.keys(x.done || {}).length > 0;
  if (feita(t) && !feita(anterior)) {
    const titulo = String(t.title).replace(/ — [^—]+$/, "");
    await avisar(t.de.id, pessoa.id, `${pessoa.nome} concluiu: ${titulo}`, t.origem);
  }
}

/** Para quem mandou: situação de cada pessoa (concluiu, pendente, recusou). Só tarefas que não repetem. */
export async function situacaoDasCopias(tarefas: Tarefa[]) {
  const comPara = tarefas.filter((t) => !t.origem && Array.isArray(t.para) && t.para.length);
  if (!comPara.length) return tarefas;
  const ids = comPara.flatMap((t) => t.para.map((p: string) => idCopia(t.id, p)));
  const { data } = await supabaseServico().from("planner_tasks").select("user_id, id, data").in("id", ids);
  const achadas = new Map((data || []).map((r) => [`${r.user_id}|${r.id}`, r.data]));
  return tarefas.map((t) => {
    if (!comPara.includes(t)) return t;
    const paraStatus: Record<string, string> = {};
    for (const p of t.para) {
      if (t.paraRecusas?.[p]) { paraStatus[p] = "recusou: " + t.paraRecusas[p]; continue; }
      const c: any = achadas.get(`${p}|${idCopia(t.id, p)}`);
      paraStatus[p] = !c ? "pendente" : Object.keys(c.done || {}).length ? "concluiu" : "pendente";
    }
    return { ...t, paraStatus };
  });
}

export async function avisosNaoLidos(userId: string) {
  const { data } = await supabaseServico().from("planner_avisos").select("id, texto, tarefa_id, criado_em")
    .eq("user_id", userId).is("lido_em", null).order("criado_em", { ascending: false }).limit(30);
  return data || [];
}
export async function marcarLidos(userId: string, ids?: number[]) {
  let q = supabaseServico().from("planner_avisos").update({ lido_em: new Date().toISOString() }).eq("user_id", userId).is("lido_em", null);
  if (ids?.length) q = q.in("id", ids);
  await q;
}
