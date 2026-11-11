import { NextResponse, type NextRequest } from "next/server";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { SITUACOES, mesAtual, type Recebivel } from "@/lib/recebiveis";
import { hojeSP } from "@/lib/formato";

// Planilha (CSV no padrão do Excel em português: separador ";" e vírgula decimal).
export async function GET(request: NextRequest) {
  if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar", request.url));
  const aba = request.nextUrl.searchParams.get("aba") ?? "vencidos";
  const estado = aba === "a_vencer" ? "a_vencer" : aba === "recebidos" ? "recebido" : "vencido";
  const hoje = hojeSP();
  const sb = await supabaseUsuario();
  let q = sb.from("recebiveis").select("*").eq("estado", estado).order("vencimento").limit(10000);
  if (estado === "recebido") {
    const { inicio, fim } = mesAtual(hoje);
    q = q.gte("recebido_em", inicio).lte("recebido_em", fim);
  }
  const { data, error } = await q;
  if (error) return new NextResponse("Não foi possível gerar a planilha.", { status: 500 });

  const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const num = (v: number | null) => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));
  const cel = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = ["Cliente", "Projeto", "Título (Flow)", "Vencimento", "Dias em atraso", "Valor", "Recebido", "Em aberto",
    "Situação no Flow", "Cobrança", "Previsão", "Motivo", "Atualizado por", "Recebido em"];
  const linhas = (data as Recebivel[]).map((t) => [
    t.cliente, t.codigo_projeto, t.flow_id, br(t.vencimento), t.dias_atraso ?? "", num(t.valor), num(t.valor_recebido),
    num(t.valor_aberto), t.situacao_flow, SITUACOES[t.cobranca_situacao]?.rotulo, br(t.previsao), t.motivo,
    t.alterado_por, br(t.recebido_em),
  ].map(cel).join(";"));
  const csv = "﻿" + [cabecalho.join(";"), ...linhas].join("\r\n");
  const nome = { vencido: "vencidos", a_vencer: "a-vencer", recebido: "recebidos-no-mes" }[estado];
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recebiveis-${nome}-${hoje}.csv"`,
    },
  });
}
