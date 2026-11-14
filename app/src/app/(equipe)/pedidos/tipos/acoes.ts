"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import type { Campo, TipoCampo } from "@/lib/tipos";

export type Resultado = { ok?: string; erro?: string };
const TIPOS: TipoCampo[] = ["texto", "texto_longo", "numero", "data", "lista", "arquivo"];

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";

/** Cria ou edita um tipo de pedido. As perguntas chegam em JSON; a chave de cada pergunta antiga é mantida (os pedidos já feitos usam ela). */
export async function salvarTipo(_: Resultado, f: FormData): Promise<Resultado> {
  if (!(await perfilAtual())) return { erro: "Sessão expirada. Entre de novo." };
  const id = Number(f.get("id")) || null;
  const setor = String(f.get("setor_id") || "");
  const nome = String(f.get("nome") || "").trim().slice(0, 120);
  const prazo = Math.max(0, Math.min(365, Number(f.get("prazo_dias")) || 0));
  if (!setor || !nome) return { erro: "Informe o setor e o nome do tipo." };
  let brutos: Partial<Campo>[] = [];
  try { brutos = JSON.parse(String(f.get("campos") || "[]")); } catch { return { erro: "Perguntas inválidas." }; }
  const usadas = new Set<string>();
  const campos: Campo[] = [];
  for (const c of brutos) {
    const rotulo = String(c.rotulo ?? "").trim().slice(0, 200);
    if (!rotulo) continue;
    const tipo = TIPOS.includes(c.tipo as TipoCampo) ? (c.tipo as TipoCampo) : "texto";
    let chave = c.chave && /^[a-z0-9_]+$/.test(c.chave) ? c.chave : slug(rotulo);
    for (let i = 2; usadas.has(chave); i++) chave = `${slug(rotulo)}_${i}`;
    usadas.add(chave);
    const campo: Campo = { chave, rotulo, tipo, obrigatorio: !!c.obrigatorio };
    if (tipo === "lista") {
      campo.opcoes = (c.opcoes ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 50);
      if (!campo.opcoes.length) return { erro: `A pergunta "${rotulo}" é uma lista: escreva as opções.` };
    }
    campos.push(campo);
  }
  if (!campos.length) return { erro: "Crie pelo menos uma pergunta." };
  const sb = await supabaseUsuario();
  const dados = { setor_id: setor, nome, prazo_dias: prazo, campos };
  const { error } = id ? await sb.from("tipos_pedido").update(dados).eq("id", id) : await sb.from("tipos_pedido").insert({ ...dados, ativo: true });
  if (error) return { erro: error.code === "23505" ? "Já existe um tipo com esse nome neste setor." : "Não foi possível salvar." };
  revalidatePath("/pedidos/tipos");
  return { ok: id ? "Tipo salvo." : "Tipo criado. Já aparece no portal." };
}

export async function excluirTipo(id: number): Promise<Resultado> {
  if (!(await perfilAtual())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { data, error } = await sb.rpc("excluir_tipo_pedido", { p_id: id });
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/pedidos/tipos");
  return { ok: data === "apagado" ? "Tipo excluído." : "Tipo tirado do portal (os pedidos antigos dele continuam na fila)." };
}

export async function restaurarTipo(id: number): Promise<Resultado> {
  if (!(await perfilAtual())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("tipos_pedido").update({ ativo: true }).eq("id", id);
  if (error) return { erro: "Não foi possível restaurar." };
  revalidatePath("/pedidos/tipos");
  return { ok: "Tipo de volta ao portal." };
}
