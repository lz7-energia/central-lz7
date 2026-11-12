import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";

/** Tudo do planner da pessoa: tasks, events, settings, sync (sem o token) e o status da última sincronização. */
export async function GET() {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const e = await new DadosPlanner(p.id).estado();
  return ok({ ...e, pessoa: { nome: p.nome }, clickupConfigurado: !!process.env.CLICKUP_API_TOKEN });
}
