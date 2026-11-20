import "server-only";
// Frota → planner do responsável pelo carro: renovar documento, revisão por data e multa pendente com vencimento.
// Ids "frota-<carro8>-<d|r|m>-<registro8>": refaz o conjunto do carro a cada mudança (o que sumiu sai do planner e do ClickUp).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";
import { sincronizar } from "@/lib/planner/sync";
import { placaBonita } from "@/lib/frota";

const curto = (id: string) => id.replace(/-/g, "").slice(0, 8);
const br = (d: string) => d.split("-").reverse().join("/");

export async function refletirVeiculoNoPlanner(veiculoId: string, responsavelAntigo?: string | null) {
  const sb = supabaseServico();
  const [{ data: v }, { data: docs }, { data: multas }] = await Promise.all([
    sb.from("frota_veiculos").select("id, placa, modelo, responsavel_id, revisao_data, ativo").eq("id", veiculoId).maybeSingle(),
    sb.from("frota_documentos").select("id, tipo, descricao, vencimento, aviso_dias").eq("veiculo_id", veiculoId),
    sb.from("frota_multas").select("id, descricao, valor, vencimento, situacao").eq("veiculo_id", veiculoId),
  ]);
  const prefixo = `frota-${curto(veiculoId)}-`;
  const carro = v ? `${placaBonita(v.placa)}${v.modelo ? " · " + v.modelo : ""}` : "";
  const link = { href: `/frota/${veiculoId}`, rotulo: `Frota · ${carro}` };
  const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";

  const desejadas: any[] = [];
  if (v?.ativo && v.responsavel_id) {
    for (const d of docs || []) {
      if (!d.vencimento) continue;
      desejadas.push({ id: `${prefixo}d-${curto(d.id)}`, title: `Renovar ${d.tipo}: ${carro}`, start: d.vencimento, urgentDays: d.aviso_dias,
        important: true, desc: `${d.tipo}${d.descricao ? " (" + d.descricao + ")" : ""} vence em ${br(d.vencimento)}.` });
    }
    if (v.revisao_data) desejadas.push({ id: `${prefixo}r-0`, title: `Revisão: ${carro}`, start: v.revisao_data, urgentDays: 15, important: true, desc: "Revisão marcada na Frota." });
    for (const m of multas || []) {
      if (m.situacao !== "pendente" || !m.vencimento) continue;
      desejadas.push({ id: `${prefixo}m-${curto(m.id)}`, title: `Multa: ${carro}`, start: m.vencimento, urgentDays: 10, important: true,
        desc: `${m.descricao || "Multa"}${m.valor ? " · R$ " + Number(m.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}. Ver se recorre, paga ou indica o condutor.` });
    }
  }

  const pessoas = new Set<string>();
  // tira do responsável antigo tudo deste carro
  if (responsavelAntigo && responsavelAntigo !== v?.responsavel_id) { await limpar(responsavelAntigo, prefixo, new Set()); pessoas.add(responsavelAntigo); }
  if (v?.responsavel_id) {
    const d = new DadosPlanner(v.responsavel_id);
    const ids = new Set(desejadas.map((t) => t.id));
    if (await limpar(v.responsavel_id, prefixo, ids)) pessoas.add(v.responsavel_id);
    const agora = Date.now();
    for (const t of desejadas) {
      const atual = await d.tarefa(t.id);
      const desc = `${t.desc}\n\nNa Central (${link.rotulo}): ${SITE}${link.href}`;
      if (atual && atual.title === t.title && atual.start === t.start && atual.desc === desc && atual.urgentDays === t.urgentDays) continue;
      await d.gravarTarefa({ subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1, ...(atual || {}), ...t, desc,
        cat: "FIS", rec: { type: "none" }, time: "", link, createdAt: atual?.createdAt || agora, updatedAt: agora });
      pessoas.add(v.responsavel_id);
    }
  }
  if (pessoas.size) {
    const { data: perfis } = await sb.from("perfis").select("id, email").in("id", [...pessoas]);
    after(async () => { for (const p of perfis || []) await sincronizar(p.id, "edit", p.email).catch(() => {}); });
  }
}

/** Apaga do planner da pessoa as tarefas do carro que não estão em `manter`. Devolve se apagou alguma. */
async function limpar(userId: string, prefixo: string, manter: Set<string>) {
  const d = new DadosPlanner(userId);
  const { data } = await d.sb.from("planner_tasks").select("id").eq("user_id", userId).like("id", `${prefixo}%`);
  let mexeu = false;
  for (const { id } of data || []) {
    if (manter.has(id)) continue;
    const t = await d.tarefa(id);
    const sync = await d.sync();
    if (t?.clickupId && sync.enabled && !(sync.noPush || []).includes(t.clickupId)) {
      await d.mudarSync((s: any) => ({ ...s, deleted: [...new Set([...(s.deleted || []), t.clickupId])],
        pendingDeletes: [...new Set([...(s.pendingDeletes || []), t.clickupId])] }));
    }
    await d.apagarTarefa(id);
    mexeu = true;
  }
  return mexeu;
}
