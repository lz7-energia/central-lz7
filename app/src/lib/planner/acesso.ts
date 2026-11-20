import "server-only";
import { NextResponse } from "next/server";
import { perfilAtual } from "@/lib/supabase/server";

/** Quem está usando o planner: qualquer perfil ativo (as duas centrais). */
export async function pessoa() {
  const p = await perfilAtual();
  if (!p || !p.ativo || !["equipe", "admin", "diretoria", "obras"].includes(p.papel)) return null;
  return p;
}
export const naoAutorizado = () => NextResponse.json({ erro: "Faça login de novo." }, { status: 401 });
export const ok = (dados: unknown = { ok: true }) => NextResponse.json(dados, { headers: { "Cache-Control": "no-store" } });
