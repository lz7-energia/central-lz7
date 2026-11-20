import "server-only";
// Central de Obras → planner da Central Administrativa: pagamento condicionado a uma parte da obra
// (entrega do material, início da instalação, conclusão). Cada condição com "avisar" vira a tarefa
// "Receber: <obra>" no planner da pessoa, na data da etapa (realizada, senão prevista). Ids "obra-<código>-<id>":
// refaz o conjunto da obra a cada mudança, então a tarefa acompanha a reprogramação e some quando o pagamento é recebido.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";
import { sincronizar } from "@/lib/planner/sync";

const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";
const br = (d: string) => d.split("-").reverse().join("/");
const moeda = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MINI = new Set(["de", "da", "do", "das", "dos", "e"]);
const nome = (s: string) => String(s || "").toLowerCase().split(/\s+/).map((w, i) => (MINI.has(w) && i ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

export const ETAPAS: Record<string, string> = { entrega: "na entrega do material", instalacao: "no início da instalação", conclusao: "na conclusão da obra" };

/** Data da etapa na obra: a realizada, senão a prevista. */
export function dataDaEtapa(o: any, etapa: string): string | null {
  if (etapa === "entrega") return o.material_entregue || o.material_previsto || null;
  if (etapa === "instalacao") return o.inicio_real || o.inicio_previsto || null;
  if (etapa === "conclusao") return o.fim_real || o.fim_previsto || null;
  return null;
}

/** Nome do card sem o código e a potência do padrão do Ploomes (igual à tela). */
export function tituloObra(o: any) {
  const c = String(o.nome_card || "").replace(/^[A-Z0-9-]{6,}\s*-\s*/, "").replace(/\s*\(\s*[\d.,]+\s*kwp\s*\)\s*$/i, "").trim();
  return c ? (c === c.toUpperCase() ? nome(c) : c) : nome(o.cliente || o.codigo);
}

export function tarefasDaObra(o: any) {
  const prefixo = `obra-${o.codigo}-`;
  const out: { dono: string; t: any }[] = [];
  for (const p of (o.pagamentos || []) as any[]) {
    if (!p?.avisar || p.recebido_em || !ETAPAS[p.etapa]) continue;
    const data = dataDaEtapa(o, p.etapa);
    if (!data) continue;
    const realizada = (p.etapa === "entrega" && o.material_entregue) || (p.etapa === "instalacao" && o.inicio_real) || (p.etapa === "conclusao" && o.fim_real);
    const linhas = [
      `Pagamento condicionado ${ETAPAS[p.etapa]}${p.valor ? ": " + moeda(p.valor) : ""}.`,
      p.obs ? `Observação: ${p.obs}` : "",
      o.forma_pagamento ? `Forma de pagamento do contrato: ${o.forma_pagamento}` : "",
      realizada ? `Etapa feita em ${br(data)}.` : `Data prevista: ${br(data)} (muda sozinha se a obra for reprogramada).`,
    ].filter(Boolean);
    out.push({ dono: p.avisar, t: {
      id: `${prefixo}${p.id}`, title: `Receber: ${tituloObra(o)} (${ETAPAS[p.etapa]})`, start: data, urgentDays: 3, important: true, desc: linhas.join("\n"),
    } });
  }
  return { prefixo, out };
}

/** Refaz no planner as tarefas de pagamento de uma obra (também limpa quando a obra é excluída). */
export async function refletirObraNoPlanner(codigo: string) {
  const sb = supabaseServico();
  const { data: o } = await sb.from("obra_obras")
    .select("codigo, nome_card, cliente, forma_pagamento, pagamentos, material_previsto, material_entregue, inicio_previsto, inicio_real, fim_previsto, fim_real")
    .eq("codigo", codigo).maybeSingle();
  const { prefixo, out } = o ? tarefasDaObra(o) : { prefixo: `obra-${codigo}-`, out: [] };
  const link = { href: `/obras/cronograma#obra=${encodeURIComponent(codigo)}`, rotulo: `Obras · ${o ? tituloObra(o) : codigo}` };

  // só perfis da Central Administrativa recebem
  const donos = [...new Set(out.map((x) => x.dono))];
  const { data: validos } = donos.length ? await sb.from("perfis").select("id").in("id", donos).eq("ativo", true).neq("papel", "obras") : { data: [] as any[] };
  const ok = new Set((validos || []).map((p: any) => p.id));
  const desejadas = out.filter((x) => ok.has(x.dono));
  const manter = new Set(desejadas.map((x) => `${x.dono}|${x.t.id}`));

  const pessoas = new Set<string>();
  const { data: existentes } = await sb.from("planner_tasks").select("id, user_id").like("id", `${prefixo}%`);
  for (const e of existentes || []) {
    if (manter.has(`${e.user_id}|${e.id}`)) continue;
    await apagar(e.user_id, e.id);
    pessoas.add(e.user_id);
  }
  const agora = Date.now();
  for (const { dono, t } of desejadas) {
    const d = new DadosPlanner(dono);
    const atual = await d.tarefa(t.id);
    const desc = `${t.desc}\n\nNa Central (${link.rotulo}): ${SITE}${link.href}`;
    if (atual && atual.title === t.title && atual.start === t.start && atual.desc === desc) continue;
    await d.gravarTarefa({ subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1, ...(atual || {}), ...t, desc,
      cat: "CR", rec: { type: "none" }, time: "", link, createdAt: atual?.createdAt || agora, updatedAt: agora });
    pessoas.add(dono);
  }
  if (pessoas.size) {
    const { data: perfis } = await sb.from("perfis").select("id, email").in("id", [...pessoas]);
    after(async () => { for (const p of perfis || []) await sincronizar(p.id, "edit", p.email).catch(() => {}); });
  }
}

/** Passada geral (agendador do planner): obras com condição de pagamento. */
export async function refletirTodasAsObras() {
  const sb = supabaseServico();
  const { data } = await sb.from("obra_obras").select("codigo").neq("pagamentos", "[]");
  const { data: soltas } = await sb.from("planner_tasks").select("id").like("id", "obra-%");
  const codigos = new Set((data || []).map((r: any) => r.codigo));
  for (const t of soltas || []) {
    const m = /^obra-(.+)-[^-]+$/.exec(t.id);
    if (m) codigos.add(m[1]);
  }
  for (const c of codigos) await refletirObraNoPlanner(c).catch(() => {});
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
