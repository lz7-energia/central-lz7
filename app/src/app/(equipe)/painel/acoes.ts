"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

// Ajustes manuais do painel. Ficam só na central (tabela painel_ajustes): a sincronização com o Flow não mexe neles.
type Ajuste = { oculto?: boolean; oculto_motivo?: string | null; nota_manual?: boolean; nota_numero?: string | null };

async function salvar(flowId: string, ajuste: Ajuste) {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  if (!flowId) return { erro: "Card inválido." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("painel_ajustes").upsert({ pedido_flow_id: flowId, ...ajuste }, { onConflict: "pedido_flow_id" });
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
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
