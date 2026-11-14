// Fiscal — PIS e COFINS. Tipos e totais da tela (as regras de classificação ficam na sincronização:
// supabase/functions/fiscal-sincronizar/index.ts). Apuração como o escritório: não cumulativo = vendas de produtos − crédito das
// compras marcadas "toma crédito"; cumulativo = notas de serviço (guia separada).
export type Nota = {
  id: number; origem: string; flow_id: string; chave: string | null; numero: string; tipo_doc: string; direcao: string;
  categoria: Categoria | null; status: "ok" | "divergente" | "pendente" | "cancelada"; motivo: string | null;
  data_emissao: string | null; competencia: string | null; emitente_cnpj: string | null; emitente_nome: string | null;
  dest_cnpj: string | null; dest_nome: string | null; cfops: string[]; csts: string[]; ncms: string[]; descricao: string | null;
  valor_produtos: number | null; valor_servicos: number | null; valor_total: number | null; base_calculo: number | null;
  pis_xml: number | null; cofins_xml: number | null; icms_xml: number | null; ipi_xml: number | null; iss_xml: number | null;
  pis: number | null; cofins: number | null; icms: number | null; ipi: number | null; iss: number | null;
  xml_completo: boolean; correcoes: { numero: number; data: string | null; texto: string | null }[];
  cancelada_em: string | null; justificativa_cancelamento: string | null;
  decisao: string | null; decidido_em: string | null; decidido_por: string | null; extras: Record<string, unknown>;
  base_credito: number | null; credito: boolean | null; credito_origem: "regra" | "historico" | "escritorio" | "manual" | null; credito_em: string | null;
};
export type Categoria = "saida_produtos" | "saida_servicos" | "entrada_produtos" | "entrada_servicos" | "despesas";
export const PRIMEIRO_MES = "2026-10";
export const TABELAS: { id: Categoria; n: number; titulo: string; colunas: ("pis" | "cofins" | "icms" | "ipi" | "iss" | "piscofins")[] }[] = [
  { id: "saida_produtos", n: 1, titulo: "Saída de Produtos", colunas: ["pis", "cofins", "icms", "ipi"] },
  { id: "saida_servicos", n: 2, titulo: "Saída de Serviços", colunas: ["pis", "cofins", "iss"] },
  { id: "entrada_produtos", n: 3, titulo: "Entrada de Produtos", colunas: ["pis", "cofins", "icms", "ipi"] },
  { id: "entrada_servicos", n: 4, titulo: "Entrada de Serviços", colunas: ["pis", "cofins", "iss"] },
  { id: "despesas", n: 6, titulo: "Despesas", colunas: ["piscofins", "icms", "ipi"] },
];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const soma = (ns: Nota[], k: keyof Nota) => r2(ns.reduce((s, n) => s + (Number(n[k]) || 0), 0));

/** Entra nos totais: classificada (ok ou divergente), não pendente nem cancelada. */
export const contaNoTotal = (n: Nota) => (n.status === "ok" || n.status === "divergente") && !!n.categoria;

export function totais(notas: Nota[]) {
  const de = (c: Categoria) => notas.filter((n) => n.categoria === c && contaNoTotal(n));
  const t = Object.fromEntries(TABELAS.map((tb) => {
    const ns = de(tb.id);
    return [tb.id, { qtd: ns.length, valor: soma(ns, "valor_total"), pis: soma(ns, "pis"), cofins: soma(ns, "cofins"), icms: soma(ns, "icms"), ipi: soma(ns, "ipi"), iss: soma(ns, "iss") }];
  })) as Record<Categoria, { qtd: number; valor: number; pis: number; cofins: number; icms: number; ipi: number; iss: number }>;
  // Não cumulativo (como o escritório): débito das vendas de produtos − crédito das compras marcadas "toma crédito".
  const entradas = de("entrada_produtos");
  const comCred = entradas.filter((n) => n.credito === true);
  const credito = { pis: soma(comCred, "pis"), cofins: soma(comCred, "cofins"), base: r2(comCred.reduce((s, n) => s + (Number(n.base_credito ?? n.valor_total) || 0), 0)), qtd: comCred.length };
  const debito = { pis: t.saida_produtos.pis, cofins: t.saida_produtos.cofins };
  const comCredito = { pis: r2(debito.pis - credito.pis), cofins: r2(debito.cofins - credito.cofins) };
  const semCredito = debito;
  // Cumulativo: notas de serviço (0,65% / 3,00%), guia separada, sem crédito.
  const cumulativo = { pis: t.saida_servicos.pis, cofins: t.saida_servicos.cofins };
  return { t, debito, credito, comCredito, semCredito, cumulativo,
    semCreditoQtd: entradas.filter((n) => n.credito === false).length,
    pendentes: notas.filter((n) => n.status === "pendente").length, divergentes: notas.filter((n) => n.status === "divergente").length };
}

