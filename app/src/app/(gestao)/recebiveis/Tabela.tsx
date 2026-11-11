"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { SITUACOES, type Atualizacao, type Recebivel, type SituacaoCobranca } from "@/lib/recebiveis";
import { data as fmtData, dataHora, moeda } from "@/lib/formato";
import { concluirAtualizacao, salvarCobranca } from "./acoes";

type Aba = "vencidos" | "a_vencer" | "recebidos";

function somarDias(hoje: string, dias: number) {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function Tabela({ titulos, historico, podeEditar, hoje }: { titulos: Recebivel[]; historico: Atualizacao[]; podeEditar: boolean; hoje: string }) {
  const [aba, setAba] = useState<Aba>("vencidos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);

  const em30 = somarDias(hoje, 30);
  const vencidos = titulos.filter((t) => t.estado === "vencido");
  const aVencer = titulos.filter((t) => t.estado === "a_vencer");
  const recebidos = titulos.filter((t) => t.estado === "recebido");
  const soma = (l: Recebivel[], campo: "valor_aberto" | "valor_recebido") => l.reduce((s, t) => s + Number(t[campo]), 0);

  const lista = useMemo(() => {
    const base = aba === "vencidos" ? vencidos : aba === "a_vencer" ? aVencer : recebidos;
    const b = busca.trim().toLowerCase();
    const filtrada = b ? base.filter((t) => [t.cliente, t.codigo_projeto].some((v) => v?.toLowerCase().includes(b))) : base;
    return [...filtrada].sort((x, y) =>
      aba === "vencidos" ? (y.dias_atraso ?? 0) - (x.dias_atraso ?? 0)
      : aba === "a_vencer" ? String(x.vencimento).localeCompare(String(y.vencimento))
      : String(y.recebido_em).localeCompare(String(x.recebido_em)));
  }, [aba, busca, vencidos, aVencer, recebidos]);

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

      <div className="filtros">
        <div className="abas">
          {([["vencidos", `Vencidos`, vencidos.length], ["a_vencer", "A vencer", aVencer.length], ["recebidos", "Recebidos no mês", recebidos.length]] as const).map(([id, rotulo, n]) => (
            <a key={id} href="#" className={aba === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setAba(id); setEditando(null); }}>
              {rotulo}<span className="contador">{n}</span>
            </a>
          ))}
        </div>
        <input type="search" placeholder="Buscar cliente ou projeto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <a className="botao secundario pequeno" href={`/recebiveis/exportar?aba=${aba}`} style={{ marginLeft: "auto" }}>
          Baixar planilha
        </a>
      </div>

      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Vencimento</th>
              {aba === "vencidos" && <th>Atraso</th>}
              <th>{aba === "recebidos" ? "Recebido" : "Em aberto"}</th>
              {aba !== "recebidos" && <th>Cobrança</th>}
              {aba !== "recebidos" && <th>Previsão</th>}
              {aba !== "recebidos" && <th>Motivo</th>}
              {aba === "recebidos" && <th>Recebido em</th>}
              {podeEditar && aba !== "recebidos" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={9} className="vazio">
                  {aba === "vencidos" ? "Nenhum título vencido. 🎉" : "Nada aqui."}
                </td>
              </tr>
            )}
            {lista.map((t) => (
              <Fragment key={t.flow_id}>
                <tr>
                  <td>
                    <strong>{t.cliente ?? "Cliente não identificado"}</strong>
                    {t.codigo_projeto && <div className="pequeno mudo">{t.codigo_projeto}</div>}
                  </td>
                  <td>{fmtData(t.vencimento)}</td>
                  {aba === "vencidos" && <td className="atrasado">{t.dias_atraso} dia{t.dias_atraso === 1 ? "" : "s"}</td>}
                  <td>{moeda(aba === "recebidos" ? t.valor_recebido : t.valor_aberto)}</td>
                  {aba !== "recebidos" && (
                    <td>
                      <span className={`etiqueta ${SITUACOES[t.cobranca_situacao].cor}`}>{SITUACOES[t.cobranca_situacao].rotulo}</span>
                    </td>
                  )}
                  {aba !== "recebidos" && <td className={t.previsao && t.previsao < hoje ? "atrasado" : ""}>{t.previsao ? fmtData(t.previsao) : <span className="mudo">—</span>}</td>}
                  {aba !== "recebidos" && (
                    <td style={{ maxWidth: 280 }}>
                      {t.motivo ?? <span className="mudo">—</span>}
                      {t.alterado_por && <div className="pequeno mudo">{t.alterado_por} · {dataHora(t.alterado_em)}</div>}
                    </td>
                  )}
                  {aba === "recebidos" && <td>{fmtData(t.recebido_em)}</td>}
                  {podeEditar && aba !== "recebidos" && (
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
                      <FormCobranca t={t} aoSalvar={() => setEditando(null)} />
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
    </>
  );
}

function FormCobranca({ t, aoSalvar }: { t: Recebivel; aoSalvar: () => void }) {
  const [situacao, setSituacao] = useState<SituacaoCobranca>(t.cobranca_situacao);
  const [previsao, setPrevisao] = useState(t.previsao ?? "");
  const [motivo, setMotivo] = useState(t.motivo ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
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
        <select id={`sit-${t.flow_id}`} value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoCobranca)}>
          {Object.entries(SITUACOES).map(([id, s]) => (
            <option key={id} value={id}>{s.rotulo}</option>
          ))}
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
