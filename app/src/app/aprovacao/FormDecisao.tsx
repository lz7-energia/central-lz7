"use client";

import { useActionState } from "react";
import { decidir, type EstadoAprovacao } from "./acao";

export function FormDecisao({ token }: { token: string }) {
  const [estado, acao, salvando] = useActionState<EstadoAprovacao, FormData>(decidir, {});

  if (estado.feito) {
    return (
      <div className="ok">
        {estado.feito === "aprovado"
          ? "Pedido aprovado. Ele seguiu para o setor e o solicitante foi avisado."
          : "Pedido recusado. O solicitante foi avisado com o motivo."}
      </div>
    );
  }

  return (
    <form action={acao}>
      <input type="hidden" name="token" value={token} />
      {estado.erro && <div className="erro">{estado.erro}</div>}
      <div className="campo">
        <label htmlFor="comentario">Comentário (obrigatório se recusar)</label>
        <textarea id="comentario" name="comentario" maxLength={1000} defaultValue={estado.comentario ?? ""} />
      </div>
      <div className="acoes">
        <button className="botao" name="decisao" value="aprovado" disabled={salvando}>
          Aprovar
        </button>
        <button className="botao perigo" name="decisao" value="recusado" disabled={salvando}>
          Recusar
        </button>
      </div>
    </form>
  );
}
