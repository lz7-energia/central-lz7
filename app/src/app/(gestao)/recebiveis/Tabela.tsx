"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  FAIXAS, GRUPOS, ORDEM_GRUPOS, faixaDe,
  type Atualizacao, type FaixaId, type Grupo, type Recebivel, type Situacao,
} from "@/lib/recebiveis";
import { data as fmtData, dataHora, moeda } from "@/lib/formato";
import { alterarSituacao, concluirAtualizacao, criarSituacao, salvarCobranca } from "./acoes";

type Aba = "vencidos" | "a_vencer" | "recebidos";
type Periodo = "dia" | "semana" | "mes" | "ano" | "todos";
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "dia", rotulo: "Hoje" },
  { id: "semana", rotulo: "Esta semana" },
  { id: "mes", rotulo: "Este mês" },
  { id: "ano", rotulo: "Este ano" },
  { id: "todos", rotulo: "Tudo" },
];

/** Último dia do período (calendário de Brasília; a semana vai até domingo). */
function fimDoPeriodo(hoje: string, p: Periodo) {
  const d = new Date(`${hoje}T12:00:00Z`);
  if (p === "dia") return hoje;
  if (p === "semana") { d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); }
  if (p === "mes") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  if (p === "ano") return `${hoje.slice(0, 4)}-12-31`;
  return "9999-12-31";
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

