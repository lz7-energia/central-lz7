import "server-only";
import nodemailer from "nodemailer";

/**
 * Envia e-mail pelo remetente Titan da central.
 * Sem SMTP configurado (ambiente de teste), só registra no log e segue.
 * Falha de e-mail nunca derruba o pedido: o pedido já está gravado.
 */
export async function enviarEmail(para: string | null | undefined, assunto: string, html: string) {
  if (!para) return;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_REMETENTE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.info(`[e-mail não enviado: SMTP não configurado] para=${para} assunto="${assunto}"`);
    return;
  }
  try {
    const porta = Number(SMTP_PORT || 465);
    const t = nodemailer.createTransport({
      host: SMTP_HOST,
      port: porta,
      secure: porta === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
    await t.sendMail({
      from: `Central LZ7 <${EMAIL_REMETENTE || SMTP_USER}>`,
      to: para,
      subject: assunto,
      html: moldura(html),
    });
  } catch (e) {
    console.error(`[e-mail falhou] para=${para} assunto="${assunto}"`, e);
  }
}

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function botao(href: string, texto: string, cor = "#0f6b4f") {
  return `<a href="${esc(href)}" style="display:inline-block;background:${cor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${esc(texto)}</a>`;
}

function moldura(conteudo: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1c2421;max-width:560px;line-height:1.5">
  <div style="font-weight:700;color:#0f6b4f;margin-bottom:16px">Central LZ7</div>
  ${conteudo}
  <p style="color:#6b7570;font-size:12px;margin-top:28px">Mensagem automática da Central LZ7. Não responda este e-mail.</p>
</div>`;
}

/** Endereço público do site, para montar os links dos e-mails. */
export function urlSite() {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
