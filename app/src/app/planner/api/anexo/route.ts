import type { NextRequest } from "next/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";
const LIMITE = 20 * 1048576;

/** Prepara o envio de um anexo: o navegador manda o arquivo direto para o armazenamento da Central (sem passar pelo servidor). */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  const nome = String(b.name || "arquivo").replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);
  if (Number(b.size) > LIMITE) return ok({ erro: "Maior que 20 MB." });
  const id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const path = `${p.id}/${id}-${nome}`;
  const { data, error } = await new DadosPlanner(p.id).sb.storage.from("planner-anexos").createSignedUploadUrl(path);
  if (error || !data) return ok({ erro: "Não foi possível preparar o envio." });
  return ok({ id, path, token: data.token, signedUrl: data.signedUrl });
}

export async function DELETE(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const path = req.nextUrl.searchParams.get("path") || "";
  if (!path.startsWith(p.id + "/")) return ok({ erro: "Anexo inválido." });
  await new DadosPlanner(p.id).sb.storage.from("planner-anexos").remove([path]);
  return ok();
}
