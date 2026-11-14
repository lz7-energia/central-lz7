import { NextResponse } from "next/server";
import { BUCKET_COLAB, ID_ANEXO, pessoaColab } from "@/lib/colaboradores";
import { supabaseServico } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";

/** /_blob/<assetId> (reescrito para cá): abre o anexo da folha depois de conferir que é alguém da equipe.
 *  Entrega o próprio arquivo (sem redirecionar), para a plataforma poder juntar os PDFs ao recibo no navegador. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await pessoaColab())) return new NextResponse("Sem permissão.", { status: 401 });
  if (!ID_ANEXO.test(id)) return new NextResponse("Anexo inválido.", { status: 400 });
  const { data, error } = await supabaseServico().storage.from(BUCKET_COLAB).download(id);
  if (error || !data) return new NextResponse("Anexo não encontrado.", { status: 404 });
  return new NextResponse(data.stream(), {
    headers: { "Content-Type": data.type || "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
  });
}
