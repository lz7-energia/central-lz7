"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { refletirNoPlanner } from "@/lib/arquivos-planner";
import { tituloDoArquivo } from "@/lib/arquivos";

export type Resultado = { erro?: string; ok?: string };
const BUCKET = "arquivos-empresa";
const LIMITE = 50 * 1048576;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function quem() {
  const p = await perfilAtual();
  return p && p.ativo && (p.papel === "equipe" || p.papel === "admin" || p.papel === "diretoria") ? p : null;
}

/** Prepara o envio: devolve um link de envio para cada arquivo (o navegador manda direto ao armazenamento). */
export async function prepararEnvio(arquivos: { nome: string; tamanho: number }[]) {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo.", links: [] };
  const sb = supabaseServico();
  const links: { nome: string; path: string; url: string }[] = [];
  for (const a of arquivos.slice(0, 50)) {
    if (a.tamanho > LIMITE) return { erro: `${a.nome}: maior que 50 MB.`, links: [] };
    const limpo = a.nome.replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${limpo}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { erro: "Não foi possível preparar o envio.", links: [] };
    links.push({ nome: a.nome, path, url: data.signedUrl });
  }
  return { links };
}

/** Registra os arquivos já enviados. Sem unidade = vão para "A classificar". */
export async function registrarDocumentos(
  enviados: { path: string; nome: string; tamanho: number; mime: string }[],
  comum: { unidade_id: string | null; tipo_id: string | null; validade: string | null; aviso_dias: number | null },
): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  if (comum.validade && !DATA.test(comum.validade)) return { erro: "Validade inválida." };
  const sb = await supabaseUsuario();
  const linhas = enviados.map((e) => ({
    unidade_id: comum.unidade_id || null, tipo_id: comum.tipo_id || null, titulo: tituloDoArquivo(e.nome).slice(0, 200),
    arquivo_path: e.path, arquivo_nome: e.nome.slice(0, 200), tamanho: e.tamanho, mime: e.mime || null,
    validade: comum.validade || null, aviso_dias: comum.aviso_dias ?? 30, enviado_por: p.id, responsavel_id: p.id,
  }));
  const { data, error } = await sb.from("arq_documentos").insert(linhas).select("id");
  if (error) {
    await supabaseServico().storage.from(BUCKET).remove(enviados.map((e) => e.path));
    return { erro: error.message.includes("row-level") ? "Esse tipo de documento é restrito ao administrador." : "Não foi possível salvar os documentos." };
  }
  if (comum.validade) for (const d of data || []) await refletirNoPlanner(d.id);
  revalidatePath("/arquivos", "layout");
  return { ok: `${linhas.length} documento(s) salvo(s).` };
}

export async function salvarDocumento(id: string, f: {
  titulo: string; unidade_id: string | null; tipo_id: string | null; validade: string | null; aviso_dias: number;
  observacao: string; responsavel_id: string | null; restrito?: boolean;
}): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  if (!f.titulo.trim()) return { erro: "Dê um nome ao documento." };
  if (f.validade && !DATA.test(f.validade)) return { erro: "Validade inválida." };
  const sb = await supabaseUsuario();
  const { data: antes } = await sb.from("arq_documentos").select("responsavel_id").eq("id", id).maybeSingle();
  if (!antes) return { erro: "Documento não encontrado." };
  const campos: Record<string, unknown> = {
    titulo: f.titulo.trim().slice(0, 200), unidade_id: f.unidade_id || null, tipo_id: f.tipo_id || null,
    validade: f.validade || null, aviso_dias: Math.max(0, Math.min(365, Math.round(f.aviso_dias || 30))),
    observacao: f.observacao.trim().slice(0, 1000) || null, responsavel_id: f.responsavel_id || null,
  };
  if (p.papel === "admin" && typeof f.restrito === "boolean") campos.restrito = f.restrito;
  const { error } = await sb.from("arq_documentos").update(campos).eq("id", id);
  if (error) return { erro: error.message.includes("row-level") ? "Esse tipo de documento é restrito ao administrador." : "Não foi possível salvar." };
  await refletirNoPlanner(id, antes.responsavel_id);
  revalidatePath("/arquivos", "layout");
  return { ok: "Documento salvo." };
}

export async function apagarDocumento(id: string): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { data: doc } = await sb.from("arq_documentos").select("arquivo_path, responsavel_id").eq("id", id).maybeSingle();
  if (!doc) return { erro: "Documento não encontrado." };
  const { error } = await sb.from("arq_documentos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível apagar." };
  await supabaseServico().storage.from(BUCKET).remove([doc.arquivo_path]);
  await refletirNoPlanner(id, doc.responsavel_id);
  revalidatePath("/arquivos", "layout");
  return { ok: "Documento apagado." };
}

export async function salvarUnidade(id: string, f: { nome: string; cnpj: string; ie: string; im: string; endereco: string; observacao: string }): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  if (!f.nome.trim()) return { erro: "Dê um nome à unidade." };
  const t = (v: string, n = 200) => v.trim().slice(0, n) || null;
  const sb = await supabaseUsuario();
  const { error } = await sb.from("arq_unidades").update({
    nome: f.nome.trim().slice(0, 80), cnpj: t(f.cnpj, 20), ie: t(f.ie, 30), im: t(f.im, 30), endereco: t(f.endereco, 300), observacao: t(f.observacao, 1000),
  }).eq("id", id);
  if (error) return { erro: error.message.includes("unique") ? "Já existe uma unidade com esse nome." : "Não foi possível salvar." };
  revalidatePath("/arquivos", "layout");
  return { ok: "Dados salvos." };
}

export async function criarUnidade(empresaId: string, nome: string): Promise<Resultado & { id?: string }> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  if (!nome.trim()) return { erro: "Dê um nome à unidade." };
  const sb = await supabaseUsuario();
  const { data, error } = await sb.from("arq_unidades").insert({ empresa_id: empresaId, nome: nome.trim().slice(0, 80), ordem: 50 }).select("id").single();
  if (error) return { erro: error.message.includes("unique") ? "Já existe uma unidade com esse nome." : "Não foi possível criar." };
  revalidatePath("/arquivos", "layout");
  return { ok: "Unidade criada.", id: data.id };
}
