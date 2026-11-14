"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Campo, TipoCampo } from "@/lib/tipos";
import { excluirTipo, restaurarTipo, salvarTipo, type Resultado } from "./acoes";

const NOMES: Record<TipoCampo, string> = {
  texto: "Texto curto", texto_longo: "Texto longo", numero: "Valor (R$)", data: "Data", lista: "Lista de opções", arquivo: "Anexo (arquivo)",
};
type Linha = Campo & { uid: number; opcoesTexto: string };

export function EditorTipo({ setores, tipo, setorInicial }: { setores: { id: string; nome: string }[]; tipo: { id: number; nome: string; prazo_dias: number; campos: Campo[] } | null; setorInicial: string }) {
  const router = useRouter();
  const [estado, acao, salvando] = useActionState(async (s: Resultado, f: FormData) => {
    const r = await salvarTipo(s, f);
    if (r.ok) router.push("/pedidos/tipos");
    return r;
  }, {});
  const [campos, setCampos] = useState<Linha[]>(() =>
    (tipo?.campos.length ? tipo.campos : [{ chave: "", rotulo: "", tipo: "texto" as TipoCampo, obrigatorio: true }])
      .map((c, i) => ({ ...c, uid: i + 1, opcoesTexto: (c.opcoes ?? []).join("\n") })));
  const muda = (uid: number, m: Partial<Linha>) => setCampos(campos.map((c) => (c.uid === uid ? { ...c, ...m } : c)));
  const mover = (i: number, d: number) => { const n = [...campos]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setCampos(n); };
  const json = JSON.stringify(campos.map(({ uid: _u, opcoesTexto, ...c }) => ({ ...c, opcoes: c.tipo === "lista" ? opcoesTexto.split("\n") : undefined })));

  return (
    <form action={acao} className="cartao" style={{ maxWidth: 820 }}>
      {tipo && <input type="hidden" name="id" value={tipo.id} />}
      <input type="hidden" name="campos" value={json} />
      <div className="linha-campos">
        <div className="campo">
          <label htmlFor="setor_id">Setor</label>
          <select id="setor_id" name="setor_id" defaultValue={setorInicial} required>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="campo" style={{ flex: 2 }}>
          <label htmlFor="nome">Nome do tipo</label>
          <input id="nome" name="nome" required maxLength={120} defaultValue={tipo?.nome ?? ""} placeholder="Ex.: Reembolso de despesa" />
        </div>
        <div className="campo">
          <label htmlFor="prazo_dias">Prazo padrão (dias)</label>
          <input id="prazo_dias" name="prazo_dias" type="number" min={0} max={365} defaultValue={tipo?.prazo_dias ?? 3} />
        </div>
      </div>

      <h2 style={{ marginTop: 10 }}>Perguntas</h2>
      {campos.map((c, i) => (
        <div key={c.uid} className="tipo-pergunta">
          <div className="linha-campos">
            <div className="campo" style={{ flex: 3 }}>
              <label>Pergunta {i + 1}</label>
              <input value={c.rotulo} onChange={(e) => muda(c.uid, { rotulo: e.target.value })} maxLength={200} placeholder="Ex.: Valor da despesa" />
            </div>
            <div className="campo">
              <label>Tipo de resposta</label>
              <select value={c.tipo} onChange={(e) => muda(c.uid, { tipo: e.target.value as TipoCampo })}>
                {(Object.keys(NOMES) as TipoCampo[]).map((t) => <option key={t} value={t}>{NOMES[t]}</option>)}
              </select>
            </div>
          </div>
          {c.tipo === "lista" && (
            <div className="campo">
              <label>Opções (uma por linha)</label>
              <textarea value={c.opcoesTexto} onChange={(e) => muda(c.uid, { opcoesTexto: e.target.value })} style={{ minHeight: 70 }} />
            </div>
          )}
          <div className="acoes" style={{ justifyContent: "space-between" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400, margin: 0 }}>
              <input type="checkbox" checked={!!c.obrigatorio} onChange={(e) => muda(c.uid, { obrigatorio: e.target.checked })} /> Obrigatória
            </label>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="botao secundario pequeno" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button type="button" className="botao secundario pequeno" onClick={() => mover(i, 1)} disabled={i === campos.length - 1} aria-label="Descer">↓</button>
              <button type="button" className="botao secundario pequeno" onClick={() => setCampos(campos.filter((x) => x.uid !== c.uid))}>Remover</button>
            </span>
          </div>
        </div>
      ))}
      <button type="button" className="botao secundario pequeno" onClick={() => setCampos([...campos, { chave: "", rotulo: "", tipo: "texto", obrigatorio: false, uid: Date.now(), opcoesTexto: "" }])}>+ Pergunta</button>
      {tipo && <p className="mudo pequeno">Mudar ou remover uma pergunta não altera os pedidos que já foram feitos.</p>}
      {estado.erro && <div className="erro">{estado.erro}</div>}
      <div className="acoes" style={{ marginTop: 16 }}>
        <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : tipo ? "Salvar tipo" : "Criar tipo"}</button>
        <Link href="/pedidos/tipos" className="botao secundario">Cancelar</Link>
      </div>
    </form>
  );
}

export function BotoesTipo({ id, nome, fora = false }: { id: number; nome: string; fora?: boolean }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resultado>({});
  if (fora) return (
    <button type="button" className="botao secundario pequeno" disabled={pend} onClick={() => iniciar(async () => { setMsg(await restaurarTipo(id)); router.refresh(); })}>
      Voltar ao portal
    </button>
  );
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <Link href={`/pedidos/tipos?editar=${id}`} className="botao secundario pequeno">Editar</Link>
      <button type="button" className="botao perigo pequeno" disabled={pend}
              onClick={() => { if (window.confirm(`Excluir o tipo "${nome}"? Ele sai do portal. Se já tiver pedidos, eles continuam na fila.`)) iniciar(async () => { setMsg(await excluirTipo(id)); router.refresh(); }); }}>
        {pend ? "…" : "Excluir"}
      </button>
      {msg.erro && <span className="pequeno" style={{ color: "var(--perigo)" }}>{msg.erro}</span>}
    </span>
  );
}
