"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

/** "Atualizar agora" (só administrador): o banco chama a função pelo pg_net e confere a permissão. */
export async function atualizarAgora(recurso: string): Promise<{ ok?: string; erro?: string }> {
  const p = await perfilAtual();
  if (p?.papel !== "admin") return { erro: "Só o administrador." };
  const sb = await supabaseUsuario();
  const { data, error } = await sb.rpc("admin_disparar_sincronizacao", { p_recurso: recurso });
  if (error) return { erro: error.message };
  revalidatePath("/sistema");
  return { ok: data === "rodando" ? "Já tem uma rodada em andamento." : "Pedido enviado. A rodada leva de 1 a 2 minutos; recarregue a página para ver." };
}
