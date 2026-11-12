"use client";

import { useActionState, useState } from "react";
import { atualizarPedido, comentar, responderPedido, type Estado } from "./acoes";
import { STATUS, STATUS_EQUIPE, type StatusPedido } from "@/lib/tipos";

type Props = {
  id: number;
  status: StatusPedido;
  responsavelId: string | null;
  prazo: string | null;
  equipe: { id: string; nome: string }[];
};

export function FormAtendimento({ id, status, responsavelId, prazo, equipe }: Props) {
  const [estado, acao, salvando] = useActionState<Estado, FormData>(atualizarPedido, {});
  const [novo, setNovo] = useState<StatusPedido>(status);
  const bloqueado = status === "aguardando_aprovacao";

  return (
    <form action={acao} className="cartao" key={`${status}-${responsavelId}-${prazo}`}>
      <h2>Atendimento</h2>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status_antes" value={status} />
      {estado.erro && <div className="erro">{estado.erro}</div>}
      {estado.ok && <div className="ok">{estado.ok}</div>}
      <div className="campo">
        <label htmlFor="status">Status</label>
        {bloqueado ? (
          <>
            <input type="hidden" name="status" value={status} />
            <p className="mudo pequeno" style={{ margin: 0 }}>
              Aguardando a aprovação do gestor (por e-mail).
            </p>
          </>
        ) : (
          <select id="status" name="status" value={novo} onChange={(e) => setNovo(e.target.value as StatusPedido)}>
            {(STATUS_EQUIPE.includes(status) ? STATUS_EQUIPE : [status, ...STATUS_EQUIPE]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].rotulo}
              </option>
            ))}
          </select>
        )}
      </div>
      {novo !== status && (
        <div className="campo">
          <label htmlFor="motivo">Mensagem para o solicitante (opcional)</label>
          <textarea id="motivo" name="motivo" maxLength={2000} style={{ minHeight: 70 }} />
        </div>
      )}
      <div className="campo">
        <label htmlFor="responsavel_id">Responsável</label>
        <select id="responsavel_id" name="responsavel_id" defaultValue={responsavelId ?? ""}>
          <option value="">Ninguém ainda</option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="prazo">Prazo</label>
        <input id="prazo" name="prazo" type="date" defaultValue={prazo ?? ""} />
      </div>
      <button className="botao" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

export function FormComentario({ id }: { id: number }) {
  const [estado, acao, salvando] = useActionState<Estado, FormData>(comentar, {});
  return (
    <form action={acao} key={estado.ok}>
      <input type="hidden" name="id" value={id} />
      {estado.erro && <div className="erro">{estado.erro}</div>}
      {estado.ok && <div className="ok">{estado.ok}</div>}
      <div className="campo">
        <label htmlFor="texto">Novo comentário</label>
        <textarea id="texto" name="texto" maxLength={4000} required defaultValue={estado.texto} />
      </div>
      <div className="acoes" style={{ justifyContent: "space-between" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: 0 }}>
          <input type="checkbox" name="visivel" /> Enviar ao solicitante (por e-mail)
        </label>
        <button className="botao secundario" disabled={salvando}>
          {salvando ? "Salvando…" : "Comentar"}
        </button>
      </div>
    </form>
  );
}

/** Caixa de resposta para pedido novo: aceitar ou recusar. */
export function FormResposta({ id }: { id: number }) {
  const [estado, acao, salvando] = useActionState<Estado, FormData>(responderPedido, {});
  const [recusar, setRecusar] = useState(false);
  if (estado.ok) return <div className="cartao resposta-pedido"><div className="ok" style={{ margin: 0 }}>{estado.ok}</div></div>;
  return (
    <form action={acao} className="cartao resposta-pedido">
      <h2>Pedido novo</h2>
      <p className="mudo pequeno" style={{ marginTop: 0 }}>Aceite para começar o atendimento ou recuse explicando o motivo. O solicitante é avisado por e-mail.</p>
      <input type="hidden" name="id" value={id} />
      {estado.erro && <div className="erro">{estado.erro}</div>}
      <div className="campo">
        <label htmlFor="resp-motivo">{recusar ? "Motivo da recusa (obrigatório)" : "Mensagem para o solicitante (opcional)"}</label>
        <textarea id="resp-motivo" name="motivo" maxLength={2000} style={{ minHeight: 64 }} required={recusar} />
      </div>
      <div className="acoes">
        <button className="botao" name="decisao" value="aceitar" disabled={salvando} onClick={() => setRecusar(false)}>✓ Aceitar</button>
        <button className="botao perigo" name="decisao" value="recusar" disabled={salvando}
                onClick={(e) => { if (!recusar) { e.preventDefault(); setRecusar(true); } }}>
          {recusar ? "Confirmar recusa" : "✕ Recusar"}
        </button>
      </div>
    </form>
  );
}
