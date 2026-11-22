import "server-only";
// Notas a emitir → planner da pessoa fixa (notas_config.responsavel): uma tarefa "Emitir nota: <cliente>" por item da lista,
// com data = desde quando está pronto (aparece como atrasada se ficar parado). Ids "nf-<chave>"; refeito a cada mudança
// (ações da tela) e pelo agendador do planner (15 min), então a tarefa some quando a nota aparece no Flow ou o card é ocultado.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";
import { sincronizar } from "@/lib/planner/sync";

const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";
const br = (d: string) => d.split("-").reverse().join("/");
const moeda = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PREFIXO = "nf-";

export const idTarefaNota = (chave: string) => PREFIXO + chave.replace(/[^A-Za-z0-9-]/g, "-");

export function tarefaDaNota(l: any) {
  const nome = l.cliente_apelido || l.cliente || l.codigo_projeto || `Pedido ${l.numero ?? l.flow_id}`;
  const linhas = [
    `${l.codigo_projeto ? `Projeto ${l.codigo_projeto}` : ""}${l.numero ? ` · Pedido ${l.numero}` : ""}${l.valor_total ? ` · ${moeda(l.valor_total)}` : ""}`.replace(/^ · /, ""),
    l.cliente && l.cliente !== nome ? `Cliente: ${l.cliente}` : "",
    l.aviso ? `Atenção: ${l.aviso}.` : l.os_status ? `OS: ${l.os_status}` : "",
    `Pronto para faturar desde ${br(l.desde)}.`,
  ].filter(Boolean);
  const busca = l.codigo_projeto || l.numero || "";
  return {
    id: idTarefaNota(l.chave), title: `Emitir nota: ${nome}${l.codigo_projeto && nome !== l.codigo_projeto ? ` (${l.codigo_projeto})` : ""}`,
    start: l.desde, urgentDays: 2, important: true, desc: linhas.join("\n"),
    link: { href: `/painel${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`, rotulo: "Notas a emitir" },
  };
}

/** Refaz as tarefas "Emitir nota" no planner do responsável e tira de quem não é mais. */
export async function refletirNotasAEmitir() {
  const sb = supabaseServico();
  const [{ data: cfg }, { data: lista }, { data: existentes }] = await Promise.all([
    sb.from("notas_config").select("responsavel").maybeSingle(),
    sb.from("notas_a_emitir").select("*").limit(1000),
    sb.from("planner_tasks").select("id, user_id").like("id", `${PREFIXO}%`),
  ]);
  let dono: string | null = cfg?.responsavel ?? null;
  if (dono) {
    const { data: p } = await sb.from("perfis").select("id").eq("id", dono).eq("ativo", true).neq("papel", "obras").maybeSingle();
    if (!p) dono = null;
  }
  const desejadas = dono ? (lista || []).map(tarefaDaNota) : [];
  const manter = new Set(desejadas.map((t) => t.id));
  const pessoas = new Set<string>();

  for (const e of existentes || []) {
    if (e.user_id === dono && manter.has(e.id)) continue;
    await apagar(e.user_id, e.id);
    pessoas.add(e.user_id);
  }
  if (dono) {
    const d = new DadosPlanner(dono);
    const agora = Date.now();
    for (const t of desejadas) {
      const atual = await d.tarefa(t.id);
      const desc = `${t.desc}\n\nNa Central (${t.link.rotulo}): ${SITE}${t.link.href}`;
      if (atual && atual.title === t.title && atual.start === t.start && atual.desc === desc) continue;
      await d.gravarTarefa({ subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1, ...(atual || {}), ...t, desc,
        cat: "FIS", rec: { type: "none" }, time: "", createdAt: atual?.createdAt || agora, updatedAt: agora });
      pessoas.add(dono);
    }
  }
  return pessoas;
}

/** Para as ações da tela: refaz e manda ao ClickUp depois da resposta. */
export async function refletirNotasDepois() {
  after(async () => {
    try {
      const pessoas = await refletirNotasAEmitir();
      if (!pessoas.size) return;
      const { data: perfis } = await supabaseServico().from("perfis").select("id, email").in("id", [...pessoas]);
      for (const p of perfis || []) await sincronizar(p.id, "edit", p.email).catch(() => {});
    } catch { /* o agendador acerta na próxima rodada */ }
  });
}

async function apagar(userId: string, id: string) {
  const d = new DadosPlanner(userId);
  const t = await d.tarefa(id);
  const sync = await d.sync();
  if (t?.clickupId && sync.enabled && !(sync.noPush || []).includes(t.clickupId)) {
    await d.mudarSync((s: any) => ({ ...s, deleted: [...new Set([...(s.deleted || []), t.clickupId])],
      pendingDeletes: [...new Set([...(s.pendingDeletes || []), t.clickupId])] }));
  }
  await d.apagarTarefa(id);
}
