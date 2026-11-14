// Fiscal — leitura dos relatórios que o escritório contábil manda todo mês (PDF do sistema dele):
//   "Relação para conferência de PIS|COFINS MM/AAAA - Entradas|Saídas" (nota a nota) e
//   "Memória de Cálculo" (apuração: débito, crédito e valores a recolher).
// Só lê o texto; não inventa nada. O que não reconhecer volta como "não reconhecido" para a tela avisar.

export type NotaEscritorio = {
  dia: string; numero: string; cfop: string; emitente: string;
  valor_contabil: number; base: number; valor: number; // valor = PIS ou COFINS dos itens
};
export type RelacaoEscritorio = { tipo: "relacao"; tributo: "pis" | "cofins"; competencia: string; direcao: "entrada" | "saida"; notas: NotaEscritorio[] };
export type MemoriaEscritorio = {
  tipo: "memoria"; tributo: "pis" | "cofins"; competencia: string;
  debito_nc: number | null; credito: number | null; nc_a_pagar: number | null; cumulativo_a_pagar: number | null; total_a_pagar: number | null;
};
export type DarfEscritorio = { tipo: "darf"; competencia: string; itens: { codigo: string; tributo: "pis" | "cofins"; regime: "nc" | "cumulativo"; valor: number }[]; vencimento: string | null };
export type LidoEscritorio = RelacaoEscritorio | MemoriaEscritorio | DarfEscritorio | { tipo: "desconhecido" };

// Códigos de receita do DARF de PIS/COFINS.
export const CODIGOS_DARF: Record<string, { tributo: "pis" | "cofins"; regime: "nc" | "cumulativo" }> = {
  "6912": { tributo: "pis", regime: "nc" }, "5856": { tributo: "cofins", regime: "nc" },
  "8109": { tributo: "pis", regime: "cumulativo" }, "2172": { tributo: "cofins", regime: "cumulativo" },
};

const N = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const comp = (mmaaaa: string) => { const [m, a] = mmaaaa.split("/"); return `${a}-${m.padStart(2, "0")}`; };
const semZeros = (s: string) => s.replace(/^0+(?=\d)/, "");

/** Linha de nota: "01 000131483 1101 0021884 - ATALAIA ... 1.003,61 1.003,61 1.003,61 16,56 16,56 0,00" */
const LINHA = new RegExp(`^(\\d{2})\\s+(\\d{3,12})\\s+(\\d{4})\\s+\\d+\\s+-\\s+(.+?)\\s+(${N})\\s+(${N})\\s+(${N})\\s+(${N})\\s+(${N})\\s+(${N})\\s*$`);

export function lerRelatorioEscritorio(texto: string): LidoEscritorio {
  const t = texto.replace(/\r/g, "");
  const rel = t.match(/Relação para conferência de (PIS|COFINS) (\d{2}\/\d{4}) - (Entradas|Saídas)/i);
  if (rel) {
    const notas: NotaEscritorio[] = [];
    for (const linha of t.split("\n")) {
      const m = linha.trim().match(LINHA);
      if (!m) continue;
      // colunas: valor contábil, base nota, base itens, tributo nota, tributo itens, diferença
      notas.push({ dia: m[1], numero: semZeros(m[2]), cfop: m[3], emitente: m[4].replace(/&amp;|eamp;/g, "&").trim(),
        valor_contabil: num(m[5]), base: num(m[7]), valor: num(m[9]) });
    }
    return { tipo: "relacao", tributo: rel[1].toLowerCase() as "pis" | "cofins", competencia: comp(rel[2]), direcao: /entrada/i.test(rel[3]) ? "entrada" : "saida", notas };
  }
  if (/Memória de Cálculo/i.test(t)) {
    const trib = t.match(/Tributo:\s*(PIS|COFINS)/i), mes = t.match(/Mês\/Ano:\s*(\d{2}\/\d{4})/i);
    if (!trib || !mes) return { tipo: "desconhecido" };
    const v = (rotulo: string) => { const m = t.match(new RegExp(`${rotulo}\\s+(${N})`, "i")); return m ? num(m[1]) : null; };
    return {
      tipo: "memoria", tributo: trib[1].toLowerCase() as "pis" | "cofins", competencia: comp(mes[1]),
      debito_nc: v("Valor Total da Contribuição Não Cumulativa do Período"),
      credito: v("Valor do Crédito Descontado, Apurado no Próprio Período da Escrituração"),
      nc_a_pagar: v("Valor da Contribuição Não Cumulativa a Recolher/Pagar"),
      cumulativo_a_pagar: v("Valor da Contribuição Cumulativa a Recolher/Pagar"),
      total_a_pagar: v("Valor Total da Contribuição a Recolher/Pagar no Período"),
    };
  }
  if (/Documento de Arrecadação/i.test(t)) {
    const pa = t.match(/PA:\s*(\d{2}\/\d{4})/);
    const itens: DarfEscritorio["itens"] = [];
    for (const linha of t.split("\n")) {
      const m = linha.trim().match(new RegExp(`^(\\d{4})\\s+.+?\\s+(${N})`));
      if (m && CODIGOS_DARF[m[1]]) itens.push({ codigo: m[1], ...CODIGOS_DARF[m[1]], valor: num(m[2]) });
    }
    if (pa && itens.length) return { tipo: "darf", competencia: comp(pa[1]), itens, vencimento: t.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null };
  }
  return { tipo: "desconhecido" };
}

/** Texto do PDF, uma linha por linha do relatório. */
export async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}
