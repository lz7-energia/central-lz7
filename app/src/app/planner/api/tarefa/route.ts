import type { NextRequest } from "next/server";
import { DadosPlanner, mesclarDoNavegador } from "@/lib/planner/dados";
import { naoAutorizado, ok, pessoa } from "@/lib/planner/acesso";

export const dynamic = "force-dynamic";
const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Salva uma tarefa vinda do navegador (os campos de sincronização continuam os do servidor). */
export async function POST(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const t = await req.json().catch(() => null);
  if (!t || typeof t !== "object" || !ID.test(String(t.id || ""))) return ok({ erro: "Tarefa inválida." });
  if (JSON.stringify(t).length > 900_000) return ok({ erro: "Tarefa grande demais." });
  const d = new DadosPlanner(p.id);
  const salva = mesclarDoNavegador(t, await d.tarefa(t.id));
  await d.gravarTarefa(salva);
  return ok({ tarefa: salva });
}

/** Exclui: se estava ligada ao ClickUp (e a sincronização está ligada), entra na fila de exclusão lá e em "deleted". */
export async function DELETE(req: NextRequest) {
  const p = await pessoa();
  if (!p) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!ID.test(id)) return ok({ erro: "Tarefa inválida." });
  const d = new DadosPlanner(p.id);
  const t = await d.tarefa(id);
  if (!t) return ok();
  const sync = await d.sync();
  if (t.clickupId && sync.enabled && !(sync.noPush || []).includes(t.clickupId)) {
    await d.mudarSync((s: Record<string, string[]>) => ({
      ...s,
      deleted: [...new Set([...(s.deleted || []), t.clickupId])],
      pendingDeletes: [...new Set([...(s.pendingDeletes || []), t.clickupId])],
    }));
  }
  const caminhos = (t.files || []).map((f: { path?: string }) => f.path).filter(Boolean) as string[];
  if (caminhos.length) await d.sb.storage.from("planner-anexos").remove(caminhos);
  await d.apagarTarefa(id);
  return ok();
}
