import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { sincronizar } from "@/lib/planner/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Chamado a cada 15 minutos pelo agendador do Supabase (pg_cron), com a chave PLANNER_CRON_SECRET. */
export async function POST(req: NextRequest) {
  const segredo = process.env.PLANNER_CRON_SECRET;
  if (!segredo || req.headers.get("x-cron-secret") !== segredo) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const sb = supabaseServico();
  const { data } = await sb.from("planner_sync_state").select("user_id, perfis(email, ativo)").eq("data->>enabled", "true");
  const resultados: Record<string, string> = {};
  for (const linha of data || []) {
    const perfil = linha.perfis as unknown as { email: string; ativo: boolean } | null;
    if (!perfil?.ativo) continue;
    const r = await sincronizar(linha.user_id, "cron", perfil.email);
    resultados[perfil.email] = r.ocupado ? "ocupado" : r.mensagem;
  }
  return NextResponse.json({ ok: true, resultados });
}
