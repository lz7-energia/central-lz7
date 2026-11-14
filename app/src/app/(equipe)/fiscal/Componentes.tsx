"use client";

import { Fragment, useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Divergencia, Nota, TABELAS } from "@/lib/fiscal";
import { decidir, importarEscritorio, marcarCredito, sincronizarAgora, type Resultado } from "./acoes";

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "Não informado" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const ni = (v: unknown) => (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) ? "Não informado" : Array.isArray(v) ? v.join(", ") : String(v));
const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "Não informado");
const nomeTipo: Record<string, string> = { nfe: "NF-e", nfse: "NFS-e", resumo: "Resumo/DANFE" };

export function BotaoSincronizar() {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [r, setR] = useState<Resultado>({});
  return (
    <div style={{ textAlign: "right" }}>
      <button className="botao" disabled={pend} onClick={() => iniciar(async () => { setR({}); const x = await sincronizarAgora(); setR(x); router.refresh(); })}>
        {pend ? "Sincronizando… (pode levar 1 minuto)" : "Sincronizar agora"}
      </button>
      {r.ok && <div className="pequeno" style={{ color: "var(--marca)", marginTop: 6, maxWidth: 420 }}>{r.ok}</div>}
      {r.erro && <div className="pequeno" style={{ color: "var(--perigo)", marginTop: 6, maxWidth: 420 }}>{r.erro}</div>}
    </div>
  );
}

