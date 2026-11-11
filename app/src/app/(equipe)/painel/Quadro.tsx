"use client";

import { useMemo, useState, useTransition } from "react";
import { COLUNAS, type LinhaPainel } from "@/lib/tipos";
import { moeda, data as fmtData, dataHora } from "@/lib/formato";
import { desmarcarNota, marcarNota, mostrarCard, ocultarCard } from "./acoes";
import { nomesDoCliente } from "@/lib/recebiveis";

const DIAS_ALERTA = 5;

export function Quadro({ linhas }: { linhas: LinhaPainel[] }) {
  const [busca, setBusca] = useState("");
  const [resp, setResp] = useState("");
  const [verOcultos, setVerOcultos] = useState(false);

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
          [l.codigo_projeto, l.cliente, l.cliente_apelido, l.numero, l.nf_numero, l.os_numero].some((v) => v?.toLowerCase().includes(b))),
    );
  }, [linhas, busca, resp]);

  const visiveis = filtradas.filter((l) => !l.oculto);
  const ocultos = filtradas.filter((l) => l.oculto);
  const totalOcultos = linhas.filter((l) => l.oculto).length;

  const por = (c: string) => visiveis.filter((l) => l.coluna === c);
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
          <div className="detalhe">obra ainda não concluída</div>
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
        <div className="abas" style={{ marginLeft: "auto" }}>
          <a href="#" className={!verOcultos ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setVerOcultos(false); }}>
            Painel
          </a>
          <a href="#" className={verOcultos ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setVerOcultos(true); }}>
            Ocultos<span className="contador">{totalOcultos}</span>
          </a>
        </div>
      </div>

      {verOcultos ? (
        <ListaOcultos linhas={ocultos} />
      ) : (
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
                  <Cartao key={l.flow_id} l={l} coluna={c.id} />
                ))}
                {itens.length > 150 && <div className="vazio">+{itens.length - 150} (use a busca)</div>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Cartao({ l, coluna }: { l: LinhaPainel; coluna: string }) {
  const [pendente, iniciar] = useTransition();
  const [informandoNota, setInformandoNota] = useState(false);
  const [numeroNota, setNumeroNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const semNota = coluna === "em_execucao" || coluna === "pronto_faturar";

  const agir = (fn: () => Promise<{ erro?: string; ok?: boolean }>) =>
    iniciar(async () => {
      setErro(null);
      const r = await fn();
      if (r.erro) setErro(r.erro);
      else setInformandoNota(false);
    });

  return (
    <article className="cartao-projeto" style={pendente ? { opacity: 0.5 } : undefined}>
      <div className="cp-topo">
        <span className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero ?? l.flow_id}`}</span>
        {l.dias_parado !== null && (
          <span className={`dias${l.dias_parado >= DIAS_ALERTA ? " alto" : ""}`}>
            {l.dias_parado} {l.dias_parado === 1 ? "dia" : "dias"}
          </span>
        )}
      </div>
      <div className="cliente">{nomesDoCliente(l).principal}</div>
      {nomesDoCliente(l).apoio.filter((v) => v !== l.codigo_projeto).map((v) => <div key={v} className="razao">{v}</div>)}
      <div className="linha-info">
        <span>{moeda(l.valor_total)}</span>
        <span>{l.responsavel ?? "sem responsável"}</span>
      </div>
      <div className="linha-info">
        <span>
          {l.nf_numero ? `NF ${l.nf_numero}${l.nf_emitida_em ? ` · ${fmtData(l.nf_emitida_em)}` : ""}` : l.os_status ? `OS: ${l.os_status}` : "OS não encontrada"}
        </span>
      </div>
      {l.nota_manual && (
        <div className="linha-info">
          <span className="etiqueta cinza" title={l.alterado_em ? `em ${dataHora(l.alterado_em)}` : undefined}>
            Nota marcada à mão{l.alterado_por ? ` por ${l.alterado_por}` : ""}
          </span>
        </div>
      )}
      {(coluna === "faturado" || coluna === "recebido") && (
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

      {informandoNota ? (
        <form
          className="cp-nota"
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => marcarNota(l.flow_id, numeroNota));
          }}
        >
          <input
            type="text"
            placeholder="Nº da nota (opcional)"
            value={numeroNota}
            onChange={(e) => setNumeroNota(e.target.value)}
            aria-label="Número da nota"
            autoFocus
            maxLength={30}
          />
          <button className="botao pequeno" disabled={pendente}>
            Salvar
          </button>
          <button type="button" className="botao secundario pequeno" onClick={() => setInformandoNota(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="cp-acoes">
          {semNota && (
            <button type="button" onClick={() => setInformandoNota(true)} disabled={pendente}>
              Já tem nota
            </button>
          )}
          {l.nota_manual && (
            <button type="button" onClick={() => agir(() => desmarcarNota(l.flow_id))} disabled={pendente}>
              Desfazer nota
            </button>
          )}
          <button type="button" onClick={() => agir(() => ocultarCard(l.flow_id))} disabled={pendente}>
            Ocultar
          </button>
        </div>
      )}
      {erro && <div className="pequeno" style={{ color: "var(--perigo)", marginTop: 4 }}>{erro}</div>}
    </article>
  );
}

function ListaOcultos({ linhas }: { linhas: LinhaPainel[] }) {
  const [pendente, iniciar] = useTransition();
  const coluna = (id: string) => COLUNAS.find((c) => c.id === id)?.rotulo ?? id;
  return (
    <div className="tabela-caixa">
      <table>
        <thead>
          <tr>
            <th>Projeto</th>
            <th>Cliente</th>
            <th>Estaria em</th>
            <th>Ocultado por</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr>
              <td colSpan={5} className="vazio">
                Nenhum card oculto.
              </td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={l.flow_id} style={pendente ? { opacity: 0.6 } : undefined}>
              <td className="codigo">{l.codigo_projeto ?? `Pedido ${l.numero}`}</td>
              <td>{l.cliente ?? "—"}</td>
              <td>{coluna(l.coluna)}</td>
              <td className="mudo pequeno">
                {l.alterado_por ?? "—"}
                {l.alterado_em ? ` · ${dataHora(l.alterado_em)}` : ""}
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="botao secundario pequeno" disabled={pendente} onClick={() => iniciar(async () => { await mostrarCard(l.flow_id); })}>
                  Mostrar de novo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
