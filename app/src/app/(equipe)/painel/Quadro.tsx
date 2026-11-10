"use client";

import { useMemo, useState } from "react";
import { COLUNAS, type LinhaPainel } from "@/lib/tipos";
import { moeda, data as fmtData } from "@/lib/formato";

const DIAS_ALERTA = 5;

export function Quadro({ linhas }: { linhas: LinhaPainel[] }) {
  const [busca, setBusca] = useState("");
  const [resp, setResp] = useState("");

  const responsaveis = useMemo(
    () => [...new Set(linhas.map((l) => l.responsavel).filter(Boolean) as string[])].sort(),
    [linhas],
  );

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhas.filter(
      (l) =>
        (!resp || (resp === "__sem" ? !l.responsavel : l.responsavel === resp)) &&
        (!b ||
          [l.codigo_projeto, l.cliente, l.numero, l.nf_numero, l.os_numero].some((v) => v?.toLowerCase().includes(b))),
    );
  }, [linhas, busca, resp]);

  const por = (c: string) => filtradas.filter((l) => l.coluna === c);
  const prontos = por("pronto_faturar");
  const faturados = por("faturado");
  const parados = prontos.filter((l) => (l.dias_parado ?? 0) >= DIAS_ALERTA).length;
  const aReceber = faturados.reduce((s, l) => s + (Number(l.total_titulos) - Number(l.total_recebido)), 0);

  return (
    <>
      <div className="resumo">
        <div className={`indicador${prontos.length ? " destaque" : ""}`}>
          <div className="rotulo">Pronto pra faturar</div>
          <div className="numero">{prontos.length}</div>
          <div className="detalhe">{moeda(prontos.reduce((s, l) => s + Number(l.valor_total ?? 0), 0))}</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Parados há {DIAS_ALERTA}+ dias</div>
          <div className="numero" style={parados ? { color: "var(--perigo)" } : undefined}>
            {parados}
          </div>
          <div className="detalhe">sem NF-e emitida</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Faturado a receber</div>
          <div className="numero">{faturados.length}</div>
          <div className="detalhe">{moeda(aReceber)} em aberto</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Em execução</div>
          <div className="numero">{por("em_execucao").length}</div>
          <div className="detalhe">aguardando vistoria</div>
        </div>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar projeto, cliente, pedido, NF ou OS"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: 300 }}
          aria-label="Buscar"
        />
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          <option value="__sem">Sem responsável</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="quadro">
        {COLUNAS.map((c) => {
          let itens = por(c.id);
          if (c.id === "pronto_faturar") itens = [...itens].sort((a, b) => (b.dias_parado ?? 0) - (a.dias_parado ?? 0));
          return (
            <section key={c.id} className={`coluna ${c.id}`} aria-label={c.rotulo}>
              <div className="coluna-topo" title={c.dica}>
                <strong>{c.rotulo}</strong>
                <span className="mudo">{itens.length}</span>
              </div>
              {itens.length === 0 && <div className="vazio">{linhas.length ? "Nada aqui" : "Sem dados do Flow ainda"}</div>}
              {itens.slice(0, 150).map((l) => (
                <article key={l.flow_id} className="cartao-projeto">
                  <div className="cp-topo">
                    <span className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero ?? l.flow_id}`}</span>
                    {l.dias_parado !== null && (
                      <span className={`dias${l.dias_parado >= DIAS_ALERTA ? " alto" : ""}`}>
                        {l.dias_parado} {l.dias_parado === 1 ? "dia" : "dias"}
                      </span>
                    )}
                  </div>
                  <div className="cliente">{l.cliente ?? "—"}</div>
                  <div className="linha-info">
                    <span>{moeda(l.valor_total)}</span>
                    <span>{l.responsavel ?? "sem responsável"}</span>
                  </div>
                  <div className="linha-info">
                    <span>
                      {l.nf_numero ? `NF ${l.nf_numero} · ${fmtData(l.nf_emitida_em)}` : l.os_status ? `OS: ${l.os_status}` : "OS não encontrada"}
                    </span>
                  </div>
                  {(c.id === "faturado" || c.id === "recebido") && (
                    <>
                      <div className="barra" aria-label={`${l.pct_recebido}% recebido`}>
                        <div style={{ width: `${Math.min(100, Number(l.pct_recebido))}%` }} />
                      </div>
                      <div className="linha-info" style={{ marginTop: 4 }}>
                        <span>{Number(l.pct_recebido).toLocaleString("pt-BR")}% recebido</span>
                        <span>
                          {moeda(l.total_recebido)} de {moeda(l.total_titulos)}
                        </span>
                      </div>
                    </>
                  )}
                </article>
              ))}
              {itens.length > 150 && <div className="vazio">+{itens.length - 150} (use a busca)</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
