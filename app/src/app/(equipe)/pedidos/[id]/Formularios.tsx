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
        <label htmlFor="prazo">Previsão de conclusão</label>
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

/** Aceitar (com previsão de conclusão) ou recusar (com motivo) um pedido novo. Usado na página do pedido e na fila. */
export function FormResposta({ id, prazo, compacto = false }: { id: number; prazo: string | null; compacto?: boolean }) {
  const [estado, acao, salvando] = useActionState<Estado, FormData>(responderPedido, {});
  const [modo, setModo] = useState<"" | "aceitar" | "recusar">(compacto ? "" : "aceitar");
  if (estado.ok) return <div className={compacto ? "ok pequeno" : "cartao resposta-pedido"}>{compacto ? estado.ok : <div className="ok" style={{ margin: 0 }}>{estado.ok}</div>}</div>;
  if (compacto && !modo) return (
    <div className="resp-rapida">
      <button type="button" className="botao pequeno" onClick={() => setModo("aceitar")}>✓ Aceitar</button>
      <button type="button" className="botao secundario pequeno" onClick={() => setModo("recusar")}>✕ Recusar</button>
    </div>
  );
  return (
    <form action={acao} className={compacto ? "resp-rapida-form" : "cartao resposta-pedido"}>
      {!compacto && <h2>Pedido novo</h2>}
      {!compacto && <p className="mudo pequeno" style={{ marginTop: 0 }}>Aceite informando quando vai concluir, ou recuse explicando o motivo. O solicitante vê a resposta na consulta do pedido.</p>}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decisao" value={modo} />
      {estado.erro && <div className="erro">{estado.erro}</div>}
      {!compacto && (
        <div className="seg-resposta" role="group" aria-label="Resposta">
          <button type="button" className={modo === "aceitar" ? "ativo" : ""} onClick={() => setModo("aceitar")}>✓ Aceitar</button>
          <button type="button" className={modo === "recusar" ? "ativo recusa" : ""} onClick={() => setModo("recusar")}>✕ Recusar</button>
        </div>
      )}
      {modo === "aceitar" ? (
        <div className="campo">
          <label htmlFor={`prev-${id}`}>Previsão de conclusão</label>
          <input id={`prev-${id}`} name="previsao" type="date" required defaultValue={prazo ?? ""} />
        </div>
      ) : (
        <div className="campo">
          <label htmlFor={`mot-${id}`}>Motivo da recusa</label>
          <textarea id={`mot-${id}`} name="motivo" required maxLength={2000} style={{ minHeight: compacto ? 50 : 64 }} />
        </div>
      )}
      {modo === "aceitar" && !compacto && (
        <div className="campo">
          <label htmlFor={`msg-${id}`}>Mensagem para o solicitante (opcional)</label>
          <textarea id={`msg-${id}`} name="motivo" maxLength={2000} style={{ minHeight: 50 }} />
        </div>
      )}
      <div className="acoes">
        <button className={`botao${compacto ? " pequeno" : ""}${modo === "recusar" ? " perigo" : ""}`} disabled={salvando}>
          {salvando ? "Salvando…" : modo === "aceitar" ? "Aceitar pedido" : "Recusar pedido"}
        </button>
        {compacto && <button type="button" className="botao secundario pequeno" onClick={() => setModo("")}>Cancelar</button>}
      </div>
    </form>
  );
}
