"use client";

import { useActionState } from "react";
import { definirSenha } from "./acao";

export default function DefinirSenha() {
  const [estado, acao, salvando] = useActionState(definirSenha, { erro: "" });
  return (
    <main className="inicio">
      <div className="cartao" style={{ textAlign: "left" }}>
        <div className="logo">
          LZ7 <span>Central</span>
        </div>
        <h1>Criar senha</h1>
        <p className="sub">Use pelo menos 10 caracteres.</p>
        <form action={acao}>
          {estado.erro && <div className="erro">{estado.erro}</div>}
          <div className="campo">
            <label htmlFor="senha">Nova senha</label>
            <input id="senha" name="senha" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <div className="campo">
            <label htmlFor="confirma">Repita a senha</label>
            <input id="confirma" name="confirma" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <button className="botao" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar e entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
