import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço. Só para as rotas públicas do portal
 * (formulário, consulta, aprovação), que chamam funções específicas do banco.
 * Nunca usar para ler dados em nome da equipe.
 */
export function supabaseServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Supabase não configurado (variáveis de ambiente)");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
