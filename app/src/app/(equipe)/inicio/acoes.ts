"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS } from "@/lib/areas";
import { AREAS_OBRAS } from "@/lib/areas-obras";
import type { OrdemTela } from "@/lib/ordem";

/** Salva a ordem dos cards da própria pessoa. lugar = "areas" (Início), o id da área (módulos),
 *  "central-obras" (Início de Obras) ou "obras-<área>" (módulos de uma área de Obras). */
export async function salvarOrdem(lugar: string, chaves: string[]): Promise<{ erro?: string }> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Faça login de novo." };
  const valido = lugar === "areas" || lugar === "central-obras" || AREAS.some((a) => a.id === lugar)
    || AREAS_OBRAS.some((a) => `obras-${a.id}` === lugar);
  if (!valido) return { erro: "Lugar inválido." };
  const limpas = chaves.filter((c) => typeof c === "string" && c.length < 200).slice(0, 50);

  const sb = await supabaseUsuario();
  const { data } = await sb.from("tela_ordem").select("ordem").eq("perfil_id", perfil.id).maybeSingle();
  const ordem: OrdemTela = (data?.ordem as OrdemTela) ?? {};
  if (lugar === "areas") ordem.areas = limpas;
  else if (lugar === "central-obras") ordem.obras = limpas;
  else ordem.modulos = { ...(ordem.modulos ?? {}), [lugar]: limpas };

  const { error } = await sb.from("tela_ordem")
    .upsert({ perfil_id: perfil.id, ordem, alterado_em: new Date().toISOString() }, { onConflict: "perfil_id" });
  if (error) return { erro: "Não foi possível salvar a ordem." };
  revalidatePath(lugar === "areas" ? "/inicio" : lugar === "central-obras" ? "/obras"
    : lugar.startsWith("obras-") ? `/obras/${lugar.slice(6)}` : `/area/${lugar}`);
  return {};
}

/** Volta à ordem de fábrica. */
export async function ordemPadrao(lugar: string) {
  return salvarOrdem(lugar, []);
}
