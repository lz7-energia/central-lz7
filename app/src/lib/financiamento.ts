import "server-only";
import { perfilAtual } from "@/lib/supabase/server";

/** Financiamento e confirmação: todos os perfis ativos veem; só equipe e administrador editam (diretoria só vê, decisão de 17/11/2026).
 *  A mesma regra está no banco (fin_pode_editar + RLS de fin_docs). */
export async function pessoaFin() {
  const p = await perfilAtual();
  if (!p || !p.ativo || !["equipe", "admin", "diretoria"].includes(p.papel)) return null;
  return { ...p, podeEditar: p.papel === "equipe" || p.papel === "admin" };
}
