import { NextResponse, type NextRequest } from "next/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";

/** Abre um anexo: confere o dono e redireciona para um link temporário (5 min). */
export async function GET(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const path = req.nextUrl.searchParams.get("p") || "";
  if (!path.startsWith(p.id + "/")) return NextResponse.json({ erro: "Anexo inválido." }, { status: 404 });
  const { data } = await new DadosPlanner(p.id).sb.storage.from("planner-anexos").createSignedUrl(path, 300);
  if (!data?.signedUrl) return NextResponse.json({ erro: "Anexo não encontrado." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
