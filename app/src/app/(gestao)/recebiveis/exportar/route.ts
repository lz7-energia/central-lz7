import { NextResponse, type NextRequest } from "next/server";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { GRUPOS, limitesDoPeriodo, nomesDoCliente, type Grupo, type Periodo, type Recebivel } from "@/lib/recebiveis";
import { hojeSP } from "@/lib/formato";
import { todasAsLinhas } from "@/lib/paginar";

// Planilha (CSV no padrão do Excel em português: separador ";" e vírgula decimal).
export async function GET(request: NextRequest) {
  if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar", request.url));
  const aba = request.nextUrl.searchParams.get("aba") ?? "vencidos";
  const estado = aba === "a_vencer" ? "a_vencer" : aba === "recebidos" ? "recebido" : "vencido";
  const hoje = hojeSP();
  const sb = await supabaseUsuario();
  const periodo = (request.nextUrl.searchParams.get("periodo") ?? "mes") as Periodo;
  const montar = (de: number, ate: number) => {
    let q = sb.from("recebiveis").select("*").eq("estado", estado).order("vencimento").order("flow_id").range(de, ate);
    if (estado === "recebido" && periodo !== "todos") {
      q = q.gte("recebido_em", limitesDoPeriodo(hoje, periodo).inicio).lte("recebido_em", hoje);
    } else if (estado === "a_vencer") {
      q = q.lte("vencimento", limitesDoPeriodo(hoje, periodo).fim);
    }
    return q;
  };
  const [{ data, error }, { data: sits }] = await Promise.all([
    todasAsLinhas<Recebivel>(montar),
    sb.from("cobranca_situacoes").select("id, rotulo, grupo"),
  ]);
  const situacao = new Map((sits ?? []).map((x) => [x.id, x]));
  if (error) return new NextResponse("Não foi possível gerar a planilha.", { status: 500 });

  const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const num = (v: number | null) => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));
  const cel = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = ["Nome", "Razão social", "Projeto", "Título (Flow)", "Vencimento", "Dias em atraso", "Valor", "Recebido", "Em aberto",
    "Situação no Flow", "Cobrança", "Grupo", "Previsão", "Motivo", "Atualizado por", "Recebido em", "Baixa manual"];
  const linhas = data.map((t) => [
    nomesDoCliente(t).principal, t.cliente, t.codigo_projeto, t.flow_id, br(t.vencimento), t.dias_atraso ?? "", num(t.valor), num(t.valor_recebido),
    num(t.valor_aberto), t.situacao_flow, situacao.get(t.cobranca_situacao)?.rotulo ?? t.cobranca_situacao,
    GRUPOS[situacao.get(t.cobranca_situacao)?.grupo as Grupo]?.rotulo ?? "", br(t.previsao), t.motivo,
    t.alterado_por, br(t.recebido_em), t.baixa_manual ? `sim (${t.ajuste_por ?? ""}${t.baixa_obs ? ` · ${t.baixa_obs}` : ""})` : "",
  ].map(cel).join(";"));
  const csv = "﻿" + [cabecalho.join(";"), ...linhas].join("\r\n");
  const nome = { vencido: "vencidos", a_vencer: `a-vencer-${periodo}`, recebido: `recebidos-${periodo}` }[estado];
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recebiveis-${nome}-${hoje}.csv"`,
    },
  });
}
