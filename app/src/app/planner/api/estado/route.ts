import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";
import { avisosNaoLidos, colegas, situacaoDasCopias } from "@/lib/planner/equipe";

export const dynamic = "force-dynamic";

/** Tudo do planner da pessoa: tasks, events, settings, sync (sem o token) e o status da última sincronização. */
export async function GET() {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const [e, time, avisos] = await Promise.all([new DadosPlanner(p.id).estado(), colegas(), avisosNaoLidos(p.id)]);
  const tasks = await situacaoDasCopias(e.tasks);
  return ok({ ...e, tasks, pessoa: { nome: p.nome, id: p.id }, clickupConfigurado: !!process.env.CLICKUP_API_TOKEN,
    equipe: time.filter((c) => c.id !== p.id).map((c) => ({ id: c.id, nome: c.nome })), avisos });
}
