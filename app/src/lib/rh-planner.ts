import "server-only";
// Recrutamento → planner: entrevista marcada vira tarefa da recrutadora (com hora); indicação aprovada lembra o bônus em 3 meses.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { after } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";
import { sincronizar } from "@/lib/planner/sync";
import { dataDoBonus } from "@/lib/rh";

const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";
const fuso = (iso: string) => {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  return { data: f({ year: "numeric", month: "2-digit", day: "2-digit" }), hora: f({ hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24/, "00") };
};

async function gravar(userId: string, id: string, campos: any | null) {
  const d = new DadosPlanner(userId);
  const atual = await d.tarefa(id);
  if (!campos) {
    if (!atual) return;
    const sync = await d.sync();
    if (atual.clickupId && sync.enabled && !(sync.noPush || []).includes(atual.clickupId)) {
      await d.mudarSync((s: any) => ({ ...s, deleted: [...new Set([...(s.deleted || []), atual.clickupId])],
        pendingDeletes: [...new Set([...(s.pendingDeletes || []), atual.clickupId])] }));
    }
    await d.apagarTarefa(id);
    return;
  }
  const agora = Date.now();
  await d.gravarTarefa({ subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1, ...(atual || {}), ...campos,
    id, cat: "RH", rec: { type: "none" }, createdAt: atual?.createdAt || agora, updatedAt: agora });
}

/** Atualiza as tarefas do planner ligadas a um candidato (entrevista e bônus de indicação). */
export async function refletirCandidatoNoPlanner(candidatoId: number, recrutadorAntigo?: string | null) {
  const sb = supabaseServico();
  const { data: c } = await sb.from("rh_candidatos")
    .select("id, nome, whatsapp, etapa, entrevista_em, recrutador_id, criado_por, contratado_em, bonus_pago_em, indicado_por, canal_id, rh_vagas(cargo, area, local), rh_canais(eh_indicacao)")
    .eq("id", candidatoId).maybeSingle();
  const pessoas = new Set<string>();
  const idEnt = `rh-ent-${candidatoId}`, idBonus = `rh-bonus-${candidatoId}`;
  if (recrutadorAntigo && recrutadorAntigo !== c?.recrutador_id) { await gravar(recrutadorAntigo, idEnt, null); pessoas.add(recrutadorAntigo); }
  const v: any = c?.rh_vagas;
  const vaga = v ? `${v.cargo} · ${v.area}${v.local ? " " + v.local : ""}` : "vaga";
  if (c?.recrutador_id) {
    pessoas.add(c.recrutador_id);
    const vale = c.entrevista_em && ["inscrito", "triagem", "gestor"].includes(c.etapa);
    if (vale) {
      const { data, hora } = fuso(c.entrevista_em!);
      await gravar(c.recrutador_id, idEnt, {
        title: `Entrevista: ${c.nome} — ${vaga}`, start: data, time: hora, important: true, urgentDays: 1,
        desc: `${c.whatsapp ? "WhatsApp: " + c.whatsapp + "\n" : ""}Ficha na Central: ${SITE}/rh/candidatos/${c.id}`,
      });
    } else await gravar(c.recrutador_id, idEnt, null);
  }
  // Bônus de indicação: 3 meses depois da contratação, para quem cadastrou o candidato (ou quem marcou a entrevista).
  const dono = c?.recrutador_id || c?.criado_por;
  if (dono) {
    pessoas.add(dono);
    const bonus = (c?.rh_canais as any)?.eh_indicacao && c?.etapa === "aprovado" && c?.contratado_em && !c?.bonus_pago_em ? dataDoBonus(c.contratado_em) : null;
    await gravar(dono, idBonus, bonus ? {
      title: `Bônus de indicação: ${c!.indicado_por || "quem indicou"} (indicou ${c!.nome})`, start: bonus, time: "", important: true, urgentDays: 7,
      desc: `${c!.nome} completa 3 meses em ${bonus.split("-").reverse().join("/")}. Se continuar na empresa, ${c!.indicado_por || "quem indicou"} ganha o bônus.\n${SITE}/rh/candidatos/${c!.id}`,
    } : null);
  }
  if (pessoas.size) {
    const { data: perfis } = await sb.from("perfis").select("id, email").in("id", [...pessoas]);
    after(async () => { for (const p of perfis || []) await sincronizar(p.id, "edit", p.email).catch(() => {}); });
  }
}
