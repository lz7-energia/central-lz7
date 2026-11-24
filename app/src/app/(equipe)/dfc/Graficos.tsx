"use client";

// Gráficos do DFC. SVG próprio (a Central não usa biblioteca de gráficos), no padrão do skill de dataviz:
// entradas e saídas em polos opostos (azul × vermelho, validados), barras finas com ponta arredondada, linha de 2px,
// grade fina e discreta, dica (tooltip) ao passar o mouse, e a tabela (aba Números) como visão em texto.
import { useMemo, useRef, useState } from "react";
import { moeda, data as fmtData } from "@/lib/formato";
import type { Lancamento } from "./Dfc";

const COR = { entrada: "#2a78d6", saida: "#e34948", saldo: "#3d3d3a", grade: "#ecebe7", eixo: "#6b6a65" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const compacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e4) return `${Math.round(v / 1e3).toLocaleString("pt-BR")} mil`;
  return Math.round(v).toLocaleString("pt-BR");
};
function passoLimpo(max: number, n = 4) {
  if (max <= 0) return 1;
  const bruto = max / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
}

type Balde = { chave: string; rotulo: string; titulo: string; ent: number; sai: number };
function baldes(ls: Lancamento[], de: string, ate: string): { modo: "dia" | "mes"; lista: Balde[] } {
  const dias = Math.round((Date.parse(ate) - Date.parse(de)) / 864e5) + 1;
  const modo = dias <= 62 ? "dia" : "mes";
  const m = new Map<string, Balde>();
  const cria = (k: string) => {
    if (modo === "dia") return { chave: k, rotulo: k.slice(8, 10), titulo: fmtData(k), ent: 0, sai: 0 };
    const [a, mm] = k.split("-"); return { chave: k, rotulo: `${MESES[+mm - 1]}`, titulo: `${MESES[+mm - 1]}/${a}`, ent: 0, sai: 0 };
  };
  // todos os dias/meses do período, mesmo sem movimento
  for (let d = new Date(de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = modo === "dia" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7);
    if (!m.has(k)) m.set(k, cria(k));
  }
  for (const l of ls) {
    const k = modo === "dia" ? l.data_baixa : l.data_baixa.slice(0, 7);
    const b = m.get(k) ?? cria(k); m.set(k, b);
    if (l.sentido === "entrada") b.ent += Number(l.valor); else b.sai += Number(l.valor);
  }
  return { modo, lista: [...m.values()].sort((a, b) => a.chave.localeCompare(b.chave)) };
}

function Dica({ x, y, largura, children }: { x: number; y: number; largura: number; children: React.ReactNode }) {
  const esq = x > largura - 210;
  return (
    <div className="dfc-dica" style={{ left: esq ? undefined : x + 14, right: esq ? largura - x + 14 : undefined, top: Math.max(0, y - 10) }}>{children}</div>
  );
}
const Chave = ({ cor }: { cor: string }) => <span className="dfc-chave" style={{ background: cor }} />;

/** Entradas para cima, saídas para baixo, por dia ou mês. */
function EntradasSaidas({ ls, de, ate }: { ls: Lancamento[]; de: string; ate: string }) {
  const { modo, lista } = useMemo(() => baldes(ls, de, ate), [ls, de, ate]);
  const [sel, setSel] = useState<{ i: number; x: number; y: number } | null>(null);
  const L = 1200, A = 300, mE = 64, mD = 8, mT = 10, mB = 28; // largura do gráfico largo: o texto fica no tamanho certo
  const maxE = Math.max(0, ...lista.map((b) => b.ent)), maxS = Math.max(0, ...lista.map((b) => b.sai));
  const passo = passoLimpo(Math.max(maxE, maxS, 1), 3);
  const topo = Math.ceil(maxE / passo) * passo || passo, fundo = Math.ceil(maxS / passo) * passo || passo;
  const y = (v: number) => mT + (topo - v) / (topo + fundo) * (A - mT - mB);
  const zero = y(0);
  const slot = (L - mE - mD) / Math.max(lista.length, 1);
  const larg = Math.min(24, Math.max(3, slot * 0.6));
  const ticks: number[] = []; for (let v = -fundo; v <= topo + 1e-6; v += passo) ticks.push(Math.round(v * 100) / 100);
  const cadaRotulo = Math.ceil(lista.length / 16);
  const caixa = useRef<HTMLDivElement>(null);
  const b = sel ? lista[sel.i] : null;
  return (
    <div className="dfc-grafico" ref={caixa} onPointerLeave={() => setSel(null)}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Entradas e saídas por ${modo === "dia" ? "dia" : "mês"}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mE} x2={L - mD} y1={y(t)} y2={y(t)} stroke={t === 0 ? COR.eixo : COR.grade} strokeWidth={1} />
            <text x={mE - 6} y={y(t) + 4} textAnchor="end" className="dfc-eixo">{compacto(Math.abs(t))}</text>
          </g>
        ))}
        {lista.map((bk, i) => {
          const cx = mE + slot * i + slot / 2, hE = zero - y(bk.ent), hS = y(-bk.sai) - zero, r = Math.min(4, larg / 2);
          return (
            <g key={bk.chave}>
              {sel?.i === i && <rect x={mE + slot * i} y={mT} width={slot} height={A - mT - mB} fill="#f4f3ef" />}
              {hE > 0.5 && <path d={`M${cx - larg / 2},${zero - 1} v${-(hE - 1 - r)} q0,${-r} ${r},${-r} h${larg - 2 * r} q${r},0 ${r},${r} v${hE - 1 - r} z`} fill={COR.entrada} />}
              {hS > 0.5 && <path d={`M${cx - larg / 2},${zero + 1} v${hS - 1 - r} q0,${r} ${r},${r} h${larg - 2 * r} q${r},0 ${r},${-r} v${-(hS - 1 - r)} z`} fill={COR.saida} />}
              {i % cadaRotulo === 0 && <text x={cx} y={A - 8} textAnchor="middle" className="dfc-eixo">{bk.rotulo}</text>}
              <rect x={mE + slot * i} y={mT} width={slot} height={A - mT - mB} fill="transparent"
                onPointerMove={(e) => { const r0 = caixa.current!.getBoundingClientRect(); setSel({ i, x: e.clientX - r0.left, y: e.clientY - r0.top }); }} />
            </g>
          );
        })}
      </svg>
      {sel && b && (
        <Dica x={sel.x} y={sel.y} largura={caixa.current?.clientWidth ?? L}>
          <div className="dfc-dica-titulo">{b.titulo}</div>
          <div><Chave cor={COR.entrada} /><b>{moeda(b.ent)}</b> entradas</div>
          <div><Chave cor={COR.saida} /><b>{moeda(b.sai)}</b> saídas</div>
          <div className="mudo">resultado <b>{moeda(b.ent - b.sai)}</b></div>
        </Dica>
      )}
    </div>
  );
}

