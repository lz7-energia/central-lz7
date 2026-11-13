import type { NextRequest } from "next/server";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";
import { marcarLidos, recusar } from "@/lib/planner/equipe";

export const dynamic = "force-dynamic";

/** { acao: "recusar", id, motivo } — recusa uma tarefa/call recebida; { acao: "lidos", ids? } — marca avisos como lidos. */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  if (b.acao === "recusar") return ok(await recusar(p, String(b.id || ""), String(b.motivo || "")));
  if (b.acao === "lidos") { await marcarLidos(p.id, Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : undefined); return ok(); }
  return ok({ erro: "Ação desconhecida." });
}
