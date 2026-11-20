"use client";

import { useState, useTransition, type ReactNode } from "react";
import { salvarOrdem } from "./acoes";

type Item = { chave: string; rotulo: string; conteudo: ReactNode };

/** Grade de cards que a pessoa pode reorganizar (arrastar, ou setas no celular). Cada um tem a própria ordem. */
export function Reordenar({ lugar, itens, className, titulo }: { lugar: string; itens: Item[]; className: string; titulo?: ReactNode }) {
  const [editando, setEditando] = useState(false);
  const [ordem, setOrdem] = useState(itens.map((i) => i.chave));
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  // itens que chegaram depois (ex.: módulo novo) entram no fim
  const lista = [...ordem.filter((c) => porChave.has(c)), ...itens.map((i) => i.chave).filter((c) => !ordem.includes(c))];

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= lista.length || de === para) return;
    const nova = [...lista];
    const [x] = nova.splice(de, 1);
    nova.splice(para, 0, x);
    setOrdem(nova);
  };
  const salvar = (chaves: string[]) => iniciar(async () => {
    setErro("");
    const r = await salvarOrdem(lugar, chaves);
    if (r.erro) setErro(r.erro); else setEditando(false);
  });
  const cancelar = () => { setOrdem(itens.map((i) => i.chave)); setEditando(false); setErro(""); };

  return (
    <>
      <div className="reordenar-barra">
        {titulo}
        {!editando
          ? <button type="button" className="link-acao pequeno" onClick={() => setEditando(true)}>Reorganizar</button>
          : <span className="reordenar-acoes">
              <span className="mudo pequeno">Arraste os cards ou use as setas.</span>
              <button type="button" className="botao pequeno" disabled={pendente} onClick={() => salvar(lista)}>{pendente ? "Salvando…" : "Salvar ordem"}</button>
              <button type="button" className="botao secundario pequeno" disabled={pendente} onClick={cancelar}>Cancelar</button>
              <button type="button" className="link-acao pequeno" disabled={pendente} onClick={() => salvar([])}>Voltar ao padrão</button>
            </span>}
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className={`${className}${editando ? " reordenando" : ""}`}>
        {lista.map((c, i) => {
          const it = porChave.get(c)!;
          if (!editando) return <div key={c} className="reordenar-item">{it.conteudo}</div>;
          return (
            <div key={c} className={`reordenar-item editando${arrastando === c ? " arrastando" : ""}`} draggable
              onDragStart={(e) => { setArrastando(c); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => setArrastando(null)}
              onDragOver={(e) => { e.preventDefault(); if (arrastando && arrastando !== c) mover(lista.indexOf(arrastando), i); }}
              onClickCapture={(e) => e.preventDefault()}>
              {it.conteudo}
              <span className="reordenar-setas">
                <button type="button" aria-label={`Mover ${it.rotulo} para antes`} disabled={i === 0} onClick={(e) => { e.stopPropagation(); mover(i, i - 1); }}>←</button>
                <button type="button" aria-label={`Mover ${it.rotulo} para depois`} disabled={i === lista.length - 1} onClick={(e) => { e.stopPropagation(); mover(i, i + 1); }}>→</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