/** Saldo dia a dia (começa no saldo inicial da conciliação). */
function Saldo({ ls, de, ate, inicial }: { ls: Lancamento[]; de: string; ate: string; inicial: number | null }) {
  const pontos = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const l of ls) porDia.set(l.data_baixa, (porDia.get(l.data_baixa) ?? 0) + Number(l.valor_sinal));
    const out: { d: string; v: number }[] = []; let s = inicial ?? 0;
    for (let d = new Date(de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10); s += porDia.get(k) ?? 0; out.push({ d: k, v: s });
    }
    return out;
  }, [ls, de, ate, inicial]);
  const [sel, setSel] = useState<{ i: number; x: number; y: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const L = 1200, A = 260, mE = 64, mD = 12, mT = 12, mB = 28;
  // eixo pelo intervalo do saldo (sem forçar o zero, para a variação aparecer); folga de 5%
  const vs = pontos.map((p) => p.v), vMin = Math.min(...vs), vMax = Math.max(...vs), folga = Math.max((vMax - vMin) * 0.05, 1);
  const min0 = vMin - folga, max0 = vMax + folga;
  const passo = passoLimpo(Math.max(max0 - min0, 1), 4);
  const lo = Math.floor(min0 / passo) * passo, hi = Math.ceil(max0 / passo) * passo;
  const x = (i: number) => mE + (pontos.length <= 1 ? 0 : i / (pontos.length - 1)) * (L - mE - mD);
  const y = (v: number) => mT + (hi - v) / (hi - lo || 1) * (A - mT - mB);
  const ticks: number[] = []; for (let v = lo; v <= hi + 1e-6; v += passo) ticks.push(v);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const cada = Math.ceil(pontos.length / 8);
  const ult = pontos[pontos.length - 1];
  const p = sel ? pontos[sel.i] : null;
  return (
    <div className="dfc-grafico" ref={caixa} onPointerLeave={() => setSel(null)}
      onPointerMove={(e) => {
        const r0 = caixa.current!.getBoundingClientRect(); const fx = (e.clientX - r0.left) / r0.width * L;
        const i = Math.max(0, Math.min(pontos.length - 1, Math.round((fx - mE) / Math.max(1, L - mE - mD) * (pontos.length - 1))));
        setSel({ i, x: e.clientX - r0.left, y: e.clientY - r0.top });
      }}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Saldo ao longo do período">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mE} x2={L - mD} y1={y(t)} y2={y(t)} stroke={t === 0 ? COR.eixo : COR.grade} strokeWidth={1} />
            <text x={mE - 6} y={y(t) + 4} textAnchor="end" className="dfc-eixo">{compacto(t)}</text>
          </g>
        ))}
        {pontos.map((pt, i) => i % cada === 0 && <text key={pt.d} x={x(i)} y={A - 8} textAnchor="middle" className="dfc-eixo">{pt.d.slice(8, 10)}/{pt.d.slice(5, 7)}</text>)}
        <path d={d} fill="none" stroke={COR.saldo} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {sel && <line x1={x(sel.i)} x2={x(sel.i)} y1={mT} y2={A - mB} stroke={COR.eixo} strokeWidth={1} />}
        {sel && <circle cx={x(sel.i)} cy={y(pontos[sel.i].v)} r={4.5} fill={COR.saldo} stroke="#fff" strokeWidth={2} />}
        {ult && !sel && <circle cx={x(pontos.length - 1)} cy={y(ult.v)} r={4.5} fill={COR.saldo} stroke="#fff" strokeWidth={2} />}
      </svg>
      {sel && p && (
        <Dica x={sel.x} y={sel.y} largura={caixa.current?.clientWidth ?? L}>
          <div className="dfc-dica-titulo">{fmtData(p.d)}</div>
          <div><b>{moeda(p.v)}</b> {inicial == null ? "acumulado no período" : "saldo no fim do dia"}</div>
        </Dica>
      )}
    </div>
  );
}

