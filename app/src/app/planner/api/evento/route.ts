import type { NextRequest } from "next/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const e = await req.json().catch(() => null);
  if (!e || !ID.test(String(e.id || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ""))) return ok({ erro: "Evento inválido." });
  const ev = { id: e.id, title: String(e.title || "").slice(0, 300), date: e.date, kind: e.kind === "holiday" ? "holiday" : "important", yearly: !!e.yearly };
  const { error } = await new DadosPlanner(p.id).sb.from("planner_events")
    .upsert({ user_id: p.id, id: ev.id, data: ev, atualizado_em: new Date().toISOString() });
  return ok(error ? { erro: "Não foi possível salvar o evento." } : { evento: ev });
}

export async function DELETE(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!ID.test(id)) return ok({ erro: "Evento inválido." });
  await new DadosPlanner(p.id).sb.from("planner_events").delete().eq("user_id", p.id).eq("id", id);
  return ok();
}
