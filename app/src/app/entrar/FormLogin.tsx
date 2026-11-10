"use client";

import { useActionState } from "react";
import { entrar, esqueciSenha, type EstadoLogin } from "./acoes";

export function FormLogin({ volta }: { volta: string }) {
  const [estado, acaoEntrar, entrando] = useActionState<EstadoLogin, FormData>(entrar, {});
  const [estadoSenha, acaoSenha, enviando] = useActionState<EstadoLogin, FormData>(esqueciSenha, {});
  const msg = estado.erro || estadoSenha.erro;

  return (
    <form action={acaoEntrar}>
      {msg && <div className="erro">{msg}</div>}
      {estadoSenha.aviso && <div className="ok">{estadoSenha.aviso}</div>}
      <input type="hidden" name="volta" value={volta} />
      <div className="campo">
        <label htmlFor="email">E-mail da empresa</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={estado.email ?? estadoSenha.email} />
      </div>
      <div className="campo">
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" />
      </div>
      <div className="acoes" style={{ justifyContent: "space-between" }}>
        <button className="botao" type="submit" disabled={entrando}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>
        <button className="botao secundario pequeno" formAction={acaoSenha} formNoValidate disabled={enviando}>
          Esqueci a senha
        </button>
      </div>
    </form>
  );
}
