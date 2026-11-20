import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDoCliente } from "@/lib/clientes";
import { data as fmtData, moeda } from "@/lib/formato";
import { COLUNAS } from "@/lib/tipos";
import { BotaoTarefa } from "@/components/BotaoTarefa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cliente" };

const ESTADO: Record<string, [string, string]> = { vencido: ["Vencido", "vermelho"], a_vencer: ["A vencer", "azul"], recebido: ["Recebido", "verde"], excluido: ["Excluído", "cinza"] };
const zap = (t: string | null) => { const d = (t ?? "").replace(/\D/g, ""); if (d.length < 10) return null; return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`; };

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id: bruto } = await params;
  const id = decodeURIComponent(bruto).slice(0, 80);
  const f = await fichaDoCliente(id);
  if (!f) notFound();
  const nome = f.apelido || f.nome;
  const abertos = f.titulos.filter((t) => t.estado === "vencido" || t.estado === "a_vencer");
  const vencido = f.titulos.filter((t) => t.estado === "vencido").reduce((s, t) => s + Number(t.valor_aberto || 0), 0);
  const aberto = abertos.reduce((s, t) => s + Number(t.valor_aberto || 0), 0);
  const recebido = f.titulos.reduce((s, t) => s + Number(t.valor_recebido || 0), 0);
  const painelPor = new Map(f.painel.map((p) => [p.flow_id, p]));
  const coluna = (c: string | undefined) => COLUNAS.find((x) => x.id === c)?.rotulo ?? "—";
  const link = zap(f.telefone);
  const titulosVisiveis = f.titulos.filter((t) => t.estado !== "excluido");

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/clientes">← Clientes</Link></p>
      <div className="cabecalho" style={{ flexWrap: "wrap" }}>
        <div>
          <h1>{nome}</h1>
          <p className="sub">{[f.apelido && f.nome !== f.apelido ? f.nome : null, f.doc].filter(Boolean).join(" · ") || " "}</p>
          <p className="pequeno" style={{ margin: 0, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {f.telefone && <span>📞 {f.telefone}{link && <> · <a href={link} target="_blank" rel="noopener">WhatsApp</a></>}</span>}
            {f.email && <span>✉️ <a href={`mailto:${f.email}`}>{f.email}</a></span>}
          </p>
        </div>
        <BotaoTarefa className="botao secundario pequeno" titulo={`${nome}: `} link={{ href: `/clientes/${encodeURIComponent(id)}`, rotulo: `Cliente ${nome}`.slice(0, 140) }} />
      </div>

      <div className="resumo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="indicador"><div className="rotulo">Em aberto</div><div className="numero" style={{ fontSize: "1.3rem" }}>{moeda(aberto)}</div><div className="detalhe">{abertos.length} título{abertos.length === 1 ? "" : "s"}</div></div>
        <div className="indicador"><div className="rotulo">Vencido</div><div className="numero" style={{ fontSize: "1.3rem", ...(vencido ? { color: "var(--perigo)" } : {}) }}>{moeda(vencido)}</div></div>
        <div className="indicador"><div className="rotulo">Já recebido</div><div className="numero" style={{ fontSize: "1.3rem" }}>{moeda(recebido)}</div></div>
        <div className="indicador"><div className="rotulo">Pedidos</div><div className="numero">{f.pedidos.length}</div><div className="detalhe">{f.cards.length ? `${f.cards.length} no financiamento` : " "}</div></div>
      </div>

      <section className="cartao" style={{ marginTop: 16 }}>
        <h2>Pedidos e obras</h2>
        {f.pedidos.length === 0 ? <p className="mudo">Nenhum pedido de venda deste cliente no Flow.</p> : (
          <div className="tabela-caixa"><table>
            <thead><tr><th>Pedido</th><th>Projeto</th><th>Data</th><th>Valor</th><th>Obra (OS)</th><th>Nota</th><th>Situação</th><th>Recebido</th></tr></thead>
            <tbody>{f.pedidos.map((p) => { const l = painelPor.get(p.flow_id); return (
              <tr key={p.flow_id}>
                <td>{p.numero ?? p.flow_id}</td>
                <td>{p.codigo_projeto ?? "—"}</td>
                <td>{fmtData(p.data_pedido)}</td>
                <td>{moeda(Number(l?.valor_total ?? p.valor_total ?? 0))}</td>
                <td className="pequeno">{l?.os_status ?? "—"}</td>
                <td>{l?.nf_numero ? <>NF {l.nf_numero}<div className="pequeno mudo">{fmtData(l.nf_emitida_em)}</div></> : "—"}</td>
                <td>{l ? <Link href="/painel">{coluna(l.coluna)}</Link> : "—"}{l?.coluna === "pronto_faturar" && l.dias_parado != null ? <div className="pequeno atrasado">{l.dias_parado} dias parado</div> : null}</td>
                <td>{l?.pct_recebido != null ? `${Math.round(Number(l.pct_recebido))}%` : "—"}</td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </section>

      {f.cards.length > 0 && (
        <section className="cartao" style={{ marginTop: 16 }}>
          <div className="cabecalho" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Financiamento e confirmação</h2><a href="/financiamento" className="pequeno">Abrir →</a></div>
          <div className="tabela-caixa"><table>
            <thead><tr><th>Coluna</th><th>Card</th><th>Valor</th><th>Vendedor</th><th>Entrou em</th></tr></thead>
            <tbody>{f.cards.map((c, i) => (
              <tr key={i}><td>{c.coluna}</td><td>{c.titulo}{c.obs && <div className="pequeno mudo">{c.obs}</div>}</td><td>{moeda(c.valor)}</td><td>{c.vendedor ?? "—"}</td><td>{fmtData(c.entrada)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      <section className="cartao" style={{ marginTop: 16 }}>
        <div className="cabecalho" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Títulos</h2>
          <Link href={`/recebiveis?${new URLSearchParams({ aba: vencido ? "vencidos" : "a_vencer", busca: nome })}`} className="pequeno">Abrir nos Recebíveis →</Link></div>
        {titulosVisiveis.length === 0 ? <p className="mudo">Nenhum título no Contas a Receber.</p> : (
          <div className="tabela-caixa"><table>
            <thead><tr><th>Vencimento</th><th>Projeto</th><th>Valor</th><th>Em aberto</th><th>Situação</th><th>Cobrança</th></tr></thead>
            <tbody>{titulosVisiveis.map((t) => (
              <tr key={t.flow_id}>
                <td className={t.estado === "vencido" ? "atrasado" : ""}>{fmtData(t.vencimento)}{t.estado === "vencido" && t.dias_atraso ? <div className="pequeno">{t.dias_atraso} dias</div> : null}</td>
                <td>{t.codigo_projeto ?? "—"}</td>
                <td>{moeda(Number(t.valor))}</td>
                <td>{t.estado === "recebido" ? <span className="pequeno mudo">recebido {fmtData(t.recebido_em)}</span> : moeda(Number(t.valor_aberto))}</td>
                <td><span className={`etiqueta ${ESTADO[t.estado]?.[1] ?? "cinza"}`}>{ESTADO[t.estado]?.[0] ?? t.estado}</span>{t.financiamento ? <div className="pequeno mudo">financiamento</div> : null}</td>
                <td className="pequeno">{t.estado === "vencido" ? <>{t.previsao ? `previsão ${fmtData(t.previsao)}` : "sem previsão"}{t.motivo ? <div className="mudo">{t.motivo}</div> : null}</> : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
