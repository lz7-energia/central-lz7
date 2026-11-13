"use client";
export function Imprimir() {
  return <div className="nao-imprimir" style={{ textAlign: "right", marginBottom: 12 }}><button className="botao" onClick={() => window.print()}>Imprimir / salvar em PDF</button></div>;
}
