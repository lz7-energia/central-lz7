import { NextResponse } from "next/server";
import { negado, pessoaColab, tokenDaSessao } from "@/lib/colaboradores";

export const dynamic = "force-dynamic";

/** Token novo para o navegador quando o atual está para vencer (a sessão é renovada pelo site, não pela página). */
export async function GET() {
  if (!(await pessoaColab())) return negado();
  const t = await tokenDaSessao();
  if (!t) return negado();
  return NextResponse.json(t, { headers: { "Cache-Control": "no-store" } });
}
