// Fiscal — PIS e COFINS. Tipos e totais da tela (as regras de classificação ficam na sincronização:
// supabase/functions/fiscal-sincronizar/index.ts). Os totais oficiais seguem a planilha: saldo = (Tabela 1 + Tabela 2) − Tabela 3.
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
  const saldoPis = r2(t.saida_produtos.pis + t.saida_servicos.pis - t.entrada_produtos.pis);
  const saldoCofins = r2(t.saida_produtos.cofins + t.saida_servicos.cofins - t.entrada_produtos.cofins);
  // Simulação de regimes (só para comparação) sobre a mesma base: saídas (produtos + serviços) e, no não cumulativo, crédito das entradas de produtos.
  const baseSaidas = r2(t.saida_produtos.valor + t.saida_servicos.valor);
  const naoCumulativo = { pis: r2(baseSaidas * 0.0165 - t.entrada_produtos.valor * 0.0165), cofins: r2(baseSaidas * 0.076 - t.entrada_produtos.valor * 0.076) };
  const cumulativo = { pis: r2(baseSaidas * 0.0065), cofins: r2(baseSaidas * 0.03) };
  return { t, saldoPis, saldoCofins, baseSaidas, naoCumulativo, cumulativo,
    pendentes: notas.filter((n) => n.status === "pendente").length, divergentes: notas.filter((n) => n.status === "divergente").length };
}

export function mesesDesde(inicio: string, ate: string) {
  const out: string[] = []; let [a, m] = inicio.split("-").map(Number); const [fa, fm] = ate.split("-").map(Number);
  while (a < fa || (a === fa && m <= fm)) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (k: string) => { const [a, m] = k.split("-").map(Number); return `${MESES[m - 1]}/${a}`; };
