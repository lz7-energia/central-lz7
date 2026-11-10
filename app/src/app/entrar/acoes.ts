"use server";

import { redirect } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { urlSite } from "@/lib/email";

export type EstadoLogin = { erro?: string; aviso?: string; email?: string };

function destinoSeguro(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/pedidos";
}

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const senha = String(form.get("senha") || "");
  if (!email || !senha) return { erro: "Preencha e-mail e senha.", email };

  const sb = await supabaseUsuario();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error || !data.user) return { erro: "E-mail ou senha incorretos.", email };

  const { data: perfil } = await sb.from("perfis").select("ativo").eq("id", data.user.id).maybeSingle();
  if (!perfil?.ativo) {
    await sb.auth.signOut();
    return { erro: "Este acesso não está liberado na central. Fale com o administrador.", email };
  }
  redirect(destinoSeguro(form.get("volta")));
}

export async function esqueciSenha(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email) return { erro: "Digite seu e-mail no campo acima." };
  const sb = await supabaseUsuario();
  await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${urlSite()}/auth/confirmar?next=/definir-senha`,
  });
  // Resposta igual exista ou não o e-mail, pra não revelar quem tem conta.
  return { email, aviso: "Se este e-mail tiver acesso, você vai receber um link para criar uma nova senha." };
}

export async function sair() {
  const sb = await supabaseUsuario();
  await sb.auth.signOut();
  redirect("/entrar");
}
