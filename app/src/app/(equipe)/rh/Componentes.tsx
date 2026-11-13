"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Candidato, Canal, Etapa, Mensagem, Motivo, Pergunta, Vaga } from "@/lib/rh";
import { ETAPAS, linkWhatsapp, preencherMensagem } from "@/lib/rh";
import {
  apagarCandidato, criarCandidato, fecharVaga, lerCurriculo, marcarBonusPago, marcarEntrevista, moverCandidato,
  prepararCurriculo, procurarRepetidos, salvarCandidato, salvarItem, salvarVaga, type Repetido, type Resultado,
} from "./acoes";

function Aviso({ r }: { r: Resultado }) {
  if (r.erro) return <div className="erro">{r.erro}</div>;
  if (r.ok) return <div className="ok">{r.ok}</div>;
  return null;
}
const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const hojeLocal = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/* ---------- vaga ---------- */
export function FormVaga({ vaga, perguntas }: { vaga: Vaga | null; perguntas: Pergunta[] }) {
  const router = useRouter();
  const [estado, acao, salvando] = useActionState(async (s: Resultado, f: FormData) => {
    const r = await salvarVaga(s, f);
    if (r.id && !r.erro) router.push(`/rh/vagas/${r.id}`);
    return r;
  }, {});
  const [novas, setNovas] = useState<number[]>([]);
  const marcadas = new Set(vaga ? vaga.perguntas : perguntas.filter((p) => p.padrao && p.ativo).map((p) => p.id));
  return (
    <form action={acao} className="cartao form-vaga">
      <Aviso r={estado} />
      <input type="hidden" name="id" value={vaga?.id ?? ""} />
      <div className="linha-envio">
        <div className="campo"><label>Cargo</label><input name="cargo" defaultValue={vaga?.cargo ?? "Vendedor"} required maxLength={80} /></div>
        <div className="campo"><label>Área</label><input name="area" defaultValue={vaga?.area ?? "Comercial"} maxLength={60} /></div>
        <div className="campo"><label>Local / unidade</label><input name="local" defaultValue={vaga?.local ?? ""} placeholder="Ex.: WB, Londrina" maxLength={60} /></div>
        <div className="campo"><label>Quantidade de vagas</label><input name="quantidade" type="number" min={1} max={200} defaultValue={vaga?.quantidade ?? 1} /></div>
        <div className="campo"><label>Gestor</label><input name="gestor" defaultValue={vaga?.gestor ?? ""} maxLength={80} /></div>
        <div className="campo"><label>Contrato</label>
          <select name="contrato" defaultValue={vaga?.contrato ?? "PJ"}><option>PJ</option><option>Cooperativa</option><option>Outro</option></select></div>
        <div className="campo"><label>Aberta em</label><input name="aberta_em" type="date" defaultValue={vaga?.aberta_em ?? hojeLocal()} /></div>
        <div className="campo"><label>Previsão de fechamento</label><input name="previsao" type="date" defaultValue={vaga?.previsao ?? ""} /></div>
        <div className="campo" style={{ gridColumn: "1 / -1" }}><label>Descrição (opcional)</label><textarea name="descricao" rows={2} defaultValue={vaga?.descricao ?? ""} maxLength={2000} /></div>
      </div>
      <h3>Perguntas da triagem</h3>
      <p className="mudo pequeno" style={{ marginTop: 0 }}>Marque as que a recrutadora vai usar na entrevista desta vaga. Perguntas novas entram também na lista geral.</p>
      <div className="lista-perguntas">
        {perguntas.filter((p) => p.ativo || marcadas.has(p.id)).map((p) => (
          <label key={p.id} className="pergunta-op">
            <input type="checkbox" name="perguntas" value={p.id} defaultChecked={marcadas.has(p.id)} />
            <span>{p.texto} <span className="mudo pequeno">· {({ sim_nao: "sim/não", escolha: "escolha", numero: "número", texto: "texto" })[p.tipo]}</span></span>
          </label>
        ))}
      </div>
      {novas.map((n) => (
        <div key={n} className="nova-pergunta">
          <input name="nova_pergunta" placeholder="Pergunta nova" maxLength={200} />
          <select name="nova_tipo" defaultValue="sim_nao"><option value="sim_nao">Sim/não</option><option value="escolha">Escolha</option><option value="numero">Número</option><option value="texto">Texto</option></select>
          <input name="nova_opcoes" placeholder="Opções (para escolha), separadas por ;" />
          <button type="button" className="link-acao" onClick={() => setNovas(novas.filter((x) => x !== n))}>Tirar</button>
        </div>
      ))}
      <button type="button" className="botao secundario pequeno" onClick={() => setNovas([...novas, Date.now()])}>+ Criar pergunta</button>
      <div className="acoes" style={{ marginTop: 16 }}>
        <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : vaga ? "Salvar vaga" : "Criar vaga"}</button>
        <Link href={vaga ? `/rh/vagas/${vaga.id}` : "/rh"} className="botao secundario">Cancelar</Link>
      </div>
    </form>
  );
}

