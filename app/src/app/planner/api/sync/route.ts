import type { NextRequest } from "next/server";
import { sincronizar, type Porque } from "@/lib/planner/sync";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const PERMITIDOS: Porque[] = ["edit", "manual", "send", "load", "focus", "timer"];

/** Sincroniza o planner de quem está logado (o navegador chama logo depois de cada edição e no botão do topo). */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const porque: Porque = PERMITIDOS.includes(b.why) ? b.why : "edit";
  return ok(await sincronizar(p.id, porque, p.email));
}