/** Barras horizontais: as 10 maiores + "Outros". Clique filtra. */
function Ranking({ itens, cor, clicar, ativos }: { itens: { nome: string; v: number }[]; cor: string; clicar: (n: string) => void; ativos: string[] }) {
  const top = itens.slice(0, 10), resto = itens.slice(10).reduce((s, x) => s + x.v, 0);
  const lista = resto > 0 ? [...top, { nome: `Outros (${itens.length - 10})`, v: resto, outros: true }] : top;
  const max = Math.max(1, ...lista.map((x) => x.v));
  const total = itens.reduce((s, x) => s + x.v, 0);
  if (!lista.length) return <p className="mudo pequeno">Nada no período.</p>;
  return (
    <ul className="dfc-ranking">
      {lista.map((x) => {
        const outros = "outros" in x;
        return (
          <li key={x.nome}>
            <button type="button" disabled={outros} onClick={() => clicar(x.nome)} className={ativos.includes(x.nome) ? "ativo" : ""}
              title={`${x.nome}: ${moeda(x.v)} (${(x.v / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)${outros ? "" : " · clique para filtrar"}`}>
              <span className="dfc-rank-nome">{x.nome}</span>
              <span className="dfc-rank-barra"><span style={{ width: `${Math.max(1, x.v / max * 100)}%`, background: outros ? "#b9b8b2" : cor }} /></span>
              <span className="dfc-rank-valor">{compacto(x.v)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Graficos({ ls, de, ate, saldoInicial, filtros, alternar }: {
  ls: Lancamento[]; de: string; ate: string; saldoInicial: number | null;
  filtros: { naturezas: string[]; centros: string[] }; alternar: (campo: "naturezas" | "centros", valor: string) => void;
}) {
  const somar = (s: "entrada" | "saida", campo: "natureza" | "centro") => {
    const m = new Map<string, number>();
    for (const l of ls) if (l.sentido === s) { const k = l[campo] ?? (campo === "natureza" ? "Sem natureza" : "Sem centro"); m.set(k, (m.get(k) ?? 0) + Number(l.valor)); }
    return [...m.entries()].map(([nome, v]) => ({ nome, v })).sort((a, b) => b.v - a.v);
  };
  return (
    <div className="dfc-graficos">
      <section className="cartao dfc-largo">
        <div className="dfc-graf-topo">
          <h2>Entradas e saídas</h2>
          <span className="dfc-legenda"><span><Chave cor={COR.entrada} />Entradas</span><span><Chave cor={COR.saida} />Saídas</span></span>
        </div>
        <EntradasSaidas ls={ls} de={de} ate={ate} />
      </section>
      <section className="cartao dfc-largo">
        <div className="dfc-graf-topo"><h2>{saldoInicial == null ? "Resultado acumulado" : "Saldo ao longo do período"}</h2>
          <span className="pequeno mudo">{saldoInicial == null ? "sem saldo da conciliação: começa em zero" : `começa em ${moeda(saldoInicial)} (conciliação)`}</span></div>
        <Saldo ls={ls} de={de} ate={ate} inicial={saldoInicial} />
      </section>
      <section className="cartao">
        <div className="dfc-graf-topo"><h2>Saídas por natureza</h2></div>
        <Ranking itens={somar("saida", "natureza")} cor={COR.saida} clicar={(n) => alternar("naturezas", n)} ativos={filtros.naturezas} />
      </section>
      <section className="cartao">
        <div className="dfc-graf-topo"><h2>Saídas por centro de custo</h2></div>
        <Ranking itens={somar("saida", "centro")} cor={COR.saida} clicar={(n) => alternar("centros", n)} ativos={filtros.centros} />
      </section>
      <section className="cartao">
        <div className="dfc-graf-topo"><h2>Entradas por natureza</h2></div>
        <Ranking itens={somar("entrada", "natureza")} cor={COR.entrada} clicar={(n) => alternar("naturezas", n)} ativos={filtros.naturezas} />
      </section>
      <section className="cartao">
        <div className="dfc-graf-topo"><h2>Entradas por centro de custo</h2></div>
        <Ranking itens={somar("entrada", "centro")} cor={COR.entrada} clicar={(n) => alternar("centros", n)} ativos={filtros.centros} />
      </section>
    </div>
  );
}
