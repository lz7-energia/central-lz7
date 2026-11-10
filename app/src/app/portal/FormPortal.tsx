"use client";

import { useMemo, useState } from "react";
import Script from "next/script";
import type { Campo, OpcoesPortal } from "@/lib/tipos";

type Resultado = { protocolo: string; link: string; aprovacao: boolean; temEmail: boolean };

export function FormPortal({ opcoes, chaveAntirrobo }: { opcoes: OpcoesPortal; chaveAntirrobo: string | null }) {
  const [setorId, setSetorId] = useState<string | null>(null);
  const [tipoId, setTipoId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  const tipos = useMemo(() => opcoes.tipos.filter((t) => t.setor_id === setorId), [opcoes.tipos, setorId]);
  const tipo = opcoes.tipos.find((t) => t.id === tipoId) ?? null;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tipo) return;
    setErro(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      form.set("tipo_id", String(tipo.id));
      const r = await fetch("/api/portal", { method: "POST", body: form });
      const j = await r.json().catch(() => ({ erro: "Resposta inválida do servidor." }));
      if (!r.ok) {
        setErro(j.erro || "Não foi possível enviar o pedido.");
        // O desafio anti-robô vale uma vez só: renova pra próxima tentativa.
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
      } else {
        setResultado(j);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="cartao">
        <div className="ok">Pedido enviado.</div>
        <p className="mudo" style={{ marginBottom: 4 }}>
          Seu protocolo
        </p>
        <div className="protocolo">{resultado.protocolo}</div>
        <p style={{ marginTop: 16 }}>
          {resultado.aprovacao
            ? "O pedido foi enviado para a aprovação do seu gestor. Depois de aprovado, ele segue para o setor."
            : "O pedido já está na fila do setor."}{" "}
          {resultado.temEmail
            ? "Você vai receber um e-mail com o link para acompanhar."
            : "Guarde o link abaixo: é por ele que você acompanha o pedido."}
        </p>
        <label htmlFor="link">Link para acompanhar</label>
        <div className="copiavel">
          <input id="link" type="text" readOnly value={resultado.link} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="botao secundario"
            onClick={() => {
              navigator.clipboard?.writeText(resultado.link);
              setCopiado(true);
            }}
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="acoes" style={{ marginTop: 20 }}>
          <a className="botao" href={resultado.link}>
            Ver o pedido
          </a>
          <button
            type="button"
            className="botao secundario"
            onClick={() => {
              setResultado(null);
              setTipoId(null);
              setSetorId(null);
              setCopiado(false);
            }}
          >
            Abrir outro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      {chaveAntirrobo && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}

      <div className="bloco">
        <p className="passo">1. Setor</p>
        <div className="grade-opcoes" role="radiogroup" aria-label="Setor">
          {opcoes.setores.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={setorId === s.id}
              className={`opcao${setorId === s.id ? " marcada" : ""}`}
              onClick={() => {
                setSetorId(s.id);
                setTipoId(null);
                setErro(null);
              }}
            >
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      {setorId && (
        <div className="bloco">
          <p className="passo">2. Tipo de pedido</p>
          {tipos.length === 0 ? (
            <p className="mudo">Nenhum tipo de pedido disponível para este setor.</p>
          ) : (
            <div className="lista-opcoes" role="radiogroup" aria-label="Tipo de pedido">
              {tipos.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tipoId === t.id}
                  className={`opcao${tipoId === t.id ? " marcada" : ""}`}
                  onClick={() => {
                    setTipoId(t.id);
                    setErro(null);
                  }}
                >
                  {t.nome}
                  {t.exige_aprovacao && <small>Precisa de aprovação do gestor</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tipo && (
        <div className="bloco" key={tipo.id}>
          <p className="passo">3. Dados do pedido</p>

          <div className="campo">
            <label htmlFor="solicitante_id">
              Seu nome<span className="obrig">*</span>
            </label>
            <select id="solicitante_id" name="solicitante_id" required defaultValue="">
              <option value="" disabled>
                Escolha seu nome
              </option>
              {opcoes.solicitantes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            {opcoes.solicitantes.length === 0 && (
              <p className="pequeno mudo" style={{ marginTop: 6 }}>
                A lista de nomes ainda não foi cadastrada. Avise a equipe da central.
              </p>
            )}
          </div>

          {tipo.campos.map((c) => (
            <CampoForm key={c.chave} campo={c} />
          ))}

          {/* Campo-isca para robôs: escondido de pessoas e de leitores de tela */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="site">Não preencha</label>
            <input id="site" name="site" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {chaveAntirrobo && <div className="cf-turnstile campo" data-sitekey={chaveAntirrobo} data-language="pt-br" />}

          {erro && <div className="erro">{erro}</div>}
          <button className="botao" type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      )}
    </form>
  );
}

function CampoForm({ campo }: { campo: Campo }) {
  const id = `campo_${campo.chave}`;
  const obrig = Boolean(campo.obrigatorio);
  const rotulo = (
    <label htmlFor={id}>
      {campo.rotulo}
      {obrig && <span className="obrig">*</span>}
    </label>
  );
  let entrada: React.ReactNode;
  switch (campo.tipo) {
    case "texto_longo":
      entrada = <textarea id={id} name={id} required={obrig} maxLength={5000} />;
      break;
    case "numero":
      entrada = <input id={id} name={id} type="number" step="0.01" min="0" inputMode="decimal" required={obrig} />;
      break;
    case "data":
      entrada = <input id={id} name={id} type="date" required={obrig} />;
      break;
    case "arquivo":
      entrada = (
        <>
          <input id={id} name={id} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xml" required={obrig} />
          <p className="pequeno mudo" style={{ margin: "4px 0 0" }}>
            PDF, imagem ou XML, até 10 MB.
          </p>
        </>
      );
      break;
    default:
      entrada = <input id={id} name={id} type="text" required={obrig} maxLength={500} />;
  }
  return (
    <div className="campo">
      {rotulo}
      {entrada}
    </div>
  );
}