export function BotaoFecharVaga({ id, fechada }: { id: number; fechada: boolean }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  return (
    <button type="button" className="botao secundario pequeno" disabled={pend}
            onClick={() => iniciar(async () => { await fecharVaga(id, !fechada); router.refresh(); })}>
      {fechada ? "Reabrir vaga" : "Vaga fechada"}
    </button>
  );
}

/* ---------- avisos de candidato repetido ---------- */
function Repetidos({ lista }: { lista: Repetido[] }) {
  if (!lista.length) return null;
  return (
    <div className="aviso-repetido">
      <strong>⚠ Este candidato já apareceu antes</strong>
      {lista.map((r) => (
        <div key={r.id} className="pequeno">
          <Link href={`/rh/candidatos/${r.id}`}>{r.nome}</Link> · {r.vaga} · {br(r.quando)} · {ETAPAS.find((e) => e.id === r.etapa)?.nome}
          {r.motivo ? ` (${r.motivo})` : ""}
        </div>
      ))}
    </div>
  );
}

/* ---------- adicionar candidato (anexa o currículo, lê, confere, salva) ---------- */
export function NovoCandidato({ vagaId, canais }: { vagaId: number; canais: Canal[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState("");
  const [arquivo, setArquivo] = useState<{ path: string; nome: string } | null>(null);
  const [dados, setDados] = useState({ nome: "", whatsapp: "", email: "", cidade: "" });
  const [repetidos, setRepetidos] = useState<Repetido[]>([]);
  const [canal, setCanal] = useState("");
  const [chave, setChave] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, acao, salvando] = useActionState(async (s: Resultado, f: FormData) => {
    const r = await criarCandidato(s, f);
    if (!r.erro) { setArquivo(null); setDados({ nome: "", whatsapp: "", email: "", cidade: "" }); setRepetidos([]); setCanal(""); setChave((k) => k + 1); router.refresh(); }
    return r;
  }, {});
  const ehIndicacao = canais.find((c) => String(c.id) === canal)?.eh_indicacao;

  const anexar = async (f: File) => {
    setLendo("Enviando o currículo…");
    const prep = await prepararCurriculo(f.name, f.size);
    if (!prep.url || !prep.path) { setLendo(""); alert(prep.erro || "Falhou o envio."); return; }
    const r = await fetch(prep.url, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" }, body: f });
    if (!r.ok) { setLendo(""); alert("Falhou o envio do currículo."); return; }
    setArquivo({ path: prep.path, nome: f.name });
    setLendo("Lendo o currículo…");
    const { leitura, repetidos } = await lerCurriculo(prep.path);
    setDados((d) => ({ nome: leitura.nome || d.nome, whatsapp: leitura.whatsapp || d.whatsapp, email: leitura.email || d.email, cidade: leitura.cidade || d.cidade }));
    setRepetidos(repetidos);
    setLendo(leitura.lido ? "" : "Não consegui ler este arquivo (só PDF com texto). Preencha à mão.");
  };
  const conferirRepetido = async () => setRepetidos(await procurarRepetidos(dados.whatsapp, dados.email));

  if (!aberto) return <button type="button" className="botao" onClick={() => setAberto(true)}>+ Adicionar candidato</button>;
  return (
    <section className="cartao novo-candidato" key={chave}>
      <div className="dados-topo"><h2>Novo candidato</h2><button type="button" className="link-acao" onClick={() => setAberto(false)}>Fechar</button></div>
      <Aviso r={estado} />
      <div className="soltar" role="button" tabIndex={0} onClick={() => entrada.current?.click()}
           onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) anexar(f); }}>
        <input ref={entrada} type="file" hidden accept=".pdf,.doc,.docx,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); e.target.value = ""; }} />
        {arquivo ? <span>📎 <strong>{arquivo.nome}</strong> · clique para trocar</span> : <span>Arraste o currículo aqui ou <u>clique para anexar</u> (PDF é lido automaticamente)</span>}
      </div>
      {lendo && <p className="mudo pequeno">{lendo}</p>}
      <Repetidos lista={repetidos} />
      <form action={acao}>
        <input type="hidden" name="vaga_id" value={vagaId} />
        <input type="hidden" name="curriculo_path" value={arquivo?.path ?? ""} />
        <input type="hidden" name="curriculo_nome" value={arquivo?.nome ?? ""} />
        <div className="linha-envio">
          <div className="campo"><label>Nome</label><input name="nome" required value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} /></div>
          <div className="campo"><label>WhatsApp</label><input name="whatsapp" type="tel" value={dados.whatsapp} onBlur={conferirRepetido} onChange={(e) => setDados({ ...dados, whatsapp: e.target.value })} /></div>
          <div className="campo"><label>E-mail</label><input name="email" type="email" value={dados.email} onBlur={conferirRepetido} onChange={(e) => setDados({ ...dados, email: e.target.value })} /></div>
          <div className="campo"><label>Cidade</label><input name="cidade" value={dados.cidade} onChange={(e) => setDados({ ...dados, cidade: e.target.value })} /></div>
          <div className="campo"><label>Como chegou</label>
            <select name="canal_id" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">—</option>{canais.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></div>
          {ehIndicacao && <div className="campo"><label>Quem indicou</label><input name="indicado_por" required placeholder="Nome de quem indicou" /></div>}
          <div className="campo" style={{ gridColumn: "1 / -1" }}><label>Observação (opcional)</label><input name="observacao" maxLength={2000} /></div>
        </div>
        <label className="pequeno lgpd"><input type="checkbox" name="lgpd" defaultChecked /> O candidato autorizou guardar o currículo para processos seletivos (LGPD)</label>
        <div className="acoes"><button className="botao" disabled={salvando || !!lendo.startsWith("Env") || lendo.startsWith("Lendo")}>{salvando ? "Salvando…" : "Salvar em Inscritos"}</button></div>
      </form>
    </section>
  );
}

