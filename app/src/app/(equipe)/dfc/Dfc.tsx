"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { moeda, data as fmtData } from "@/lib/formato";
import { Graficos } from "./Graficos";

export type Lancamento = {
  chave: string; tipo: "pagar" | "receber"; sentido: "entrada" | "saida"; titulo_id: string; rateio_id: string | null;
  parte: "rateio" | "titulo" | "diferenca"; valor: number; valor_sinal: number; data_baixa: string; competencia: string | null;
  numero: string | null; parcela: number | null; pessoa: string | null; pessoa_razao: string | null; descricao: string | null;
  historico_baixa: string | null; banco: string | null; os: string | null; codigo_projeto: string | null;
  juros: number | null; multa: number | null; desconto: number | null; valor_titulo: number | null; valor_pago_titulo: number | null;
  natureza_id: number | null; natureza: string | null; natureza_grupo: string | null; centro_id: number | null; centro: string | null;
};
export type SaldoBanco = { banco: string; ate: string; saldo: number };

const LIMITE = 500;
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tem = (v: string | null | undefined, q: string) => !q || sem(v ?? "").includes(sem(q));
/** Vários termos separados por vírgula: vale se bater com qualquer um. */
const temAlgum = (vals: (string | null | undefined)[], q: string) => {
  const termos = q.split(",").map((t) => t.trim()).filter(Boolean);
  return !termos.length || termos.some((t) => vals.some((v) => tem(v, t)));
};
type Multi = { centros: string[]; grupos: string[]; naturezas: string[]; bancos: string[] };
const MULTI0: Multi = { centros: [], grupos: [], naturezas: [], bancos: [] };
const TEXTO0 = { sentido: "", min: "", max: "", pessoa: "", descricao: "", os: "", projeto: "" };

