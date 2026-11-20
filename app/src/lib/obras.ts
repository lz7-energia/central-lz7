import "server-only";
import { perfilAtual } from "@/lib/supabase/server";

/** Central de Obras: todo perfil ativo vê; só o perfil "obras" edita o cronograma (a mesma regra está no banco: obra_pode_editar). */
export async function pessoaObras() {
  const p = await perfilAtual();
  if (!p || !p.ativo) return null;
  return { ...p, podeEditar: p.papel === "obras" };
}

export const BUCKET_CONTRATOS = "obra-contratos";
export const CODIGO_OBRA_OK = /^[A-Z0-9][A-Z0-9-]{3,30}$/;
