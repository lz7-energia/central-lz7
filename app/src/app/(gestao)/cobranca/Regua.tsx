"use client";

import { useMemo, useState, useTransition } from "react";
import {
  dataBR, moedaBR, montarFila, montarMensagem, nomeParaMensagem,
  type Contato, type Envio, type Etapa, type GrupoCliente, type SituacaoRegua, type TituloRegua,
} from "@/lib/regua";
import { dataHora } from "@/lib/formato";
import { alternarPausa, desfazerEnvio, excluirEtapa, registrarEnvio, salvarContato, salvarEtapa } from "./acoes";

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
type Aba = "enviar" | "emdia" | "pausados" | "enviados" | "configurar";
type Sit = SituacaoRegua & { grupo: string; ativo: boolean };

export function Regua({ hoje, titulos, etapas, envios, situacoes, contatos, meuId }: {
  hoje: string; titulos: TituloRegua[]; etapas: Etapa[]; envios: Envio[]; situacoes: Sit[];
  contatos: Record<string, Contato>; meuId: string | null;
}) {
  const [aba, setAba] = useState<Aba>("enviar");
  const [busca, setBusca] = useState("");
  const [ultimo, setUltimo] = useState<{ lote: string; nome: string; acao: string } | null>(null);
  const [msgTopo, setMsgTopo] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, comecar] = useTransition();

  const fila = useMemo(() => montarFila({ titulos, etapas, envios, situacoes, contatos: new Map(Object.entries(contatos)), hoje }),
    [titulos, etapas, envios, situacoes, contatos, hoje]);
  const porTitulo = useMemo(() => new Map(titulos.map((t) => [t.flow_id, t])), [titulos]);
  const etapaPor = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);

  const b = busca.trim().toLowerCase();
  const casa = (...s: (string | null | undefined)[]) => !b || s.some((x) => (x ?? "").toLowerCase().includes(b));
  const paraEnviar = fila.paraEnviar.filter((g) => casa(g.nome, g.razao, ...g.itens.map((i) => i.codigo_projeto)));
  const emDia = fila.emDia.filter((t) => casa(t.cliente_apelido, t.cliente, t.codigo_projeto));
  const pausados = fila.pausados.filter((t) => casa(t.cliente_apelido, t.cliente, t.codigo_projeto));

  // Enviados: um registro por lote (uma mensagem), mais recentes primeiro, últimos 30 dias.
  const lim = new Date(Date.now() - 30 * 86400000).toISOString();
  const lotes = useMemo(() => {
    const m = new Map<string, Envio[]>();
    for (const e of envios) if (e.em >= lim) { const l = m.get(e.lote) ?? []; l.push(e); m.set(e.lote, l); }
    return [...m.values()].sort((a, c) => (a[0].em < c[0].em ? 1 : -1));
  }, [envios, lim]);

  const desfazer = (lote: string) => comecar(async () => {
    const r = await desfazerEnvio(lote);
    setMsgTopo(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: "Registro desfeito." });
    if (!r.erro) setUltimo(null);
  });

  return (
    <>
      {ultimo && (
        <div className="ok regua-faixa">
          <span>{ultimo.acao === "enviado" ? "Envio registrado" : "Etapa pulada"} para <b>{ultimo.nome}</b>.</span>
          <button className="link-acao" disabled={pendente} onClick={() => desfazer(ultimo.lote)}>Desfazer</button>
        </div>
      )}
      {msgTopo && <div className={msgTopo.tipo} onClick={() => setMsgTopo(null)}>{msgTopo.texto}</div>}

      <div className="filtros">
        <div className="abas">
          {([["enviar", "Para enviar hoje", paraEnviar.length], ["emdia", "Em dia", emDia.length], ["pausados", "Pausados", pausados.length],
             ["enviados", "Enviados", lotes.length], ["configurar", "Etapas e textos", null]] as const).map(([id, rotulo, n]) => (
            <a key={id} href="#" className={aba === id ? "ativo" : ""} onClick={(e) => { e.preventDefault(); setAba(id); }}>
              {rotulo}{n !== null && <span className="contador">{n}</span>}
            </a>
          ))}
        </div>
        {aba !== "configurar" && <input type="search" placeholder="Buscar cliente ou projeto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />}
      </div>

      {aba === "enviar" && (
        paraEnviar.length === 0
          ? <div className="cartao vazio">Nenhuma mensagem para enviar hoje. 🎉</div>
          : <div className="regua-lista">{paraEnviar.map((g) => (
              <CartaoCliente key={g.chave} g={g} aoRegistrar={(lote, acao) => { setUltimo({ lote, nome: g.nome, acao }); setMsgTopo(null); }} />
            ))}</div>
      )}

      {aba === "emdia" && (
        <div className="tabela-caixa">
          <table>
            <thead><tr><th>Cliente</th><th>Vencimento</th><th>Em aberto</th><th>Última etapa</th><th>Próxima</th></tr></thead>
            <tbody>
              {emDia.length === 0 && <tr><td colSpan={5} className="vazio">Nenhum título com a etapa em dia.</td></tr>}
              {emDia.sort((a, c) => a.dias - c.dias).map((t) => (
                <tr key={t.flow_id}>
                  <td><b>{t.cliente_apelido || t.cliente}</b>{t.codigo_projeto && <div className="pequeno mudo">{t.codigo_projeto}</div>}</td>
                  <td>{dataBR(t.vencimento)}<div className="pequeno mudo">{t.dias === 0 ? "vence hoje" : `${t.dias} dia${t.dias === 1 ? "" : "s"} de atraso`}</div></td>
                  <td>{moedaBR(t.valor_aberto)}</td>
                  <td>{t.ultimoEnvio ? <>{etapaPor.get(t.ultimoEnvio.etapa_id)?.nome ?? t.ultimoEnvio.etapa_id}
                    <div className="pequeno mudo">{t.ultimoEnvio.acao === "pulado" ? "pulada" : "enviada"} · {t.ultimoEnvio.por?.split(" ")[0]} · {dataHora(t.ultimoEnvio.em)}</div></> : "—"}</td>
                  <td>{t.proxima ? <>{t.proxima.nome}<div className="pequeno mudo">em {t.proxima.dias - t.dias} dia{t.proxima.dias - t.dias === 1 ? "" : "s"}</div></> : <span className="mudo">fim da régua</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === "pausados" && (
        <div className="tabela-caixa">
          <table>
            <thead><tr><th>Cliente</th><th>Vencimento</th><th>Em aberto</th><th>Por que está pausado</th></tr></thead>
            <tbody>
              {pausados.length === 0 && <tr><td colSpan={4} className="vazio">Nenhum título pausado.</td></tr>}
              {pausados.sort((a, c) => c.dias - a.dias).map((t) => (
                <tr key={t.flow_id}>
                  <td><b>{t.cliente_apelido || t.cliente}</b>{t.codigo_projeto && <div className="pequeno mudo">{t.codigo_projeto}</div>}</td>
                  <td>{dataBR(t.vencimento)}<div className="pequeno mudo">{t.dias === 0 ? "vence hoje" : `${t.dias} dia${t.dias === 1 ? "" : "s"} de atraso`}</div></td>
                  <td>{moedaBR(t.valor_aberto)}</td>
                  <td><span className="etiqueta cinza">{t.motivo}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pequeno mudo" style={{ padding: "8px 12px", margin: 0 }}>
            A pausa vem da situação de cobrança do título (em Recebíveis) ou da marcação “Pago por financiamento”. Quando sair dessa situação, o título volta para a régua na etapa em que estiver.
          </p>
        </div>
      )}

      {aba === "enviados" && (
        <div className="tabela-caixa">
          <table>
            <thead><tr><th>Quando</th><th>Cliente</th><th>Etapa</th><th>Valor</th><th>Por</th><th>Telefone</th><th></th></tr></thead>
            <tbody>
              {lotes.length === 0 && <tr><td colSpan={7} className="vazio">Nenhum envio nos últimos 30 dias.</td></tr>}
              {lotes.map((l) => {
                const t0 = porTitulo.get(l[0].titulo_flow_id);
                const etapaMsg = l.map((e) => etapaPor.get(e.etapa_id)).filter(Boolean).sort((x, y) => y!.dias - x!.dias)[0];
                const mesmoDia = diaSP(l[0].em) === diaSP(new Date().toISOString());
                return (
                  <tr key={l[0].lote}>
                    <td style={{ whiteSpace: "nowrap" }}>{dataHora(l[0].em)}</td>
                    <td><b>{t0?.cliente_apelido || t0?.cliente || "—"}</b><div className="pequeno mudo">{l.length} título{l.length === 1 ? "" : "s"}</div></td>
                    <td>{etapaMsg?.nome ?? l[0].etapa_id}
                      {l[0].acao === "pulado" && <div className="pequeno mudo">pulada: {l[0].motivo}</div>}</td>
                    <td>{moedaBR(l.reduce((s, e) => s + (porTitulo.get(e.titulo_flow_id)?.valor_aberto ?? 0), 0))}</td>
                    <td>{l[0].por}</td>
                    <td className="pequeno">{l[0].telefone ?? "—"}</td>
                    <td>
                      {l[0].texto && <details><summary className="link-acao">mensagem</summary><pre className="regua-pre">{l[0].texto}</pre></details>}
                      {l[0].por_id === meuId && mesmoDia && <button className="link-acao" disabled={pendente} onClick={() => desfazer(l[0].lote)}>Desfazer</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aba === "configurar" && <Configurar etapas={etapas} situacoes={situacoes} />}
    </>
  );
}

function CartaoCliente({ g, aoRegistrar }: { g: GrupoCliente; aoRegistrar: (lote: string, acao: string) => void }) {
  const inicial = useMemo(() => montarMensagem(g.etapa, { nome: nomeParaMensagem(g.razao, g.nome), itens: g.itens }), [g]);
  const [texto, setTexto] = useState(inicial);
  const [telefone, setTelefone] = useState(g.contato.telefone ?? "");
  const [editandoTel, setEditandoTel] = useState(!g.telefoneWa);
  const [pular, setPular] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, comecar] = useTransition();
  const itens = g.itens.map((i) => ({ titulo: i.flow_id, etapa: i.etapa!.id }));
  const telWa = (() => { const d = telefone.replace(/\D/g, ""); return d.length === 10 || d.length === 11 ? "55" + d : d.startsWith("55") && (d.length === 12 || d.length === 13) ? d : null; })();

  const enviar = () => {
    if (!telWa) { setErro("Informe um telefone com DDD."); return; }
    window.open(`https://wa.me/${telWa}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    comecar(async () => {
      if (g.id_cliente && telefone.replace(/\D/g, "") !== (g.contato.telefone ?? "").replace(/\D/g, "")) await salvarContato(g.id_cliente, telefone, g.contato.email ?? "");
      const r = await registrarEnvio(itens, telWa, texto, "enviado");
      if (r.erro) setErro(r.erro); else aoRegistrar(r.lote!, "enviado");
    });
  };
  const confirmarPulo = () => comecar(async () => {
    const r = await registrarEnvio(itens, "", "", "pulado", pular ?? "");
    if (r.erro) setErro(r.erro); else aoRegistrar(r.lote!, "pulado");
  });
  const salvarTel = () => comecar(async () => {
    if (!g.id_cliente) { setEditandoTel(false); return; }
    const r = await salvarContato(g.id_cliente, telefone, g.contato.email ?? "");
    if (r.erro) setErro(r.erro); else { setErro(""); setEditandoTel(false); }
  });

  return (
    <div className="cartao regua-cartao">
      <div className="regua-cab">
        <div>
          <b className="regua-nome">{g.nome}</b>
          {g.razao && g.razao !== g.nome && <div className="pequeno mudo">{g.razao}</div>}
        </div>
        <span className={`etiqueta ${g.etapa.dias >= 30 ? "vermelho" : g.etapa.dias >= 7 ? "amarelo" : "azul"}`}>{g.etapa.nome}</span>
        <b className="regua-total">{moedaBR(g.total)}</b>
      </div>
      <ul className="regua-titulos">
        {g.itens.map((i) => (
          <li key={i.flow_id}>
            {moedaBR(i.valor_aberto)} · venc. {dataBR(i.vencimento)} · {i.dias === 0 ? "vence hoje" : `${i.dias} dia${i.dias === 1 ? "" : "s"}`}
            {i.codigo_projeto && <span className="mudo"> · {i.codigo_projeto}</span>}
            {i.ultimoEnvio && <span className="mudo"> · última: {i.ultimoEnvio.acao === "pulado" ? "pulada" : "enviada"} em {dataHora(i.ultimoEnvio.em)}</span>}
          </li>
        ))}
      </ul>
      <div className="regua-tel">
        {editandoTel ? (
          <>
            <label htmlFor={`tel-${g.chave}`} className="pequeno">WhatsApp do cliente</label>
            <input id={`tel-${g.chave}`} type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="43 99999-0000" style={{ maxWidth: 200 }} />
            {g.id_cliente && <button className="botao secundario pequeno" disabled={pendente} onClick={salvarTel}>Salvar telefone</button>}
            {!g.contato.telefone && <span className="pequeno mudo">Sem telefone no cadastro do Flow.</span>}
          </>
        ) : (
          <>
            <span className="pequeno">WhatsApp: <b>{telefone}</b> <span className="mudo">({g.contato.origem === "central" ? "informado na Central" : "do Flow"})</span></span>
            <button className="link-acao" onClick={() => setEditandoTel(true)}>trocar</button>
          </>
        )}
      </div>
      <textarea className="regua-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(12, texto.split("\n").length + 1)} aria-label="Mensagem" />
      <div className="regua-acoes">
        <button className="botao" disabled={pendente || !telWa} onClick={enviar}>Abrir WhatsApp e registrar</button>
        {texto !== inicial && <button className="link-acao" onClick={() => setTexto(inicial)}>voltar ao texto da etapa</button>}
        <span style={{ marginLeft: "auto" }} />
        {pular === null
          ? <button className="link-acao" onClick={() => setPular("")}>Pular esta etapa</button>
          : <>
              <input type="text" value={pular} onChange={(e) => setPular(e.target.value)} placeholder="Por quê? Ex.: cliente avisou que paga sexta" maxLength={300} style={{ maxWidth: 320 }} autoFocus />
              <button className="botao secundario pequeno" disabled={pendente || !pular.trim()} onClick={confirmarPulo}>Confirmar</button>
              <button className="link-acao" onClick={() => setPular(null)}>cancelar</button>
            </>}
      </div>
      {erro && <div className="erro" style={{ margin: "8px 0 0" }}>{erro}</div>}
    </div>
  );
}

function Configurar({ etapas, situacoes }: { etapas: Etapa[]; situacoes: Sit[] }) {
  const [nova, setNova] = useState(false);
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState("");
  return (
    <>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Etapas da régua</h2>
        <p className="pequeno mudo">
          Dias contados a partir do vencimento (0 = no dia). Variáveis no texto: <code>{"{nome}"}</code> (primeiro nome, ou a razão social de empresa),
          <code>{"{lista}"}</code> (os títulos em aberto, um por linha), <code>{"{total}"}</code>, <code>{"{dias}"}</code> (dias de atraso do mais antigo)
          e <code>{"{vencimento}"}</code> (o vencimento mais antigo). Quem entra atrasado na régua recebe só a etapa atual.
        </p>
        {[...etapas].sort((a, c) => a.dias - c.dias).map((e) => <EditorEtapa key={e.id} e={e} />)}
        {nova ? <EditorEtapa e={{ id: "", dias: 45, nome: "", texto: "", ativo: true }} aoFechar={() => setNova(false)} />
              : <button className="botao secundario pequeno" onClick={() => setNova(true)}>+ Nova etapa</button>}
      </div>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Situações que pausam a régua</h2>
        <p className="pequeno mudo">Título com uma destas situações de cobrança (em Recebíveis) sai da régua até mudar de situação. Recebido, excluído e “Pago por financiamento” sempre saem.</p>
        <div className="regua-pausas">
          {situacoes.filter((s) => s.ativo).map((s) => (
            <label key={s.id} className="regua-pausa">
              <input type="checkbox" checked={s.pausa_regua} disabled={pendente}
                onChange={(ev) => comecar(async () => { const r = await alternarPausa(s.id, ev.target.checked); setErro(r.erro ?? ""); })} />
              {s.rotulo}
            </label>
          ))}
        </div>
        {erro && <div className="erro">{erro}</div>}
      </div>
    </>
  );
}

function EditorEtapa({ e, aoFechar }: { e: Etapa; aoFechar?: () => void }) {
  const [dias, setDias] = useState(String(e.dias));
  const [nome, setNome] = useState(e.nome);
  const [texto, setTexto] = useState(e.texto);
  const [ativo, setAtivo] = useState(e.ativo);
  const [msg, setMsg] = useState<{ tipo: string; t: string } | null>(null);
  const [pendente, comecar] = useTransition();
  const mudou = String(e.dias) !== dias || e.nome !== nome || e.texto !== texto || e.ativo !== ativo;
  const salvar = () => comecar(async () => {
    const r = await salvarEtapa({ id: e.id || undefined, dias: Number(dias), nome, texto, ativo });
    setMsg(r.erro ? { tipo: "erro", t: r.erro } : { tipo: "ok", t: "Etapa salva." });
    if (!r.erro && aoFechar) aoFechar();
  });
  const excluir = () => { if (!confirm(`Excluir a etapa "${e.nome}"? Os envios já registrados continuam no histórico.`)) return;
    comecar(async () => { const r = await excluirEtapa(e.id); if (r.erro) setMsg({ tipo: "erro", t: r.erro }); }); };
  return (
    <div className={`regua-etapa${ativo ? "" : " inativa"}`}>
      <div className="form-cobranca">
        <div style={{ flex: "0 0 110px", minWidth: 0 }}>
          <label htmlFor={`ed-${e.id || "nova"}`}>Dias</label>
          <input id={`ed-${e.id || "nova"}`} type="number" min={0} max={365} value={dias} onChange={(ev) => setDias(ev.target.value)} />
        </div>
        <div style={{ flex: 2 }}>
          <label htmlFor={`en-${e.id || "nova"}`}>Nome da etapa</label>
          <input id={`en-${e.id || "nova"}`} type="text" value={nome} onChange={(ev) => setNome(ev.target.value)} maxLength={80} placeholder="Ex.: 45 dias de atraso" />
        </div>
        <div style={{ flex: "0 0 auto", alignSelf: "flex-end", minWidth: 0 }}>
          <label className="regua-pausa"><input type="checkbox" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} /> Ativa</label>
        </div>
      </div>
      <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={Math.min(10, texto.split("\n").length + 2)} aria-label="Texto da mensagem" className="regua-texto" />
      <div className="regua-acoes">
        <button className="botao pequeno" disabled={pendente || !mudou} onClick={salvar}>{pendente ? "Salvando…" : "Salvar"}</button>
        {aoFechar && <button className="link-acao" onClick={aoFechar}>cancelar</button>}
        {e.id && <button className="link-acao" style={{ marginLeft: "auto" }} disabled={pendente} onClick={excluir}>Excluir etapa</button>}
        {msg && <span className={`pequeno ${msg.tipo === "erro" ? "atrasado" : "mudo"}`}>{msg.t}</span>}
      </div>
    </div>
  );
}
