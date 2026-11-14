import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { BUCKET_COLAB, ID_ANEXO, negado, pessoaColab } from "@/lib/colaboradores";
import { supabaseServico } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";
const LIMITE = 25 * 1024 * 1024;

/** Prepara o envio de um anexo (recibo, NF, holerite, TRCT): devolve o assetId e um link de envio direto ao bucket.
 *  { id } só para o administrador, na importação (mantém o assetId antigo para os links da folha continuarem valendo). */
export async function POST(req: NextRequest) {
  const p = await pessoaColab();
  if (!p) return negado();
  const b = await req.json().catch(() => ({}));
  if (!(Number(b.tamanho) > 0) || Number(b.tamanho) > LIMITE) return NextResponse.json({ erro: "Arquivo vazio ou maior que 25 MB." }, { status: 400 });
  let id = randomBytes(16).toString("hex");
  if (b.id) {
    if (p.papel !== "admin" || !ID_ANEXO.test(String(b.id))) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    id = String(b.id);
  }
  const { data, error } = await supabaseServico().storage.from(BUCKET_COLAB).createSignedUploadUrl(id, { upsert: !!b.id });
  if (error || !data) return NextResponse.json({ erro: `Não foi possível preparar o envio${error?.message ? ` (${error.message})` : ""}.` }, { status: 500 });
  return NextResponse.json({ id, url: data.signedUrl });
}

export async function DELETE(req: NextRequest) {
  if (!(await pessoaColab())) return negado();
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!ID_ANEXO.test(id)) return NextResponse.json({ erro: "Anexo inválido." }, { status: 400 });
  await supabaseServico().storage.from(BUCKET_COLAB).remove([id]);
  return NextResponse.json({ ok: true });
}