function somarDias(hoje: string, dias: number) {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const moedaCurta = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
  : v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : moeda(v);

function NomeCliente({ t }: { t: Recebivel }) {
  const principal = t.cliente_apelido ?? t.cliente ?? "Cliente não identificado";
  return (
    <>
      <strong>{principal}</strong>
      {t.cliente_apelido && t.cliente && <div className="pequeno mudo">{t.cliente}</div>}
      {t.codigo_projeto && <div className="pequeno mudo">{t.codigo_projeto}</div>}
    </>
  );
}

export function Tabela({ titulos, historico, situacoes, podeEditar, hoje }: {
  titulos: Recebivel[]; historico: Atualizacao[]; situacoes: Situacao[]; podeEditar: boolean; hoje: string;
}) {
  const [aba, setAba] = useState<Aba>("vencidos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [faixa, setFaixa] = useState<FaixaId | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const sit = useMemo(() => new Map(situacoes.map((s) => [s.id, s])), [situacoes]);
  const grupoDe = (t: Recebivel): Grupo => sit.get(t.cobranca_situacao)?.grupo ?? "outro";
  const rotuloDe = (id: string) => sit.get(id)?.rotulo ?? id;

  const em30 = somarDias(hoje, 30);
  const vencidos = titulos.filter((t) => t.estado === "vencido");
  const aVencer = titulos.filter((t) => t.estado === "a_vencer");
  const recebidos = titulos.filter((t) => t.estado === "recebido");
  const soma = (l: Recebivel[], campo: "valor_aberto" | "valor_recebido") => l.reduce((s, t) => s + Number(t[campo]), 0);

  // Filtros do gráfico (valem para a aba Vencidos)
  const vencidosFiltrados = vencidos.filter((t) =>
    (!grupo || grupoDe(t) === grupo) && (!faixa || faixaDe(t.dias_atraso) === faixa) && (!situacao || t.cobranca_situacao === situacao));
  const filtrosAtivos = Boolean(grupo || faixa || situacao);
  const fimPeriodo = fimDoPeriodo(hoje, periodo);
  const aVencerNoPeriodo = aVencer.filter((t) => t.vencimento && t.vencimento <= fimPeriodo);

  const lista = useMemo(() => {
    const base = aba === "vencidos" ? vencidosFiltrados : aba === "a_vencer" ? aVencerNoPeriodo : recebidos;
    const b = busca.trim().toLowerCase();
    const filtrada = b ? base.filter((t) => [t.cliente, t.cliente_apelido, t.codigo_projeto].some((v) => v?.toLowerCase().includes(b))) : base;
    return [...filtrada].sort((x, y) =>
      aba === "vencidos" ? (y.dias_atraso ?? 0) - (x.dias_atraso ?? 0)
      : aba === "a_vencer" ? String(x.vencimento).localeCompare(String(y.vencimento))
      : String(y.recebido_em).localeCompare(String(x.recebido_em)));
  }, [aba, busca, vencidosFiltrados, aVencerNoPeriodo, recebidos]);

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
          <div className="numero">{moeda(soma(recebidos, "valor_recebido"))}</div>
          <div className="detalhe">{recebidos.length} títulos baixados</div>
        </div>
      </div>

      <Panorama
        vencidos={vencidos} filtrados={vencidosFiltrados} situacoes={situacoes} grupoDe={grupoDe}
        grupo={grupo} faixa={faixa} situacao={situacao}
        setGrupo={(g) => { setGrupo(g); setSituacao(null); setAba("vencidos"); }}
        setFaixa={(f) => { setFaixa(f); setAba("vencidos"); }}
        setSituacao={(s) => { setSituacao(s); setAba("vencidos"); }}
        limpar={() => { setGrupo(null); setFaixa(null); setSituacao(null); }}
      />

      <div className="filtros">
        <div className="abas">
          {([["vencidos", "Vencidos", vencidosFiltrados.length], ["a_vencer", "A vencer", aVencerNoPeriodo.length], ["recebidos", "Recebidos no mês", recebidos.length]] as const).map(([id, rotulo, n]) => (
            <a key={id} href="#" className={aba === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setAba(id); setEditando(null); }}>
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
        <a className="botao secundario pequeno" href={`/recebiveis/exportar?aba=${aba}`} style={{ marginLeft: "auto" }}>
          Baixar planilha
        </a>
      </div>

      {aba === "a_vencer" && (
        <div className="filtros">
          <div className="abas" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <a key={p.id} href="#" className={periodo === p.id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setPeriodo(p.id); }}>
                {p.rotulo}
              </a>
            ))}
          </div>
          <span className="previsto">
            Previsto para receber: <strong>{moeda(soma(aVencerNoPeriodo, "valor_aberto"))}</strong>{" "}
            <span className="mudo">em {aVencerNoPeriodo.length} título{aVencerNoPeriodo.length === 1 ? "" : "s"}</span>
          </span>
        </div>
      )}

      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Vencimento</th>
              {aba === "vencidos" && <th>Atraso</th>}
              <th>{aba === "recebidos" ? "Recebido" : "Em aberto"}</th>
              {aba === "a_vencer" && <th>Vence em</th>}
              {aba === "vencidos" && <th>Cobrança</th>}
              {aba === "vencidos" && <th>Previsão</th>}
              {aba === "vencidos" && <th>Motivo</th>}
              {aba === "recebidos" && <th>Recebido em</th>}
              {podeEditar && aba === "vencidos" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={9} className="vazio">
                  {aba === "vencidos" ? (filtrosAtivos ? "Nenhum vencido com esses filtros." : "Nenhum título vencido. 🎉") : aba === "a_vencer" ? "Nenhum título vence neste período." : "Nada aqui."}
                </td>
              </tr>
            )}
            {lista.map((t) => (
              <Fragment key={t.flow_id}>
                <tr>
                  <td><NomeCliente t={t} /></td>
                  <td>{fmtData(t.vencimento)}</td>
                  {aba === "vencidos" && <td className="atrasado">{t.dias_atraso} dia{t.dias_atraso === 1 ? "" : "s"}</td>}
                  <td>{moeda(aba === "recebidos" ? t.valor_recebido : t.valor_aberto)}</td>
                  {aba === "a_vencer" && t.vencimento && (
                    <td className="mudo">{diasEntre(hoje, t.vencimento) === 0 ? "hoje" : `${diasEntre(hoje, t.vencimento)} dia${diasEntre(hoje, t.vencimento) === 1 ? "" : "s"}`}</td>
                  )}
                  {aba === "vencidos" && (
                    <td>
                      <span className={`etiqueta ${GRUPOS[grupoDe(t)].etiqueta}`}>{rotuloDe(t.cobranca_situacao)}</span>
                    </td>
                  )}
                  {aba === "vencidos" && <td className={t.previsao && t.previsao < hoje ? "atrasado" : ""}>{t.previsao ? fmtData(t.previsao) : <span className="mudo">—</span>}</td>}
                  {aba === "vencidos" && (
                    <td style={{ maxWidth: 280 }}>
                      {t.motivo ?? <span className="mudo">—</span>}
                      {t.alterado_por && <div className="pequeno mudo">{t.alterado_por} · {dataHora(t.alterado_em)}</div>}
                    </td>
                  )}
                  {aba === "recebidos" && <td>{fmtData(t.recebido_em)}</td>}
                  {podeEditar && aba === "vencidos" && (
                    <td style={{ textAlign: "right" }}>
                      <button className="botao secundario pequeno" onClick={() => setEditando(editando === t.flow_id ? null : t.flow_id)}>
                        {editando === t.flow_id ? "Fechar" : "Atualizar"}
                      </button>
                    </td>
                  )}
                </tr>
                {editando === t.flow_id && (
                  <tr className="linha-edicao">
                    <td colSpan={9}>
                      <FormCobranca t={t} situacoes={situacoes} aoSalvar={() => setEditando(null)} />
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
