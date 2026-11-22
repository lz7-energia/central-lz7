"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { moeda, data as fmtData, dataHora } from "@/lib/formato";
import { fecharProjeto, salvarIndicador, semIndicadorEmLote } from "./acoes";

export type Projeto = {
  flow_id: string; numero: string | null; codigo_projeto: string | null; cliente: string | null; cliente_apelido: string | null;
  cliente_id: string | null; valor_total: number | null; total_titulos: number; total_recebido: number; pct_recebido: number;
  falta_receber: number; recebido_ok: boolean; nota: "emitida" | "a_emitir" | "em_obra"; nf_numero: string | null; nf_emitida_em: string | null;
  os_status: string | null; data_pedido: string | null; indicador: "sem" | "pago" | "a_pagar" | "nao_informado";
  indicador_nome: string | null; indicador_valor: number | null; indicador_pago_em: string | null; indicador_obs: string | null;
  fechado_manual: boolean; fechado_motivo: string | null; alterado_por: string | null; alterado_em: string | null; fechado: boolean;
};
type Situacao = "abertos" | "fechados" | "todos";
type Pend = "" | "receber" | "nota" | "ind_pagar" | "ind_info";
const LIMITE = 300;

const chip = (cor: "ok" | "alerta" | "perigo" | "cinza", texto: string, title?: string) => (
  <span className={`chip-proj ${cor}`} title={title}>{texto}</span>
);

