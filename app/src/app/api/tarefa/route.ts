import type { NextRequest } from "next/server";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";
import { colegas } from "@/lib/planner/equipe";
import { criarTarefaLigada } from "@/lib/tarefa-ligada";

export const dynamic = "force-dynamic";

/** Equipe para o "Para quem" do botão Criar tarefa. */
export async function GET() {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const time = await colegas();
  return ok({ eu: p.id, equipe: time.map((c) => ({ id: c.id, nome: c.nome, principal: c.papel === "equipe" })) });
}

/** Cria a tarefa (de qualquer tela da Central) no planner. */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const e = await req.json().catch(() => null);
  if (!e || typeof e !== "object") return ok({ erro: "Dados inválidos." });
  return ok(await criarTarefaLigada(p, e));
}
