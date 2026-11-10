"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { STATUS, STATUS_EQUIPE, type StatusPedido } from "@/lib/tipos";
import { enviarEmail, esc } from "@/lib/email";

export type Estado = { erro?: string; ok?: string; texto?: string };

async function avisarSolicitante(pedidoId: number, assunto: (protocolo: string) => string, corpo: string) {
  const sb = await supabaseUsuario();
  const { data } = await sb
    .from("pedidos")
    .select("protocolo, solicitantes(nome, email)")
    .eq("id", pedidoId)
    .single();
  const p = data as unknown as { protocolo: string; solicitantes: { nome: string; email: string | null } | null } | null;
  if (!p?.solicitantes?.email) return;
  await enviarEmail(
    p.solicitantes.email,
    assunto(p.protocolo),
    `<p>Olá, ${esc(p.solicitantes.nome)}.</p>${corpo}
     <p style="font-size:13px;color:#6b7570">Para ver o andamento completo, use o link do e-mail de confirmação do pedido ${esc(p.protocolo)}.</p>`,
  );
}

export async function atualizarPedido(_: Estado, form: FormData): Promise<Estado> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };

  const id = Number(form.get("id"));
  const statusAntes = String(form.get("status_antes")) as StatusPedido;
  const status = String(form.get("status")) as StatusPedido;
  const responsavel = String(form.get("responsavel_id") || "") || null;
  const prazo = String(form.get("prazo") || "") || null;

  const mudanca: Record<string, unknown> = { responsavel_id: responsavel, prazo };
  if (status !== statusAntes) {
    if (!STATUS_EQUIPE.includes(status)) return { erro: "Status inválido." };
    if (statusAntes === "aguardando_aprovacao") return { erro: "Este pedido ainda espera a aprovação do gestor." };
    mudanca.status = status;
  }

  const sb = await supabaseUsuario();
  const { error } = await sb.from("pedidos").update(mudanca).eq("id", id);
  if (error) return { erro: "Não foi possível salvar." };

  if (mudanca.status) {
    const motivo = String(form.get("motivo") || "").trim();
    if (motivo) {
      await sb.from("pedido_eventos").insert({ pedido_id: id, tipo: "comentario", texto: motivo, autor: perfil.nome });
    }
    await avisarSolicitante(
      id,
      (pr) => `Pedido ${pr}: ${STATUS[status].rotulo}`,
      `<p>Seu pedido mudou para <strong>${esc(STATUS[status].rotulo)}</strong>.</p>${motivo ? `<p>${esc(motivo)}</p>` : ""}`,
    );
  }
  revalidatePath(`/pedidos/${id}`);
  return { ok: "Salvo." };
}

export async function comentar(_: Estado, form: FormData): Promise<Estado> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const id = Number(form.get("id"));
  const texto = String(form.get("texto") || "").trim().slice(0, 4000);
  const visivel = form.get("visivel") === "on";
  if (!texto) return { erro: "Escreva o comentário." };

  const sb = await supabaseUsuario();
  const { error } = await sb
    .from("pedido_eventos")
    .insert({ pedido_id: id, tipo: "comentario", texto, autor: perfil.nome, visivel_solicitante: visivel });
  if (error) return { erro: "Não foi possível salvar o comentário.", texto };

  if (visivel) {
    await avisarSolicitante(id, (pr) => `Pedido ${pr}: nova mensagem da central`, `<p>${esc(texto)}</p>`);
  }
  revalidatePath(`/pedidos/${id}`);
  return { ok: visivel ? "Comentário enviado ao solicitante." : "Nota interna salva." };
}
