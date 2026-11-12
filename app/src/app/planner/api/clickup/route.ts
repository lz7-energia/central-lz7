import type { NextRequest } from "next/server";
import { ClickUp, mensagemDeErro } from "@/lib/planner/clickup";
import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";

/** Membros do ClickUp, para a pessoa escolher o próprio usuário em Configurações. */
export async function GET() {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  try {
    const membros = await new ClickUp().membros();
    const sugerido = membros.find((m) => m.email?.toLowerCase() === p.email.toLowerCase())?.id ?? null;
    return ok({ membros, sugerido });
  } catch (e) {
    return ok({ erro: mensagemDeErro(e), membros: [] });
  }
}

/** Liga/desliga a sincronização e define o usuário do ClickUp. Ao ligar pela primeira vez, marca activatedAt. */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const d = new DadosPlanner(p.id);
  const sync = await d.mudarSync((s: Record<string, unknown>) => ({
    ...s,
    enabled: !!b.enabled,
    clickupUserId: b.clickupUserId ? Number(b.clickupUserId) : s.clickupUserId ?? null,
    activatedAt: b.enabled && !s.activatedAt ? Date.now() : s.activatedAt ?? null,
  }));
  return ok({ sync });
}
