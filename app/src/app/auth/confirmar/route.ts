import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseUsuario } from "@/lib/supabase/server";

// Links dos e-mails do Supabase (convite e troca de senha) caem aqui.
// Modelo do link no Supabase: {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const tokenHash = p.get("token_hash");
  const tipo = p.get("type") as EmailOtpType | null;
  const codigo = p.get("code");
  const prox = p.get("next") || "/pedidos";
  const destino = prox.startsWith("/") && !prox.startsWith("//") ? prox : "/pedidos";

  const sb = await supabaseUsuario();
  let ok = false;
  if (tokenHash && tipo) {
    ok = !(await sb.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;
  } else if (codigo) {
    ok = !(await sb.auth.exchangeCodeForSession(codigo)).error;
  }
  const url = request.nextUrl.clone();
  url.search = "";
  url.pathname = ok ? destino : "/entrar";
  return NextResponse.redirect(url);
}
