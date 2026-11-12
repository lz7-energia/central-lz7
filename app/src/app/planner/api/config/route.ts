import type { NextRequest } from "next/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { mergeSettings } from "@/lib/planner/regras";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";

/** Salva config/settings. */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const s = mergeSettings(await req.json().catch(() => ({})));
  const { error } = await new DadosPlanner(p.id).sb.from("planner_settings")
    .upsert({ user_id: p.id, data: s, atualizado_em: new Date().toISOString() });
  return ok(error ? { erro: "Não foi possível salvar as configurações." } : { settings: s });
}
