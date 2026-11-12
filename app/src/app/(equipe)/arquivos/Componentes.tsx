"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Documento, Empresa, Tipo, Unidade } from "@/lib/arquivos";
import { situacao, tamanhoLegivel } from "@/lib/arquivos";
import { apagarDocumento, criarUnidade, prepararEnvio, registrarDocumentos, salvarDocumento, salvarUnidade, type Resultado } from "./acoes";

function Aviso({ r }: { r: Resultado }) {
  if (r.erro) return <div className="erro">{r.erro}</div>;
  if (r.ok) return <div className="ok">{r.ok}</div>;
  return null;
}
const br = (d: string) => d.split("-").reverse().join("/");

export function Validade({ d, hoje }: { d: Pick<Documento, "validade" | "aviso_dias">; hoje: string }) {
  const s = situacao(d, hoje);
  if (!s || !d.validade) return <span className="mudo pequeno">sem validade</span>;
  return <span className={`validade v-${s.tipo}`} title={`Vence em ${br(d.validade)}`}>{br(d.validade)} · {s.texto}</span>;
}

/** Copiar um dado da empresa (CNPJ, IE…). */
export function Copiar({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  const [ok, setOk] = useState(false);
  if (!valor) return <div className="dado"><span className="mudo pequeno">{rotulo}</span><span className="mudo">—</span></div>;
  return (
    <div className="dado">
      <span className="mudo pequeno">{rotulo}</span>
      <button type="button" className="dado-valor" title="Clique para copiar"
              onClick={() => navigator.clipboard.writeText(valor).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
        {valor} <span className="copiar-ic" aria-hidden="true">{ok ? "✓ copiado" : "⧉"}</span>
      </button>
    </div>
  );
}

/** Enviar vários arquivos de uma vez (clicando ou arrastando). */
export function EnviarArquivos({ unidadeId, tipos, titulo = "Enviar documentos" }: { unidadeId: string | null; tipos: Tipo[]; titulo?: string }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [tipo, setTipo] = useState("");
  const [validade, setValidade] = useState("");
  const [aviso, setAviso] = useState("30");
  const [estado, setEstado] = useState<Resultado>({});
  const [enviando, setEnviando] = useState("");
  const [sobre, setSobre] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const enviar = async () => {
    if (!arquivos.length) return;
    setEstado({});
    setEnviando("Preparando…");
    const prep = await prepararEnvio(arquivos.map((a) => ({ nome: a.name, tamanho: a.size })));
    if (prep.erro) { setEnviando(""); setEstado({ erro: prep.erro }); return; }
    const feitos: { path: string; nome: string; tamanho: number; mime: string }[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      const a = arquivos[i], l = prep.links[i];
      setEnviando(`Enviando ${i + 1} de ${arquivos.length}…`);
      const r = await fetch(l.url, { method: "PUT", headers: { "Content-Type": a.type || "application/octet-stream", "x-upsert": "false" }, body: a });
      if (!r.ok) { setEnviando(""); setEstado({ erro: `${a.name}: falhou o envio.` }); return; }
      feitos.push({ path: l.path, nome: a.name, tamanho: a.size, mime: a.type });
    }
    setEnviando("Salvando…");
    const res = await registrarDocumentos(feitos, { unidade_id: unidadeId, tipo_id: tipo || null, validade: validade || null, aviso_dias: Number(aviso) || 30 });
    setEnviando("");
    setEstado(res);
    if (!res.erro) { setArquivos([]); setValidade(""); router.refresh(); }
  };

  return (
    <section className="cartao envio">
      <h2>{titulo}</h2>
      <Aviso r={estado} />
      <div className={`soltar${sobre ? " sobre" : ""}`}
           onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
           onDrop={(e) => { e.preventDefault(); setSobre(false); setArquivos([...arquivos, ...Array.from(e.dataTransfer.files)]); }}
           onClick={() => entrada.current?.click()} role="button" tabIndex={0}
           onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") entrada.current?.click(); }}>
        <input ref={entrada} type="file" multiple hidden onChange={(e) => { setArquivos([...arquivos, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
        {arquivos.length
          ? <span><strong>{arquivos.length} arquivo(s)</strong> · {arquivos.map((a) => a.name).join(", ").slice(0, 160)}</span>
          : <span>Arraste os arquivos aqui ou <u>clique para escolher</u> (vários de uma vez, até 50 MB cada)</span>}
      </div>
      {unidadeId && (
        <div className="linha-envio">
          <div className="campo">
            <label htmlFor="env-tipo">Tipo</label>
            <select id="env-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Escolher depois</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.restrito ? " (só admin)" : ""}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="env-val">Validade (opcional)</label>
            <input id="env-val" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="env-aviso">Avisar quantos dias antes</label>
            <input id="env-aviso" type="number" min={0} max={365} value={aviso} onChange={(e) => setAviso(e.target.value)} />
          </div>
        </div>
      )}
      <div className="acoes">
        <button type="button" className="botao" disabled={!arquivos.length || !!enviando} onClick={enviar}>{enviando || "Enviar"}</button>
        {arquivos.length > 0 && !enviando && <button type="button" className="botao secundario" onClick={() => setArquivos([])}>Limpar</button>}
      </div>
      {unidadeId && <p className="mudo pequeno" style={{ margin: "8px 0 0" }}>Com validade, você recebe uma tarefa de renovação no seu planner (e no ClickUp) antes de vencer.</p>}
    </section>
  );
}

/** Linha de documento: abrir, editar (nome, tipo, unidade, validade, responsável) e apagar. */
export function DocLinha({ doc, tipos, empresas, unidades, pessoas, hoje, admin, mostrarOnde = false }: {
  doc: Documento; tipos: Tipo[]; empresas: Empresa[]; unidades: Unidade[]; pessoas: { id: string; nome: string }[];
  hoje: string; admin: boolean; mostrarOnde?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Resultado>({});
  const [apagar, setApagar] = useState(false);
  const [pend, iniciar] = useTransition();
  const u = unidades.find((x) => x.id === doc.unidade_id);
  const emp = empresas.find((e) => e.id === u?.empresa_id);
  const tipo = tipos.find((t) => t.id === doc.tipo_id);

  const salvar = (form: FormData) => iniciar(async () => {
    const r = await salvarDocumento(doc.id, {
      titulo: String(form.get("titulo") || ""), unidade_id: String(form.get("unidade") || "") || null,
      tipo_id: String(form.get("tipo") || "") || null, validade: String(form.get("validade") || "") || null,
      aviso_dias: Number(form.get("aviso") || 30), observacao: String(form.get("obs") || ""),
      responsavel_id: String(form.get("resp") || "") || null, restrito: admin ? form.get("restrito") === "on" : undefined,
    });
    setEstado(r);
    if (!r.erro) { setAberto(false); router.refresh(); }
  });

  return (
    <div className={`doc${aberto ? " aberto" : ""}`}>
      <div className="doc-linha">
        <span className="doc-ic" aria-hidden="true">{doc.mime?.includes("pdf") || doc.arquivo_nome.toLowerCase().endsWith(".pdf") ? "PDF" : (doc.arquivo_nome.split(".").pop() || "").slice(0, 4).toUpperCase()}</span>
        <div className="doc-corpo">
          <a href={`/arquivos-abrir/${doc.id}`} target="_blank" rel="noopener" className="doc-titulo">{doc.titulo}</a>
          <div className="mudo pequeno">
            {mostrarOnde && emp && <>{emp.nome}{u && !u.unica ? ` · ${u.nome}` : ""} · </>}
            {mostrarOnde && tipo && <>{tipo.nome} · </>}
            {doc.arquivo_nome} {tamanhoLegivel(doc.tamanho) && `· ${tamanhoLegivel(doc.tamanho)}`}
            {(doc.restrito || tipo?.restrito) && " · 🔒 só admin"}
            {doc.observacao && ` · ${doc.observacao}`}
          </div>
        </div>
        <Validade d={doc} hoje={hoje} />
        <div className="doc-acoes">
          <a className="link-acao" href={`/arquivos-abrir/${doc.id}`} target="_blank" rel="noopener">Abrir</a>
          <a className="link-acao" href={`/arquivos-abrir/${doc.id}?baixar=1`}>Baixar</a>
          <button type="button" className="link-acao" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : "Editar"}</button>
        </div>
      </div>
      {aberto && (
        <form action={salvar} className="doc-form">
          <Aviso r={estado} />
          <div className="linha-envio">
            <div className="campo" style={{ gridColumn: "span 2" }}>
              <label>Nome do documento</label>
              <input name="titulo" defaultValue={doc.titulo} required maxLength={200} />
            </div>
            <div className="campo">
              <label>Empresa / unidade</label>
              <select name="unidade" defaultValue={doc.unidade_id ?? ""}>
                <option value="">A classificar</option>
                {empresas.map((e) => (
                  <optgroup key={e.id} label={e.nome}>
                    {unidades.filter((x) => x.empresa_id === e.id).map((x) => <option key={x.id} value={x.id}>{x.unica ? e.nome : `${e.nome} · ${x.nome}`}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Tipo</label>
              <select name="tipo" defaultValue={doc.tipo_id ?? ""}>
                <option value="">—</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.restrito ? " (só admin)" : ""}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Validade</label>
              <input name="validade" type="date" defaultValue={doc.validade ?? ""} />
            </div>
            <div className="campo">
              <label>Avisar quantos dias antes</label>
              <input name="aviso" type="number" min={0} max={365} defaultValue={doc.aviso_dias} />
            </div>
            <div className="campo">
              <label>Responsável pela renovação</label>
              <select name="resp" defaultValue={doc.responsavel_id ?? ""}>
                <option value="">Ninguém</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="campo" style={{ gridColumn: "span 2" }}>
              <label>Observação</label>
              <input name="obs" defaultValue={doc.observacao ?? ""} maxLength={1000} />
            </div>
          </div>
          {admin && <label className="pequeno" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><input type="checkbox" name="restrito" defaultChecked={doc.restrito} /> Só o administrador vê este documento</label>}
          <div className="acoes" style={{ justifyContent: "space-between" }}>
            <div className="acoes">
              <button className="botao" disabled={pend}>{pend ? "Salvando…" : "Salvar"}</button>
              <button type="button" className="botao secundario" onClick={() => setAberto(false)}>Cancelar</button>
            </div>
            <button type="button" className={`botao perigo${apagar ? " armado" : ""}`} disabled={pend}
                    onClick={() => { if (!apagar) { setApagar(true); return; } iniciar(async () => { const r = await apagarDocumento(doc.id); setEstado(r); if (!r.erro) router.refresh(); }); }}>
              {apagar ? "Confirmar: apagar" : "Apagar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Dados da unidade (CNPJ, inscrições, endereço) com copiar e editar. */
export function DadosUnidade({ u }: { u: Unidade }) {
  const router = useRouter();
  const [editar, setEditar] = useState(false);
  const [estado, setEstado] = useState<Resultado>({});
  const [pend, iniciar] = useTransition();
  if (!editar) return (
    <section className="cartao dados-unidade">
      <div className="dados-topo"><h2>Dados da empresa</h2><button type="button" className="link-acao" onClick={() => setEditar(true)}>Editar</button></div>
      <Aviso r={estado} />
      <div className="dados-grade">
        <Copiar rotulo="CNPJ" valor={u.cnpj} />
        <Copiar rotulo="Inscrição estadual" valor={u.ie} />
        <Copiar rotulo="Inscrição municipal" valor={u.im} />
        <Copiar rotulo="Endereço" valor={u.endereco} />
      </div>
      {u.observacao && <p className="mudo pequeno" style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{u.observacao}</p>}
    </section>
  );
  return (
    <section className="cartao dados-unidade">
      <h2>Dados da empresa</h2>
      <Aviso r={estado} />
      <form action={(f) => iniciar(async () => {
        const r = await salvarUnidade(u.id, { nome: String(f.get("nome") || ""), cnpj: String(f.get("cnpj") || ""), ie: String(f.get("ie") || ""),
          im: String(f.get("im") || ""), endereco: String(f.get("endereco") || ""), observacao: String(f.get("obs") || "") });
        setEstado(r); if (!r.erro) { setEditar(false); router.refresh(); }
      })}>
        <div className="linha-envio">
          {!u.unica && <div className="campo"><label>Nome da unidade</label><input name="nome" defaultValue={u.nome} required /></div>}
          {u.unica && <input type="hidden" name="nome" value={u.nome} />}
          <div className="campo"><label>CNPJ</label><input name="cnpj" defaultValue={u.cnpj ?? ""} placeholder="00.000.000/0000-00" /></div>
          <div className="campo"><label>Inscrição estadual</label><input name="ie" defaultValue={u.ie ?? ""} /></div>
          <div className="campo"><label>Inscrição municipal</label><input name="im" defaultValue={u.im ?? ""} /></div>
          <div className="campo" style={{ gridColumn: "span 2" }}><label>Endereço</label><input name="endereco" defaultValue={u.endereco ?? ""} /></div>
          <div className="campo" style={{ gridColumn: "1 / -1" }}><label>Observações</label><textarea name="obs" defaultValue={u.observacao ?? ""} rows={2} /></div>
        </div>
        <div className="acoes">
          <button className="botao" disabled={pend}>{pend ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="botao secundario" onClick={() => setEditar(false)}>Cancelar</button>
        </div>
      </form>
    </section>
  );
}

export function NovaUnidade({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Resultado>({});
  const [pend, iniciar] = useTransition();
  if (!aberto) return <button type="button" className="aba-unidade nova" onClick={() => setAberto(true)}>+ unidade</button>;
  return (
    <form className="nova-unidade" action={(f) => iniciar(async () => {
      const r = await criarUnidade(empresaId, String(f.get("nome") || ""));
      setEstado(r); if (!r.erro && r.id) { setAberto(false); router.push(`/arquivos/${empresaId}?u=${r.id}`); router.refresh(); }
    })}>
      <input name="nome" placeholder="Nome da unidade (ex.: cidade)" autoFocus required maxLength={80} />
      <button className="botao pequeno" disabled={pend}>Criar</button>
      <button type="button" className="botao secundario pequeno" onClick={() => setAberto(false)}>Cancelar</button>
      {estado.erro && <span className="erro pequeno">{estado.erro}</span>}
    </form>
  );
}
