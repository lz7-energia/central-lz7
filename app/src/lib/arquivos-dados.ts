import "server-only";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import type { Documento, Empresa, Tipo, Unidade } from "@/lib/arquivos";

/** Tudo o que a pessoa pode ver da central de arquivos (o banco já esconde o que é restrito). */
export async function carregarArquivos() {
  const sb = await supabaseUsuario();
  const [e, u, t, d, p] = await Promise.all([
    sb.from("arq_empresas").select("*").order("nome"),
    sb.from("arq_unidades").select("*").order("ordem").order("nome"),
    sb.from("arq_tipos").select("*").order("ordem"),
    todasAsLinhas<Documento>((de, ate) => sb.from("arq_documentos")
      .select("id, unidade_id, tipo_id, titulo, arquivo_nome, tamanho, mime, validade, aviso_dias, restrito, observacao, responsavel_id, enviado_em")
      .order("titulo").range(de, ate)),
    sb.from("perfis").select("id, nome").in("papel", ["equipe", "admin"]).eq("ativo", true).order("nome"),
  ]);
  return {
    empresas: (e.data ?? []) as Empresa[],
    unidades: (u.data ?? []) as Unidade[],
    tipos: (t.data ?? []) as Tipo[],
    documentos: d.data ?? [],
    pessoas: (p.data ?? []) as { id: string; nome: string }[],
  };
}
