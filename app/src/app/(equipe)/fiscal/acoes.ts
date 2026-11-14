"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";

export type Resultado = { ok?: string; erro?: string };
const equipe = async () => { const p = await perfilAtual(); return p && p.ativo && (p.papel === "equipe" || p.papel === "admin") ? p : null; };

/** Decisão sobre nota pendente: lançar pelo modelo fixo, mover para Despesas ou aguardar o XML. Registra quem e quando. */
export async function decidir(id: number, decisao: "modelo" | "despesas" | "aguardar"): Promise<Resultado> {
  if (!(await equipe())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { error } = await sb.rpc("fiscal_decidir", { p_id: id, p_decisao: decisao });
  if (error) return { erro: "Não foi possível registrar a decisão." };
  revalidatePath("/fiscal");
  return { ok: decisao === "aguardar" ? "Marcada para aguardar o XML." : "Decisão registrada." };
}

/** Sincronizar agora: chama a Edge Function (só leitura no Flow). Cada execução baixa até 35 XMLs; chame de novo se faltar. */
export async function sincronizarAgora(): Promise<Resultado & { resumo?: Record<string, unknown> }> {
  if (!(await equipe())) return { erro: "Sessão expirada. Entre de novo." };
  const funcao = process.env.FISCAL_FUNCAO || "fiscal-sincronizar";
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${funcao}`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(170_000),
    });
    const j = await r.json().catch(() => ({}));
    revalidatePath("/fiscal");
    if (r.status === 429) return { ok: "Já há uma sincronização rodando. Aguarde um pouco." };
    if (!r.ok) return { erro: `A sincronização falhou${j.erro ? `: ${j.erro}` : ""}.` };
    const falta = Number(j.pendentesDeDownload) || 0;
    return { ok: `Sincronizado: ${j.recebidas ?? 0} recebidas, ${j.saidaProdutos ?? 0} de produto e ${j.saidaServicos ?? 0} de serviço emitidas.${falta ? ` Faltam ${falta} XMLs: clique de novo.` : ""}`, resumo: j };
  } catch {
    return { erro: "Não consegui falar com a sincronização. Tente de novo em instantes." };
  }
}
