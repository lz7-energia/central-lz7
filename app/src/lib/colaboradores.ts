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
  if (!s?.access_token) return null;
  const exp = s.expires_at ?? Number(JSON.parse(Buffer.from(s.access_token.split(".")[1] || "", "base64url").toString() || "{}").exp || 0);
  return { token: s.access_token, exp };
}

/** Página simples de aviso (sem redirecionar para "Entrar": a tela de login devolve quem já está logado e daria laço). */
export function paginaAviso(titulo: string, texto: string, status = 401) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new NextResponse(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f5f2;color:#14201a;display:grid;place-items:center;min-height:100vh;margin:0}
.c{background:#fff;border:1px solid #d8e2db;border-radius:12px;padding:28px;max-width:440px}a{color:#124735;font-weight:600}</style></head>
<body><div class="c"><h1 style="font-size:1.3rem;margin-top:0">${esc(titulo)}</h1><p>${esc(texto)}</p><p><a href="/inicio">Ir para a Central</a> · <a href="/entrar">Entrar de novo</a></p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const BUCKET_COLAB = "colab-anexos";
export const ID_ANEXO = /^[A-Za-z0-9_-]{6,80}$/;
