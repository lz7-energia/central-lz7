import { NextResponse } from "next/server";
import { negado, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaConc } from "@/lib/conciliacao";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await pessoaConc())) return negado();
  const t = await tokenDaSessao();
  if (!t) return negado();
  return NextResponse.json(t, { headers: { "Cache-Control": "no-store" } });
}
