import "server-only";
import { perfilAtual } from "@/lib/supabase/server";

/** Central de Obras: todo perfil ativo vê; só o perfil "obras" edita o cronograma (a mesma regra está no banco: obra_pode_editar).
 *  Dentro do perfil obras, a área decide a instalação: "obras" edita tudo; "logistica" edita entrega, material e dados do cliente
 *  (banco: obra_area() e o gatilho obra_antes_de_gravar). */
export async function pessoaObras() {
  const p = await perfilAtual();
  if (!p || !p.ativo) return null;
  const area = p.papel === "obras" ? (p.area_obras ?? "obras") : null;
  return { ...p, podeEditar: p.papel === "obras", area };
}

export const BUCKET_CONTRATOS = "obra-contratos";
export const CODIGO_OBRA_OK = /^[A-Z0-9][A-Z0-9-]{3,30}$/;
