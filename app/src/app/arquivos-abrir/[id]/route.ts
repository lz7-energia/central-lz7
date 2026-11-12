import { NextResponse, type NextRequest } from "next/server";
import { supabaseUsuario } from "@/lib/supabase/server";
import { supabaseServico } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";

/** Abre um documento: o banco confere a permissão (RLS) e o site redireciona para um link temporário de 5 minutos. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const { data: doc } = await sb.from("arq_documentos").select("arquivo_path, arquivo_nome").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ erro: "Documento não encontrado ou sem permissão." }, { status: 404 });
  const baixar = req.nextUrl.searchParams.get("baixar") === "1";
  const { data } = await supabaseServico().storage.from("arquivos-empresa")
    .createSignedUrl(doc.arquivo_path, 300, baixar ? { download: doc.arquivo_nome } : undefined);
  if (!data?.signedUrl) return NextResponse.json({ erro: "Arquivo não encontrado." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
