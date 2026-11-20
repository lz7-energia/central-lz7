"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS } from "@/lib/areas";
import type { OrdemTela } from "@/lib/ordem";

/** Salva a ordem dos cards da própria pessoa. lugar = "areas" (Início) ou o id da área (módulos). */
export async function salvarOrdem(lugar: string, chaves: string[]): Promise<{ erro?: string }> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Faça login de novo." };
  if (lugar !== "areas" && !AREAS.some((a) => a.id === lugar)) return { erro: "Lugar inválido." };
  const limpas = chaves.filter((c) => typeof c === "string" && c.length < 200).slice(0, 50);

  const sb = await supabaseUsuario();
  const { data } = await sb.from("tela_ordem").select("ordem").eq("perfil_id", perfil.id).maybeSingle();
  const ordem: OrdemTela = (data?.ordem as OrdemTela) ?? {};
  if (lugar === "areas") ordem.areas = limpas;
  else ordem.modulos = { ...(ordem.modulos ?? {}), [lugar]: limpas };

  const { error } = await sb.from("tela_ordem")
    .upsert({ perfil_id: perfil.id, ordem, alterado_em: new Date().toISOString() }, { onConflict: "perfil_id" });
  if (error) return { erro: "Não foi possível salvar a ordem." };
  revalidatePath(lugar === "areas" ? "/inicio" : `/area/${lugar}`);
  return {};
}

/** Volta à ordem de fábrica. */
export async function ordemPadrao(lugar: string) {
  return salvarOrdem(lugar, []);
}
