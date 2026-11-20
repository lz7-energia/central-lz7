"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { salvarDados, tirarFoto, trocarFoto, trocarSenha, type Resultado } from "./acoes";

function Aviso({ r }: { r: Resultado }) {
  if (r.erro) return <div className="erro">{r.erro}</div>;
  if (r.ok) return <div className="ok">{r.ok}</div>;
  return null;
}

/** Reduz a foto no navegador (lado maior 512 px, JPEG) antes de enviar. */
async function reduzir(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo;
  } catch {
    return arquivo;
  }
}

export function FormFoto({ temFoto }: { temFoto: boolean }) {
  const [estado, setEstado] = useState<Resultado>({});
  const [previa, setPrevia] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const enviar = (arquivo: File) =>
    iniciar(async () => {
      setPrevia(URL.createObjectURL(arquivo));
      const form = new FormData();
      form.set("foto", await reduzir(arquivo));
      setEstado(await trocarFoto({}, form));
    });

  return (
    <div>
      <Aviso r={estado} />
      {previa && pendente && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa} alt="" className="avatar" style={{ width: 72, height: 72, marginBottom: 12 }} />
      )}
      <p className="mudo pequeno">JPG, PNG ou WEBP. A foto é reduzida antes de enviar.</p>
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
      <div className="acoes">
        <button type="button" className="botao" disabled={pendente} onClick={() => entrada.current?.click()}>
          {pendente ? "Enviando…" : temFoto ? "Trocar foto" : "Escolher foto"}
        </button>
        {temFoto && (
          <button type="button" className="botao secundario" disabled={pendente}
                  onClick={() => iniciar(async () => setEstado(await tirarFoto()))}>
            Tirar foto
          </button>
        )}
      </div>
    </div>
  );
}

export function FormDados({ nome, cargo, telefone, email }: { nome: string; cargo: string; telefone: string; email: string }) {
  const [estado, acao, salvando] = useActionState(salvarDados, {});
  return (
    <form action={acao}>
      <Aviso r={estado} />
      <div className="campo">
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" defaultValue={nome} required maxLength={120} autoComplete="name" />
      </div>
      <div className="campo">
        <label htmlFor="cargo">Cargo</label>
        <input id="cargo" name="cargo" defaultValue={cargo} maxLength={80} placeholder="Ex.: Analista financeiro" />
      </div>
      <div className="campo">
        <label htmlFor="telefone">Telefone</label>
        <input id="telefone" name="telefone" type="tel" defaultValue={telefone} maxLength={30} autoComplete="tel" placeholder="(11) 99999-0000" />
      </div>
      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input id="email" value={email} readOnly disabled />
        <p className="mudo pequeno" style={{ margin: "4px 0 0" }}>O e-mail de login só o administrador troca.</p>
      </div>
      <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}

export function FormSenha() {
  const [estado, acao, salvando] = useActionState(trocarSenha, {});
  return (
    <form action={acao}>
      <Aviso r={estado} />
      <div className="campo">
        <label htmlFor="senha">Nova senha</label>
        <input id="senha" name="senha" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="campo">
        <label htmlFor="confirma">Repita a senha</label>
        <input id="confirma" name="confirma" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <p className="mudo pequeno">Pelo menos 10 caracteres.</p>
      <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Trocar senha"}</button>
    </form>
  );
}
