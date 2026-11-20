import "server-only";
import { perfilAtual } from "@/lib/supabase/server";
import { veAdm } from "@/lib/centrais";

/** Conciliação Bancária (Financeiro): todos os perfis ativos veem; só equipe e admin editam; diretoria só vê
 *  (decisão de 20/11/2026). A mesma regra está no banco (conc_pode_editar + RLS de conc_docs). */
export async function pessoaConc() {
  const p = await perfilAtual();
  if (!p || !p.ativo || !veAdm(p)) return null; // perfil de Obras não entra
  return { ...p, podeEditar: ["equipe", "admin"].includes(p.papel) };
}
