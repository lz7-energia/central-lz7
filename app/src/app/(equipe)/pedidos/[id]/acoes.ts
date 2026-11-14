"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { STATUS, STATUS_EQUIPE, type StatusPedido } from "@/lib/tipos";
import { enviarEmail, esc, urlSite } from "@/lib/email";

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

/** Resposta rápida a um pedido novo: aceitar (vai para "Em andamento" com você como responsável) ou recusar (com motivo). */
export async function responderPedido(_: Estado, form: FormData): Promise<Estado> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const id = Number(form.get("id"));
  const decisao = String(form.get("decisao"));
  const motivo = String(form.get("motivo") || "").trim().slice(0, 2000);
  if (decisao !== "aceitar" && decisao !== "recusar") return { erro: "Escolha aceitar ou recusar." };
  if (decisao === "recusar" && !motivo) return { erro: "Escreva o motivo da recusa: o solicitante vai receber." };
  const previsao = String(form.get("previsao") || "");
  if (decisao === "aceitar" && !/^\d{4}-\d{2}-\d{2}$/.test(previsao)) return { erro: "Informe a previsão de conclusão." };

  const sb = await supabaseUsuario();
  const { data: atual } = await sb.from("pedidos").select("status, responsavel_id").eq("id", id).single();
  if (!atual) return { erro: "Pedido não encontrado." };
  if (atual.status !== "aberto") return { erro: "Este pedido já foi respondido." };

  const status: StatusPedido = decisao === "aceitar" ? "em_andamento" : "recusado";
  const mudanca: Record<string, unknown> = { status };
  if (decisao === "aceitar" && !atual.responsavel_id) mudanca.responsavel_id = perfil.id;
  if (decisao === "aceitar") mudanca.prazo = previsao;
  const { error } = await sb.from("pedidos").update(mudanca).eq("id", id).eq("status", "aberto");
  if (error) return { erro: "Não foi possível salvar." };
  if (motivo) await sb.from("pedido_eventos").insert({ pedido_id: id, tipo: "comentario", texto: motivo, autor: perfil.nome });

  await avisarSolicitante(
    id,
    (pr) => (decisao === "aceitar" ? `Pedido ${pr}: aceito` : `Pedido ${pr}: recusado`),
    decisao === "aceitar"
      ? `<p>Seu pedido foi <strong>aceito</strong> por ${esc(perfil.nome)} e está em andamento.</p><p><strong>Previsão de conclusão:</strong> ${previsao.split("-").reverse().join("/")}</p>${motivo ? `<p>${esc(motivo)}</p>` : ""}`
      : `<p>Seu pedido foi <strong>recusado</strong>.</p><p><strong>Motivo:</strong> ${esc(motivo)}</p>`,
  );
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  return { ok: decisao === "aceitar" ? `Aceito, com previsão para ${previsao.split("-").reverse().join("/")}.` : "Pedido recusado e solicitante avisado." };
}

/** Novo link de acompanhamento (o do e-mail de confirmação continua valendo). */
async function novoLink(id: number): Promise<string | null> {
  const sb = await supabaseUsuario();
  const { data, error } = await sb.rpc("gerar_link_consulta", { p_pedido_id: id });
  if (error || !data) return null;
  const r = data as { protocolo: string; token: string };
  return `${urlSite()}/consulta?p=${encodeURIComponent(r.protocolo)}&t=${r.token}`;
}

async function solicitante(id: number) {
  const sb = await supabaseUsuario();
  const { data } = await sb.from("pedidos").select("protocolo, status, solicitantes(nome, email)").eq("id", id).single();
  return data as unknown as { protocolo: string; status: StatusPedido; solicitantes: { nome: string; email: string | null } | null } | null;
}

export type ResultadoLink = Estado & { link?: string; email?: string | null; enviado?: boolean };

/** Marca o pedido como concluído e manda o link de acompanhamento para quem pediu. */
export async function concluirPedido(_: ResultadoLink, form: FormData): Promise<ResultadoLink> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const id = Number(form.get("id"));
  const msg = String(form.get("mensagem") || "").trim().slice(0, 2000);
  const p = await solicitante(id);
  if (!p) return { erro: "Pedido não encontrado." };
  if (p.status === "aguardando_aprovacao") return { erro: "Este pedido ainda espera a aprovação do gestor." };
  const sb = await supabaseUsuario();
  if (p.status !== "concluido") {
    const { error } = await sb.from("pedidos").update({ status: "concluido" }).eq("id", id);
    if (error) return { erro: "Não foi possível concluir." };
  }
  if (msg) await sb.from("pedido_eventos").insert({ pedido_id: id, tipo: "comentario", texto: msg, autor: perfil.nome });
  const link = await novoLink(id);
  let enviado = false;
  if (p.solicitantes?.email && link) {
    await enviarEmail(p.solicitantes.email, `Pedido ${p.protocolo}: concluído`,
      `<p>Olá, ${esc(p.solicitantes.nome)}.</p><p>Seu pedido <strong>${esc(p.protocolo)}</strong> foi <strong>concluído</strong> por ${esc(perfil.nome)}.</p>
       ${msg ? `<p>${esc(msg)}</p>` : ""}<p><a href="${link}">Ver o acompanhamento do pedido</a></p>`);
    enviado = true;
  }
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/pedidos");
  return { ok: enviado ? "Pedido concluído e link enviado por e-mail." : "Pedido concluído.", link: link ?? undefined, email: p.solicitantes?.email, enviado };
}

/** Gera o link de acompanhamento para copiar ou mandar; com enviar = true, manda por e-mail ao solicitante. */
export async function linkAcompanhamento(id: number, enviar: boolean): Promise<ResultadoLink> {
  const perfil = await perfilAtual();
  if (!perfil) return { erro: "Sessão expirada. Entre de novo." };
  const p = await solicitante(id);
  if (!p) return { erro: "Pedido não encontrado." };
  const link = await novoLink(id);
  if (!link) return { erro: "Não foi possível gerar o link." };
  if (enviar) {
    if (!p.solicitantes?.email) return { erro: "O solicitante não tem e-mail cadastrado.", link };
    await enviarEmail(p.solicitantes.email, `Pedido ${p.protocolo}: acompanhamento`,
      `<p>Olá, ${esc(p.solicitantes.nome)}.</p><p>Este é o link para acompanhar o seu pedido <strong>${esc(p.protocolo)}</strong>
       (status atual: ${esc(STATUS[p.status].rotulo)}):</p><p><a href="${link}">Ver o acompanhamento do pedido</a></p>`);
    return { ok: `Link enviado para ${p.solicitantes.email}.`, link, email: p.solicitantes.email, enviado: true };
  }
  return { link, email: p.solicitantes?.email };
}
