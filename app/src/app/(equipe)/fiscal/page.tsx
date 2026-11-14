import type { Metadata } from "next";
import Link from "next/link";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import { dataHora, hojeSP } from "@/lib/formato";
import { PRIMEIRO_MES, TABELAS, conferir, mesesDesde, nomeMes, totais, type ApuracaoEscritorio, type Nota, type NotaEscritorio } from "@/lib/fiscal";
import { BotaoSincronizar, Conferencia, ImportarEscritorio, TabelaFiscal, Pendentes } from "./Componentes";

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
  const [{ data: notas }, { data: ult }, { data: log }, { data: escNotas }, { data: escApur }] = await Promise.all([
    todasAsLinhas<Nota>((de, ate) => sb.from("fiscal_notas").select("*").eq("competencia", mes).order("data_emissao").order("numero").range(de, ate)),
    sb.from("sincronizacoes").select("terminada_em, sucesso, erro").eq("recurso", "fiscal").not("terminada_em", "is", null).order("id", { ascending: false }).limit(1).maybeSingle(),
    sb.from("fiscal_log").select("em, numero, texto").order("em", { ascending: false }).limit(15),
    todasAsLinhas<NotaEscritorio>((de, ate) => sb.from("fiscal_escritorio_notas").select("*").eq("competencia", mes).order("id").range(de, ate)),
    sb.from("fiscal_escritorio_apuracao").select("*").eq("competencia", mes),
  ]);
  const apur = Object.fromEntries(((escApur ?? []) as ApuracaoEscritorio[]).map((a) => [a.tributo, a])) as Partial<Record<"pis" | "cofins", ApuracaoEscritorio>>;
  const temEscritorio = (escNotas ?? []).length > 0 || Object.keys(apur).length > 0;
  const todas = (notas ?? []) as Nota[];
  const T = totais(todas);
  const divergencias = temEscritorio ? conferir(todas, (escNotas ?? []) as NotaEscritorio[]) : [];
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
        <div className="fis-card destaque"><span>PIS a pagar · tomando crédito</span><strong>{brl(T.comCredito.pis)}</strong><small>não cumulativo{T.cumulativo.pis ? ` · + ${brl(T.cumulativo.pis)} cumulativo (serviços)` : ""}</small></div>
        <div className="fis-card destaque"><span>COFINS a pagar · tomando crédito</span><strong>{brl(T.comCredito.cofins)}</strong><small>não cumulativo{T.cumulativo.cofins ? ` · + ${brl(T.cumulativo.cofins)} cumulativo (serviços)` : ""}</small></div>
        <div className="fis-card sim"><span>Sem tomar crédito</span><strong>{brl(T.semCredito.pis)} · {brl(T.semCredito.cofins)}</strong><small>PIS · COFINS só sobre as vendas de produtos</small></div>
        <div className="fis-card sim"><span>Crédito aproveitado</span><strong>{brl(T.credito.pis + T.credito.cofins)}</strong><small>{T.credito.qtd} compras tomam crédito · {T.semCreditoQtd} não tomam</small></div>
        <Link href={link({ status: filtro === "pendente" ? "" : "pendente" })} className={`fis-card contador${T.pendentes ? " alerta" : ""}${filtro === "pendente" ? " sel" : ""}`}><span>A decidir</span><strong>{T.pendentes}</strong><small>fora dos totais · clique para filtrar</small></Link>
        <Link href={link({ status: filtro === "divergente" ? "" : "divergente" })} className={`fis-card contador${T.divergentes ? " aviso" : ""}${filtro === "divergente" ? " sel" : ""}`}><span>Divergentes</span><strong>{T.divergentes}</strong><small>nossas notas: calculado × informado</small></Link>
      </div>

      <section className="cartao fis-tabela">
        <h2>Conferência com o escritório</h2>
        <p className="mudo pequeno" style={{ marginTop: 0 }}>
          Envie os PDFs que o escritório manda (relação de entradas e saídas de PIS e de COFINS, memória de cálculo e DARF). A central compara com as notas do mês.
        </p>
        <ImportarEscritorio />
        {temEscritorio && (<>
          <div className="tabela-caixa" style={{ marginTop: 14 }}><table>
            <thead><tr><th></th><th className="num">PIS escritório</th><th className="num">PIS central</th><th className="num">COFINS escritório</th><th className="num">COFINS central</th></tr></thead>
            <tbody>
              {([
                ["Débito das vendas (não cumulativo)", apur.pis?.debito_nc, T.debito.pis, apur.cofins?.debito_nc, T.debito.cofins],
                ["− Crédito das compras", apur.pis?.credito, T.credito.pis, apur.cofins?.credito, T.credito.cofins],
                ["= Não cumulativo a pagar", apur.pis?.nc_a_pagar, T.comCredito.pis, apur.cofins?.nc_a_pagar, T.comCredito.cofins],
                ["Guia (DARF) não cumulativo", apur.pis?.darf_nc, null, apur.cofins?.darf_nc, null],
                ["Cumulativo (serviços)", apur.pis?.cumulativo_a_pagar, T.cumulativo.pis, apur.cofins?.cumulativo_a_pagar, T.cumulativo.cofins],
              ] as [string, number | null | undefined, number | null, number | null | undefined, number | null][]).map(([rot, pe, pc, ce, cc]) => (
                <tr key={rot}>
                  <td>{rot}</td>
                  <td className="num">{pe === null || pe === undefined ? "—" : brl(Number(pe))}</td>
                  <td className={`num${pc !== null && pe != null && Math.abs(pc - Number(pe)) > 0.05 ? " fis-difere" : ""}`}>{pc === null ? "" : brl(pc)}</td>
                  <td className="num">{ce === null || ce === undefined ? "—" : brl(Number(ce))}</td>
                  <td className={`num${cc !== null && ce != null && Math.abs(cc - Number(ce)) > 0.05 ? " fis-difere" : ""}`}>{cc === null ? "" : brl(cc)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <h3 style={{ margin: "16px 0 8px" }}>Diferenças nota a nota</h3>
          <Conferencia divergencias={divergencias} />
        </>)}
      </section>

      <div className="fis-filtro">
        <span className="mudo pequeno">Mostrar:</span>
        {[["", "Todas"], ["ok", "Ok"], ["divergente", "Divergentes"], ["pendente", "Pendentes"]].map(([v, t]) => (
          <Link key={v} href={link({ status: v })} className={filtro === v ? "ativo" : ""}>{t}</Link>
        ))}
      </div>

      {(!filtro || filtro === "pendente") && <Pendentes notas={visiveis.filter((n) => n.status === "pendente")} />}

      {TABELAS.slice(0, 4).map((tb) => <TabelaFiscal key={tb.id} tabela={tb} notas={visiveis.filter((n) => n.categoria === tb.id && n.status !== "pendente" && n.status !== "cancelada")} total={T.t[tb.id]} />)}

      <section className="cartao fis-tabela">
        <h2>Tabela 5 — Apuração</h2>
        <div className="tabela-caixa"><table>
          <thead><tr><th></th><th className="num">PIS</th><th className="num">COFINS</th></tr></thead>
          <tbody>
            <tr><td>Vendas de produtos (Tabela 1) — 1,65% / 7,60%</td><td className="num">{brl(T.debito.pis)}</td><td className="num">{brl(T.debito.cofins)}</td></tr>
            <tr><td>− Crédito das compras que tomam crédito (Tabela 3)</td><td className="num">{brl(T.credito.pis)}</td><td className="num">{brl(T.credito.cofins)}</td></tr>
            <tr className="fis-total"><td>Não cumulativo a pagar{T.comCredito.pis < 0 ? " (saldo credor)" : ""}</td><td className="num">{brl(T.comCredito.pis)}</td><td className="num">{brl(T.comCredito.cofins)}</td></tr>
            <tr><td>Cumulativo — notas de serviço (Tabela 2), guia separada</td><td className="num">{brl(T.cumulativo.pis)}</td><td className="num">{brl(T.cumulativo.cofins)}</td></tr>
            <tr><td className="mudo">Para comparar: sem tomar crédito</td><td className="num mudo">{brl(T.semCredito.pis)}</td><td className="num mudo">{brl(T.semCredito.cofins)}</td></tr>
          </tbody>
        </table></div>
        <p className="mudo pequeno" style={{ margin: "8px 0 0" }}>Entradas de serviço (Tabela 4) e Despesas (Tabela 6) não geram crédito.</p>
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
