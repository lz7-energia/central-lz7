import "server-only";
import { todasAsLinhas } from "@/lib/paginar";
import type { supabaseUsuario } from "@/lib/supabase/server";

type Obra = { codigo: string; material_previsto: string | null; material_entregue: string | null; inicio_previsto: string | null;
  fim_previsto: string | null; fim_real: string | null; codigo_provisorio: boolean; flow_situacao: string | null };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Números da Início de Obras: semana do cronograma e pendentes de cada área (mesmas regras da tela do cronograma). */
export async function resumoObras(sb: Awaited<ReturnType<typeof supabaseUsuario>>) {
  const { data } = await todasAsLinhas<Obra>((de, ate) => sb.from("obra_obras")
    .select("codigo, material_previsto, material_entregue, inicio_previsto, fim_previsto, fim_real, codigo_provisorio, flow_situacao")
    .order("codigo").range(de, ate));
  const hoje = hojeSP(), dow = (new Date(hoje + "T12:00:00").getDay() + 6) % 7, s0 = somaDias(hoje, -dow), s1 = somaDias(s0, 6);
  const ab = data.filter((o) => !o.fim_real);
  return {
    abertas: ab.length,
    instSemana: ab.filter((o) => o.inicio_previsto && o.inicio_previsto <= s1 && (o.fim_previsto ?? o.inicio_previsto) >= s0).length,
    entSemana: ab.filter((o) => !o.material_entregue && o.material_previsto && o.material_previsto >= s0 && o.material_previsto <= s1).length,
    logistica: {
      atrasadas: ab.filter((o) => !o.material_entregue && o.material_previsto && o.material_previsto < hoje).length,
      semPrevisao: ab.filter((o) => !o.material_entregue && !o.material_previsto).length,
    },
    obras: {
      aAgendar: ab.filter((o) => !o.inicio_previsto).length,
      atrasadas: ab.filter((o) => o.fim_previsto && o.fim_previsto < hoje).length,
      avisosFlow: ab.filter((o) => o.codigo_provisorio || (o.flow_situacao && !["Aprovado", "Faturado"].includes(o.flow_situacao))).length,
    },
  };
}
