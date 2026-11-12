"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

export type Resultado = { erro?: string; ok?: string };

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function salvarDados(_: Resultado, form: FormData): Promise<Resultado> {
  const sb = await supabaseUsuario();
  const { error } = await sb.rpc("atualizar_meu_perfil", {
    p_nome: String(form.get("nome") || ""),
    p_cargo: String(form.get("cargo") || ""),
    p_telefone: String(form.get("telefone") || ""),
  });
  if (error) return { erro: error.message.includes("nome") ? "Informe o nome." : "Não foi possível salvar. Tente de novo." };
  revalidatePath("/", "layout");
  return { ok: "Dados salvos." };
}

export async function trocarFoto(_: Resultado, form: FormData): Promise<Resultado> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Faça login de novo." };
  const arquivo = form.get("foto");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha uma foto." };
  const ext = TIPOS[arquivo.type];
  if (!ext) return { erro: "Use uma foto JPG, PNG ou WEBP." };
  if (arquivo.size > 3 * 1024 * 1024) return { erro: "A foto passa de 3 MB." };

  const sb = await supabaseUsuario();
  // Nome novo a cada troca: o navegador não mostra a foto antiga guardada.
  const caminho = `${perfil.id}/foto-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("fotos-perfil").upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) return { erro: "Não foi possível enviar a foto. Tente de novo." };
  const { error: e2 } = await sb.rpc("trocar_minha_foto", { p_caminho: caminho });
  if (e2) return { erro: "Não foi possível salvar a foto. Tente de novo." };
  if (perfil.foto_caminho) await sb.storage.from("fotos-perfil").remove([perfil.foto_caminho]);
  revalidatePath("/", "layout");
  return { ok: "Foto atualizada." };
}

export async function tirarFoto(): Promise<Resultado> {
  const perfil = await perfilAtual();
  if (!perfil?.foto_caminho) return {};
  const sb = await supabaseUsuario();
  const { error } = await sb.rpc("trocar_minha_foto", { p_caminho: null });
  if (error) return { erro: "Não foi possível tirar a foto." };
  await sb.storage.from("fotos-perfil").remove([perfil.foto_caminho]);
  revalidatePath("/", "layout");
  return { ok: "Foto removida." };
}

export async function trocarSenha(_: Resultado, form: FormData): Promise<Resultado> {
  const senha = String(form.get("senha") || "");
  const confirma = String(form.get("confirma") || "");
  if (senha.length < 10) return { erro: "Use pelo menos 10 caracteres." };
  if (senha !== confirma) return { erro: "As senhas não são iguais." };
  const sb = await supabaseUsuario();
  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) return { erro: error.message.includes("different") ? "Escolha uma senha diferente da atual." : "Não foi possível trocar a senha." };
  return { ok: "Senha trocada. Use a nova no próximo login." };
}
