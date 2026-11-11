"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  FAIXAS, GRUPOS, ORDEM_GRUPOS, faixaDe, limitesDoPeriodo, nomesDoCliente,
  type Atualizacao, type FaixaId, type Grupo, type Periodo, type Recebivel, type Situacao,
} from "@/lib/recebiveis";
import { data as fmtData, dataHora, moeda } from "@/lib/formato";
import {
  alterarSituacao, concluirAtualizacao, criarSituacao, darBaixa, desfazerBaixa, editarNome, excluirTitulo, restaurarTitulo, salvarCobranca,
} from "./acoes";

type Aba = "vencidos" | "a_vencer" | "recebidos" | "excluidos";
type Coluna = "cliente" | "vencimento" | "atraso" | "valor" | "previsao" | "recebido";
type Modo = "cobranca" | "baixa" | "excluir" | "nome";

const PERIODOS_FUTURO: { id: Periodo; rotulo: string }[] = [
  { id: "dia", rotulo: "Hoje" }, { id: "semana", rotulo: "Esta semana" }, { id: "mes", rotulo: "Este mês" },
  { id: "ano", rotulo: "Este ano" }, { id: "todos", rotulo: "Tudo" },
];
const PERIODOS_PASSADO: { id: Periodo; rotulo: string }[] = [
  { id: "dia", rotulo: "Hoje" }, { id: "semana", rotulo: "Esta semana" }, { id: "mes", rotulo: "Este mês" },
  { id: "ano", rotulo: "Este ano" }, { id: "todos", rotulo: "Tudo" }, { id: "personalizado", rotulo: "Escolher datas" },
];
type Balde = { id: string; inicio: string; fim: string; rotulo: string; dica: string };
const ORDEM_PADRAO: Record<Aba, { col: Coluna; dir: 1 | -1 }> = {
  vencidos: { col: "atraso", dir: -1 }, a_vencer: { col: "vencimento", dir: 1 },
  recebidos: { col: "recebido", dir: -1 }, excluidos: { col: "cliente", dir: 1 },
};

