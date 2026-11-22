"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { refletirNotasDepois } from "@/lib/notas-planner";

// Ajustes manuais das Notas a emitir. Ficam só na central (painel_ajustes / notas_ocultas_obra / notas_config):
// a sincronização com o Flow não mexe neles. Depois de cada ajuste, as tarefas "Emitir nota" do planner são refeitas.
type Ajuste = { oculto?: boolean; oculto_motivo?: string | null; nota_manual?: boolean; nota_numero?: string | null };
type R = { erro?: string; ok?: boolean };

async function salvar(flowId: string, ajuste: Ajuste): Promise<R> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  if (!flowId) return { erro: "Card inválido." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("painel_ajustes").upsert({ pedido_flow_id: flowId, ...ajuste }, { onConflict: "pedido_flow_id" });
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  await refletirNotasDepois();
  revalidatePath("/painel");
  return { ok: true };
}

export async function ocultarCard(flowId: string) {
  return salvar(flowId, { oculto: true });
}

export async function mostrarCard(flowId: string) {
  return salvar(flowId, { oculto: false, oculto_motivo: null });
}

export async function marcarNota(flowId: string, numero: string) {
  const n = numero.trim().slice(0, 30) || null;
  return salvar(flowId, { nota_manual: true, nota_numero: n });
}

export async function desmarcarNota(flowId: string) {
  return salvar(flowId, { nota_manual: false, nota_numero: null });
}

/** Obra concluída no cronograma sem pedido no Flow: ocultar / mostrar de novo. */
export async function ocultarObra(codigo: string, ocultar: boolean): Promise<R> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { error } = ocultar
    ? await sb.from("notas_ocultas_obra").upsert({ codigo })
    : await sb.from("notas_ocultas_obra").delete().eq("codigo", codigo);
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  await refletirNotasDepois();
  revalidatePath("/painel");
  return { ok: true };
}

/** Quem recebe as tarefas "Emitir nota" no planner. */
export async function definirResponsavel(id: string | null): Promise<R> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("notas_config").update({ responsavel: id || null }).eq("id", true);
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  await refletirNotasDepois();
  revalidatePath("/painel");
  return { ok: true };
}