/** Lista suspensa com caixas de marcar (vários valores) e busca. */
function MultiSelecao({ rotulo, opcoes, marcados, mudar }: { rotulo: string; opcoes: string[]; marcados: string[]; mudar: (v: string[]) => void }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  const vis = opcoes.filter((o) => tem(o, q));
  return (
    <div className="multi" ref={caixa}>
      <button type="button" className={`multi-botao${marcados.length ? " ativo" : ""}`} onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        {rotulo}{marcados.length ? <span className="contador">{marcados.length}</span> : null} <span aria-hidden>▾</span>
      </button>
      {aberto && (
        <div className="multi-painel" role="listbox" aria-multiselectable aria-label={rotulo}>
          {opcoes.length > 8 && <input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
          <div className="multi-lista">
            {vis.length === 0 && <div className="mudo pequeno" style={{ padding: 6 }}>Nada encontrado.</div>}
            {vis.map((o) => (
              <label key={o}><input type="checkbox" checked={marcados.includes(o)}
                onChange={(e) => mudar(e.target.checked ? [...marcados, o] : marcados.filter((x) => x !== o))} /> {o}</label>
            ))}
          </div>
          <div className="multi-rodape">
            <button type="button" className="link-botao pequeno" onClick={() => mudar([...new Set([...marcados, ...vis])])}>Marcar {q ? "os achados" : "todos"}</button>
            {marcados.length > 0 && <button type="button" className="link-botao pequeno" onClick={() => mudar([])}>Limpar</button>}
          </div>
        </div>
      )}
    </div>
  );
}
const valorDe = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

function periodo(rot: string, de: string, ate: string) { return { rot, href: `/dfc?de=${de}&ate=${ate}` }; }
function atalhos(hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const pm = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const fimPm = new Date(Date.UTC(Number(pm.slice(0, 4)), Number(pm.slice(5)), 0)).toISOString().slice(0, 10);
  return [periodo("Este mês", hoje.slice(0, 8) + "01", hoje), periodo("Mês passado", pm + "-01", fimPm), periodo("Este ano", `${a}-01-01`, hoje)];
}

export function Dfc({ lancamentos, de, ate, saldos, antes }: { lancamentos: Lancamento[]; de: string; ate: string; saldos: SaldoBanco[]; antes: string }) {
  const [f, setF] = useState(TEXTO0);
  const [m, setM] = useState<Multi>(MULTI0);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const limpar = () => { setF(TEXTO0); setM(MULTI0); };
  const alternar = (campo: keyof Multi, valor: string) =>
    setM((x) => ({ ...x, [campo]: x[campo].includes(valor) ? x[campo].filter((v) => v !== valor) : [...x[campo], valor] }));
  // Números ou gráficos: lembrado neste navegador (só conveniência; pode vir vazio).
  const [modo, setModo] = useState<"numeros" | "graficos">("numeros");
  useEffect(() => { try { if (localStorage.getItem("dfc-modo") === "graficos") setModo("graficos"); } catch { /* sem armazenamento */ } }, []);
  const trocarModo = (v: "numeros" | "graficos") => { setModo(v); try { localStorage.setItem("dfc-modo", v); } catch { /* */ } };

  const opcoes = useMemo(() => {
    const u = (fn: (l: Lancamento) => string | null) => [...new Set(lancamentos.map(fn).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
    return { centros: u((l) => l.centro), grupos: u((l) => l.natureza_grupo), naturezas: u((l) => l.natureza), bancos: u((l) => l.banco) };
  }, [lancamentos]);

  const filtrados = useMemo(() => {
    const min = valorDe(f.min), max = valorDe(f.max);
    return lancamentos.filter((l) =>
      (!f.sentido || l.sentido === f.sentido) && (min === null || l.valor >= min) && (max === null || l.valor <= max) &&
      temAlgum([l.pessoa, l.pessoa_razao], f.pessoa) && temAlgum([l.descricao, l.historico_baixa], f.descricao) &&
      (!m.centros.length || m.centros.includes(l.centro ?? "")) && (!m.grupos.length || m.grupos.includes(l.natureza_grupo ?? "")) &&
      (!m.naturezas.length || m.naturezas.includes(l.natureza ?? "")) && (!m.bancos.length || m.bancos.includes(l.banco ?? "")) &&
      temAlgum([l.os], f.os) && temAlgum([l.codigo_projeto], f.projeto),
    ).sort((a, b) => b.data_baixa.localeCompare(a.data_baixa) || a.titulo_id.localeCompare(b.titulo_id));
  }, [lancamentos, f, m]);
  const filtrando = Object.values(f).some(Boolean) || Object.values(m).some((x) => x.length > 0);
  const chips = (Object.keys(m) as (keyof Multi)[]).flatMap((k) => m[k].map((v) => ({ k, v })));

  const soma = (ls: Lancamento[], s: string) => ls.filter((l) => l.sentido === s).reduce((t, l) => t + Number(l.valor), 0);
  const entradas = soma(lancamentos, "entrada"), saidas = soma(lancamentos, "saida");
  const saldoInicial = saldos.reduce((t, s) => t + s.saldo, 0);
  const atrasadas = saldos.filter((s) => s.ate < antes);

  // Resumo por grupo → natureza (dos filtrados)
  const grupos = useMemo(() => {
    const m = new Map<string, { ent: number; sai: number; nat: Map<string, { ent: number; sai: number }> }>();
    for (const l of filtrados) {
      const g = l.natureza_grupo ?? "Sem grupo", n = l.natureza ?? "Sem natureza";
      if (!m.has(g)) m.set(g, { ent: 0, sai: 0, nat: new Map() });
      const G = m.get(g)!; if (!G.nat.has(n)) G.nat.set(n, { ent: 0, sai: 0 });
      const N = G.nat.get(n)!;
      if (l.sentido === "entrada") { G.ent += Number(l.valor); N.ent += Number(l.valor); } else { G.sai += Number(l.valor); N.sai += Number(l.valor); }
    }
    return [...m.entries()].sort((a, b) => (b[1].ent - b[1].sai) - (a[1].ent - a[1].sai));
  }, [filtrados]);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const exportar = () => {
    const cab = ["Data da baixa", "Entrada/Saída", "Valor", "Fornecedor/Cliente", "Razão social", "Descrição", "Natureza", "Grupo", "Centro de custo", "OS", "Código do projeto", "Banco", "Título", "Parcela", "Parte", "Valor do título", "Valor pago do título", "Competência"];
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
    const linhas = filtrados.map((l) => [fmtData(l.data_baixa), l.sentido === "entrada" ? "Entrada" : "Saída", num(l.valor), l.pessoa, l.pessoa_razao, l.descricao,
      l.natureza, l.natureza_grupo, l.centro, l.os, l.codigo_projeto, l.banco, l.numero ?? l.titulo_id, l.parcela,
      l.parte === "rateio" ? "Rateio" : l.parte === "diferenca" ? "Juros/multa/desconto" : "Título", num(l.valor_titulo), num(l.valor_pago_titulo), l.competencia]);
    const csv = "﻿" + [cab, ...linhas].map((r) => r.map(esc).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `dfc-${de}-a-${ate}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <form className="filtros" action="/dfc">
        <label className="pequeno mudo">De <input type="date" name="de" defaultValue={de} /></label>
        <label className="pequeno mudo">até <input type="date" name="ate" defaultValue={ate} /></label>
        <button className="botao pequeno">Ver período</button>
        <div className="abas" style={{ marginLeft: "auto" }}>
          <a href="#" className={modo === "numeros" ? "ativo" : ""} onClick={(e) => { e.preventDefault(); trocarModo("numeros"); }}>Números</a>
          <a href="#" className={modo === "graficos" ? "ativo" : ""} onClick={(e) => { e.preventDefault(); trocarModo("graficos"); }}>Gráficos</a>
        </div>
        <div className="abas">
          {atalhos(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)).map((p) => (
            <a key={p.rot} href={p.href} className={p.href === `/dfc?de=${de}&ate=${ate}` ? "ativo" : ""}>{p.rot}</a>
          ))}
        </div>
      </form>

      <div className="resumo">
        <div className="indicador">
          <div className="rotulo">Saldo inicial (conciliação)</div>
          <div className="numero" style={{ fontSize: "1.45rem" }}>{saldos.length ? moeda(saldoInicial) : "—"}</div>
          <div className="detalhe">{saldos.length ? `${saldos.length} ${saldos.length === 1 ? "banco" : "bancos"} · até ${fmtData(antes)}` : "nenhuma conciliação antes do período"}</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Entradas</div>
          <div className="numero" style={{ fontSize: "1.45rem", color: "#1b6b3a" }}>{moeda(entradas)}</div>
          <div className="detalhe">títulos a receber baixados</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Saídas</div>
          <div className="numero" style={{ fontSize: "1.45rem", color: "var(--perigo)" }}>{moeda(saidas)}</div>
          <div className="detalhe">títulos a pagar baixados</div>
        </div>
        <div className="indicador destaque">
          <div className="rotulo">Saldo final</div>
          <div className="numero" style={{ fontSize: "1.45rem" }}>{saldos.length ? moeda(saldoInicial + entradas - saidas) : "—"}</div>
          <div className="detalhe">resultado do período {moeda(entradas - saidas)}</div>
        </div>
      </div>
      {saldos.length > 0 && (
        <details className="pequeno" style={{ margin: "-6px 0 14px" }}>
          <summary className="mudo" style={{ cursor: "pointer" }}>Saldo inicial por banco{atrasadas.length ? ` · ${atrasadas.length} com conciliação atrasada` : ""}</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {saldos.map((s) => (
              <li key={s.banco}>{s.banco}: <b>{moeda(s.saldo)}</b> <span className={s.ate < antes ? "atrasado" : "mudo"}>(conciliado até {fmtData(s.ate)}{s.ate < antes ? ": faltam dias até o início do período" : ""})</span></li>
            ))}
          </ul>
        </details>
      )}

      <div className="filtros" style={{ flexWrap: "wrap", gap: 8 }}>
        <select value={f.sentido} onChange={set("sentido")} aria-label="Entrada ou saída"><option value="">Entradas e saídas</option><option value="entrada">Só entradas</option><option value="saida">Só saídas</option></select>
        <input type="text" inputMode="decimal" placeholder="Valor de" value={f.min} onChange={set("min")} style={{ width: 95 }} aria-label="Valor mínimo" />
        <input type="text" inputMode="decimal" placeholder="até" value={f.max} onChange={set("max")} style={{ width: 95 }} aria-label="Valor máximo" />
        <input type="search" placeholder="Fornecedor ou cliente" value={f.pessoa} onChange={set("pessoa")} aria-label="Fornecedor ou cliente" title="Vários: separe por vírgula" />
        <input type="search" placeholder="Descrição" value={f.descricao} onChange={set("descricao")} aria-label="Descrição" title="Vários: separe por vírgula" />
        <MultiSelecao rotulo="Centro de custo" opcoes={opcoes.centros} marcados={m.centros} mudar={(v) => setM({ ...m, centros: v })} />
        <MultiSelecao rotulo="Grupo" opcoes={opcoes.grupos} marcados={m.grupos} mudar={(v) => setM({ ...m, grupos: v })} />
        <MultiSelecao rotulo="Natureza" opcoes={opcoes.naturezas} marcados={m.naturezas} mudar={(v) => setM({ ...m, naturezas: v })} />
        <MultiSelecao rotulo="Banco" opcoes={opcoes.bancos} marcados={m.bancos} mudar={(v) => setM({ ...m, bancos: v })} />
        <input type="search" placeholder="OS" value={f.os} onChange={set("os")} style={{ width: 90 }} aria-label="OS" title="Vários: separe por vírgula" />
        <input type="search" placeholder="Código do projeto" value={f.projeto} onChange={set("projeto")} style={{ width: 160 }} aria-label="Código do projeto" title="Vários: separe por vírgula" />
        {filtrando && <button type="button" className="botao secundario pequeno" onClick={limpar}>Limpar filtros</button>}
        <button type="button" className="botao secundario pequeno" style={{ marginLeft: "auto" }} onClick={exportar} disabled={!filtrados.length}>Baixar planilha</button>
      </div>
      {chips.length > 0 && (
        <div className="filtros-ativos">
          {chips.map((c) => <button key={c.k + c.v} type="button" className="chip-filtro" onClick={() => alternar(c.k, c.v)} title="Tirar este filtro">{c.v} ×</button>)}
        </div>
      )}
      <p className="pequeno mudo" style={{ margin: "0 0 8px" }}>Nos campos de texto, separe vários valores por vírgula (ex.: OS <i>123, 456</i>).</p>
      {filtrando && (
        <p className="pequeno" style={{ margin: "0 0 10px" }}>
          Com os filtros: entradas <b style={{ color: "#1b6b3a" }}>{moeda(soma(filtrados, "entrada"))}</b> · saídas <b style={{ color: "var(--perigo)" }}>{moeda(soma(filtrados, "saida"))}</b> ·
          resultado <b>{moeda(soma(filtrados, "entrada") - soma(filtrados, "saida"))}</b> · {filtrados.length} lançamentos
        </p>
      )}

      {modo === "graficos" ? (
        <Graficos ls={filtrados} de={de} ate={ate} saldoInicial={saldos.length ? saldoInicial : null}
          filtros={{ naturezas: m.naturezas, centros: m.centros }} alternar={alternar} />
      ) : <>
      <section className="cartao" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Por natureza</h2>
        <div className="tabela-caixa"><table>
          <thead><tr><th>Grupo / natureza</th><th style={{ textAlign: "right" }}>Entradas</th><th style={{ textAlign: "right" }}>Saídas</th><th style={{ textAlign: "right" }}>Resultado</th></tr></thead>
          <tbody>
            {grupos.length === 0 && <tr><td colSpan={4} className="vazio">Nada no período.</td></tr>}
            {grupos.map(([g, G]) => (
              <GrupoLinhas key={g} nome={g} G={G} aberto={abertos.has(g)}
                alternar={() => setAbertos((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })}
                filtrar={(nat) => alternar("naturezas", nat)} />
            ))}
          </tbody>
        </table></div>
      </section>

      <div className="tabela-caixa">
        <table>
          <thead>
            <tr><th>Baixa</th><th style={{ textAlign: "right" }}>Valor</th><th>Fornecedor / cliente</th><th>Descrição</th><th>Natureza</th><th>Centro de custo</th><th>OS / projeto</th><th>Banco</th></tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={8} className="vazio">{lancamentos.length ? "Nenhum lançamento com esses filtros." : "Nenhum título baixado no período."}</td></tr>}
            {filtrados.slice(0, LIMITE).map((l) => (
              <tr key={l.chave}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtData(l.data_baixa)}<div className="pequeno mudo">{l.tipo === "pagar" ? "Pagar" : "Receber"} {l.numero ?? l.titulo_id}{l.parcela ? `/${l.parcela}` : ""}</div></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap", color: l.sentido === "entrada" ? "#1b6b3a" : "var(--perigo)", fontWeight: 600 }}>
                  {l.sentido === "entrada" ? "+" : "−"}{moeda(l.valor)}
                  {l.parte !== "titulo" && <div className="pequeno mudo" style={{ fontWeight: 400 }}>{l.parte === "rateio" ? "rateio" : "juros/multa/desconto"} de {moeda(l.valor_pago_titulo ?? l.valor_titulo)}</div>}
                </td>
                <td>{l.pessoa ?? "—"}{l.pessoa_razao && l.pessoa_razao !== l.pessoa && <div className="pequeno mudo">{l.pessoa_razao}</div>}</td>
                <td className="pequeno" style={{ maxWidth: 280 }} title={l.historico_baixa ?? undefined}>{l.descricao ?? <span className="mudo">—</span>}</td>
                <td className="pequeno">{l.natureza ?? "—"}{l.natureza_grupo && <div className="mudo">{l.natureza_grupo}</div>}</td>
                <td className="pequeno">{l.centro ?? "—"}</td>
                <td className="pequeno">{l.os ? `OS ${l.os}` : ""}{l.os && l.codigo_projeto ? <br /> : null}{l.codigo_projeto ?? (l.os ? "" : "—")}</td>
                <td className="pequeno">{l.banco ?? "—"}</td>
              </tr>
            ))}
            {filtrados.length > LIMITE && <tr><td colSpan={8} className="vazio">+{filtrados.length - LIMITE} lançamentos (use os filtros ou baixe a planilha)</td></tr>}
          </tbody>
        </table>
      </div>
      </>}
    </>
  );
}

function GrupoLinhas({ nome, G, aberto, alternar, filtrar }: {
  nome: string; G: { ent: number; sai: number; nat: Map<string, { ent: number; sai: number }> }; aberto: boolean; alternar: () => void; filtrar: (n: string) => void;
}) {
  const r = G.ent - G.sai;
  return (
    <>
      <tr onClick={alternar} style={{ cursor: "pointer" }}>
        <td><b>{aberto ? "▾" : "▸"} {nome}</b></td>
        <td style={{ textAlign: "right" }}>{G.ent ? moeda(G.ent) : "—"}</td>
        <td style={{ textAlign: "right" }}>{G.sai ? moeda(G.sai) : "—"}</td>
        <td style={{ textAlign: "right", fontWeight: 600, color: r >= 0 ? "#1b6b3a" : "var(--perigo)" }}>{moeda(r)}</td>
      </tr>
      {aberto && [...G.nat.entries()].sort((a, b) => (b[1].ent + b[1].sai) - (a[1].ent + a[1].sai)).map(([n, N]) => (
        <tr key={n} className="pequeno">
          <td style={{ paddingLeft: 28 }}><button type="button" className="link-botao" onClick={() => filtrar(n)}>{n}</button></td>
          <td style={{ textAlign: "right" }}>{N.ent ? moeda(N.ent) : "—"}</td>
          <td style={{ textAlign: "right" }}>{N.sai ? moeda(N.sai) : "—"}</td>
          <td style={{ textAlign: "right" }}>{moeda(N.ent - N.sai)}</td>
        </tr>
      ))}
    </>
  );
}
