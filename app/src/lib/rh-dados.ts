import "server-only";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import type { Candidato, Canal, Mensagem, Motivo, Pergunta, Vaga } from "@/lib/rh";

export async function carregarListas() {
  const sb = await supabaseUsuario();
  const [p, m, c, w] = await Promise.all([
    sb.from("rh_perguntas").select("*").order("ordem").order("id"),
    sb.from("rh_motivos").select("*").order("ordem").order("id"),
    sb.from("rh_canais").select("*").order("ordem").order("id"),
    sb.from("rh_mensagens").select("*").order("ordem").order("id"),
  ]);
  return {
    perguntas: (p.data ?? []) as Pergunta[], motivos: (m.data ?? []) as Motivo[],
    canais: (c.data ?? []) as Canal[], mensagens: (w.data ?? []) as Mensagem[],
  };
}

export async function carregarVagas() {
  const sb = await supabaseUsuario();
  const [v, c] = await Promise.all([
    sb.from("rh_vagas").select("*").order("aberta_em", { ascending: false }),
    todasAsLinhas<Candidato>((de, ate) => sb.from("rh_candidatos").select("*").order("criado_em").range(de, ate)),
  ]);
  return { vagas: (v.data ?? []) as Vaga[], candidatos: c.data ?? [] };
}
