import "server-only";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import { colabsDaFolha, type Colab } from "@/lib/frota";

export type Opcao = { id: string; nome: string };
export type Listas = { colabs: Colab[]; perfis: Opcao[]; empresas: Opcao[]; unidades: (Opcao & { empresa_id: string })[] };

/** Listas dos formulários da Frota: colaboradores da folha, equipe (responsável), empresas e unidades. */
export async function listasFrota(): Promise<Listas> {
  const sb = await supabaseUsuario();
  const [colab, { data: perfis }, { data: empresas }, { data: unidades }] = await Promise.all([
    todasAsLinhas<{ id: string; data: Record<string, unknown> }>((de, ate) => sb.from("plat_docs").select("id, data").eq("colecao", "colab").order("id").range(de, ate)),
    sb.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    sb.from("arq_empresas").select("id, nome").order("nome"),
    sb.from("arq_unidades").select("id, nome, empresa_id, unica").order("nome"),
  ]);
  return {
    colabs: colabsDaFolha(colab.data ?? []),
    perfis: (perfis ?? []) as Opcao[],
    empresas: (empresas ?? []) as Opcao[],
    unidades: ((unidades ?? []) as { id: string; nome: string; empresa_id: string; unica: boolean }[]).map((u) => ({ id: u.id, nome: u.unica ? "Única" : u.nome, empresa_id: u.empresa_id })),
  };
}