/* ---------- card de vaga e funil ---------- */
export function CartaoCandidato({ c, canal }: { c: Candidato; canal: string | null }) {
  return (
    <Link href={`/rh/candidatos/${c.id}`} className="cand-card">
      <strong>{c.nome}</strong>
      <span className="mudo pequeno">{[c.cidade, canal].filter(Boolean).join(" · ")}</span>
      {c.entrevista_em && ["inscrito", "triagem", "gestor"].includes(c.etapa) && <span className="cand-ent">🗓 {new Date(c.entrevista_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
      {c.nota && <span className="cand-nota">{"★".repeat(c.nota)}<span className="mudo">{"★".repeat(5 - c.nota)}</span></span>}
    </Link>
  );
}

/* ---------- página do candidato ---------- */
export function PainelCandidato({ c, vaga, perguntas, motivos, canais, mensagens, repetidos }: {
  c: Candidato; vaga: Vaga; perguntas: Pergunta[]; motivos: Motivo[]; canais: Canal[]; mensagens: Mensagem[]; repetidos: Repetido[];
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Resultado>({});
  const [pend, iniciar] = useTransition();
  const [salvo, acaoSalvar, salvando] = useActionState(salvarCandidato, {});
  const [salvoT, acaoTriagem, salvandoT] = useActionState(salvarCandidato, {});
  const [salvoG, acaoGestor, salvandoG] = useActionState(salvarCandidato, {});
  const versao = c.atualizado_em;
  const [msgId, setMsgId] = useState(String(mensagens.find((m) => m.ativo)?.id ?? ""));
  const msg = mensagens.find((m) => String(m.id) === msgId);
  const texto = msg ? preencherMensagem(msg.texto, c, vaga) : "";
  const zap = linkWhatsapp(c.whatsapp, texto);
  const doVaga = useMemo(() => vaga.perguntas.map((id) => perguntas.find((p) => p.id === id)).filter(Boolean) as Pergunta[], [vaga, perguntas]);
  const entInicial = c.entrevista_em
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(c.entrevista_em)).replace(" ", "T")
    : "";
  const [ent, setEnt] = useState(entInicial);
  const [motivo, setMotivo] = useState("");
  const [contratado, setContratado] = useState(hojeLocal());
  const [modo, setModo] = useState<"" | "aprovar" | "reprovar">("");
  const fazer = (fn: () => Promise<Resultado>) => iniciar(async () => { const r = await fn(); setEstado(r); if (!r.erro) router.refresh(); });
  const ehIndicacao = canais.find((x) => x.id === c.canal_id)?.eh_indicacao;
  const aberto = ["inscrito", "triagem", "gestor"].includes(c.etapa);

  return (
    <div className="cand-grade">
      <div className="cand-col">
        <section className="cartao">
          <h2>Dados</h2>
          <Repetidos lista={repetidos} />
          <form action={acaoSalvar} key={"d" + versao}>
            <Aviso r={salvo} />
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="lgpd_presente" value="1" />
            <div className="campo"><label>Nome</label><input name="nome" defaultValue={c.nome} required /></div>
            <div className="campo"><label>WhatsApp</label><input name="whatsapp" type="tel" defaultValue={c.whatsapp ?? ""} /></div>
            <div className="campo"><label>E-mail</label><input name="email" type="email" defaultValue={c.email ?? ""} /></div>
            <div className="campo"><label>Cidade</label><input name="cidade" defaultValue={c.cidade ?? ""} /></div>
            <div className="campo"><label>Como chegou</label>
              <select name="canal_id" defaultValue={c.canal_id ?? ""}><option value="">—</option>{canais.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
            <div className="campo"><label>Quem indicou</label><input name="indicado_por" defaultValue={c.indicado_por ?? ""} placeholder="Se veio por indicação" /></div>
            <label className="pequeno lgpd"><input type="checkbox" name="lgpd" defaultChecked={c.lgpd_autorizou} /> Autorizou guardar o currículo (LGPD)</label>
            <button className="botao secundario pequeno" disabled={salvando}>{salvando ? "Salvando…" : "Salvar dados"}</button>
          </form>
          <div className="cand-links">
            {c.curriculo_path ? <a className="botao secundario pequeno" href={`/rh-curriculo/${c.id}`} target="_blank" rel="noopener">📎 Abrir currículo</a> : <span className="mudo pequeno">Sem currículo anexado</span>}
            <a className="botao secundario pequeno" href={`/rh/candidatos/${c.id}/ficha`} target="_blank" rel="noopener">⎙ Ficha para o gestor</a>
          </div>
        </section>
        <section className="cartao">
          <h2>WhatsApp</h2>
          <div className="campo"><label>Mensagem</label>
            <select value={msgId} onChange={(e) => setMsgId(e.target.value)}>{mensagens.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}</select></div>
          <p className="zap-previa">{texto}</p>
          {zap ? <a className="botao zap" href={zap} target="_blank" rel="noopener">Abrir no WhatsApp</a> : <p className="mudo pequeno">Cadastre o WhatsApp do candidato.</p>}
        </section>
      </div>

      <div className="cand-col">
        <section className="cartao">
          <h2>Entrevista</h2>
          <p className="mudo pequeno" style={{ marginTop: 0 }}>Ao marcar, a entrevista entra no <strong>seu planner</strong> (e no ClickUp) com a hora.</p>
          <div className="linha-ent">
            <input type="datetime-local" value={ent} onChange={(e) => setEnt(e.target.value)} />
            <button type="button" className="botao" disabled={pend || !ent} onClick={() => fazer(() => marcarEntrevista(c.id, ent))}>{c.entrevista_em ? "Remarcar" : "Marcar entrevista"}</button>
            {c.entrevista_em && <button type="button" className="botao secundario" disabled={pend} onClick={() => { setEnt(""); fazer(() => marcarEntrevista(c.id, null)); }}>Desmarcar</button>}
          </div>
        </section>
        <section className="cartao">
          <h2>Triagem (entrevista da recrutadora)</h2>
          <form action={acaoTriagem} key={"t" + versao}>
            <Aviso r={salvoT} />
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="tem_respostas" value="1" />
            {doVaga.length === 0 && <p className="mudo pequeno">Esta vaga não tem perguntas. Edite a vaga para escolher.</p>}
            {doVaga.map((p) => {
              const v = c.respostas?.[String(p.id)] ?? "";
              return (
                <div key={p.id} className="campo">
                  <label>{p.texto}</label>
                  {p.tipo === "sim_nao" ? (
                    <div className="radios-sn">
                      {["Sim", "Não"].map((o) => <label key={o}><input type="radio" name={`r_${p.id}`} value={o} defaultChecked={v === o} /> {o}</label>)}
                    </div>
                  ) : p.tipo === "escolha" ? (
                    <select name={`r_${p.id}`} defaultValue={v}><option value="">—</option>{p.opcoes.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : p.tipo === "numero" ? (
                    <input name={`r_${p.id}`} type="number" defaultValue={v} />
                  ) : <textarea name={`r_${p.id}`} rows={2} defaultValue={v} />}
                </div>
              );
            })}
            <div className="campo"><label>Nota da recrutadora</label>
              <select name="nota" defaultValue={c.nota ?? ""}><option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select></div>
            <div className="campo"><label>Observações</label><textarea name="observacao" rows={3} defaultValue={c.observacao ?? ""} /></div>
            <button className="botao" disabled={salvandoT}>{salvandoT ? "Salvando…" : "Salvar triagem"}</button>
          </form>
        </section>
        <section className="cartao">
          <h2>Consideração final do gestor</h2>
          <form action={acaoGestor} key={"g" + versao}>
            <Aviso r={salvoG} />
            <input type="hidden" name="id" value={c.id} />
            <textarea name="consideracao_gestor" rows={3} defaultValue={c.consideracao_gestor ?? ""} placeholder="O que o gestor achou do candidato" />
            <button className="botao secundario pequeno" style={{ marginTop: 8 }} disabled={salvandoG}>Salvar consideração</button>
          </form>
        </section>
      </div>

      <div className="cand-col">
        <section className="cartao etapa-cartao">
          <h2>Etapa</h2>
          <Aviso r={estado} />
          <div className="etapas-linha">
            {ETAPAS.map((e) => <span key={e.id} className={`etapa-pill${e.id === c.etapa ? " atual" : ""}${e.id === "reprovado" && c.etapa === "reprovado" ? " ruim" : ""}`}>{e.nome}</span>)}
          </div>
          {c.etapa === "reprovado" && <p className="pequeno">Parou em <strong>{ETAPAS.find((e) => e.id === c.parou_em)?.nome}</strong> · {motivos.find((m) => m.id === c.motivo_id)?.texto}</p>}
          {c.etapa === "aprovado" && <p className="pequeno">Contratado em <strong>{br(c.contratado_em)}</strong>{ehIndicacao && c.indicado_por ? ` · indicação de ${c.indicado_por}` : ""}</p>}
          {aberto && (
            <div className="acoes-etapa">
              {c.etapa === "inscrito" && <button type="button" className="botao" disabled={pend} onClick={() => fazer(() => moverCandidato(c.id, "triagem"))}>Chamar para entrevista → Triagem</button>}
              {c.etapa === "triagem" && <button type="button" className="botao" disabled={pend} onClick={() => fazer(() => moverCandidato(c.id, "gestor"))}>Enviar para aprovação do gestor →</button>}
              {c.etapa === "gestor" && <button type="button" className="botao" disabled={pend} onClick={() => setModo("aprovar")}>✓ Gestor aprovou</button>}
              <button type="button" className="botao secundario" disabled={pend} onClick={() => setModo("reprovar")}>✕ Não passou</button>
            </div>
          )}
          {modo === "aprovar" && (
            <div className="sub-form">
              <label className="pequeno">Data da contratação</label>
              <input type="date" value={contratado} onChange={(e) => setContratado(e.target.value)} />
              <button type="button" className="botao" disabled={pend} onClick={() => fazer(() => moverCandidato(c.id, "aprovado", { contratado_em: contratado }))}>Confirmar aprovação</button>
            </div>
          )}
          {modo === "reprovar" && (
            <div className="sub-form">
              <label className="pequeno">Motivo</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}><option value="">Escolha…</option>{motivos.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}</select>
              <button type="button" className="botao perigo" disabled={pend || !motivo} onClick={() => fazer(() => moverCandidato(c.id, "reprovado", { motivo_id: Number(motivo) }))}>Confirmar</button>
            </div>
          )}
          {!aberto && <button type="button" className="link-acao" disabled={pend} onClick={() => fazer(() => moverCandidato(c.id, c.parou_em ?? "triagem"))}>Voltar para {ETAPAS.find((e) => e.id === (c.parou_em ?? "triagem"))?.nome}</button>}
        </section>
        <ApagarCandidato id={c.id} vagaId={vaga.id} />
      </div>
    </div>
  );
}

function ApagarCandidato({ id, vagaId }: { id: number; vagaId: number }) {
  const router = useRouter();
  const [arm, setArm] = useState(false);
  const [pend, iniciar] = useTransition();
  return (
    <button type="button" className={`link-acao perigo-txt`} disabled={pend}
            onClick={() => { if (!arm) { setArm(true); return; } iniciar(async () => { const r = await apagarCandidato(id); if (!r.erro) router.push(`/rh/vagas/${vagaId}`); }); }}>
      {arm ? "Confirmar: apagar candidato e currículo" : "Apagar candidato"}
    </button>
  );
}

export function BonusPago({ id, pago }: { id: number; pago: boolean }) {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  return (
    <button type="button" className={pago ? "link-acao" : "botao pequeno"} disabled={pend}
            onClick={() => iniciar(async () => { await marcarBonusPago(id, !pago); router.refresh(); })}>
      {pago ? "Desfazer" : "Marcar como pago"}
    </button>
  );
}

/* ---------- configurações ---------- */
type Tabela = "rh_perguntas" | "rh_motivos" | "rh_canais" | "rh_mensagens";
export function ListaEditavel({ tabela, itens, titulo, ajuda }: { tabela: Tabela; itens: Record<string, unknown>[]; titulo: string; ajuda?: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Resultado>({});
  const [pend, iniciar] = useTransition();
  const salvar = (item: Record<string, unknown>) => iniciar(async () => { const r = await salvarItem(tabela, item); setEstado(r); if (!r.erro) router.refresh(); });
  const campoTexto = tabela === "rh_canais" ? "nome" : tabela === "rh_mensagens" ? "titulo" : "texto";
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      {ajuda && <p className="mudo pequeno" style={{ marginTop: 0 }}>{ajuda}</p>}
      <Aviso r={estado} />
      {itens.map((it) => (
        <form key={String(it.id)} className={`item-lista${it.ativo ? "" : " inativo"}`} action={(f) => salvar({
          id: it.id, [campoTexto]: String(f.get("t") || ""), ...(tabela === "rh_mensagens" ? { texto: String(f.get("m") || "") } : {}),
          ...(tabela === "rh_perguntas" ? { tipo: String(f.get("tipo")), opcoes: String(f.get("opcoes") || "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean), padrao: f.get("padrao") === "on" } : {}),
          ...(tabela === "rh_canais" ? { eh_indicacao: f.get("ind") === "on" } : {}),
        })}>
          <input name="t" defaultValue={String(it[campoTexto] ?? "")} />
          {tabela === "rh_mensagens" && <textarea name="m" rows={2} defaultValue={String(it.texto ?? "")} />}
          {tabela === "rh_perguntas" && (
            <>
              <select name="tipo" defaultValue={String(it.tipo)}><option value="sim_nao">Sim/não</option><option value="escolha">Escolha</option><option value="numero">Número</option><option value="texto">Texto</option></select>
              <input name="opcoes" placeholder="Opções (escolha), separadas por ;" defaultValue={((it.opcoes as string[]) || []).join("; ")} />
              <label className="pequeno"><input type="checkbox" name="padrao" defaultChecked={!!it.padrao} /> já vem marcada</label>
            </>
          )}
          {tabela === "rh_canais" && <label className="pequeno"><input type="checkbox" name="ind" defaultChecked={!!it.eh_indicacao} /> é indicação (bônus)</label>}
          <div className="acoes">
            <button className="botao secundario pequeno" disabled={pend}>Salvar</button>
            <button type="button" className="link-acao" disabled={pend} onClick={() => salvar({ id: it.id, ativo: !it.ativo })}>{it.ativo ? "Desativar" : "Ativar"}</button>
          </div>
        </form>
      ))}
      <form className="item-lista novo" action={(f) => salvar({
        [campoTexto]: String(f.get("t") || ""), ordem: 90, ...(tabela === "rh_mensagens" ? { texto: String(f.get("m") || "") } : {}),
        ...(tabela === "rh_perguntas" ? { tipo: String(f.get("tipo")), opcoes: String(f.get("opcoes") || "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean) } : {}),
      })}>
        <input name="t" placeholder={tabela === "rh_mensagens" ? "Título da mensagem nova" : "Novo item"} required />
        {tabela === "rh_mensagens" && <textarea name="m" rows={2} placeholder="Texto. Use {nome}, {vaga}, {cidade}, {entrevista}" required />}
        {tabela === "rh_perguntas" && (
          <>
            <select name="tipo" defaultValue="sim_nao"><option value="sim_nao">Sim/não</option><option value="escolha">Escolha</option><option value="numero">Número</option><option value="texto">Texto</option></select>
            <input name="opcoes" placeholder="Opções (escolha), separadas por ;" />
          </>
        )}
        <button className="botao pequeno" disabled={pend}>Adicionar</button>
      </form>
    </section>
  );
}

export type { Etapa };
