import { NextResponse } from "next/server";
import { supabaseUsuario } from "@/lib/supabase/server";
import { BUCKET_CONTRATOS, CODIGO_OBRA_OK, pessoaObras } from "@/lib/obras";

export const dynamic = "force-dynamic";

/** Abre o contrato da obra: o banco confere quem pode ver e o site redireciona para um link de 5 minutos. */
export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!(await pessoaObras())) return NextResponse.redirect(new URL("/entrar", req.url));
  if (!CODIGO_OBRA_OK.test(codigo)) return new NextResponse("Obra inválida.", { status: 400 });
  const sb = await supabaseUsuario();
  const { data: o } = await sb.from("obra_obras").select("contrato_path").eq("codigo", codigo).maybeSingle();
  if (!o?.contrato_path) return new NextResponse("Esta obra não tem contrato anexado.", { status: 404 });
  const { data } = await sb.storage.from(BUCKET_CONTRATOS).createSignedUrl(o.contrato_path, 300);
  if (!data?.signedUrl) return new NextResponse("Não foi possível abrir o contrato.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
