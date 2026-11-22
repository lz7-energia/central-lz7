"use client";

import { useMemo, useState, useTransition } from "react";
import type { LinhaPainel } from "@/lib/tipos";
import { moeda, data as fmtData, dataHora } from "@/lib/formato";
import { nomesDoCliente } from "@/lib/recebiveis";
import { definirResponsavel, desmarcarNota, marcarNota, mostrarCard, ocultarCard, ocultarObra } from "./acoes";

export type NotaAEmitir = {
  chave: string; flow_id: string | null; numero: string | null; codigo_projeto: string | null; cliente: string | null;
  cliente_apelido: string | null; valor_total: number | null; responsavel: string | null; os_numero: string | null; os_status: string | null;
  origem: "flow" | "cronograma" | "sem_pedido"; desde: string; aviso: string | null; dias: number;
};
export type ObraOculta = { codigo: string; cliente: string | null; alterado_por: string | null; alterado_em: string };
type Aba = "emitir" | "emitidas" | "ocultos";
type Periodo = "mes" | "anterior" | "ano" | "todos";

const DIAS_ALERTA = 5;
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const r = (fn: () => Promise<{ erro?: string }>, set: (e: string | null) => void) => async () => { set(null); const x = await fn(); if (x.erro) set(x.erro); };

export function Notas(p: {
  aEmitir: NotaAEmitir[]; emitidas: LinhaPainel[]; ocultos: LinhaPainel[]; obrasOcultas: ObraOculta[];
  responsavel: string | null; pessoas: { id: string; nome: string }[]; buscaInicial: string;
}) {
  const [aba, setAba] = useState<Aba>("emitir");
  const [busca, setBusca] = useState(p.buscaInicial);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const bate = (vals: (string | null)[]) => {
    const b = busca.trim().toLowerCase();
    return !b || vals.some((v) => v?.toLowerCase().includes(b));
  };
  const lista = useMemo(
    () => p.aEmitir.filter((l) => bate([l.codigo_projeto, l.cliente, l.cliente_apelido, l.numero, l.os_numero]))
      .sort((a, b) => b.dias - a.dias || String(a.cliente).localeCompare(String(b.cliente))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.aEmitir, busca],
  );
  const dataEmissao = (l: LinhaPainel) => (l.nf_emitida_em || (l.nota_manual ? l.alterado_em : null) || "").slice(0, 10);
  const noPeriodo = (d: string) => {
    if (periodo === "todos") return true;
    if (!d) return false;
    const h = hoje(), mes = h.slice(0, 7);
    if (periodo === "mes") return d.startsWith(mes);
    if (periodo === "ano") return d.startsWith(h.slice(0, 4));
    const [a, m] = mes.split("-").map(Number);
    return d.startsWith(m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`);
  };
  const emitidas = useMemo(
    () => p.emitidas.filter((l) => noPeriodo(dataEmissao(l)) && bate([l.codigo_projeto, l.cliente, l.cliente_apelido, l.numero, l.nf_numero]))
      .sort((a, b) => dataEmissao(b).localeCompare(dataEmissao(a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.emitidas, busca, periodo],
  );
  const doMes = p.emitidas.filter((l) => dataEmissao(l).startsWith(hoje().slice(0, 7)));
  const parados = p.aEmitir.filter((l) => l.dias >= DIAS_ALERTA).length;
  const comAviso = p.aEmitir.filter((l) => l.origem !== "flow").length;
  const totalOcultos = p.ocultos.length + p.obrasOcultas.length;

  return (
    <>
      <div className="resumo">
        <div className={`indicador${p.aEmitir.length ? " destaque" : ""}`}>
          <div className="rotulo">A emitir</div>
          <div className="numero">{p.aEmitir.length}</div>
          <div className="detalhe">{moeda(p.aEmitir.reduce((s, l) => s + Number(l.valor_total ?? 0), 0))}</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Parados há {DIAS_ALERTA}+ dias</div>
          <div className="numero" style={parados ? { color: "var(--perigo)" } : undefined}>{parados}</div>
          <div className="detalhe">desde a conclusão da obra</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Concluídas no cronograma</div>
          <div className="numero" style={comAviso ? { color: "var(--alerta, #b7791f)" } : undefined}>{comAviso}</div>
          <div className="detalhe">OS ou pedido pendente no Flow</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Emitidas este mês</div>
          <div className="numero">{doMes.length}</div>
          <div className="detalhe">{moeda(doMes.reduce((s, l) => s + Number(l.valor_total ?? 0), 0))}</div>
        </div>
      </div>

      <div className="filtros">
        <input type="search" placeholder="Buscar projeto, cliente, pedido, NF ou OS" value={busca} onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: 300 }} aria-label="Buscar" />
        <label className="pequeno mudo" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Tarefas no planner de
          <select value={p.responsavel ?? ""} disabled={pendente} aria-label="Quem emite as notas"
            onChange={(e) => iniciar(r(() => definirResponsavel(e.target.value || null), setErro))}>
            <option value="">Ninguém</option>
            {p.pessoas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <div className="abas" style={{ marginLeft: "auto" }}>
          {([["emitir", "A emitir", p.aEmitir.length], ["emitidas", "Emitidas", p.emitidas.length], ["ocultos", "Ocultos", totalOcultos]] as const).map(([id, rot, n]) => (
            <a key={id} href="#" className={aba === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setAba(id); }}>
              {rot}<span className="contador">{n}</span>
            </a>
          ))}
        </div>
      </div>
      {erro && <div className="erro">{erro}</div>}

      {aba === "emitir" && <ListaAEmitir linhas={lista} vazio={p.aEmitir.length ? "Nada com essa busca." : "Nenhuma nota a emitir. Tudo em dia."} />}
      {aba === "emitidas" && (
        <>
          <div className="abas" style={{ display: "inline-flex", marginBottom: 12 }}>
            {([["mes", "Este mês"], ["anterior", "Mês passado"], ["ano", "Este ano"], ["todos", "Tudo"]] as const).map(([id, rot]) => (
              <a key={id} href="#" className={periodo === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setPeriodo(id); }}>{rot}</a>
            ))}
          </div>
          <span className="pequeno mudo" style={{ marginLeft: 12 }}>
            {emitidas.length} {emitidas.length === 1 ? "nota" : "notas"} · {moeda(emitidas.reduce((s, l) => s + Number(l.valor_total ?? 0), 0))}
          </span>
          <ListaEmitidas linhas={emitidas} />
        </>
      )}
      {aba === "ocultos" && <ListaOcultos linhas={p.ocultos} obras={p.obrasOcultas} />}
    </>
  );
}

function ListaAEmitir({ linhas, vazio }: { linhas: NotaAEmitir[]; vazio: string }) {
  return (
    <div className="tabela-caixa">
      <table>
        <thead>
          <tr><th>Parado</th><th>Projeto e cliente</th><th>Valor</th><th>Situação</th><th>Vendedor</th><th></th></tr>
        </thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={6} className="vazio">{vazio}</td></tr>}
          {linhas.map((l) => <LinhaEmitir key={l.chave} l={l} />)}
        </tbody>
      </table>
    </div>
  );
}

function LinhaEmitir({ l }: { l: NotaAEmitir }) {
  const [pendente, iniciar] = useTransition();
  const [nota, setNota] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const n = nomesDoCliente(l);
  return (
    <tr style={pendente ? { opacity: 0.5 } : undefined}>
      <td style={{ whiteSpace: "nowrap" }}>
        <span className={`dias${l.dias >= DIAS_ALERTA ? " alto" : ""}`}>{l.dias} {l.dias === 1 ? "dia" : "dias"}</span>
        <div className="pequeno mudo">desde {fmtData(l.desde)}</div>
      </td>
      <td>
        <div className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero}`}</div>
        <div><strong>{n.principal}</strong></div>
        {n.apoio.filter((v) => v !== l.codigo_projeto).map((v) => <div key={v} className="pequeno mudo">{v}</div>)}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>{l.valor_total != null ? moeda(l.valor_total) : "—"}{l.numero ? <div className="pequeno mudo">Pedido {l.numero}</div> : null}</td>
      <td style={{ maxWidth: 320 }}>
        {l.origem === "flow"
          ? <span className="pequeno">OS {l.os_numero ? `${l.os_numero}: ` : ""}{l.os_status}</span>
          : <span className="etiqueta" style={{ background: "#fdf3dc", color: "#8a5a00", whiteSpace: "normal" }}>{l.aviso}</span>}
        {l.origem !== "sem_pedido" && l.codigo_projeto && (
          <div className="pequeno"><a href={`/obras/cronograma#obra=${encodeURIComponent(l.codigo_projeto)}`}>Ver no cronograma</a></div>
        )}
      </td>
      <td className="pequeno">{l.responsavel ?? "—"}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {nota !== null ? (
          <form style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
            onSubmit={(e) => { e.preventDefault(); iniciar(r(() => marcarNota(l.flow_id!, nota), setErro)); }}>
            <input type="text" placeholder="Nº da nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={30} autoFocus
              aria-label="Número da nota" style={{ width: 150 }} />
            <button className="botao pequeno" disabled={pendente}>Salvar</button>
            <button type="button" className="botao secundario pequeno" onClick={() => setNota(null)}>Cancelar</button>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {l.flow_id && <button className="botao secundario pequeno" disabled={pendente} onClick={() => setNota("")}>Já tem nota</button>}
            <button className="botao secundario pequeno" disabled={pendente}
              onClick={() => iniciar(r(() => (l.flow_id ? ocultarCard(l.flow_id) : ocultarObra(l.codigo_projeto!, true)), setErro))}>Ocultar</button>
          </div>
        )}
        {erro && <div className="pequeno" style={{ color: "var(--perigo)" }}>{erro}</div>}
      </td>
    </tr>
  );
}

