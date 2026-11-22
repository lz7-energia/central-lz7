"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

// Fechamento do projeto (indicador e "fechar mesmo assim"): só na central, tabela projeto_fechamento.
type R = { erro?: string; ok?: boolean };
export type DadosIndicador = { sem: boolean; nome: string; valor: string; pagoEm: string; obs: string };

async function gravar(flowId: string, campos: Record<string, unknown>): Promise<R> {
  if (!(await perfilAtual())) return { erro: "Sessão expirada. Entre de novo." };
  if (!flowId) return { erro: "Projeto inválido." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("projeto_fechamento").upsert({ pedido_flow_id: flowId, ...campos }, { onConflict: "pedido_flow_id" });
  if (error) return { erro: error.code === "23514" ? "Confira os dados: valor, data e nome do indicador." : "Não foi possível salvar. Tente de novo." };
  revalidatePath("/clientes", "layout");
  return { ok: true };
}

export async function salvarIndicador(flowId: string, d: DadosIndicador): Promise<R> {
  if (d.sem) return gravar(flowId, { sem_indicador: true, indicador_nome: null, indicador_valor: null, indicador_pago_em: null, indicador_obs: null });
  const nome = d.nome.trim().slice(0, 120);
  if (!nome) return { erro: "Informe o nome do indicador ou marque \"Sem indicador\"." };
  const v = d.valor.trim() ? Number(d.valor.replace(/\./g, "").replace(",", ".")) : null;
  if (v !== null && (!Number.isFinite(v) || v < 0)) return { erro: "Valor inválido." };
  if (d.pagoEm && !/^\d{4}-\d{2}-\d{2}$/.test(d.pagoEm)) return { erro: "Data inválida." };
  return gravar(flowId, { sem_indicador: false, indicador_nome: nome, indicador_valor: v, indicador_pago_em: d.pagoEm || null,
    indicador_obs: d.obs.trim().slice(0, 300) || null });
}

/** Sem indicador em vários projetos de uma vez. */
export async function semIndicadorEmLote(ids: string[]): Promise<R> {
  if (!(await perfilAtual())) return { erro: "Sessão expirada. Entre de novo." };
  const lista = [...new Set(ids)].filter(Boolean).slice(0, 500);
  if (!lista.length) return { ok: true };
  const sb = await supabaseUsuario();
  const { data: ja } = await sb.from("projeto_fechamento").select("pedido_flow_id").in("pedido_flow_id", lista).not("indicador_nome", "is", null);
  const comNome = new Set((ja ?? []).map((x) => x.pedido_flow_id));
  const linhas = lista.filter((id) => !comNome.has(id)).map((id) => ({ pedido_flow_id: id, sem_indicador: true }));
  if (!linhas.length) return { ok: true };
  const { error } = await sb.from("projeto_fechamento").upsert(linhas, { onConflict: "pedido_flow_id" });
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/clientes", "layout");
  return { ok: true };
}

export async function fecharProjeto(flowId: string, motivo: string | null): Promise<R> {
  if (motivo === null) return gravar(flowId, { fechado_manual: false, fechado_motivo: null });
  const m = motivo.trim().slice(0, 300);
  if (!m) return { erro: "Escreva o motivo para fechar mesmo assim." };
  return gravar(flowId, { fechado_manual: true, fechado_motivo: m });
}
