import type { Metadata } from "next";
import Link from "next/link";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import { dataHora, hojeSP } from "@/lib/formato";
import { PRIMEIRO_MES, TABELAS, mesesDesde, nomeMes, totais, type Nota } from "@/lib/fiscal";
import { BotaoSincronizar, TabelaFiscal, Pendentes } from "./Componentes";

export const metadata: Metadata = { title: "PIS e COFINS" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Fiscal({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string }> }) {
  const sp = await searchParams;
  const atual = hojeSP().slice(0, 7);
  const meses = mesesDesde(PRIMEIRO_MES, atual < PRIMEIRO_MES ? PRIMEIRO_MES : atual);
  const mes = sp.mes && meses.includes(sp.mes) ? sp.mes : meses[meses.length - 1];
  const filtro = ["ok", "divergente", "pendente"].includes(sp.status ?? "") ? sp.status! : "";
  const sb = await supabaseUsuario();
  const [{ data: notas }, { data: ult }, { data: log }] = await Promise.all([
    todasAsLinhas<Nota>((de, ate) => sb.from("fiscal_notas").select("*").eq("competencia", mes).order("data_emissao").order("numero").range(de, ate)),
    sb.from("sincronizacoes").select("terminada_em, sucesso, erro").eq("recurso", "fiscal").not("terminada_em", "is", null).order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("fiscal_log").select("em, numero, texto").order("em", { ascending: false }).limit(15),
  ]);
  const todas = (notas ?? []) as Nota[];
  const T = totais(todas);
  const visiveis = filtro ? todas.filter((n) => n.status === filtro) : todas;
  const canceladas = todas.filter((n) => n.status === "cancelada");
  const link = (o: { status: string }) => `/fiscal?mes=${mes}${o.status ? `&status=${o.status}` : ""}`;

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/area/fiscal">← Fiscal</Link></p>
      <div className="arq-topo">
        <div>
          <h1>PIS e COFINS</h1>
          <p className="mudo" style={{ margin: 0 }}>
            Notas do Flow desde outubro/2026 · última sincronização {ult?.terminada_em ? dataHora(ult.terminada_em) : "—"}{ult && ult.sucesso === false ? " (com erro)" : ""}
          </p>
        </div>
        <BotaoSincronizar />
      </div>
      <div className="fis-aviso">
        <strong>Classificação automática operacional.</strong> Revise com o responsável fiscal antes de qualquer uso oficial.
        Notas sem classificação segura ficam como <em>pendentes</em> e fora dos totais até alguém decidir.
      </div>

      <div className="fis-meses">
        {meses.map((m) => <Link key={m} href={`/fiscal?mes=${m}`} className={m === mes ? "ativo" : ""}>{nomeMes(m)}</Link>)}
      </div>

      <div className="fis-cards">
        <div className="fis-card destaque"><span>PIS a pagar</span><strong>{brl(T.saldoPis)}</strong><small>Saldo da Tabela 5</small></div>
        <div className="fis-card destaque"><span>COFINS a pagar</span><strong>{brl(T.saldoCofins)}</strong><small>Saldo da Tabela 5</small></div>
        <div className="fis-card sim"><span>Se fosse não cumulativo (1,65% / 7,60%)</span><strong>{brl(T.naoCumulativo.pis)} · {brl(T.naoCumulativo.cofins)}</strong><small>Simulação: saídas − crédito das entradas de produtos</small></div>
        <div className="fis-card sim"><span>Se fosse cumulativo (0,65% / 3,00%)</span><strong>{brl(T.cumulativo.pis)} · {brl(T.cumulativo.cofins)}</strong><small>Simulação: sobre as saídas, sem créditos</small></div>
        <Link href={link({ status: filtro === "pendente" ? "" : "pendente" })} className={`fis-card contador${T.pendentes ? " alerta" : ""}${filtro === "pendente" ? " sel" : ""}`}><span>Pendentes de confirmação</span><strong>{T.pendentes}</strong><small>fora dos totais · clique para filtrar</small></Link>
        <Link href={link({ status: filtro === "divergente" ? "" : "divergente" })} className={`fis-card contador${T.divergentes ? " aviso" : ""}${filtro === "divergente" ? " sel" : ""}`}><span>Divergentes</span><strong>{T.divergentes}</strong><small>calculado × informado · clique para filtrar</small></Link>
      </div>
      <p className="mudo pequeno" style={{ marginTop: -6 }}>
        As simulações são só para comparar regimes. O cálculo oficial já segue a regra por tabela: produtos a 1,65% / 7,60%, saída de serviços a 0,65% / 3,00%.
      </p>

      <div className="fis-filtro">
        <span className="mudo pequeno">Mostrar:</span>
        {[["", "Todas"], ["ok", "Ok"], ["divergente", "Divergentes"], ["pendente", "Pendentes"]].map(([v, t]) => (
          <Link key={v} href={link({ status: v })} className={filtro === v ? "ativo" : ""}>{t}</Link>
        ))}
      </div>

      {(!filtro || filtro === "pendente") && <Pendentes notas={visiveis.filter((n) => n.status === "pendente")} />}

      {TABELAS.slice(0, 4).map((tb) => <TabelaFiscal key={tb.id} tabela={tb} notas={visiveis.filter((n) => n.categoria === tb.id && n.status !== "pendente" && n.status !== "cancelada")} total={T.t[tb.id]} />)}

      <section className="cartao fis-tabela">
        <h2>Tabela 5 — Diferença de imposto</h2>
        <div className="tabela-caixa"><table>
          <thead><tr><th></th><th className="num">PIS</th><th className="num">COFINS</th></tr></thead>
          <tbody>
            <tr><td>Saída de Produtos (Tabela 1)</td><td className="num">{brl(T.t.saida_produtos.pis)}</td><td className="num">{brl(T.t.saida_produtos.cofins)}</td></tr>
            <tr><td>+ Saída de Serviços (Tabela 2)</td><td className="num">{brl(T.t.saida_servicos.pis)}</td><td className="num">{brl(T.t.saida_servicos.cofins)}</td></tr>
            <tr><td>− Entrada de Produtos (Tabela 3)</td><td className="num">{brl(T.t.entrada_produtos.pis)}</td><td className="num">{brl(T.t.entrada_produtos.cofins)}</td></tr>
            <tr className="fis-total"><td>Saldo a pagar</td><td className="num">{brl(T.saldoPis)}</td><td className="num">{brl(T.saldoCofins)}</td></tr>
          </tbody>
        </table></div>
        <p className="mudo pequeno" style={{ margin: "8px 0 0" }}>Entradas de serviço (Tabela 4) e Despesas (Tabela 6) não entram no saldo.</p>
      </section>

      <TabelaFiscal tabela={TABELAS[4]} notas={visiveis.filter((n) => n.categoria === "despesas" && n.status !== "pendente" && n.status !== "cancelada")} total={T.t.despesas} />

      {canceladas.length > 0 && !filtro && (
        <section className="cartao fis-tabela">
          <h2>Canceladas no mês ({canceladas.length})</h2>
          <ul className="fis-lista">{canceladas.map((n) => <li key={n.id}>NF {n.numero} · {n.emitente_nome || n.dest_nome} · {n.justificativa_cancelamento || "motivo não informado"}</li>)}</ul>
        </section>
      )}
      {(log ?? []).length > 0 && (
        <section className="cartao fis-tabela">
          <h2>Histórico</h2>
          <ul className="fis-lista">{(log ?? []).map((l, i) => <li key={i}><span className="mudo">{dataHora(l.em)}</span> · {l.texto}{l.numero ? ` (NF ${l.numero})` : ""}</li>)}</ul>
        </section>
      )}
    </>
  );
}
