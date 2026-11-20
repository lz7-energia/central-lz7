import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { supabaseUsuario } from "@/lib/supabase/server";
import { BUCKET_CONTRATOS, pessoaObras } from "@/lib/obras";
import { lerTextoContrato } from "@/lib/obras-contrato";

export const dynamic = "force-dynamic";
const ok = (x: unknown, status = 200) => NextResponse.json(x, { status, headers: { "Cache-Control": "no-store" } });
const nomeLimpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "contrato.pdf";

/** Contrato da obra: link para enviar o PDF direto ao armazenamento (acao "url") e leitura dos dados (acao "ler"). */
export async function POST(req: Request) {
  const p = await pessoaObras();
  if (!p) return ok({ erro: "Faça login de novo." }, 401);
  if (!p.podeEditar) return ok({ erro: "Seu perfil só pode consultar o cronograma." }, 403);
  const b = await req.json().catch(() => null);
  const sb = await supabaseUsuario();

  if (b?.acao === "url") {
    const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${nomeLimpo(String(b.nome || "contrato.pdf"))}`;
    const { data, error } = await sb.storage.from(BUCKET_CONTRATOS).createSignedUploadUrl(path);
    if (error || !data) return ok({ erro: "Não foi possível preparar o envio do PDF." }, 500);
    return ok({ path: data.path, token: data.token });
  }
  if (b?.acao === "ler" && typeof b.path === "string" && /^\d{4}-\d{2}\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/.test(b.path)) {
    const { data, error } = await sb.storage.from(BUCKET_CONTRATOS).download(b.path);
    if (error || !data) return ok({ erro: "Não encontrei o PDF enviado." }, 404);
    let texto = "";
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
      texto = String((await extractText(pdf, { mergePages: true })).text || "");
    } catch { texto = ""; }
    return ok({ dados: lerTextoContrato(texto, String(b.nome || "")) });
  }
  return ok({ erro: "Pedido inválido." }, 400);
}
