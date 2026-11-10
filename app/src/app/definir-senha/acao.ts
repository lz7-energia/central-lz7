"use server";

import { redirect } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";

export async function definirSenha(_: { erro: string }, form: FormData) {
  const senha = String(form.get("senha") || "");
  if (senha.length < 10) return { erro: "A senha precisa ter pelo menos 10 caracteres." };
  if (senha !== form.get("confirma")) return { erro: "As duas senhas não são iguais." };
  const sb = await supabaseUsuario();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { erro: "O link expirou. Peça um novo em “Esqueci a senha”." };
  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) return { erro: "Não foi possível salvar a senha. Tente outra." };
  redirect("/pedidos");
}
