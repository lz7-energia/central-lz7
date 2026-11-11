"use server";

export type Resultado = { erro?: string; ok?: boolean };

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { GRUPOS, type Grupo } from "@/lib/recebiveis";

async function equipe(): Promise<Resultado | null> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  if (perfil.papel === "diretoria") return { erro: "Acesso só de leitura." };
  return null;
}

export async function salvarCobranca(flowId: string, situacao: string, previsao: string, motivo: string): Promise<Resultado> {
  const bloqueio = await equipe();
  if (bloqueio) return bloqueio;
  if (!situacao) return { erro: "Escolha a situação." };
  if (previsao && !/^\d{4}-\d{2}-\d{2}$/.test(previsao)) return { erro: "Data de previsão inválida." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("cobranca_notas").upsert(
    { titulo_flow_id: flowId, situacao, previsao: previsao || null, motivo: motivo.trim().slice(0, 1000) || null },
    { onConflict: "titulo_flow_id" },
  );
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  revalidatePath("/recebiveis");
  return { ok: true };
}

export async function concluirAtualizacao(observacao: string): Promise<Resultado> {
  const bloqueio = await equipe();
  if (bloqueio) return bloqueio;
  const sb = await supabaseUsuario();
  const { data, error: e1 } = await sb.from("recebiveis").select("valor_aberto, previsao").eq("estado", "vencido");
  if (e1) return { erro: "Não foi possível ler os títulos." };
  const vencidos = data ?? [];
  const { error } = await sb.from("cobranca_atualizacoes").insert({
    qtd_vencidos: vencidos.length,
    valor_vencido: Math.round(vencidos.reduce((s, t) => s + Number(t.valor_aberto), 0) * 100) / 100,
    qtd_sem_previsao: vencidos.filter((t) => !t.previsao).length,
    observacao: observacao.trim().slice(0, 1000) || null,
  });
  if (error) return { erro: "Não foi possível concluir. Tente de novo." };
  revalidatePath("/recebiveis");
  return { ok: true };
}

export async function criarSituacao(rotulo: string, grupo: string): Promise<Resultado> {
  const bloqueio = await equipe();
  if (bloqueio) return bloqueio;
  const nome = rotulo.trim().slice(0, 60);
  if (!nome) return { erro: "Dê um nome para a situação." };
  if (!(grupo in GRUPOS)) return { erro: "Grupo inválido." };
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "situacao";
  const id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  const sb = await supabaseUsuario();
  const { error } = await sb.from("cobranca_situacoes").insert({ id, rotulo: nome, grupo: grupo as Grupo, ordem: 500 });
  if (error) return { erro: "Não foi possível criar a situação." };
  revalidatePath("/recebiveis");
  return { ok: true };
}

export async function alterarSituacao(id: string, mudanca: { rotulo?: string; grupo?: string; ativo?: boolean }): Promise<Resultado> {
  const bloqueio = await equipe();
  if (bloqueio) return bloqueio;
  const dados: Record<string, unknown> = {};
  if (mudanca.rotulo !== undefined) {
    const nome = mudanca.rotulo.trim().slice(0, 60);
    if (!nome) return { erro: "O nome não pode ficar vazio." };
    dados.rotulo = nome;
  }
  if (mudanca.grupo !== undefined) {
    if (!(mudanca.grupo in GRUPOS)) return { erro: "Grupo inválido." };
    dados.grupo = mudanca.grupo;
  }
  if (mudanca.ativo !== undefined) dados.ativo = mudanca.ativo;
  const sb = await supabaseUsuario();
  const { error } = await sb.from("cobranca_situacoes").update(dados).eq("id", id);
  if (error) return { erro: "Não foi possível salvar a situação." };
  revalidatePath("/recebiveis");
  return { ok: true };
}
