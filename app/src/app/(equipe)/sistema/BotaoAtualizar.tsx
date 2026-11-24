"use client";

import { useState, useTransition } from "react";
import { atualizarAgora } from "./acoes";

export function BotaoAtualizar({ recurso }: { recurso: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button className="botao secundario pequeno" disabled={pendente}
        onClick={() => iniciar(async () => { const r = await atualizarAgora(recurso); setMsg(r.erro ?? r.ok ?? null); })}>
        {pendente ? "Enviando…" : "Atualizar agora"}
      </button>
      {msg && <div className="pequeno mudo" style={{ maxWidth: 220, marginLeft: "auto" }}>{msg}</div>}
    </>
  );
}
