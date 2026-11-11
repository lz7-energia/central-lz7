import "server-only";
import { supabaseUsuario } from "@/lib/supabase/server";
import { STATUS_ABERTOS } from "@/lib/tipos";
import { hojeSP } from "@/lib/formato";

export type ResumoSetor = { abertos: number; atrasados: number };

/** Pedidos em aberto e atrasados por setor, e cards do painel prontos pra faturar. */
export async function resumoDasAreas() {
  const sb = await supabaseUsuario();
  const hoje = hojeSP();
  const [{ data: pedidos }, { count: prontos }] = await Promise.all([
    sb.from("pedidos").select("setor_id, prazo").in("status", STATUS_ABERTOS),
    sb.from("painel_faturamento").select("flow_id", { count: "exact", head: true })
      .eq("coluna", "pronto_faturar").eq("oculto", false),
  ]);
  const setores: Record<string, ResumoSetor> = {};
  for (const p of pedidos ?? []) {
    const s = (setores[p.setor_id] ??= { abertos: 0, atrasados: 0 });
    s.abertos++;
    if (p.prazo && p.prazo < hoje) s.atrasados++;
  }
  return { setores, prontosFaturar: prontos ?? 0 };
}

/** Bom dia / Boa tarde / Boa noite pelo horário de Brasília. */
export function cumprimento(agora = new Date()) {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(agora));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function dataPorExtenso(agora = new Date()) {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(agora);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
