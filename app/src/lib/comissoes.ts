import "server-only";
import { perfilAtual } from "@/lib/supabase/server";

/** Comissões LZ7 (RH): só a equipe principal — perfis equipe e administrador veem e editam; diretoria não vê
 *  (decisão de 17/11/2026: tem salários, CPF e chave Pix). A mesma regra está no banco (com_pode + RLS de com_docs). */
export async function pessoaCom() {
  const p = await perfilAtual();
  if (!p || !p.ativo || !["equipe", "admin"].includes(p.papel)) return null;
  return p;
}
