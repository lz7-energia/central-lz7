import "server-only";
import { NextResponse } from "next/server";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

/** Plataforma de colaboradores (cadastro, folha, recibos): só a equipe da Central e o administrador. Diretoria não vê. */
export async function pessoaColab() {
  const p = await perfilAtual();
  if (!p || !p.ativo || (p.papel !== "equipe" && p.papel !== "admin")) return null;
  return p;
}
export const negado = () => NextResponse.json({ erro: "Sem permissão. Faça login de novo." }, { status: 401 });

/** Token de acesso da sessão (o mesmo do login do site), para o navegador falar com o banco sujeito ao RLS. */
export async function tokenDaSessao() {
  const sb = await supabaseUsuario();
  const { data } = await sb.auth.getSession();
  const s = data.session;
  return s ? { token: s.access_token, exp: s.expires_at ?? 0 } : null;
}

export const BUCKET_COLAB = "colab-anexos";
export const ID_ANEXO = /^[A-Za-z0-9_-]{6,80}$/;
