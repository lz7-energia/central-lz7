import { NextResponse } from "next/server";
import { supabaseUsuario } from "@/lib/supabase/server";
import { supabaseServico } from "@/lib/supabase/servico";

export const dynamic = "force-dynamic";

/** Abre o currículo: o banco confere a permissão (RLS: só a equipe) e o site redireciona para um link de 5 minutos. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("curriculo_path").eq("id", id).maybeSingle();
  if (!c?.curriculo_path) return NextResponse.json({ erro: "Currículo não encontrado ou sem permissão." }, { status: 404 });
  const { data } = await supabaseServico().storage.from("rh-curriculos").createSignedUrl(c.curriculo_path, 300);
  if (!data?.signedUrl) return NextResponse.json({ erro: "Arquivo não encontrado." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
