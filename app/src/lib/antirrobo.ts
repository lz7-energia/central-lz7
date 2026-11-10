import "server-only";

/**
 * Verificação anti-robô (Cloudflare Turnstile, gratuito).
 * Enquanto as chaves não forem configuradas, a verificação fica desligada
 * e vale só o limite de envios do banco.
 */
export const antirroboLigado = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

export async function verificarAntirrobo(token: string | null, ip: string | null) {
  const segredo = process.env.TURNSTILE_SECRET_KEY;
  if (!segredo) return true;
  if (!token) return false;
  const corpo = new URLSearchParams({ secret: segredo, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: corpo,
    });
    const j = (await r.json()) as { success?: boolean };
    return Boolean(j.success);
  } catch {
    return false;
  }
}