export function Projetos({ projetos, buscaInicial }: { projetos: Projeto[]; buscaInicial: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [sit, setSit] = useState<Situacao>("abertos");
  const [pend, setPend] = useState<Pend>("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return projetos.filter((p) =>
      (sit === "todos" || (sit === "fechados" ? p.fechado : !p.fechado)) &&
      (!pend || (pend === "receber" ? !p.recebido_ok : pend === "nota" ? p.nota !== "emitida" : pend === "ind_pagar" ? p.indicador === "a_pagar" : p.indicador === "nao_informado")) &&
      (!b || [p.codigo_projeto, p.cliente, p.cliente_apelido, p.numero, p.nf_numero, p.indicador_nome].some((v) => v?.toLowerCase().includes(b))),
    ).sort((a, b) => String(b.data_pedido ?? "").localeCompare(String(a.data_pedido ?? "")) || String(a.cliente).localeCompare(String(b.cliente)));
  }, [projetos, busca, sit, pend]);

  const abertos = projetos.filter((p) => !p.fechado);
  const faltaReceber = abertos.reduce((s, p) => s + Number(p.falta_receber || 0), 0);
  const aPagar = projetos.filter((p) => p.indicador === "a_pagar");
  const semInfo = abertos.filter((p) => p.indicador === "nao_informado");
  const visiveis = filtrados.slice(0, LIMITE);
  const marcaveis = visiveis.filter((p) => p.indicador === "nao_informado");

  return (
    <>
      <div className="resumo">
        <div className={`indicador${abertos.length ? " destaque" : ""}`}>
          <div className="rotulo">Projetos em aberto</div>
          <div className="numero">{abertos.length}</div>
          <div className="detalhe">{projetos.length - abertos.length} fechados 100%</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Falta receber</div>
          <div className="numero" style={{ fontSize: "1.5rem" }}>{moeda(faltaReceber)}</div>
          <div className="detalhe">{abertos.filter((p) => !p.recebido_ok).length} projetos</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Falta emitir nota</div>
          <div className="numero">{projetos.filter((p) => p.nota === "a_emitir").length}</div>
          <div className="detalhe">{projetos.filter((p) => p.nota === "em_obra").length} ainda em obra</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Indicadores a pagar</div>
          <div className="numero" style={aPagar.length ? { color: "var(--perigo)" } : undefined}>{aPagar.length}</div>
          <div className="detalhe">{moeda(aPagar.reduce((s, p) => s + Number(p.indicador_valor || 0), 0))} · {semInfo.length} sem informar</div>
        </div>
      </div>

      <div className="filtros">
        <input type="search" placeholder="Cliente, projeto, pedido, nota ou indicador" value={busca} onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: 280 }} aria-label="Buscar projeto" />
        <select value={pend} onChange={(e) => setPend(e.target.value as Pend)} aria-label="Pendência">
          <option value="">Qualquer pendência</option>
          <option value="receber">Falta receber</option>
          <option value="nota">Falta nota</option>
          <option value="ind_pagar">Indicador a pagar</option>
          <option value="ind_info">Indicador não informado</option>
        </select>
        <div className="abas" style={{ marginLeft: "auto" }}>
          {([["abertos", "Em aberto", abertos.length], ["fechados", "Fechados", projetos.length - abertos.length], ["todos", "Todos", projetos.length]] as const).map(([id, rot, n]) => (
            <a key={id} href="#" className={sit === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setSit(id); }}>{rot}<span className="contador">{n}</span></a>
          ))}
        </div>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {marcados.size > 0 && (
        <div className="aviso-lote">
          {marcados.size} {marcados.size === 1 ? "projeto marcado" : "projetos marcados"}
          <button className="botao pequeno" disabled={pendente} onClick={() => iniciar(async () => {
            setErro(null); const r = await semIndicadorEmLote([...marcados]); if (r.erro) setErro(r.erro); else setMarcados(new Set());
          })}>Marcar como sem indicador</button>
          <button className="botao secundario pequeno" onClick={() => setMarcados(new Set())}>Desmarcar</button>
        </div>
      )}

      <div className="tabela-caixa">
        <table className="tabela-projetos">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                {marcaveis.length > 0 && (
                  <input type="checkbox" aria-label="Marcar todos sem indicador informado"
                    checked={marcaveis.every((p) => marcados.has(p.flow_id))}
                    onChange={(e) => setMarcados(e.target.checked ? new Set(marcaveis.map((p) => p.flow_id)) : new Set())} />
                )}
              </th>
              <th>Projeto e cliente</th><th>Valor</th><th style={{ minWidth: 170 }}>Recebido</th><th>Nota</th><th style={{ minWidth: 200 }}>Indicador</th><th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="vazio">{projetos.length ? "Nenhum projeto com esse filtro." : "Sem dados do Flow ainda."}</td></tr>}
            {visiveis.map((p) => (
              <LinhaProjeto key={p.flow_id} p={p} marcado={marcados.has(p.flow_id)}
                marcar={(v) => setMarcados((s) => { const n = new Set(s); if (v) n.add(p.flow_id); else n.delete(p.flow_id); return n; })} />
            ))}
            {filtrados.length > LIMITE && <tr><td colSpan={7} className="vazio">+{filtrados.length - LIMITE} projetos (use a busca ou os filtros)</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LinhaProjeto({ p, marcado, marcar }: { p: Projeto; marcado: boolean; marcar: (v: boolean) => void }) {
  const [editando, setEditando] = useState<"" | "indicador" | "fechar">("");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ sem: p.indicador === "sem", nome: p.indicador_nome ?? "", valor: p.indicador_valor != null ? String(p.indicador_valor).replace(".", ",") : "",
    pagoEm: p.indicador_pago_em ?? "", obs: p.indicador_obs ?? "" });
  const [motivo, setMotivo] = useState("");
  const nome = p.cliente_apelido || p.cliente || "Cliente não identificado";
  const agir = (fn: () => Promise<{ erro?: string }>) => iniciar(async () => { setErro(null); const r = await fn(); if (r.erro) setErro(r.erro); else setEditando(""); });

  const pendencias = [
    !p.recebido_ok && (p.total_titulos > 0 ? "receber" : "sem títulos no Flow"),
    p.nota !== "emitida" && "nota",
    p.indicador === "a_pagar" && "pagar indicador",
    p.indicador === "nao_informado" && "informar indicador",
  ].filter(Boolean) as string[];

  return (
    <>
      <tr style={pendente ? { opacity: 0.5 } : undefined} className={p.fechado ? "fechado" : ""}>
        <td>{p.indicador === "nao_informado" && <input type="checkbox" checked={marcado} onChange={(e) => marcar(e.target.checked)} aria-label={`Marcar ${nome}`} />}</td>
        <td>
          <div className="codigo">{p.codigo_projeto ?? `Pedido ${p.numero}`}</div>
          {p.cliente_id ? <Link className="linha" href={`/clientes/${encodeURIComponent(p.cliente_id)}`}><b>{nome}</b></Link> : <b>{nome}</b>}
          {p.cliente_apelido && p.cliente && p.cliente !== p.cliente_apelido && <div className="pequeno mudo">{p.cliente}</div>}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>{moeda(p.valor_total)}{p.data_pedido && <div className="pequeno mudo">pedido de {fmtData(p.data_pedido)}</div>}</td>
        <td>
          {p.total_titulos > 0 ? (
            <>
              <div className="barra" aria-label={`${p.pct_recebido}% recebido`}><div style={{ width: `${Math.min(100, Number(p.pct_recebido))}%` }} /></div>
              <div className="pequeno" style={{ marginTop: 4 }}>
                {Number(p.pct_recebido).toLocaleString("pt-BR")}%{p.falta_receber > 0 ? <span className="atrasado"> · falta {moeda(p.falta_receber)}</span> : " · tudo recebido"}
              </div>
            </>
          ) : <span className="pequeno mudo">Sem títulos no Flow</span>}
        </td>
        <td>
          {p.nota === "emitida" ? chip("ok", p.nf_numero ? `NF ${p.nf_numero}` : "Emitida", p.nf_emitida_em ? `Emitida em ${fmtData(p.nf_emitida_em)}` : undefined)
            : p.nota === "a_emitir" ? chip("alerta", "Falta emitir") : chip("cinza", "Em obra", p.os_status ? `OS: ${p.os_status}` : undefined)}
        </td>
        <td>
          {p.indicador === "sem" && chip("cinza", "Sem indicador")}
          {p.indicador === "pago" && <>{chip("ok", `Pago · ${p.indicador_nome}`)}<div className="pequeno mudo">{p.indicador_valor != null ? `${moeda(p.indicador_valor)} · ` : ""}em {fmtData(p.indicador_pago_em)}</div></>}
          {p.indicador === "a_pagar" && <>{chip("perigo", `A pagar · ${p.indicador_nome}`)}{p.indicador_valor != null && <div className="pequeno mudo">{moeda(p.indicador_valor)}</div>}</>}
          {p.indicador === "nao_informado" && chip("alerta", "Não informado")}
          <div><button type="button" className="link-botao pequeno" onClick={() => setEditando(editando === "indicador" ? "" : "indicador")}>
            {p.indicador === "nao_informado" ? "Informar" : "Editar"}</button></div>
        </td>
        <td>
          {p.fechado ? (
            <>{chip("ok", "✓ Fechado", p.fechado_manual ? `Fechado mesmo assim: ${p.fechado_motivo}` : undefined)}
              {p.fechado_manual && <div className="pequeno mudo" title={p.fechado_motivo ?? ""}>à mão · <button type="button" className="link-botao pequeno" disabled={pendente} onClick={() => agir(() => fecharProjeto(p.flow_id, null))}>Reabrir</button></div>}
            </>
          ) : (
            <>
              <div className="pequeno">Falta: {pendencias.join(", ")}</div>
              <button type="button" className="link-botao pequeno" onClick={() => setEditando(editando === "fechar" ? "" : "fechar")}>Fechar mesmo assim</button>
            </>
          )}
          {p.alterado_em && <div className="pequeno mudo" style={{ marginTop: 2 }}>{p.alterado_por} · {dataHora(p.alterado_em)}</div>}
        </td>
      </tr>
      {editando === "indicador" && (
        <tr className="linha-edicao"><td></td><td colSpan={6}>
          <form className="form-indicador" onSubmit={(e) => { e.preventDefault(); agir(() => salvarIndicador(p.flow_id, f)); }}>
            <label className="opcao"><input type="radio" checked={f.sem} onChange={() => setF({ ...f, sem: true })} /> Sem indicador</label>
            <label className="opcao"><input type="radio" checked={!f.sem} onChange={() => setF({ ...f, sem: false })} /> Tem indicador</label>
            {!f.sem && (
              <>
                <label>Nome<input type="text" value={f.nome} maxLength={120} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus /></label>
                <label>Valor (R$)<input type="text" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} style={{ width: 110 }} /></label>
                <label>Pago em<input type="date" value={f.pagoEm} onChange={(e) => setF({ ...f, pagoEm: e.target.value })} /></label>
                <label style={{ flex: 1, minWidth: 180 }}>Observação<input type="text" value={f.obs} maxLength={300} onChange={(e) => setF({ ...f, obs: e.target.value })} placeholder="ex.: Pix, 2% do contrato" /></label>
              </>
            )}
            <button className="botao pequeno" disabled={pendente}>Salvar</button>
            <button type="button" className="botao secundario pequeno" onClick={() => setEditando("")}>Cancelar</button>
          </form>
          {erro && <div className="pequeno" style={{ color: "var(--perigo)" }}>{erro}</div>}
        </td></tr>
      )}
      {editando === "fechar" && (
        <tr className="linha-edicao"><td></td><td colSpan={6}>
          <form className="form-indicador" onSubmit={(e) => { e.preventDefault(); agir(() => fecharProjeto(p.flow_id, motivo)); }}>
            <label style={{ flex: 1 }}>Por que fechar mesmo faltando {pendencias.join(", ")}?
              <input type="text" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="ex.: cliente pagou por fora, combinado com a diretoria" /></label>
            <button className="botao pequeno" disabled={pendente}>Fechar projeto</button>
            <button type="button" className="botao secundario pequeno" onClick={() => setEditando("")}>Cancelar</button>
          </form>
          {erro && <div className="pequeno" style={{ color: "var(--perigo)" }}>{erro}</div>}
        </td></tr>
      )}
    </>
  );
}
