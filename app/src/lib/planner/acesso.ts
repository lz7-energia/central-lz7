import "server-only";
import { NextResponse } from "next/server";
import { perfilAtual } from "@/lib/supabase/server";

/** Quem está usando o planner (equipe ou admin, ativo). Diretoria não tem planner. */
export async function pessoa() {
  const p = await perfilAtual();
  if (!p || !p.ativo || (p.papel !== "equipe" && p.papel !== "admin")) return null;
  return p;
}
export const naoAutorizado = () => NextResponse.json({ erro: "Faça login de novo." }, { status: 401 });
export const ok = (dados: unknown = { ok: true }) => NextResponse.json(dados, { headers: { "Cache-Control": "no-store" } });
