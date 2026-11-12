import "server-only";
// Documento com validade → tarefa de renovação no planner do responsável (e, pela sincronização do planner, no ClickUp).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";
import { sincronizar } from "@/lib/planner/sync";

const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";
const br = (d: string) => d.split("-").reverse().join("/");

/** Cria, atualiza ou tira a tarefa "Renovar …" do planner, conforme a validade e o responsável do documento. */
export async function refletirNoPlanner(docId: string, responsavelAntigo?: string | null) {
  const sb = supabaseServico();
  const { data: doc } = await sb.from("arq_documentos")
    .select("id, titulo, validade, aviso_dias, responsavel_id, unidade_id, tipo_id, arq_unidades(nome, unica, empresa_id, arq_empresas(nome)), arq_tipos(nome)")
    .eq("id", docId).maybeSingle();
  const id = "doc-" + docId;
  const quem = new Set<string>();
  if (responsavelAntigo && responsavelAntigo !== doc?.responsavel_id) { await tirar(responsavelAntigo, id); quem.add(responsavelAntigo); }
  if (!doc || !doc.validade || !doc.responsavel_id || !doc.unidade_id) {
    if (doc?.responsavel_id) { await tirar(doc.responsavel_id, id); quem.add(doc.responsavel_id); }
  } else {
    const u: any = doc.arq_unidades, tipo = (doc.arq_tipos as any)?.nome || "documento";
    const onde = u?.unica ? u?.arq_empresas?.nome : `${u?.arq_empresas?.nome} ${u?.nome}`;
    const d = new DadosPlanner(doc.responsavel_id);
    const atual = await d.tarefa(id);
    const agora = Date.now();
    await d.gravarTarefa({
      subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1,
      ...(atual || {}),
      id, title: `Renovar: ${doc.titulo} — ${onde}`,
      desc: `${tipo} vence em ${br(doc.validade)}.\nDocumento na Central: ${SITE}/arquivos/${u?.empresa_id}?u=${doc.unidade_id}`,
      cat: "FIS", rec: { type: "none" }, start: doc.validade, time: "", important: true, urgentDays: doc.aviso_dias,
      createdAt: atual?.createdAt || agora, updatedAt: agora,
    });
    quem.add(doc.responsavel_id);
  }
  // Leva a mudança ao ClickUp logo depois da resposta.
  if (quem.size) {
    const { data: perfis } = await sb.from("perfis").select("id, email").in("id", [...quem]);
    after(async () => { for (const p of perfis || []) await sincronizar(p.id, "edit", p.email).catch(() => {}); });
  }
}

async function tirar(userId: string, id: string) {
  const d = new DadosPlanner(userId);
  const t = await d.tarefa(id);
  if (!t) return;
  const sync = await d.sync();
  if (t.clickupId && sync.enabled && !(sync.noPush || []).includes(t.clickupId)) {
    await d.mudarSync((s: any) => ({ ...s, deleted: [...new Set([...(s.deleted || []), t.clickupId])],
      pendingDeletes: [...new Set([...(s.pendingDeletes || []), t.clickupId])] }));
  }
  await d.apagarTarefa(id);
}
