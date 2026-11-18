"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { telefoneWhatsApp } from "@/lib/regua";

export type Resultado = { erro?: string; ok?: boolean; lote?: string };

async function sessao() {
  const perfil = await perfilAtual();
  if (!perfil) return null;
  return await supabaseUsuario();
}
const pronto = () => { revalidatePath("/cobranca"); revalidatePath("/recebiveis"); };

/** Registra o envio (ou a etapa pulada) de cada título do cliente. Quem estava "Sem contato" passa a "Cobrado". */
export async function registrarEnvio(itens: { titulo: string; etapa: string }[], telefone: string, texto: string,
  acao: "enviado" | "pulado", motivo = ""): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  if (!itens.length) return { erro: "Nada para registrar." };
  if (acao === "pulado" && !motivo.trim()) return { erro: "Diga por que a etapa foi pulada." };
  const lote = crypto.randomUUID();
  const { error } = await sb.from("cobranca_envios").insert(itens.map((i) => ({
    lote, titulo_flow_id: i.titulo, etapa_id: i.etapa, canal: "whatsapp", acao,
    telefone: acao === "enviado" ? telefoneWhatsApp(telefone) : null,
    texto: acao === "enviado" ? texto.slice(0, 4000) : null, motivo: motivo.trim().slice(0, 300) || null,
  })));
  if (error) return { erro: "Não foi possível registrar. Tente de novo." };
  if (acao === "enviado") {
    const ids = itens.map((i) => i.titulo);
    const { data: notas } = await sb.from("cobranca_notas").select("titulo_flow_id, situacao").in("titulo_flow_id", ids);
    const tem = new Map((notas ?? []).map((n) => [n.titulo_flow_id, n.situacao]));
    const novos = ids.filter((id) => !tem.has(id)).map((id) => ({ titulo_flow_id: id, situacao: "cobrado" }));
    if (novos.length) await sb.from("cobranca_notas").insert(novos);
    const semContato = ids.filter((id) => tem.get(id) === "sem_contato");
    if (semContato.length) await sb.from("cobranca_notas").update({ situacao: "cobrado" }).in("titulo_flow_id", semContato);
  }
  pronto();
  return { ok: true, lote };
}

/** Desfaz um registro de hoje feito pela própria pessoa (o banco confere as duas coisas). */
export async function desfazerEnvio(lote: string): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  const { data, error } = await sb.from("cobranca_envios").delete().eq("lote", lote).select("id");
  if (error) return { erro: "Não foi possível desfazer." };
  if (!data?.length) return { erro: "Só dá para desfazer os seus registros de hoje." };
  pronto();
  return { ok: true };
}

export async function salvarContato(idCliente: string, telefone: string, email: string): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  const tel = telefone.replace(/\D/g, "");
  if (tel && !telefoneWhatsApp(tel)) return { erro: "Telefone inválido. Use DDD + número (ex.: 43 99999-0000)." };
  const mail = email.trim().toLowerCase();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { erro: "E-mail inválido." };
  const { error } = await sb.from("cliente_contatos").upsert({ id_cliente: idCliente, telefone: tel || null, email: mail || null }, { onConflict: "id_cliente" });
  if (error) return { erro: "Não foi possível salvar o contato." };
  pronto();
  return { ok: true };
}

export async function salvarEtapa(e: { id?: string; dias: number; nome: string; texto: string; ativo: boolean }): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  const dias = Math.round(Number(e.dias));
  if (!Number.isFinite(dias) || dias < 0 || dias > 365) return { erro: "Dias: de 0 (no dia do vencimento) a 365." };
  const nome = e.nome.trim().slice(0, 80);
  if (!nome) return { erro: "Dê um nome para a etapa." };
  const texto = e.texto.trim().slice(0, 2000);
  if (!texto) return { erro: "Escreva o texto da mensagem." };
  const id = e.id || `d${dias}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await sb.from("cobranca_regua_etapas").upsert({ id, dias, nome, texto, ativo: !!e.ativo }, { onConflict: "id" });
  if (error) return { erro: "Não foi possível salvar a etapa." };
  pronto();
  return { ok: true };
}

export async function excluirEtapa(id: string): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  const { error } = await sb.from("cobranca_regua_etapas").delete().eq("id", id);
  if (error) return { erro: "Não foi possível excluir a etapa." };
  pronto();
  return { ok: true };
}

export async function alternarPausa(situacaoId: string, pausa: boolean): Promise<Resultado> {
  const sb = await sessao();
  if (!sb) return { erro: "Sessão expirada. Entre de novo." };
  const { error } = await sb.from("cobranca_situacoes").update({ pausa_regua: pausa }).eq("id", situacaoId);
  if (error) return { erro: "Não foi possível salvar." };
  pronto();
  return { ok: true };
}
