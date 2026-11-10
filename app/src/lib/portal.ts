import "server-only";
import { supabaseServico } from "@/lib/supabase/servico";
import type { OpcoesPortal } from "@/lib/tipos";

export async function opcoesPortal(): Promise<OpcoesPortal | null> {
  try {
    const { data, error } = await supabaseServico().rpc("portal_opcoes");
    if (error) throw error;
    return data as OpcoesPortal;
  } catch (e) {
    console.error("[portal] não foi possível carregar as opções", e);
    return null;
  }
}

export const TAMANHO_MAX_ANEXO = 10 * 1024 * 1024;
export const TIPOS_ANEXO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/xml": "xml",
  "application/xml": "xml",
};

/** Mensagens de erro do banco que podem ser mostradas pra quem preencheu. */
export function mensagemAmigavel(e: { code?: string; message?: string } | null) {
  if (!e) return "Não foi possível enviar o pedido.";
  if (e.code === "22023" || e.code === "54000") return e.message || "Dados inválidos.";
  return "Não foi possível enviar o pedido agora. Tente de novo em alguns minutos.";
}