function somarDias(hoje: string, dias: number) {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const moedaCurta = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
  : v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : moeda(v);

function NomeCliente({ t }: { t: Recebivel }) {
  const { principal, apoio } = nomesDoCliente(t);
  return (
    <>
      <strong>{principal}</strong>
      {apoio.map((v) => <div key={v} className="pequeno mudo">{v}</div>)}
    </>
  );
}

export function Tabela({ titulos, historico, situacoes, podeEditar, hoje }: {
  titulos: Recebivel[]; historico: Atualizacao[]; situacoes: Situacao[]; podeEditar: boolean; hoje: string;
}) {
  const [aba, setAba] = useState<Aba>("vencidos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<{ id: string; modo: Modo } | null>(null);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [faixa, setFaixa] = useState<FaixaId | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [periodoFuturo, setPeriodoFuturo] = useState<Periodo>("mes");
  const [periodoPassado, setPeriodoPassado] = useState<Periodo>("ano");
  const [ordem, setOrdem] = useState(ORDEM_PADRAO.vencidos);
  const [balde, setBalde] = useState<Balde | null>(null);
  const [baldeFuturo, setBaldeFuturo] = useState<Balde | null>(null);
  const [deData, setDeData] = useState(`${hoje.slice(0, 7)}-01`);
  const [ateData, setAteData] = useState(hoje);
  const [pendente, iniciar] = useTransition();

  const sit = useMemo(() => new Map(situacoes.map((s) => [s.id, s])), [situacoes]);
  const grupoDe = (t: Recebivel): Grupo => sit.get(t.cobranca_situacao)?.grupo ?? "outro";
  const rotuloDe = (id: string) => sit.get(id)?.rotulo ?? id;

  const em30 = somarDias(hoje, 30);
  const mes = limitesDoPeriodo(hoje, "mes");
  const vencidos = titulos.filter((t) => t.estado === "vencido");
  const aVencer = titulos.filter((t) => t.estado === "a_vencer");
  const recebidos = titulos.filter((t) => t.estado === "recebido");
  const excluidos = titulos.filter((t) => t.estado === "excluido");
  const soma = (l: Recebivel[], campo: "valor_aberto" | "valor_recebido") => l.reduce((s, t) => s + Number(t[campo]), 0);
  const recebidosMes = recebidos.filter((t) => t.recebido_em && t.recebido_em >= mes.inicio && t.recebido_em <= hoje);

  const vencidosFiltrados = vencidos.filter((t) =>
    (!grupo || grupoDe(t) === grupo) && (!faixa || faixaDe(t.dias_atraso) === faixa) && (!situacao || t.cobranca_situacao === situacao));
  const filtrosAtivos = Boolean(grupo || faixa || situacao);
  const fimFuturo = limitesDoPeriodo(hoje, periodoFuturo).fim;
  const aVencerDoPeriodo = aVencer.filter((t) => t.vencimento && t.vencimento <= fimFuturo);
  const aVencerNoPeriodo = baldeFuturo
    ? aVencerDoPeriodo.filter((t) => t.vencimento && t.vencimento >= baldeFuturo.inicio && t.vencimento <= baldeFuturo.fim)
    : aVencerDoPeriodo;
  const inicioPassado = limitesDoPeriodo(hoje, periodoPassado).inicio;
  const recebidosDoPeriodo = periodoPassado === "todos"
    ? recebidos
    : periodoPassado === "personalizado"
      ? recebidos.filter((t) => t.recebido_em && t.recebido_em >= deData && t.recebido_em <= ateData)
      : recebidos.filter((t) => t.recebido_em && t.recebido_em >= inicioPassado && t.recebido_em <= hoje);
  const recebidosNoPeriodo = balde
    ? recebidosDoPeriodo.filter((t) => t.recebido_em && t.recebido_em >= balde.inicio && t.recebido_em <= balde.fim)
    : recebidosDoPeriodo;

  const trocarAba = (a: Aba) => { setAba(a); setEditando(null); setOrdem(ORDEM_PADRAO[a]); };
  const ordenarPor = (col: Coluna) =>
    setOrdem((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: col === "cliente" || col === "vencimento" || col === "previsao" ? 1 : -1 }));

  const lista = useMemo(() => {
    const base = aba === "vencidos" ? vencidosFiltrados : aba === "a_vencer" ? aVencerNoPeriodo : aba === "recebidos" ? recebidosNoPeriodo : excluidos;
    const b = busca.trim().toLowerCase();
    const filtrada = b ? base.filter((t) => [t.cliente, t.cliente_apelido, t.codigo_projeto].some((v) => v?.toLowerCase().includes(b))) : base;
    const chave = (t: Recebivel): string | number => {
      switch (ordem.col) {
        case "cliente": return nomesDoCliente(t).principal.toLowerCase();
        case "vencimento": return t.vencimento ?? "";
        case "atraso": return t.dias_atraso ?? 0;
        case "valor": return Number(aba === "recebidos" ? t.valor_recebido : t.valor_aberto);
        case "previsao": return t.previsao ?? "";
        case "recebido": return t.recebido_em ?? "";
      }
    };
    return [...filtrada].sort((x, y) => {
      const a = chave(x), c = chave(y);
      // Sem data (ou sem previsão) vai sempre para o fim, nos dois sentidos.
      if (a === "" || c === "") return a === c ? 0 : a === "" ? 1 : -1;
      const r = typeof a === "number" && typeof c === "number" ? a - c : String(a).localeCompare(String(c), "pt-BR", { numeric: true, sensitivity: "base" });
      return r * ordem.dir;
    });
  }, [aba, busca, ordem, vencidosFiltrados, aVencerNoPeriodo, recebidosNoPeriodo, excluidos]);

  const Cab = ({ col, children }: { col: Coluna; children: React.ReactNode }) => (
    <th aria-sort={ordem.col === col ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="ordenar" onClick={() => ordenarPor(col)} title="Clique para ordenar">
        {children}
        <span className={`seta${ordem.col === col ? " ativa" : ""}`}>{ordem.col === col ? (ordem.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
  const abrir = (id: string, modo: Modo) => setEditando(editando?.id === id && editando.modo === modo ? null : { id, modo });
  const rapido = (fn: () => Promise<{ erro?: string }>) => iniciar(async () => { await fn(); });
  const colunas = aba === "vencidos" ? 8 : 6;

  return (
    <>
      <div className="resumo">
        <div className={`indicador${vencidos.length ? " destaque" : ""}`}>
          <div className="rotulo">Vencido</div>
          <div className="numero" style={vencidos.length ? { color: "var(--perigo)" } : undefined}>{moeda(soma(vencidos, "valor_aberto"))}</div>
          <div className="detalhe">{vencidos.length} título{vencidos.length === 1 ? "" : "s"}</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Vencidos sem previsão</div>
          <div className="numero">{vencidos.filter((t) => !t.previsao).length}</div>
          <div className="detalhe">precisam de contato</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Vence nos próximos 30 dias</div>
          <div className="numero">{moeda(soma(aVencer.filter((t) => t.vencimento && t.vencimento <= em30), "valor_aberto"))}</div>
          <div className="detalhe">{aVencer.filter((t) => t.vencimento && t.vencimento <= em30).length} títulos</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Recebido no mês</div>
          <div className="numero">{moeda(soma(recebidosMes, "valor_recebido"))}</div>
          <div className="detalhe">{recebidosMes.length} títulos</div>
        </div>
      </div>

      {aba === "a_vencer" && (
        <PanoramaAVencer todos={aVencer} titulos={aVencerDoPeriodo} periodo={periodoFuturo} hoje={hoje} balde={baldeFuturo} setBalde={setBaldeFuturo} />
      )}

      {aba === "recebidos" && (
        <PanoramaRecebidos
          titulos={recebidosDoPeriodo} periodo={periodoPassado} hoje={hoje} balde={balde} intervalo={{ de: deData, ate: ateData }}
          setBalde={setBalde}
        />
      )}

      {aba === "vencidos" && <Panorama
        vencidos={vencidos} filtrados={vencidosFiltrados} situacoes={situacoes} grupoDe={grupoDe}
        grupo={grupo} faixa={faixa} situacao={situacao}
        setGrupo={(g) => { setGrupo(g); setSituacao(null); if (aba !== "vencidos") trocarAba("vencidos"); }}
        setFaixa={(f) => { setFaixa(f); if (aba !== "vencidos") trocarAba("vencidos"); }}
        setSituacao={(s) => { setSituacao(s); if (aba !== "vencidos") trocarAba("vencidos"); }}
        limpar={() => { setGrupo(null); setFaixa(null); setSituacao(null); }}
      />}

      <div className="filtros">
        <div className="abas">
          {([["vencidos", "Vencidos", vencidos.length], ["a_vencer", "A vencer", aVencer.length],
             ["recebidos", "Recebidos", recebidos.length], ["excluidos", "Excluídos", excluidos.length]] as const).map(([id, rotulo, n]) => (
            <a key={id} href="#" className={aba === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); trocarAba(id); }}>
              {rotulo}<span className="contador">{n}</span>
            </a>
          ))}
        </div>
        <input type="search" placeholder="Buscar cliente, apelido ou projeto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        {aba === "vencidos" && filtrosAtivos && (
          <span className="pequeno mudo">
            Filtrado: {[grupo && GRUPOS[grupo].rotulo, faixa && FAIXAS.find((f) => f.id === faixa)?.rotulo, situacao && rotuloDe(situacao)].filter(Boolean).join(" · ")}
          </span>
        )}
        {aba !== "excluidos" && (
          <a className="botao secundario pequeno" style={{ marginLeft: "auto" }}
             href={`/recebiveis/exportar?aba=${aba}&periodo=${aba === "a_vencer" ? periodoFuturo : periodoPassado}${aba === "recebidos" && periodoPassado === "personalizado" ? `&de=${deData}&ate=${ateData}` : ""}`}>
            Baixar planilha
          </a>
        )}
      </div>

      {(aba === "a_vencer" || aba === "recebidos") && (
        <div className="filtros">
          <div className="abas" role="group" aria-label="Período">
            {(aba === "a_vencer" ? PERIODOS_FUTURO : PERIODOS_PASSADO).map((p) => {
              const ativo = (aba === "a_vencer" ? periodoFuturo : periodoPassado) === p.id;
              return (
                <a key={p.id} href="#" className={ativo ? "ativo" : ""}
                   onClick={(e) => { e.preventDefault(); if (aba === "a_vencer") { setPeriodoFuturo(p.id); setBaldeFuturo(null); } else { setPeriodoPassado(p.id); setBalde(null); } }}>
                  {p.rotulo}
                </a>
              );
            })}
          </div>
          {aba === "recebidos" && periodoPassado === "personalizado" && (
            <span className="intervalo">
              <label htmlFor="de">de</label>
              <input id="de" type="date" value={deData} max={ateData} onChange={(e) => { setDeData(e.target.value); setBalde(null); }} />
              <label htmlFor="ate">até</label>
              <input id="ate" type="date" value={ateData} min={deData} onChange={(e) => { setAteData(e.target.value); setBalde(null); }} />
            </span>
          )}
          {aba === "a_vencer" ? (
            <span className="previsto">Previsto para receber{baldeFuturo ? ` em ${baldeFuturo.dica}` : ""}: <strong>{moeda(soma(aVencerNoPeriodo, "valor_aberto"))}</strong>{" "}
              <span className="mudo">em {aVencerNoPeriodo.length} título{aVencerNoPeriodo.length === 1 ? "" : "s"}</span>
              {baldeFuturo && <button className="link-acao" style={{ marginLeft: 10 }} onClick={() => setBaldeFuturo(null)}>ver o período todo</button>}</span>
          ) : (
            <span className="previsto">Recebido{balde ? ` em ${balde.dica}` : ""}: <strong>{moeda(soma(recebidosNoPeriodo, "valor_recebido"))}</strong>{" "}
              <span className="mudo">em {recebidosNoPeriodo.length} título{recebidosNoPeriodo.length === 1 ? "" : "s"}</span>
              {balde && <button className="link-acao" style={{ marginLeft: 10 }} onClick={() => setBalde(null)}>ver o período todo</button>}</span>
          )}
        </div>
      )}

      <div className="tabela-caixa" style={pendente ? { opacity: 0.6 } : undefined}>
        <table>
          <thead>
            <tr>
              <Cab col="cliente">Cliente</Cab>
              <Cab col="vencimento">Vencimento</Cab>
              {aba === "vencidos" && <Cab col="atraso">Atraso</Cab>}
              {aba === "a_vencer" && <th>Vence em</th>}
              <Cab col="valor">{aba === "recebidos" ? "Recebido" : "Em aberto"}</Cab>
              {aba === "recebidos" && <Cab col="recebido">Recebido em</Cab>}
              {aba === "vencidos" && <th>Cobrança</th>}
              {aba === "vencidos" && <Cab col="previsao">Previsão</Cab>}
              {aba === "vencidos" && <th>Motivo</th>}
              {(aba === "recebidos" || aba === "excluidos") && <th>Observação</th>}
              {podeEditar && <th></th>}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={colunas + 1} className="vazio">
                  {aba === "vencidos" ? (filtrosAtivos ? "Nenhum vencido com esses filtros." : "Nenhum título vencido. 🎉")
                    : aba === "a_vencer" ? "Nenhum título vence neste período."
                    : aba === "recebidos" ? "Nenhum recebimento neste período." : "Nenhum título excluído."}
                </td>
              </tr>
            )}
            {lista.map((t) => (
              <Fragment key={t.flow_id}>
                <tr>
                  <td><NomeCliente t={t} /></td>
                  <td>{fmtData(t.vencimento)}</td>
                  {aba === "vencidos" && <td className="atrasado">{t.dias_atraso} dia{t.dias_atraso === 1 ? "" : "s"}</td>}
                  {aba === "a_vencer" && (
                    <td className="mudo">{t.vencimento ? (diasEntre(hoje, t.vencimento) === 0 ? "hoje" : `${diasEntre(hoje, t.vencimento)} dia${diasEntre(hoje, t.vencimento) === 1 ? "" : "s"}`) : "—"}</td>
                  )}
                  <td>{moeda(aba === "recebidos" ? t.valor_recebido : aba === "excluidos" ? t.valor : t.valor_aberto)}</td>
                  {aba === "recebidos" && <td>{fmtData(t.recebido_em)}</td>}
                  {aba === "vencidos" && (
                    <td><span className={`etiqueta ${GRUPOS[grupoDe(t)].etiqueta}`}>{rotuloDe(t.cobranca_situacao)}</span></td>
                  )}
                  {aba === "vencidos" && <td className={t.previsao && t.previsao < hoje ? "atrasado" : ""}>{t.previsao ? fmtData(t.previsao) : <span className="mudo">—</span>}</td>}
                  {aba === "vencidos" && (
                    <td style={{ maxWidth: 280 }}>
                      {t.motivo ?? <span className="mudo">—</span>}
                      {t.alterado_por && <div className="pequeno mudo">{t.alterado_por} · {dataHora(t.alterado_em)}</div>}
                    </td>
                  )}
                  {aba === "recebidos" && (
                    <td>
                      {t.baixa_manual ? (
                        <>
                          <span className="etiqueta cinza">Baixa manual{t.ajuste_por ? ` · ${t.ajuste_por}` : ""}</span>
                          {t.baixa_obs && <div className="pequeno mudo">{t.baixa_obs}</div>}
                        </>
                      ) : <span className="pequeno mudo">Baixado no Flow</span>}
                    </td>
                  )}
                  {aba === "excluidos" && (
                    <td>
                      {t.excluido_motivo ?? <span className="mudo">—</span>}
                      {t.ajuste_por && <div className="pequeno mudo">{t.ajuste_por} · {dataHora(t.ajuste_em)}</div>}
                    </td>
                  )}
                  {podeEditar && (
                    <td className="acoes-linha">
                      {aba === "vencidos" && <button className="botao secundario pequeno" onClick={() => abrir(t.flow_id, "cobranca")}>Atualizar</button>}
                      {(aba === "vencidos" || aba === "a_vencer") && (
                        <>
                          <button className="link-acao" onClick={() => abrir(t.flow_id, "baixa")}>Dar baixa</button>
                          <button className="link-acao" onClick={() => abrir(t.flow_id, "excluir")}>Excluir</button>
                        </>
                      )}
                      {aba === "recebidos" && t.baixa_manual && (
                        <button className="link-acao" onClick={() => rapido(() => desfazerBaixa(t.flow_id))}>Desfazer baixa</button>
                      )}
                      {aba === "recebidos" && <button className="link-acao" onClick={() => abrir(t.flow_id, "excluir")}>Excluir</button>}
                      {aba === "excluidos" && (
                        <button className="botao secundario pequeno" onClick={() => rapido(() => restaurarTitulo(t.flow_id))}>Restaurar</button>
                      )}
                      {aba !== "excluidos" && <button className="link-acao" onClick={() => abrir(t.flow_id, "nome")}>Editar nome</button>}
                    </td>
                  )}
                </tr>
                {editando?.id === t.flow_id && (
                  <tr className="linha-edicao">
                    <td colSpan={colunas + 1}>
                      {editando.modo === "cobranca" && <FormCobranca t={t} situacoes={situacoes} aoSalvar={() => setEditando(null)} />}
                      {editando.modo === "baixa" && <FormBaixa t={t} hoje={hoje} aoSalvar={() => setEditando(null)} />}
                      {editando.modo === "excluir" && <FormExcluir t={t} aoSalvar={() => setEditando(null)} />}
                      {editando.modo === "nome" && <FormNome t={t} aoSalvar={() => setEditando(null)} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="duas-colunas" style={{ marginTop: 24 }}>
        <div className="cartao">
          <h2>Histórico de atualizações</h2>
          {historico.length === 0 ? (
            <p className="mudo">Nenhuma atualização concluída ainda.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Concluída em</th><th>Por</th><th>Vencidos</th><th>Valor vencido</th><th>Sem previsão</th></tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{dataHora(h.concluida_em)}{h.observacao && <div className="pequeno mudo">{h.observacao}</div>}</td>
                    <td>{h.concluida_por}</td>
                    <td>{h.qtd_vencidos}</td>
                    <td>{moeda(h.valor_vencido)}</td>
                    <td>{h.qtd_sem_previsao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {podeEditar && <Concluir />}
      </div>

      {podeEditar && <GerenciarSituacoes situacoes={situacoes} />}
    </>
  );
}

/* ---------- Gráfico: recebimentos por dia / mês / ano ---------- */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const isoDe = (d: Date) => d.toISOString().slice(0, 10);
function baldesPorDia(inicio: string, fim: string, comSemana: boolean): Balde[] {
  const r: Balde[] = [];
  for (let d = new Date(`${inicio}T12:00:00Z`); isoDe(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const id = isoDe(d);
    r.push({ id, inicio: id, fim: id, rotulo: comSemana ? `${SEMANA[d.getUTCDay()]} ${d.getUTCDate()}` : String(d.getUTCDate()), dica: fmtData(id) });
  }
  return r;
}
function baldesPorMes(inicio: string, fim: string): Balde[] {
  const r: Balde[] = [];
  for (let d = new Date(Date.UTC(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, 1, 12)); isoDe(d).slice(0, 7) <= fim.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const ini = isoDe(d);
    const ult = isoDe(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
    const rot = `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
    r.push({ id: ini.slice(0, 7), inicio: ini, fim: ult, rotulo: rot, dica: rot });
  }
  return r;
}
function baldesPorAno(de: number, ate: number): Balde[] {
  const r: Balde[] = [];
  for (let a = de; a <= ate; a++) r.push({ id: String(a), inicio: `${a}-01-01`, fim: `${a}-12-31`, rotulo: String(a), dica: String(a) });
  return r;
}

function baldesDoPeriodo(titulos: Recebivel[], periodo: Periodo, hoje: string, intervalo: { de: string; ate: string }): Balde[] {
  const porDia = (inicio: string, fim: string) => baldesPorDia(inicio, fim, periodo === "semana");
  const porMes = baldesPorMes;
  if (periodo === "semana" || periodo === "mes") {
    const { inicio, fim } = limitesDoPeriodo(hoje, periodo);
    return porDia(inicio, fim);
  }
  if (periodo === "ano") return porMes(`${hoje.slice(0, 4)}-01-01`, `${hoje.slice(0, 4)}-12-31`);
  if (periodo === "personalizado") {
    if (!intervalo.de || !intervalo.ate || intervalo.de > intervalo.ate) return [];
    const dias = Math.round((Date.parse(`${intervalo.ate}T12:00:00Z`) - Date.parse(`${intervalo.de}T12:00:00Z`)) / 86_400_000);
    return dias <= 62 ? porDia(intervalo.de, intervalo.ate) : porMes(intervalo.de, intervalo.ate);
  }
  // Tudo: por mês; se passar de 3 anos, por ano.
  const datas = titulos.map((t) => t.recebido_em).filter(Boolean).sort() as string[];
  if (!datas.length) return [];
  const meses = porMes(datas[0], hoje);
  if (meses.length <= 36) return meses;
  return baldesPorAno(Number(datas[0].slice(0, 4)), Number(hoje.slice(0, 4)));
}

/* ---------- Gráfico: previsão de recebimentos (a vencer) ---------- */
function baldesDaPrevisao(titulos: Recebivel[], periodo: Periodo, hoje: string): Balde[] {
  if (periodo === "semana" || periodo === "mes") return baldesPorDia(hoje, limitesDoPeriodo(hoje, periodo).fim, periodo === "semana");
  if (periodo === "ano") return baldesPorMes(hoje, `${hoje.slice(0, 4)}-12-31`);
  if (periodo === "todos") {
    const ultimo = titulos.map((t) => t.vencimento).filter(Boolean).sort().at(-1) as string | undefined;
    if (!ultimo) return [];
    const meses = baldesPorMes(hoje, ultimo);
    return meses.length <= 36 ? meses : baldesPorAno(Number(hoje.slice(0, 4)), Number(ultimo.slice(0, 4)));
  }
  return [];
}

function PanoramaAVencer({ todos, titulos, periodo, hoje, balde, setBalde }: {
  todos: Recebivel[]; titulos: Recebivel[]; periodo: Periodo; hoje: string; balde: Balde | null; setBalde: (b: Balde | null) => void;
}) {
  const valor = (l: Recebivel[]) => l.reduce((s, t) => s + Number(t.valor_aberto), 0);
  const ate = (dias: number) => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); const fim = isoDe(d); return todos.filter((t) => t.vencimento && t.vencimento <= fim); };
  const prox = [{ rotulo: "Próximos 7 dias", l: ate(7) }, { rotulo: "Próximos 30 dias", l: ate(30) }, { rotulo: "Próximos 90 dias", l: ate(90) }];
  const baldes = baldesDaPrevisao(titulos, periodo, hoje);
  // Título com vencimento já passado mas ainda "a vencer" no Flow cai no primeiro balde.
  const doBalde = (b: Balde, i: number) => titulos.filter((t) => t.vencimento && t.vencimento <= b.fim && (i === 0 || t.vencimento >= b.inicio));
  const valores = baldes.map((b, i) => valor(doBalde(b, i)));
  const qtds = baldes.map((b, i) => doBalde(b, i).length);
  const max = Math.max(1, ...valores);
  const comRotulo = baldes.length <= 14;

  return (
    <section className="cartao panorama" aria-label="Previsão de recebimentos">
      <div className="panorama-topo">
        <h2 style={{ margin: 0 }}>Previsão de recebimentos</h2>
        {balde && <button className="botao secundario pequeno" onClick={() => setBalde(null)}>Limpar filtro</button>}
      </div>
      <div className="resumo" style={{ marginBottom: baldes.length ? 18 : 0 }}>
        <div className="indicador"><div className="rotulo">Previsto no período</div><div className="numero">{moeda(valor(titulos))}</div><div className="detalhe">{titulos.length} títulos</div></div>
        {prox.map((p) => (
          <div key={p.rotulo} className="indicador"><div className="rotulo">{p.rotulo}</div><div className="numero">{moeda(valor(p.l))}</div><div className="detalhe">{p.l.length} títulos</div></div>
        ))}
      </div>
      {baldes.length > 0 && (
        <>
          <h3>{baldes[0].id.length === 7 ? "Por mês" : baldes[0].id.length === 4 ? "Por ano" : "Por dia"}</h3>
          <div className="colunas-tempo" style={{ gridTemplateColumns: `repeat(${baldes.length}, minmax(0, 1fr))` }} role="group" aria-label="Previsão no tempo">
            {baldes.map((b, i) => {
              const ativo = balde?.id === b.id;
              return (
                <button
                  key={b.id}
                  className={`coluna-tempo${ativo ? " ativo" : ""}${balde && !ativo ? " apagada" : ""}`}
                  disabled={qtds[i] === 0}
                  onClick={() => setBalde(ativo ? null : { ...b, inicio: i === 0 ? "0000-01-01" : b.inicio })}
                  aria-pressed={ativo}
                  title={`${b.dica}: ${moeda(valores[i])} em ${qtds[i]} título${qtds[i] === 1 ? "" : "s"}${qtds[i] ? " — clique para filtrar" : ""}`}
                >
                  <span className="ct-valor">{comRotulo && valores[i] ? moedaCurta(valores[i]) : (valores[i] === max && valores[i] ? moedaCurta(valores[i]) : "")}</span>
                  <span className="ct-trilho"><span className="ct-barra" style={{ height: `${valores[i] ? Math.max(2, (valores[i] / max) * 100) : 0}%` }} /></span>
                  <span className="ct-rotulo">{b.rotulo}</span>
                </button>
              );
            })}
          </div>
          <p className="pequeno mudo" style={{ margin: "10px 0 0" }}>Pelo vencimento de cada título. Passe o mouse numa barra para ver o valor; clique para filtrar a lista.</p>
        </>
      )}
    </section>
  );
}

function PanoramaRecebidos({ titulos, periodo, hoje, balde, setBalde, intervalo }: {
  titulos: Recebivel[]; periodo: Periodo; hoje: string; balde: Balde | null; setBalde: (b: Balde | null) => void;
  intervalo: { de: string; ate: string };
}) {
  const total = titulos.reduce((s, t) => s + Number(t.valor_recebido), 0);
  const manuais = titulos.filter((t) => t.baixa_manual);
  const semData = titulos.filter((t) => !t.recebido_em).length;
  const baldes = periodo === "dia" ? [] : baldesDoPeriodo(titulos, periodo, hoje, intervalo);
  const valores = baldes.map((b) => titulos
    .filter((t) => t.recebido_em && t.recebido_em >= b.inicio && t.recebido_em <= b.fim)
    .reduce((s, t) => s + Number(t.valor_recebido), 0));
  const qtds = baldes.map((b) => titulos.filter((t) => t.recebido_em && t.recebido_em >= b.inicio && t.recebido_em <= b.fim).length);
  const max = Math.max(1, ...valores);
  const comRotulo = baldes.length <= 14;

  return (
    <section className="cartao panorama" aria-label="Recebimentos">
      <div className="panorama-topo">
        <h2 style={{ margin: 0 }}>Recebimentos</h2>
        {balde && <button className="botao secundario pequeno" onClick={() => setBalde(null)}>Limpar filtro</button>}
      </div>
      <div className="resumo" style={{ marginBottom: baldes.length ? 18 : 0 }}>
        <div className="indicador"><div className="rotulo">Total recebido</div><div className="numero">{moeda(total)}</div><div className="detalhe">{titulos.length} títulos</div></div>
        <div className="indicador"><div className="rotulo">Baixas manuais</div><div className="numero">{manuais.length}</div><div className="detalhe">{moeda(manuais.reduce((s, t) => s + Number(t.valor_recebido), 0))} · só na central</div></div>
        <div className="indicador"><div className="rotulo">Baixados no Flow</div><div className="numero">{titulos.length - manuais.length}</div><div className="detalhe">{semData ? `${semData} sem data de baixa` : "com data de baixa"}</div></div>
      </div>
      {baldes.length > 0 && (
        <>
          <h3>{periodo === "ano" || baldes[0]?.id.length === 7 ? "Por mês" : baldes[0]?.id.length === 4 ? "Por ano" : "Por dia"}</h3>
          <div className="colunas-tempo" style={{ gridTemplateColumns: `repeat(${baldes.length}, minmax(0, 1fr))` }} role="group" aria-label="Recebimentos no tempo">
            {baldes.map((b, i) => {
              const ativo = balde?.id === b.id;
              const futuro = b.inicio > hoje;
              return (
                <button
                  key={b.id}
                  className={`coluna-tempo${ativo ? " ativo" : ""}${balde && !ativo ? " apagada" : ""}`}
                  disabled={futuro || qtds[i] === 0}
                  onClick={() => setBalde(ativo ? null : b)}
                  aria-pressed={ativo}
                  title={`${b.dica}: ${moeda(valores[i])} em ${qtds[i]} título${qtds[i] === 1 ? "" : "s"}${qtds[i] ? " — clique para filtrar" : ""}`}
                >
                  <span className="ct-valor">{comRotulo && valores[i] ? moedaCurta(valores[i]) : (valores[i] === max && valores[i] ? moedaCurta(valores[i]) : "")}</span>
                  <span className="ct-trilho"><span className="ct-barra" style={{ height: `${valores[i] ? Math.max(2, (valores[i] / max) * 100) : 0}%` }} /></span>
                  <span className="ct-rotulo">{b.rotulo}</span>
                </button>
              );
            })}
          </div>
          <p className="pequeno mudo" style={{ margin: "10px 0 0" }}>Passe o mouse numa barra para ver o valor; clique para filtrar a lista.</p>
        </>
      )}
    </section>
  );
}

/* ---------- Formulários de ajuste do título (só na central) ---------- */
function useEnvio(aoSalvar: () => void) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const enviar = (fn: () => Promise<{ erro?: string }>) =>
    iniciar(async () => { setErro(null); const r = await fn(); if (r.erro) setErro(r.erro); else aoSalvar(); });
  return { erro, pendente, enviar };
}

function FormBaixa({ t, hoje, aoSalvar }: { t: Recebivel; hoje: string; aoSalvar: () => void }) {
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(Number(t.valor_aberto || t.valor).toFixed(2).replace(".", ","));
  const [obs, setObs] = useState("");
  const { erro, pendente, enviar } = useEnvio(aoSalvar);
  return (
    <form className="form-cobranca" onSubmit={(e) => { e.preventDefault(); enviar(() => darBaixa(t.flow_id, data, valor, obs)); }}>
      <div>
        <label htmlFor={`bd-${t.flow_id}`}>Recebido em</label>
        <input id={`bd-${t.flow_id}`} type="date" value={data} onChange={(e) => setData(e.target.value)} required />
      </div>
      <div>
        <label htmlFor={`bv-${t.flow_id}`}>Valor recebido (R$)</label>
        <input id={`bv-${t.flow_id}`} type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div style={{ flex: 2 }}>
        <label htmlFor={`bo-${t.flow_id}`}>Observação</label>
        <input id={`bo-${t.flow_id}`} type="text" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} placeholder="Ex.: PIX no Itaú, ainda não baixado no Flow" />
      </div>
      <div style={{ alignSelf: "flex-end" }}>
        <button className="botao" disabled={pendente}>{pendente ? "Salvando…" : "Dar baixa"}</button>
      </div>
      <p className="pequeno mudo" style={{ flexBasis: "100%", margin: 0 }}>A baixa vale só na central. No Flow o título continua como está até ser baixado lá.</p>
      {erro && <div className="erro" style={{ flexBasis: "100%", margin: 0 }}>{erro}</div>}
    </form>
  );
}

function FormExcluir({ t, aoSalvar }: { t: Recebivel; aoSalvar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { erro, pendente, enviar } = useEnvio(aoSalvar);
  return (
    <form className="form-cobranca" onSubmit={(e) => { e.preventDefault(); enviar(() => excluirTitulo(t.flow_id, motivo)); }}>
      <div style={{ flex: 3 }}>
        <label htmlFor={`em-${t.flow_id}`}>Por que excluir? (opcional)</label>
        <input id={`em-${t.flow_id}`} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ex.: título duplicado, renegociado em outro título" />
      </div>
      <div style={{ alignSelf: "flex-end" }}>
        <button className="botao perigo" disabled={pendente}>{pendente ? "Excluindo…" : "Excluir da lista"}</button>
      </div>
      <p className="pequeno mudo" style={{ flexBasis: "100%", margin: 0 }}>Vai para a aba Excluídos, onde dá para restaurar. O Flow não é alterado.</p>
      {erro && <div className="erro" style={{ flexBasis: "100%", margin: 0 }}>{erro}</div>}
    </form>
  );
}

function FormNome({ t, aoSalvar }: { t: Recebivel; aoSalvar: () => void }) {
  const [nome, setNome] = useState(t.nome_exibicao ?? nomesDoCliente(t).principal);
  const { erro, pendente, enviar } = useEnvio(aoSalvar);
  return (
    <form className="form-cobranca" onSubmit={(e) => { e.preventDefault(); enviar(() => editarNome(t.flow_id, nome)); }}>
      <div style={{ flex: 3 }}>
        <label htmlFor={`nm-${t.flow_id}`}>Nome que aparece na central</label>
        <input id={`nm-${t.flow_id}`} type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </div>
      <div style={{ alignSelf: "flex-end" }} className="acoes">
        <button className="botao" disabled={pendente}>{pendente ? "Salvando…" : "Salvar nome"}</button>
        {t.nome_exibicao && (
          <button type="button" className="botao secundario" disabled={pendente} onClick={() => enviar(() => editarNome(t.flow_id, ""))}>Voltar ao do Flow</button>
        )}
      </div>
      {erro && <div className="erro" style={{ flexBasis: "100%", margin: 0 }}>{erro}</div>}
    </form>
  );
}

/* ---------- Gráfico: vencidos por situação e por tempo de atraso ---------- */
function Panorama({ vencidos, filtrados, situacoes, grupoDe, grupo, faixa, situacao, setGrupo, setFaixa, setSituacao, limpar }: {
  vencidos: Recebivel[]; filtrados: Recebivel[]; situacoes: Situacao[]; grupoDe: (t: Recebivel) => Grupo;
  grupo: Grupo | null; faixa: FaixaId | null; situacao: string | null;
  setGrupo: (g: Grupo | null) => void; setFaixa: (f: FaixaId | null) => void; setSituacao: (s: string | null) => void; limpar: () => void;
}) {
  if (vencidos.length === 0) return null;
  const valor = (l: Recebivel[]) => l.reduce((s, t) => s + Number(t.valor_aberto), 0);

  // Totais por grupo (respeitam a faixa de atraso escolhida)
  const naFaixa = vencidos.filter((t) => !faixa || faixaDe(t.dias_atraso) === faixa);
  const porGrupo = ORDEM_GRUPOS.map((g) => ({ g, l: naFaixa.filter((t) => grupoDe(t) === g) }));
  const totalFaixa = valor(naFaixa) || 1;

  // Barras por situação (respeitam grupo e faixa)
  const base = naFaixa.filter((t) => !grupo || grupoDe(t) === grupo);
  const linhasSit = situacoes
    .map((s) => ({ s, l: base.filter((t) => t.cobranca_situacao === s.id) }))
    .filter((x) => x.l.length > 0)
    .sort((a, b) => valor(b.l) - valor(a.l));
  const maxSit = Math.max(1, ...linhasSit.map((x) => valor(x.l)));

  // Barras por faixa de atraso (respeitam grupo e situação)
  const baseFaixa = vencidos.filter((t) => (!grupo || grupoDe(t) === grupo) && (!situacao || t.cobranca_situacao === situacao));
  const porFaixa = FAIXAS.map((f) => ({ f, l: baseFaixa.filter((t) => faixaDe(t.dias_atraso) === f.id) }));
  const maxFaixa = Math.max(1, ...porFaixa.map((x) => valor(x.l)));

  return (
    <section className="cartao panorama" aria-label="Panorama dos vencidos">
      <div className="panorama-topo">
        <h2 style={{ margin: 0 }}>Panorama dos vencidos</h2>
        {(grupo || faixa || situacao) && (
          <button className="botao secundario pequeno" onClick={limpar}>Limpar filtros</button>
        )}
      </div>

      {/* Filtro por grupo: também é a legenda das cores */}
      <div className="chips" role="group" aria-label="Grupo">
        {porGrupo.map(({ g, l }) => (
          <button
            key={g}
            className={`chip${grupo === g ? " ativo" : ""}`}
            aria-pressed={grupo === g}
            onClick={() => setGrupo(grupo === g ? null : g)}
            title={`${GRUPOS[g].rotulo}: ${moeda(valor(l))} em ${l.length} títulos`}
          >
            <span className="marca-cor" style={{ background: GRUPOS[g].cor }} />
            <span>
              <strong>{GRUPOS[g].rotulo}</strong>
              <small>{moedaCurta(valor(l))} · {Math.round((valor(l) / totalFaixa) * 100)}%</small>
            </span>
          </button>
        ))}
      </div>

      <div className="panorama-graficos">
        <div>
          <h3>Por situação</h3>
          {linhasSit.length === 0 && <p className="mudo pequeno">Nenhum vencido com esses filtros.</p>}
          <ul className="barras-h">
            {linhasSit.map(({ s, l }) => {
              const v = valor(l);
              const ativo = situacao === s.id;
              return (
                <li key={s.id}>
                  <button
                    className={`barra-h${ativo ? " ativo" : ""}${situacao && !ativo ? " apagada" : ""}`}
                    onClick={() => setSituacao(ativo ? null : s.id)}
                    aria-pressed={ativo}
                    title={`${s.rotulo} (${GRUPOS[s.grupo].rotulo}): ${moeda(v)} em ${l.length} títulos — clique para filtrar`}
                  >
                    <span className="bh-rotulo">{s.rotulo}</span>
                    <span className="bh-trilho">
                      <span className="bh-barra" style={{ width: `${Math.max(2, (v / maxSit) * 100)}%`, background: GRUPOS[s.grupo].cor }} />
                    </span>
                    <span className="bh-valor">{moedaCurta(v)} <small>· {l.length}</small></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3>Por tempo de atraso</h3>
          <div className="barras-v" role="group" aria-label="Faixa de atraso">
            {porFaixa.map(({ f, l }) => {
              const v = valor(l);
              const ativo = faixa === f.id;
              return (
                <button
                  key={f.id}
                  className={`barra-v${ativo ? " ativo" : ""}${faixa && !ativo ? " apagada" : ""}`}
                  onClick={() => setFaixa(ativo ? null : f.id)}
                  aria-pressed={ativo}
                  title={`${f.rotulo}: ${moeda(v)} em ${l.length} títulos — clique para filtrar`}
                >
                  <span className="bv-valor">{moedaCurta(v)}</span>
                  <span className="bv-trilho">
                    <span className="bv-barra" style={{ height: `${v ? Math.max(3, (v / maxFaixa) * 100) : 0}%` }} />
                  </span>
                  <span className="bv-rotulo">{f.rotulo}</span>
                  <small className="mudo">{l.length} título{l.length === 1 ? "" : "s"}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="pequeno mudo" style={{ margin: "12px 0 0" }}>
        Mostrando {filtrados.length} de {vencidos.length} vencidos. Clique numa barra ou num grupo para filtrar a lista abaixo.
      </p>
    </section>
  );
}

function FormCobranca({ t, situacoes, aoSalvar }: { t: Recebivel; situacoes: Situacao[]; aoSalvar: () => void }) {
  const [situacao, setSituacao] = useState(t.cobranca_situacao);
  const [previsao, setPrevisao] = useState(t.previsao ?? "");
  const [motivo, setMotivo] = useState(t.motivo ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const opcoes = situacoes.filter((s) => s.ativo || s.id === t.cobranca_situacao);
  return (
    <form
      className="form-cobranca"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarCobranca(t.flow_id, situacao, previsao, motivo);
          if (r.erro) setErro(r.erro);
          else aoSalvar();
        });
      }}
    >
      <div>
        <label htmlFor={`sit-${t.flow_id}`}>Cobrança</label>
        <select id={`sit-${t.flow_id}`} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          {ORDEM_GRUPOS.map((g) => {
            const doGrupo = opcoes.filter((s) => s.grupo === g);
            return doGrupo.length ? (
              <optgroup key={g} label={GRUPOS[g].rotulo}>
                {doGrupo.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      <div>
        <label htmlFor={`prev-${t.flow_id}`}>Previsão de pagamento</label>
        <input id={`prev-${t.flow_id}`} type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
      </div>
      <div style={{ flex: 2 }}>
        <label htmlFor={`mot-${t.flow_id}`}>Por que está vencido</label>
        <input id={`mot-${t.flow_id}`} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} placeholder="Ex.: aguardando liberação do financiamento" />
      </div>
      <div style={{ alignSelf: "flex-end" }}>
        <button className="botao" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
      </div>
      {erro && <div className="erro" style={{ flexBasis: "100%", margin: 0 }}>{erro}</div>}
    </form>
  );
}

function Concluir() {
  const [observacao, setObservacao] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="cartao"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await concluirAtualizacao(observacao);
          setMsg(r.erro ? { texto: r.erro } : { ok: true, texto: "Atualização concluída. A diretoria já vê a data nova." });
          if (!r.erro) setObservacao("");
        });
      }}
    >
      <h2>Concluir atualização</h2>
      <p className="pequeno mudo">Quando terminar de revisar os vencidos, conclua: fica registrado quem fez, quando, e os números do momento.</p>
      {msg && <div className={msg.ok ? "ok" : "erro"}>{msg.texto}</div>}
      <div className="campo">
        <label htmlFor="obs">Observação (opcional)</label>
        <textarea id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} style={{ minHeight: 70 }} />
      </div>
      <button className="botao" disabled={pendente}>{pendente ? "Concluindo…" : "Concluir atualização"}</button>
    </form>
  );
}

/* ---------- Situações de cobrança (a equipe cria e organiza) ---------- */
function GerenciarSituacoes({ situacoes }: { situacoes: Situacao[] }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [grupoNovo, setGrupoNovo] = useState<Grupo>("negociacao");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const agir = (fn: () => Promise<{ erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await fn();
      if (r.erro) setErro(r.erro);
      else depois?.();
    });

  return (
    <section className="cartao" style={{ marginTop: 16 }}>
      <div className="panorama-topo">
        <h2 style={{ margin: 0 }}>Situações de cobrança</h2>
        <button className="botao secundario pequeno" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : "Gerenciar"}</button>
      </div>
      {aberto && (
        <>
          <p className="pequeno mudo">Crie situações próprias e diga em qual grupo cada uma entra no gráfico. Situação desativada some da lista de escolha, mas os títulos que já a usam continuam com ela.</p>
          {erro && <div className="erro">{erro}</div>}
          <table style={{ opacity: pendente ? 0.6 : 1 }}>
            <thead><tr><th>Situação</th><th>Grupo no gráfico</th><th>Em uso na escolha</th></tr></thead>
            <tbody>
              {situacoes.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="text" defaultValue={s.rotulo} maxLength={60} aria-label={`Nome de ${s.rotulo}`}
                      onBlur={(e) => e.target.value.trim() !== s.rotulo && agir(() => alterarSituacao(s.id, { rotulo: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select value={s.grupo} aria-label={`Grupo de ${s.rotulo}`} onChange={(e) => agir(() => alterarSituacao(s.id, { grupo: e.target.value }))}>
                      {ORDEM_GRUPOS.map((g) => <option key={g} value={g}>{GRUPOS[g].rotulo}</option>)}
                    </select>
                  </td>
                  <td>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: 0 }}>
                      <input type="checkbox" checked={s.ativo} onChange={(e) => agir(() => alterarSituacao(s.id, { ativo: e.target.checked }))} />
                      {s.ativo ? "Ativa" : "Desativada"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form
            className="form-cobranca" style={{ marginTop: 16 }}
            onSubmit={(e) => { e.preventDefault(); agir(() => criarSituacao(nome, grupoNovo), () => setNome("")); }}
          >
            <div style={{ flex: 2 }}>
              <label htmlFor="nova-sit">Nova situação</label>
              <input id="nova-sit" type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: Aguardando seguradora" />
            </div>
            <div>
              <label htmlFor="nova-sit-grupo">Grupo</label>
              <select id="nova-sit-grupo" value={grupoNovo} onChange={(e) => setGrupoNovo(e.target.value as Grupo)}>
                {ORDEM_GRUPOS.map((g) => <option key={g} value={g}>{GRUPOS[g].rotulo}</option>)}
              </select>
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button className="botao" disabled={pendente || !nome.trim()}>Criar</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
