import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServico } from "@/lib/supabase/servico";
import { opcoesPortal, TAMANHO_MAX_ANEXO, TIPOS_ANEXO, mensagemAmigavel } from "@/lib/portal";
import { verificarAntirrobo } from "@/lib/antirrobo";
import { enviarEmail, botao, esc, urlSite } from "@/lib/email";
import { valorCampo } from "@/lib/formato";

export const runtime = "nodejs";

function falha(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return falha("Envio inválido.");
  }

  // Campo-isca: invisível pra pessoas, robôs costumam preencher.
  if (String(form.get("site") || "") !== "") return falha("Envio inválido.");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (!(await verificarAntirrobo(form.get("cf-turnstile-response") as string | null, ip))) {
    return falha("Confirme que você não é um robô e tente de novo.");
  }

  const opcoes = await opcoesPortal();
  if (!opcoes) return falha("O portal está indisponível agora. Tente mais tarde.", 503);

  const tipoId = Number(form.get("tipo_id"));
  const solicitanteId = Number(form.get("solicitante_id"));
  const tipo = opcoes.tipos.find((t) => t.id === tipoId);
  const solicitante = opcoes.solicitantes.find((s) => s.id === solicitanteId);
  if (!tipo) return falha("Escolha o tipo de pedido.");
  if (!solicitante) return falha("Escolha seu nome na lista.");

  const sb = supabaseServico();
  const dados: Record<string, string> = {};
  const enviados: string[] = [];
  const desfazerAnexos = async () => {
    if (enviados.length) await sb.storage.from("anexos").remove(enviados);
  };

  for (const campo of tipo.campos) {
    if (campo.tipo === "arquivo") {
      const arq = form.get(`campo_${campo.chave}`);
      if (!(arq instanceof File) || arq.size === 0) continue;
      const ext = TIPOS_ANEXO[arq.type];
      if (!ext) {
        await desfazerAnexos();
        return falha(`${campo.rotulo}: envie PDF, imagem ou XML.`);
      }
      if (arq.size > TAMANHO_MAX_ANEXO) {
        await desfazerAnexos();
        return falha(`${campo.rotulo}: o arquivo passa de 10 MB.`);
      }
      const mes = new Date().toISOString().slice(0, 7);
      const nome = arq.name.replace(/\.[^.]*$/, "").normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 60) || "anexo";
      const caminho = `${mes}/${randomUUID()}/${nome}.${ext}`;
      const { error } = await sb.storage
        .from("anexos")
        .upload(caminho, Buffer.from(await arq.arrayBuffer()), { contentType: arq.type });
      if (error) {
        console.error("[portal] falha no anexo", error);
        await desfazerAnexos();
        return falha("Não foi possível enviar o anexo. Tente de novo.", 502);
      }
      enviados.push(caminho);
      dados[campo.chave] = caminho;
    } else {
      const v = String(form.get(`campo_${campo.chave}`) ?? "").trim().slice(0, 5000);
      if (v) dados[campo.chave] = v;
    }
  }

  const { data, error } = await sb.rpc("criar_pedido", {
    p_tipo_id: tipo.id,
    p_solicitante_id: solicitante.id,
    p_dados: dados,
  });
  if (error || !data) {
    await desfazerAnexos();
    if (error?.code !== "22023" && error?.code !== "54000") console.error("[portal] criar_pedido", error);
    return falha(mensagemAmigavel(error), error?.code === "54000" ? 429 : 400);
  }

  const r = data as {
    protocolo: string;
    token_consulta: string;
    status: string;
    setor_email: string | null;
    solicitante_email: string | null;
    aprovacao: { token: string; email: string } | null;
  };
  const site = urlSite();
  const linkConsulta = `${site}/consulta?p=${encodeURIComponent(r.protocolo)}&t=${r.token_consulta}`;
  const setor = opcoes.setores.find((s) => s.id === tipo.setor_id)?.nome ?? tipo.setor_id;

  const resumo = tipo.campos
    .filter((c) => c.tipo !== "arquivo" && dados[c.chave])
    .map((c) => `<tr><td style="color:#6b7570;padding:2px 12px 2px 0">${esc(c.rotulo)}</td><td>${esc(valorCampo(c.tipo, dados[c.chave]))}</td></tr>`)
    .join("");
  const tabela = resumo ? `<table style="margin:12px 0;font-size:14px">${resumo}</table>` : "";

  const envios: Promise<void>[] = [
    enviarEmail(
      r.solicitante_email,
      `Pedido ${r.protocolo} recebido`,
      `<p>Olá, ${esc(solicitante.nome)}.</p>
       <p>Recebemos seu pedido <strong>${esc(tipo.nome)}</strong> para o ${esc(setor)}. Protocolo: <strong>${esc(r.protocolo)}</strong>.</p>
       ${r.aprovacao ? "<p>Ele precisa da aprovação do seu gestor antes de seguir para o setor.</p>" : ""}
       <p>${botao(linkConsulta, "Acompanhar o pedido")}</p>
       <p style="font-size:13px;color:#6b7570">Guarde este e-mail: o link acima é a sua forma de acompanhar o pedido.</p>`,
    ),
  ];

  if (r.aprovacao) {
    const linkAprov = `${site}/aprovacao?t=${r.aprovacao.token}`;
    envios.push(
      enviarEmail(
        r.aprovacao.email,
        `Aprovação pendente: ${tipo.nome} (${solicitante.nome})`,
        `<p>${esc(solicitante.nome)} abriu um pedido que precisa da sua aprovação.</p>
         <p><strong>${esc(tipo.nome)}</strong> · ${esc(setor)} · protocolo ${esc(r.protocolo)}</p>
         ${tabela}
         <p>${botao(linkAprov, "Ver e decidir")}</p>
         <p style="font-size:13px;color:#6b7570">O link vale por 7 dias.</p>`,
      ),
    );
  } else {
    envios.push(
      enviarEmail(
        r.setor_email,
        `Novo pedido ${r.protocolo}: ${tipo.nome}`,
        `<p>Novo pedido na fila do ${esc(setor)}, aberto por ${esc(solicitante.nome)}.</p>
         <p><strong>${esc(tipo.nome)}</strong> · protocolo ${esc(r.protocolo)}</p>
         ${tabela}
         <p>${botao(`${site}/pedidos?busca=${encodeURIComponent(r.protocolo)}`, "Abrir na central")}</p>`,
      ),
    );
  }
  await Promise.all(envios);

  return NextResponse.json({
    protocolo: r.protocolo,
    link: linkConsulta,
    aprovacao: Boolean(r.aprovacao),
    temEmail: Boolean(r.solicitante_email),
  });
}