function Detalhe({ n }: { n: Nota }) {
  return (
    <div className="fis-detalhe">
      {n.motivo && <p className={`fis-motivo ${n.status}`}>{n.motivo}</p>}
      <dl>
        <div><dt>Documento</dt><dd>{nomeTipo[n.tipo_doc] ?? n.tipo_doc} nº {n.numero}{n.xml_completo ? "" : " · sem XML completo"}</dd></div>
        <div><dt>Emissão</dt><dd>{dataBr(n.data_emissao)}</dd></div>
        <div><dt>Emitente</dt><dd>{ni(n.emitente_nome)}<br /><span className="mudo">{ni(n.emitente_cnpj)}</span></dd></div>
        <div><dt>Destinatário</dt><dd>{ni(n.dest_nome)}<br /><span className="mudo">{ni(n.dest_cnpj)}</span></dd></div>
        <div><dt>CFOP</dt><dd>{ni(n.cfops)}</dd></div>
        <div><dt>CST/CSOSN</dt><dd>{ni(n.csts)}</dd></div>
        <div><dt>NCM</dt><dd>{ni(n.ncms)}</dd></div>
        <div><dt>Itens / serviço</dt><dd>{ni(n.descricao)}</dd></div>
        <div><dt>Valor dos produtos</dt><dd>{brl(n.valor_produtos)}</dd></div>
        <div><dt>Valor dos serviços</dt><dd>{brl(n.valor_servicos)}</dd></div>
        <div><dt>Valor total</dt><dd>{brl(n.valor_total)}</dd></div>
        <div><dt>Base de cálculo</dt><dd>{brl(n.base_calculo)}</dd></div>
        {n.direcao === "entrada" && n.tipo_doc !== "nfse" && <div><dt>Base do crédito (itens)</dt><dd>{brl(n.base_credito)}</dd></div>}
        <div><dt>PIS informado</dt><dd>{brl(n.pis_xml)}</dd></div>
        <div><dt>COFINS informado</dt><dd>{brl(n.cofins_xml)}</dd></div>
        <div><dt>ICMS informado</dt><dd>{brl(n.icms_xml)}</dd></div>
        <div><dt>IPI informado</dt><dd>{brl(n.ipi_xml)}</dd></div>
        <div><dt>ISS informado</dt><dd>{brl(n.iss_xml)}</dd></div>
        <div><dt>Chave</dt><dd className="fis-chave">{ni(n.chave)}</dd></div>
      </dl>
      {n.correcoes?.length > 0 && (
        <div className="fis-cce"><strong>Cartas de correção</strong>{n.correcoes.map((c, i) => <p key={i}>Nº {c.numero}{c.data ? ` · ${dataBr(c.data.slice(0, 10))}` : ""}: {c.texto || "texto não informado"}</p>)}</div>
      )}
      {n.decisao && n.decidido_em && <p className="mudo pequeno">Decisão “{n.decisao === "modelo" ? "lançar pelo modelo fixo" : n.decisao === "despesas" ? "mover para Despesas" : "aguardar o XML"}” registrada em {new Date(n.decidido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>}
    </div>
  );
}

type Tab = (typeof TABELAS)[number];
export function TabelaFiscal({ tabela, notas, total }: { tabela: Tab; notas: Nota[]; total: { qtd: number; valor: number; pis: number; cofins: number; icms: number; ipi: number; iss: number } }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const cols = tabela.colunas;
  const credito = tabela.id === "entrada_produtos";
  const nomeCol: Record<string, string> = credito ? { pis: "Crédito PIS", cofins: "Crédito COFINS", icms: "ICMS", ipi: "IPI" } : { pis: "PIS", cofins: "COFINS", icms: "ICMS", ipi: "IPI", iss: "ISS", piscofins: "PIS/COFINS" };
  const val = (n: Nota, c: string) => (c === "piscofins" ? (n.pis ?? 0) + (n.cofins ?? 0) : (n as never)[c]);
  const tot = (c: string) => (c === "piscofins" ? total.pis + total.cofins : (total as never)[c]);
  return (
    <section className="cartao fis-tabela">
      <h2>Tabela {tabela.n} — {tabela.titulo} <span className="mudo pequeno">({notas.length})</span></h2>
      {notas.length === 0 ? <p className="mudo pequeno" style={{ margin: 0 }}>Nenhuma nota neste mês.</p> : (
        <div className="tabela-caixa"><table>
          <thead><tr><th>Discriminação</th>{credito && <th>Crédito</th>}<th className="num">{tabela.id.startsWith("saida") ? "Valor de saída" : "Valor"}</th>{cols.map((c) => <th key={c} className="num">{nomeCol[c]}</th>)}<th></th></tr></thead>
          <tbody>
            {notas.map((n) => (
              <Fragment key={n.id}>
                <tr className={`fis-linha st-${n.status}`} onClick={() => setAberta(aberta === n.id ? null : n.id)}>
                  <td>
                    <strong>NF {n.numero}</strong> · {n.direcao === "saida" ? n.dest_nome || "Não informado" : n.emitente_nome || "Não informado"}
                    <div className="mudo pequeno">{dataBr(n.data_emissao)}{n.cfops?.length ? ` · CFOP ${n.cfops.join(", ")}` : ""}{n.correcoes?.length ? " · tem carta de correção" : ""}</div>
                  </td>
                  {credito && <td onClick={(e) => e.stopPropagation()}><BotaoCredito n={n} /></td>}
                  <td className="num">{brl(n.valor_total)}</td>
                  {cols.map((c) => <td key={c} className="num">{brl(val(n, c))}{n.status === "divergente" && (c === "pis" || c === "cofins") && <div className="fis-inf">inf. {brl(c === "pis" ? n.pis_xml : n.cofins_xml)}</div>}</td>)}
                  <td>{n.status === "divergente" && <span className="fis-tag div">Divergente</span>}<span className="fis-seta">{aberta === n.id ? "▴" : "▾"}</span></td>
                </tr>
                {aberta === n.id && <tr className="fis-aberta"><td colSpan={cols.length + (credito ? 4 : 3)}><Detalhe n={n} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr className="fis-total"><td>Total</td>{credito && <td></td>}<td className="num">{brl(total.valor)}</td>{cols.map((c) => <td key={c} className="num">{brl(tot(c))}</td>)}<td></td></tr></tfoot>
        </table></div>
      )}
    </section>
  );
}

export function Pendentes({ notas }: { notas: Nota[] }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [aberta, setAberta] = useState<number | null>(null);
  const [msg, setMsg] = useState<Resultado>({});
  if (!notas.length) return null;
  const agir = (id: number, d: "modelo" | "despesas" | "aguardar") => iniciar(async () => { const r = await decidir(id, d); setMsg(r); router.refresh(); });
  return (
    <section className="cartao fis-tabela fis-pendentes">
      <h2>Pendentes de confirmação <span className="mudo pequeno">({notas.length}) · fora dos totais até decidir</span></h2>
      {msg.erro && <div className="erro">{msg.erro}</div>}
      {msg.ok && <div className="ok">{msg.ok}</div>}
      {notas.map((n) => (
        <div key={n.id} className="fis-pend">
          <div className="fis-pend-topo" onClick={() => setAberta(aberta === n.id ? null : n.id)}>
            <div>
              <strong>NF {n.numero}</strong> · {n.direcao === "saida" ? n.dest_nome : n.emitente_nome} · {brl(n.valor_total)}
              <div className="fis-motivo pendente">{n.motivo}</div>
              {n.decisao === "aguardar" && <div className="mudo pequeno">Aguardando o XML completo (decidido em {n.decidido_em ? new Date(n.decidido_em).toLocaleDateString("pt-BR") : "—"}).</div>}
            </div>
            <span className="fis-seta">{aberta === n.id ? "▴" : "▾"}</span>
          </div>
          <div className="fis-pend-acoes">
            {n.direcao === "entrada" && n.base_credito !== null && n.xml_completo ? (<>
              <button className="botao pequeno" disabled={pend} onClick={() => iniciar(async () => { setMsg(await marcarCredito([n.id], true)); router.refresh(); })}>Toma crédito</button>
              <button className="botao secundario pequeno" disabled={pend} onClick={() => iniciar(async () => { setMsg(await marcarCredito([n.id], false)); router.refresh(); })}>Não toma crédito</button>
            </>) : <>
            <button className="botao pequeno" disabled={pend} onClick={() => agir(n.id, "modelo")}>{n.direcao === "entrada" ? "Lançar com crédito (valor total)" : "Lançar pelo modelo fixo"}</button>
            <button className="botao secundario pequeno" disabled={pend} onClick={() => agir(n.id, "aguardar")}>Aguardar o XML</button>
            <button className="botao secundario pequeno" disabled={pend} onClick={() => agir(n.id, "despesas")}>Mover para Despesas</button>
            </>}
          </div>
          {aberta === n.id && <Detalhe n={n} />}
        </div>
      ))}
    </section>
  );
}

const ORIGEM: Record<string, string> = { regra: "pela regra", historico: "como nas notas anteriores do fornecedor", escritorio: "seguindo o escritório", manual: "marcado na tela" };

/** Chave "toma / não toma crédito" na linha da Tabela 3. */
function BotaoCredito({ n }: { n: Nota }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const trocar = () => iniciar(async () => { await marcarCredito([n.id], !n.credito); router.refresh(); });
  return (
    <div className="fis-credito">
      <button type="button" className={`fis-chip ${n.credito ? "sim" : "nao"}`} disabled={pend} onClick={trocar} title="Clique para trocar">
        {pend ? "…" : n.credito ? "Toma" : "Não toma"}
      </button>
      {n.credito_origem && <div className="mudo pequeno">{ORIGEM[n.credito_origem]}</div>}
    </div>
  );
}

/** Envio dos PDFs do escritório (relação de entradas e saídas, memória de cálculo, DARF). */
export function ImportarEscritorio() {
  const router = useRouter();
  const [r, enviar, pend] = useActionState(async (s: Resultado, fd: FormData) => { const x = await importarEscritorio(s, fd); router.refresh(); return x; }, {});
  return (
    <form action={enviar} className="fis-importar">
      <input type="file" name="arquivos" accept="application/pdf" multiple required />
      <button className="botao" disabled={pend}>{pend ? "Lendo os PDFs…" : "Enviar relatórios do escritório"}</button>
      {r.ok && <div className="ok">{r.ok}</div>}
      {r.erro && <div className="erro">{r.erro}</div>}
    </form>
  );
}

const TITULO_DIV: Record<Divergencia["tipo"], string> = {
  credito_so_escritorio: "O escritório tomou crédito e a central não",
  credito_so_central: "A central toma crédito e o escritório não",
  fora_do_escritorio: "Com crédito na central, mas fora do relatório do escritório (candidatas à compensação)",
  base_diferente: "Base do crédito diferente",
  saida_so_escritorio: "Vendas só no relatório do escritório",
  saida_so_central: "Vendas só na central",
  saida_valor: "Vendas com valor diferente",
};

/** Lista de diferenças nota a nota, com "seguir o escritório". */
export function Conferencia({ divergencias }: { divergencias: Divergencia[] }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resultado>({});
  const seguir = (ids: number[], credito: boolean) => iniciar(async () => { setMsg(await marcarCredito(ids, credito, "escritorio")); router.refresh(); });
  const paraTomar = divergencias.filter((d) => d.tipo === "credito_so_escritorio" && d.notaId).map((d) => d.notaId!);
  const paraTirar = divergencias.filter((d) => d.tipo === "credito_so_central" && d.notaId).map((d) => d.notaId!);
  if (!divergencias.length) return <p className="ok" style={{ margin: 0 }}>Nenhuma diferença nota a nota.</p>;
  const grupos = (Object.keys(TITULO_DIV) as Divergencia["tipo"][]).map((t) => [t, divergencias.filter((d) => d.tipo === t)] as const).filter(([, l]) => l.length);
  return (
    <div>
      {msg.erro && <div className="erro">{msg.erro}</div>}
      {msg.ok && <div className="ok">{msg.ok}</div>}
      {(paraTomar.length > 0 || paraTirar.length > 0) && (
        <div className="fis-pend-acoes" style={{ marginBottom: 12 }}>
          <button className="botao pequeno" disabled={pend} onClick={() => iniciar(async () => {
            const r1 = paraTomar.length ? await marcarCredito(paraTomar, true, "escritorio") : {};
            const r2 = paraTirar.length ? await marcarCredito(paraTirar, false, "escritorio") : {};
            setMsg(r1.erro || r2.erro ? { erro: r1.erro || r2.erro } : { ok: "Marcações do escritório aplicadas." }); router.refresh();
          })}>
            Seguir o escritório em todas ({paraTomar.length + paraTirar.length})
          </button>
        </div>
      )}
      {grupos.map(([t, l]) => (
        <div key={t} className="fis-conf-grupo">
          <h3>{TITULO_DIV[t]} <span className="mudo pequeno">({l.length})</span></h3>
          <div className="tabela-caixa"><table>
            <thead><tr><th>Nota</th><th className="num">Escritório</th><th className="num">Central</th><th></th></tr></thead>
            <tbody>{l.map((d, i) => (
              <tr key={i}>
                <td><strong>NF {d.numero}</strong> · {d.nome}<div className="mudo pequeno">{d.texto}</div></td>
                <td className="num">{d.escritorio === null ? "—" : brl(d.escritorio)}</td>
                <td className="num">{d.central === null ? "—" : brl(d.central)}</td>
                <td>{d.notaId && (d.tipo === "credito_so_escritorio" || d.tipo === "credito_so_central") &&
                  <button className="botao secundario pequeno" disabled={pend} onClick={() => seguir([d.notaId!], d.tipo === "credito_so_escritorio")}>Seguir o escritório</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}