/* ---------- conferência com o escritório ---------- */
export type NotaEscritorio = { competencia: string; tributo: "pis" | "cofins"; direcao: "entrada" | "saida"; dia: string | null; numero: string; cfop: string | null; emitente: string | null; valor_contabil: number | null; base: number | null; valor: number | null };
export type ApuracaoEscritorio = { competencia: string; tributo: "pis" | "cofins"; debito_nc: number | null; credito: number | null; nc_a_pagar: number | null; cumulativo_a_pagar: number | null; total_a_pagar: number | null; darf_nc: number | null; darf_cumulativo: number | null; vencimento: string | null; importado_em: string };
export type Divergencia = {
  tipo: "credito_so_escritorio" | "credito_so_central" | "fora_do_escritorio" | "base_diferente" | "saida_so_escritorio" | "saida_so_central" | "saida_valor";
  numero: string; nome: string; escritorio: number | null; central: number | null; notaId: number | null; texto: string;
};
const semZeros = (s: string) => String(s ?? "").replace(/^0+(?=\d)/, "");
const palavras = (s: string | null) => (s ?? "").toUpperCase().normalize("NFD").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((p) => p.length > 2);
const parecido = (a: string | null, b: string | null) => { const pa = new Set(palavras(a)); return palavras(b).some((p) => pa.has(p)); };

/** Compara nota a nota (pelos relatórios de PIS do escritório; os de COFINS trazem as mesmas notas). */
export function conferir(notas: Nota[], esc: NotaEscritorio[]): Divergencia[] {
  const out: Divergencia[] = [];
  const acha = (lista: Nota[], numero: string, nome: string | null, valor: number | null) => {
    const c = lista.filter((n) => semZeros(n.numero) === numero);
    if (c.length <= 1) return c[0] ?? null;
    return c.find((n) => parecido(n.emitente_nome ?? n.dest_nome, nome)) ?? c.find((n) => valor !== null && Math.abs((n.valor_total ?? 0) - valor) <= Math.max(1, valor * 0.02)) ?? null;
  };
  // Entradas: crédito.
  const entCentral = notas.filter((n) => n.direcao === "entrada" && n.origem === "recebida" && n.tipo_doc !== "nfse" && n.status !== "cancelada");
  const entEsc = esc.filter((e) => e.direcao === "entrada" && e.tributo === "pis");
  const vistas = new Set<number>();
  for (const e of entEsc) {
    const n = acha(entCentral, e.numero, e.emitente, e.valor_contabil);
    if (n) vistas.add(n.id);
    const escCredita = (e.base ?? 0) > 0;
    if (escCredita && (!n || n.credito !== true))
      out.push({ tipo: "credito_so_escritorio", numero: e.numero, nome: e.emitente ?? "", escritorio: e.base, central: n ? Number(n.base_credito ?? n.valor_total) : null, notaId: n?.id ?? null,
        texto: n ? "O escritório tomou crédito; na central está como não toma." : "O escritório tomou crédito de uma nota que não está na central." });
    else if (!escCredita && n?.credito === true)
      out.push({ tipo: "credito_so_central", numero: e.numero, nome: n.emitente_nome ?? e.emitente ?? "", escritorio: 0, central: Number(n.base_credito ?? n.valor_total), notaId: n.id,
        texto: `A central toma crédito; o escritório lançou sem crédito (CFOP ${e.cfop}).` });
    else if (escCredita && n?.credito === true && Math.abs((e.base ?? 0) - Number(n.base_credito ?? n.valor_total ?? 0)) > 1)
      out.push({ tipo: "base_diferente", numero: e.numero, nome: n.emitente_nome ?? "", escritorio: e.base, central: Number(n.base_credito ?? n.valor_total), notaId: n.id,
        texto: "Os dois tomam crédito, mas com base diferente." });
  }
  if (entEsc.length) for (const n of entCentral) {
    if (vistas.has(n.id) || n.credito !== true || n.categoria !== "entrada_produtos") continue;
    out.push({ tipo: "fora_do_escritorio", numero: n.numero, nome: n.emitente_nome ?? "", escritorio: null, central: Number(n.base_credito ?? n.valor_total), notaId: n.id,
      texto: "Nota com crédito na central que não aparece no relatório do escritório: pedir para incluir." });
  }
  // Saídas: notas e valores.
  const saiCentral = notas.filter((n) => n.direcao === "saida" && n.status !== "cancelada");
  const saiEsc = esc.filter((e) => e.direcao === "saida" && e.tributo === "pis");
  const saiVistas = new Set<number>();
  for (const e of saiEsc) {
    const n = acha(saiCentral, e.numero, e.emitente, e.valor_contabil);
    if (!n) { out.push({ tipo: "saida_so_escritorio", numero: e.numero, nome: e.emitente ?? "", escritorio: e.valor_contabil, central: null, notaId: null, texto: "Venda no relatório do escritório que não está na central." }); continue; }
    saiVistas.add(n.id);
    if (Math.abs((e.valor_contabil ?? 0) - (n.valor_total ?? 0)) > 0.01)
      out.push({ tipo: "saida_valor", numero: e.numero, nome: n.dest_nome ?? "", escritorio: e.valor_contabil, central: n.valor_total, notaId: n.id, texto: "Valor da nota diferente." });
  }
  if (saiEsc.length) for (const n of saiCentral) {
    if (saiVistas.has(n.id) || !contaNoTotal(n)) continue;
    out.push({ tipo: "saida_so_central", numero: n.numero, nome: n.dest_nome ?? "", escritorio: null, central: n.valor_total, notaId: n.id, texto: "Venda na central que não está no relatório do escritório." });
  }
  return out;
}

export function mesesDesde(inicio: string, ate: string) {
  const out: string[] = []; let [a, m] = inicio.split("-").map(Number); const [fa, fm] = ate.split("-").map(Number);
  while (a < fa || (a === fa && m <= fm)) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (k: string) => { const [a, m] = k.split("-").map(Number); return `${MESES[m - 1]}/${a}`; };
