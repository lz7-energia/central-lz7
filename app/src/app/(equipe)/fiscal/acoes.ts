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

/** "Toma crédito" / "Não toma" numa ou mais notas de entrada. origem "escritorio" = seguir o relatório do escritório. */
export async function marcarCredito(ids: number[], credito: boolean, origem: "manual" | "escritorio" = "manual"): Promise<Resultado> {
  if (!(await equipe())) return { erro: "Sessão expirada. Entre de novo." };
  if (!ids.length) return { erro: "Nenhuma nota selecionada." };
  const sb = await supabaseUsuario();
  const { data, error } = await sb.rpc("fiscal_marcar_credito", { p_ids: ids, p_credito: credito, p_origem: origem });
  if (error) return { erro: "Não foi possível marcar o crédito." };
  revalidatePath("/fiscal");
  return { ok: `${data ?? 0} nota(s) marcada(s): ${credito ? "toma crédito" : "não toma crédito"}.` };
}

/** Lê os PDFs do escritório (relação de entradas/saídas, memória de cálculo, DARF) e guarda para a conferência. */
export async function importarEscritorio(_: Resultado, fd: FormData): Promise<Resultado> {
  if (!(await equipe())) return { erro: "Sessão expirada. Entre de novo." };
  const arquivos = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) return { erro: "Escolha os PDFs do escritório." };
  const { lerRelatorioEscritorio, textoDoPdf } = await import("@/lib/fiscal-escritorio");
  const relacoes: unknown[] = [], memorias: unknown[] = [], darfs: unknown[] = [], lidos: string[] = [], ignorados: string[] = [];
  for (const f of arquivos) {
    if (f.size > 8 * 1024 * 1024) { ignorados.push(`${f.name} (maior que 8 MB)`); continue; }
    try {
      const r = lerRelatorioEscritorio(await textoDoPdf(new Uint8Array(await f.arrayBuffer())));
      if (r.tipo === "relacao" && r.notas.length) { relacoes.push(r); lidos.push(`${r.direcao === "entrada" ? "Entradas" : "Saídas"} ${r.tributo.toUpperCase()} (${r.notas.length} notas)`); }
      else if (r.tipo === "memoria") { memorias.push(r); lidos.push(`Memória de cálculo ${r.tributo.toUpperCase()}`); }
      else if (r.tipo === "darf") { darfs.push(r); lidos.push(`DARF ${r.itens.map((i) => i.codigo).join(", ")}`); }
      else ignorados.push(f.name);
    } catch { ignorados.push(f.name); }
  }
  if (!lidos.length) return { erro: `Nenhum relatório reconhecido${ignorados.length ? `: ${ignorados.join(", ")}` : ""}.` };
  const sb = await supabaseUsuario();
  const { error } = await sb.rpc("fiscal_importar_escritorio", { p: { relacoes, memorias, darfs } });
  if (error) return { erro: "Não foi possível guardar os relatórios." };
  revalidatePath("/fiscal");
  return { ok: `Lidos: ${lidos.join(" · ")}.${ignorados.length ? ` Não reconhecidos: ${ignorados.join(", ")}.` : ""}` };
}
