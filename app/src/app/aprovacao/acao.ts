"use server";

import { supabaseServico } from "@/lib/supabase/servico";
import { enviarEmail, botao, esc, urlSite } from "@/lib/email";

export type EstadoAprovacao = { erro?: string; feito?: "aprovado" | "recusado"; comentario?: string | null };

export async function decidir(_: EstadoAprovacao, form: FormData): Promise<EstadoAprovacao> {
  const token = String(form.get("token") || "");
  const decisao = String(form.get("decisao") || "");
  const comentario = String(form.get("comentario") || "").trim().slice(0, 1000) || null;
  if (!/^[0-9a-f]{48}$/.test(token)) return { erro: "Link inválido." };
  if (decisao !== "aprovado" && decisao !== "recusado") return { erro: "Decisão inválida." };
  if (decisao === "recusado" && !comentario) return { erro: "Escreva o motivo da recusa: o solicitante vai ver." };

  const sb = supabaseServico();
  const { data, error } = await sb.rpc("decidir_aprovacao", {
    p_token: token,
    p_decisao: decisao,
    p_comentario: comentario,
  });
  if (error) return { comentario, erro: error.code === "22023" ? error.message : "Não foi possível registrar a decisão. Tente de novo." };

  // Avisos: setor (se aprovado) e solicitante.
  const pedidoId = (data as { pedido_id: number }).pedido_id;
  const { data: p } = await sb
    .from("pedidos")
    .select("protocolo, setores(nome, email_responsavel), tipos_pedido(nome), solicitantes(nome, email)")
    .eq("id", pedidoId)
    .single();
  if (p) {
    const ped = p as unknown as {
      protocolo: string;
      setores: { nome: string; email_responsavel: string | null };
      tipos_pedido: { nome: string };
      solicitantes: { nome: string; email: string | null } | null;
    };
    const site = urlSite();
    const envios = [
      enviarEmail(
        ped.solicitantes?.email,
        `Pedido ${ped.protocolo} ${decisao === "aprovado" ? "aprovado" : "recusado"} pelo gestor`,
        decisao === "aprovado"
          ? `<p>Seu pedido <strong>${esc(ped.tipos_pedido.nome)}</strong> (${esc(ped.protocolo)}) foi aprovado e seguiu para o ${esc(ped.setores.nome)}.</p>`
          : `<p>Seu pedido <strong>${esc(ped.tipos_pedido.nome)}</strong> (${esc(ped.protocolo)}) foi recusado pelo gestor.</p><p>Motivo: ${esc(comentario)}</p>`,
      ),
    ];
    if (decisao === "aprovado") {
      envios.push(
        enviarEmail(
          ped.setores.email_responsavel,
          `Novo pedido ${ped.protocolo}: ${ped.tipos_pedido.nome}`,
          `<p>Novo pedido aprovado na fila do ${esc(ped.setores.nome)}, aberto por ${esc(ped.solicitantes?.nome)}.</p>
           <p>${botao(`${site}/pedidos?busca=${encodeURIComponent(ped.protocolo)}`, "Abrir na central")}</p>`,
        ),
      );
    }
    await Promise.all(envios);
  }
  return { feito: decisao };
}
