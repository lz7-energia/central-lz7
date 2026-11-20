import { NextResponse } from "next/server";
import { supabaseUsuario } from "@/lib/supabase/server";
import { pessoaObras } from "@/lib/obras";
import { refletirObraNoPlanner } from "@/lib/obras-planner";

export const dynamic = "force-dynamic";
const ok = (x: unknown, status = 200) => NextResponse.json(x, { status, headers: { "Cache-Control": "no-store" } });

/** Pagamento condicionado a uma parte da obra.
 *  acao "salvar": grava a lista (o banco confere quem pode: obras, equipe e admin) e refaz as tarefas no planner.
 *  acao "refletir": só refaz as tarefas (a tela chama depois de mudar datas da obra ou excluí-la). */
export async function POST(req: Request) {
  const p = await pessoaObras();
  if (!p) return ok({ erro: "Faça login de novo." }, 401);
  const b = await req.json().catch(() => null);
  const codigo = typeof b?.codigo === "string" ? b.codigo.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9-]{3,30}$/.test(codigo)) return ok({ erro: "Obra inválida." }, 400);

  if (b?.acao === "salvar") {
    if (!Array.isArray(b.lista)) return ok({ erro: "Pedido inválido." }, 400);
    const sb = await supabaseUsuario();
    const { error } = await sb.rpc("obra_salvar_pagamentos", { p_codigo: codigo, p_lista: b.lista });
    if (error) return ok({ erro: error.code === "42501" || error.code === "22023" ? error.message : "Não foi possível salvar o pagamento." }, error.code === "42501" ? 403 : 400);
  } else if (b?.acao !== "refletir") return ok({ erro: "Pedido inválido." }, 400);

  try { await refletirObraNoPlanner(codigo); } catch { return ok({ ok: true, aviso: "Salvo, mas o planner não foi atualizado agora; ele se acerta na próxima rodada." }); }
  return ok({ ok: true });
}