function ListaEmitidas({ linhas }: { linhas: LinhaPainel[] }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="tabela-caixa">
      {erro && <div className="erro">{erro}</div>}
      <table>
        <thead>
          <tr><th>Nota</th><th>Projeto e cliente</th><th>Valor</th><th style={{ minWidth: 180 }}>Recebido</th><th></th></tr>
        </thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={5} className="vazio">Nenhuma nota neste período.</td></tr>}
          {linhas.slice(0, 500).map((l) => {
            const n = nomesDoCliente(l);
            return (
              <tr key={l.flow_id} style={pendente ? { opacity: 0.6 } : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {l.nf_numero ? `NF ${l.nf_numero}` : "Sem número"}
                  <div className="pequeno mudo">{l.nf_emitida_em ? fmtData(l.nf_emitida_em) : l.nota_manual ? "marcada à mão" : ""}</div>
                </td>
                <td>
                  <div className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero}`}</div>
                  <div><strong>{n.principal}</strong></div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{moeda(l.valor_total)}</td>
                <td>
                  <div className="barra" aria-label={`${l.pct_recebido}% recebido`}><div style={{ width: `${Math.min(100, Number(l.pct_recebido))}%` }} /></div>
                  <div className="pequeno mudo" style={{ marginTop: 4 }}>
                    {Number(l.pct_recebido).toLocaleString("pt-BR")}% · {moeda(l.total_recebido)} de {moeda(l.total_titulos)}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  {l.nota_manual && (
                    <button className="botao secundario pequeno" disabled={pendente} title={l.alterado_por ? `Marcada por ${l.alterado_por}${l.alterado_em ? ` em ${dataHora(l.alterado_em)}` : ""}` : undefined}
                      onClick={() => iniciar(r(() => desmarcarNota(l.flow_id), setErro))}>Desfazer nota</button>
                  )}
                </td>
              </tr>
            );
          })}
          {linhas.length > 500 && <tr><td colSpan={5} className="vazio">+{linhas.length - 500} (use a busca ou o período)</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ListaOcultos({ linhas, obras }: { linhas: LinhaPainel[]; obras: ObraOculta[] }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const vazio = linhas.length + obras.length === 0;
  return (
    <div className="tabela-caixa">
      {erro && <div className="erro">{erro}</div>}
      <table>
        <thead><tr><th>Projeto</th><th>Cliente</th><th>Ocultado por</th><th></th></tr></thead>
        <tbody>
          {vazio && <tr><td colSpan={4} className="vazio">Nada oculto.</td></tr>}
          {linhas.map((l) => (
            <tr key={l.flow_id} style={pendente ? { opacity: 0.6 } : undefined}>
              <td className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero}`}</td>
              <td>{nomesDoCliente(l).principal}</td>
              <td className="mudo pequeno">{l.alterado_por ?? "—"}{l.alterado_em ? ` · ${dataHora(l.alterado_em)}` : ""}</td>
              <td style={{ textAlign: "right" }}>
                <button className="botao secundario pequeno" disabled={pendente} onClick={() => iniciar(r(() => mostrarCard(l.flow_id), setErro))}>Mostrar de novo</button>
              </td>
            </tr>
          ))}
          {obras.map((o) => (
            <tr key={o.codigo} style={pendente ? { opacity: 0.6 } : undefined}>
              <td className="codigo">{o.codigo}</td>
              <td>{o.cliente ?? "—"} <span className="pequeno mudo">(obra sem pedido no Flow)</span></td>
              <td className="mudo pequeno">{o.alterado_por ?? "—"} · {dataHora(o.alterado_em)}</td>
              <td style={{ textAlign: "right" }}>
                <button className="botao secundario pequeno" disabled={pendente} onClick={() => iniciar(r(() => ocultarObra(o.codigo, false), setErro))}>Mostrar de novo</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
