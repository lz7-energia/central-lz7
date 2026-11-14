// Central LZ7 — Fiscal: notas do Flow para a apuração de PIS e COFINS. SOMENTE LEITURA no Flow (só GET).
// A partir de outubro/2026 copia e classifica:
//   - notas recebidas (documentosEntrada/eventos/) + XML de cada uma (obterArquivosNotasRecebidas / ...Nfse);
//   - notas de produto emitidas (documentosSaida + detalhe de cada nota);
//   - notas de serviço emitidas (notasFiscaisServico + XML pelo link da própria nota).
// Regras: as da planilha "PIS E COFINS - Outubro.xlsx" (ver CLAUDE.md, seção Fiscal). Nunca inventa dado: campo ausente
// fica null ("Não informado"); dúvida de classificação fica "pendente" e fora dos totais até alguém decidir na tela.
// Endereços confirmados em 14/11/2026 pela tela do Flow e com o token da Central (explorador v7).
// deno-lint-ignore-file no-explicit-any

export const DESDE = "2026-10-01";
export const ALIQ = { produtos: { pis: 0.0165, cofins: 0.076 }, servicos: { pis: 0.0065, cofins: 0.03 } };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/* ---------- leitura do XML (NF-e e NFS-e), sem dependências ---------- */
const semNs = (xml: string) => xml.replace(/<(\/?)[a-zA-Z0-9_]+:/g, "<$1");
function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`));
  return m ? m[1].trim() : null;
}
function tags(xml: string, nome: string): string[] {
  return [...xml.matchAll(new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`, "g"))].map((m) => m[1].trim());
}
function bloco(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return m ? m[1] : null;
}
const primeiro = (xml: string, nomes: string[]) => { for (const n of nomes) { const v = tag(xml, n); if (v !== null) return v; } return null; };
const unicos = (a: string[]) => [...new Set(a.filter(Boolean))];

export type Lido = {
  tipo: "nfe" | "nfse" | "resumo" | "desconhecido";
  numero: string | null; emissao: string | null;
  emitCnpj: string | null; emitNome: string | null; destCnpj: string | null; destNome: string | null;
  cfops: string[]; csts: string[]; ncms: string[]; descricao: string | null;
  vProd: number | null; vServ: number | null; vNF: number | null; base: number | null; baseItens: number | null;
  vPIS: number | null; vCOFINS: number | null; vICMS: number | null; vIPI: number | null; vISS: number | null;
  tpEmis: string | null; refNFe: string | null;
};

export function lerXml(original: string): Lido {
  const xml = semNs(original || "");
  const vazio: Lido = { tipo: "desconhecido", numero: null, emissao: null, emitCnpj: null, emitNome: null, destCnpj: null, destNome: null,
    cfops: [], csts: [], ncms: [], descricao: null, vProd: null, vServ: null, vNF: null, base: null, baseItens: null,
    vPIS: null, vCOFINS: null, vICMS: null, vIPI: null, vISS: null, tpEmis: null, refNFe: null };
  if (/<resNFe[\s>]/.test(xml) && !/<infNFe[\s>]/.test(xml)) {
    return { ...vazio, tipo: "resumo", emitCnpj: tag(xml, "CNPJ"), emitNome: tag(xml, "xNome"), emissao: tag(xml, "dhEmi"), vNF: num(tag(xml, "vNF")) };
  }
  if (/<infNFe[\s>]/.test(xml)) {
    const emit = bloco(xml, "emit") ?? "", dest = bloco(xml, "dest") ?? "", ide = bloco(xml, "ide") ?? "";
    const tot = bloco(xml, "ICMSTot") ?? "";
    const dets = [...xml.matchAll(/<det\s[^>]*>([\s\S]*?)<\/det>/g)].map((m) => m[1]);
    // Base do crédito como o escritório calcula: soma dos itens (valor do produto − desconto), sem frete/IPI/ST.
    const baseItens = dets.length ? r2(dets.reduce((s, d) => s + (num(tag(bloco(d, "prod") ?? d, "vProd")) ?? 0) - (num(tag(bloco(d, "prod") ?? d, "vDesc")) ?? 0), 0)) : null;
    const csts = unicos(dets.flatMap((d) => [...tags(bloco(d, "PIS") ?? "", "CST"), ...tags(bloco(d, "ICMS") ?? "", "CST"), ...tags(bloco(d, "ICMS") ?? "", "CSOSN")]));
    return {
      ...vazio, tipo: "nfe", numero: tag(ide, "nNF"), emissao: tag(ide, "dhEmi") ?? tag(ide, "dEmi"),
      emitCnpj: tag(emit, "CNPJ") ?? tag(emit, "CPF"), emitNome: tag(emit, "xNome"), destCnpj: tag(dest, "CNPJ") ?? tag(dest, "CPF"), destNome: tag(dest, "xNome"),
      cfops: unicos(dets.map((d) => tag(d, "CFOP") ?? "")), csts, ncms: unicos(dets.map((d) => tag(d, "NCM") ?? "")),
      descricao: unicos(dets.map((d) => tag(d, "xProd") ?? "")).slice(0, 6).join(" · ") || null,
      vProd: num(tag(tot, "vProd")), vNF: num(tag(tot, "vNF")), base: num(tag(tot, "vBC")), baseItens,
      vPIS: num(tag(tot, "vPIS")), vCOFINS: num(tag(tot, "vCOFINS")), vICMS: num(tag(tot, "vICMS")), vIPI: num(tag(tot, "vIPI")),
      tpEmis: tag(ide, "tpEmis"), refNFe: tag(ide, "refNFe"),
    };
  }
  if (/<(Nfse|CompNfse|NFSe|InfNfse|infNFSe|DPS)[\s>]/i.test(xml)) {
    const prest = bloco(xml, "PrestadorServico") ?? bloco(xml, "Prestador") ?? bloco(xml, "emit") ?? "";
    const toma = bloco(xml, "TomadorServico") ?? bloco(xml, "Tomador") ?? bloco(xml, "toma") ?? "";
    return {
      ...vazio, tipo: "nfse", numero: primeiro(xml, ["Numero", "nNFSe", "nDFSe"]), emissao: primeiro(xml, ["DataEmissao", "dhEmi", "dhProc"]),
      emitCnpj: primeiro(prest, ["Cnpj", "CNPJ", "Cpf", "CPF"]), emitNome: primeiro(prest, ["RazaoSocial", "xNome", "NomeFantasia"]),
      destCnpj: primeiro(toma, ["Cnpj", "CNPJ", "Cpf", "CPF"]), destNome: primeiro(toma, ["RazaoSocial", "xNome"]),
      descricao: primeiro(xml, ["Discriminacao", "xDescServ", "xTribNac"]),
      vServ: num(primeiro(xml, ["ValorServicos", "vServ"])), vNF: num(primeiro(xml, ["ValorServicos", "vServ", "vLiq", "ValorLiquidoNfse"])),
      vPIS: num(primeiro(xml, ["ValorPis", "vPis", "vPIS"])), vCOFINS: num(primeiro(xml, ["ValorCofins", "vCofins", "vCOFINS"])),
      vISS: num(primeiro(xml, ["ValorIss", "vISSQN", "vISS", "ValorISS"])),
    };
  }
  return vazio;
}

/* ---------- classificação (regras da planilha + crédito como o escritório) ---------- */
// CFOP do FORNECEDOR na nota recebida (5xxx/6xxx = saída dele = compra nossa).
// Compra de mercadoria (revenda/industrialização, inclusive com ST): o escritório toma crédito (CST 50).
const COMPRA = new Set(["5101", "6101", "5102", "6102", "5401", "6401", "5402", "6402", "5403", "6403", "6404", "5405", "6405"]);
// Combustível, venda a consumidor final / não contribuinte, cupom: o escritório lança como uso e consumo, sem crédito (CST 70).
const SEM_CREDITO = new Set(["5929", "6929", "5656", "6656", "5667", "6667", "5103", "6103", "5104", "6104", "5106", "6106", "5108", "6108", "5933", "6933"]);
// CFOP da LZ7 nas notas emitidas.
const SAIDA_PRODUTOS = new Set(["5102", "6102", "5405", "6405", "5949", "6949"]);
const ENTRADA_PRODUTOS_PROPRIA = new Set(["1102", "2102", "1124", "2124"]);
const USO_CONSUMO = new Set(["1556", "2556", "1407", "2407"]);
// Atípicos sem tabela própria → Despesas: remessa/retorno de conserto ou garantia, venda/remessa à ordem, retornos.
const ATIPICO = new Set([
  "5915", "6915", "5916", "6916", "1915", "2915", "1916", "2916", // remessa / retorno de conserto ou garantia
  "5923", "6923", "1923", "2923", "5118", "6118", "5119", "6119", "5120", "6120", // venda / remessa à ordem
  "5201", "6201", "5202", "6202", "1201", "2201", "1202", "2202", "5411", "6411", "1411", "2411", // devolução / retorno de mercadoria
]);
const ehAtipico = (c: string) => ATIPICO.has(c);

export type Classificada = {
  categoria: string | null; status: "ok" | "divergente" | "pendente"; motivo: string | null;
  base: number | null; pis: number | null; cofins: number | null; icms: number | null; ipi: number | null; iss: number | null;
  credito?: boolean | null; creditoOrigem?: "regra" | "historico" | null; baseCredito?: number | null;
};
const modeloProdutos = (valor: number | null, icms: number | null, ipi: number | null): Classificada => ({
  categoria: null, status: "ok", motivo: null, base: valor,
  pis: valor === null ? null : r2(valor * ALIQ.produtos.pis), cofins: valor === null ? null : r2(valor * ALIQ.produtos.cofins),
  icms: icms ?? 0, ipi: ipi ?? 0, iss: null,
});
const despesas = (valor: number | null, motivo: string): Classificada => ({ categoria: "despesas", status: "ok", motivo, base: valor, pis: 0, cofins: 0, icms: 0, ipi: 0, iss: null });
const pendente = (motivo: string, valor: number | null): Classificada => ({ categoria: null, status: "pendente", motivo, base: valor, pis: null, cofins: null, icms: null, ipi: null, iss: null });

function divergencia(c: Classificada, pisInf: number | null, cofinsInf: number | null): Classificada {
  const dif = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) > 0.01;
  if (dif(c.pis, pisInf) || dif(c.cofins, cofinsInf)) {
    return { ...c, status: "divergente", motivo: `Calculado PIS ${c.pis?.toFixed(2)} / COFINS ${c.cofins?.toFixed(2)} × informado PIS ${pisInf?.toFixed(2) ?? "—"} / COFINS ${cofinsInf?.toFixed(2) ?? "—"}` };
  }
  return c;
}

/** Entrada de produto com a decisão de crédito: toma = base dos itens × 1,65% / 7,60%; não toma = 0. */
export function comCredito(base: number | null, credito: boolean | null, icms: number | null, ipi: number | null): Pick<Classificada, "pis" | "cofins" | "icms" | "ipi"> {
  return {
    pis: credito ? (base === null ? null : r2(base * ALIQ.produtos.pis)) : 0,
    cofins: credito ? (base === null ? null : r2(base * ALIQ.produtos.cofins)) : 0,
    icms: icms ?? 0, ipi: ipi ?? 0,
  };
}

/**
 * Nota recebida de produto (NF-e do fornecedor). Vai para Entrada de Produtos com a sugestão de crédito:
 *   1) o que a equipe ou o escritório decidiu para o mesmo fornecedor (historico);
 *   2) senão, pelo CFOP do fornecedor: compra de mercadoria → toma; combustível/consumo → não toma;
 *   3) CFOP fora dessas listas → pendente, para alguém marcar "toma" ou "não toma".
 * O PIS/COFINS destacado pelo fornecedor não decide o crédito (o escritório credita compra de Simples, por exemplo).
 */
export function classificarRecebidaProduto(x: Lido, completa: boolean, historico: boolean | null = null): Classificada {
  const valor = x.vNF;
  if (x.tipo === "resumo" || !completa || x.tipo !== "nfe")
    return pendente("Só chegou resumo/DANFE, sem o XML completo — confirmar se lança em Entrada de Produtos pelo modelo fixo (toma crédito pelo valor total) ou se espera o XML.", valor);
  const atipicos = x.cfops.filter(ehAtipico);
  if (atipicos.length) return { ...despesas(valor, `CFOP atípico sem tabela própria (${atipicos.join(", ")}).`), credito: false, creditoOrigem: "regra", baseCredito: x.baseItens };
  const base = x.baseItens ?? valor;
  const montar = (credito: boolean, origem: "regra" | "historico", motivo: string): Classificada =>
    ({ categoria: "entrada_produtos", status: "ok", motivo, base, ...comCredito(base, credito, x.vICMS, x.vIPI), iss: null, credito, creditoOrigem: origem, baseCredito: base });
  if (historico !== null)
    return montar(historico, "historico", historico ? "Toma crédito: mesma decisão já registrada para este fornecedor." : "Não toma crédito: mesma decisão já registrada para este fornecedor.");
  if (x.cfops.length && x.cfops.every((c) => COMPRA.has(c))) return montar(true, "regra", `Toma crédito: compra de mercadoria (CFOP ${x.cfops.join(", ")}).`);
  if (x.cfops.length && x.cfops.every((c) => COMPRA.has(c) || SEM_CREDITO.has(c)))
    return montar(false, "regra", `Não toma crédito: CFOP de combustível, consumo ou consumidor final (${x.cfops.filter((c) => SEM_CREDITO.has(c)).join(", ")}).`);
  const fora = x.cfops.filter((c) => !COMPRA.has(c) && !SEM_CREDITO.has(c));
  return { ...pendente(`CFOP ${fora.join(", ") || "não informado"} fora das listas de crédito — marcar se toma crédito ou não.`, valor), baseCredito: base };
}

/** Nota de serviço recebida (NFS-e do prestador): sem modelo fixo; PIS/COFINS só se informados. */
export function classificarRecebidaServico(valor: number | null, pisInf: number | null, cofinsInf: number | null, issInf: number | null): Classificada {
  return { categoria: "entrada_servicos", status: "ok", motivo: null, base: valor, pis: pisInf, cofins: cofinsInf, icms: null, ipi: null, iss: issInf };
}

/** Nota de produto emitida pela LZ7 (saída ou entrada própria). */
export function classificarEmitidaProduto(entradaSaida: string, cfops: string[], valor: number | null, pisInf: number | null, cofinsInf: number | null, icmsInf: number | null, ipiInf: number | null): Classificada {
  const entrada = /entrada/i.test(entradaSaida || "");
  if (!cfops.length) return pendente("CFOP não informado pelo Flow — confirmar a classificação.", valor);
  const atipicos = cfops.filter(ehAtipico);
  if (atipicos.length) return despesas(valor, `CFOP atípico sem tabela própria (${atipicos.join(", ")}).`);
  if (!entrada && cfops.every((c) => SAIDA_PRODUTOS.has(c)))
    return divergencia({ ...modeloProdutos(valor, icmsInf, ipiInf), categoria: "saida_produtos" }, pisInf, cofinsInf);
  if (entrada && cfops.every((c) => ENTRADA_PRODUTOS_PROPRIA.has(c)))
    return divergencia({ ...modeloProdutos(valor, icmsInf, ipiInf), categoria: "entrada_produtos" }, pisInf, cofinsInf);
  if (cfops.some((c) => USO_CONSUMO.has(c))) return pendente(`CFOP de uso/consumo (${cfops.join(", ")}) — confirmar se entra em Produtos ou Despesas.`, valor);
  return pendente(`CFOP ${cfops.join(", ")} não mapeado — confirmar a classificação.`, valor);
}

/** Nota de serviço emitida pela LZ7: modelo 0,65% / 3,00% sempre; ISS informado. */
export function classificarEmitidaServico(valor: number | null, pisInf: number | null, cofinsInf: number | null, issInf: number | null): Classificada {
  const c: Classificada = { categoria: "saida_servicos", status: "ok", motivo: null, base: valor,
    pis: valor === null ? null : r2(valor * ALIQ.servicos.pis), cofins: valor === null ? null : r2(valor * ALIQ.servicos.cofins), icms: null, ipi: null, iss: issInf };
  return divergencia(c, pisInf, cofinsInf);
}

/** Data no horário de Brasília: "2026-11-01T01:30:00Z" (31/10 às 22h30 em Brasília) vira "2026-10-31". Sem fuso, vale como veio. */
export const dataSP = (data: string | null | undefined): string | null => {
  if (!data) return null;
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(data)) {
    const d = new Date(data);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  return /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null;
};
export const competencia = (data: string | null) => dataSP(data)?.slice(0, 7) ?? null;
const soDigitos = (s: string | null) => (s ? s.replace(/\D/g, "") || null : null);

/* ---------- sincronização ---------- */
if (typeof (globalThis as any).Deno !== "undefined") {
  const Deno = (globalThis as any).Deno;
  const RAIZ = (Deno.env.get("FLOW_API_RAIZ") ?? "https://api.flow2.com.br").replace(/\/$/, "");
  const TOKEN = Deno.env.get("FLOW_API_TOKEN") ?? "";
  const LIMITE_DOWNLOADS = 35; // XMLs/detalhes por execução (o resto vai nas próximas)
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function flow(caminho: string, comoTexto = false): Promise<any> {
    for (let t = 1; ; t++) {
      const r = await fetch(`${RAIZ}/${caminho}`, { method: "GET", headers: { Authorization: `Bearer ${TOKEN}`, Accept: comoTexto ? "*/*" : "application/json" } });
      if (r.ok) return comoTexto ? await r.text() : await r.json();
      if (t < 3 && (r.status === 429 || r.status >= 500)) { await espera(2000 * t); continue; }
      const corpo = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`Flow ${caminho.split("?")[0]}: HTTP ${r.status}${corpo ? ` (${corpo})` : ""}`);
    }
  }
  // Paginação igual à tela do Flow: skip só a partir da 2ª página (a tela nunca manda skip=0).
  // Se o Flow recusar o tamanho de página (HTTP 400), tenta de novo com páginas menores.
  async function paginas(caminho: string, parar?: (item: any) => boolean, tamanho = 100): Promise<any[]> {
    const out: any[] = [];
    const sep = caminho.includes("?") ? "&" : "?";
    for (let skip = 0; skip < 50000;) {
      let p: any;
      try {
        p = await flow(`${caminho}${sep}pageSize=${tamanho}${skip > 0 ? `&skip=${skip}` : ""}`);
      } catch (e) {
        if (tamanho > 20 && /HTTP 400/.test((e as Error).message)) { tamanho = tamanho > 50 ? 50 : 20; continue; }
        throw e;
      }
      const itens = p?.itens ?? [];
      out.push(...itens);
      if (itens.length < tamanho || (parar && itens.some(parar))) break;
      skip += itens.length;
    }
    return out;
  }

  Deno.serve(async () => {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    if (!TOKEN) return Response.json({ erro: "FLOW_API_TOKEN não configurado" }, { status: 500 });
    const desde = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: rec } = await sb.from("sincronizacoes").select("id").eq("recurso", "fiscal").gte("iniciada_em", desde).is("terminada_em", null).limit(1);
    if (rec?.length) return Response.json({ ignorado: "já há uma sincronização fiscal rodando" }, { status: 429 });
    const { data: reg } = await sb.from("sincronizacoes").insert({ recurso: "fiscal" }).select("id").single();
    const resumo: any = { recebidas: 0, saidaProdutos: 0, saidaServicos: 0, xmlBaixados: 0, pendentesDeDownload: 0, canceladas: 0, duplicadas: 0, avisos: [] as string[] };
    let downloads = 0;
    try {
      // O Supabase devolve no máximo 1000 linhas por consulta: lê em páginas.
      const atuais: any[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("fiscal_notas").select("id, origem, flow_id, status, decisao, numero, categoria, emitente_cnpj, dest_nome, credito, credito_origem, credito_em").order("id").range(de, de + 999);
        if (error) throw new Error(`ler notas: ${error.message}`);
        atuais.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      // Última decisão de crédito da equipe ou do escritório por fornecedor: vira a sugestão para as próximas notas dele.
      const historicoCredito = new Map<string, { credito: boolean; em: string }>();
      for (const n of atuais) {
        if (!n.emitente_cnpj || n.credito === null || !["manual", "escritorio"].includes(n.credito_origem)) continue;
        const h = historicoCredito.get(n.emitente_cnpj);
        if (!h || (n.credito_em ?? "") > h.em) historicoCredito.set(n.emitente_cnpj, { credito: n.credito, em: n.credito_em ?? "" });
      }
      const porChave = new Map((atuais ?? []).map((n: any) => [`${n.origem}|${n.flow_id}`, n]));
      const { data: xmls } = await sb.from("fiscal_xml").select("origem, flow_id");
      const temXml = new Set((xmls ?? []).map((x: any) => `${x.origem}|${x.flow_id}`));
      const log = async (nota_id: number | null, numero: string | null, texto: string) => { await sb.from("fiscal_log").insert({ nota_id, numero, texto }); };

      const salvar = async (origem: string, flowId: string, linha: any, cls: Classificada) => {
        const ant: any = porChave.get(`${origem}|${flowId}`);
        // Decisão manual vale enquanto o documento continuar sem dados para classificar sozinho.
        let c = cls;
        if (ant?.decisao && ant.decisao !== "aguardar" && cls.status === "pendente") c = null as any;
        // Deduplicação: mesmo número e mesmo emitente na mesma categoria já lançados com outro id do Flow.
        const cat = c?.categoria ?? linha.categoria ?? null;
        if (!ant && cat) {
          const dup = (atuais ?? []).find((n: any) => n.categoria === cat && n.numero === linha.numero && n.emitente_cnpj === linha.emitente_cnpj && n.status !== "cancelada");
          if (dup) { resumo.duplicadas++; return; }
        }
        const dados: any = { origem, flow_id: flowId, ...linha, sincronizado_em: new Date().toISOString() };
        if (c) {
          // Crédito marcado na tela (equipe ou "seguir o escritório") nunca é sobrescrito pela regra.
          const manual = ant && ["manual", "escritorio"].includes(ant.credito_origem) && ant.credito !== null;
          if (manual && (c.categoria === "entrada_produtos" || c.status === "pendente") && c.baseCredito !== undefined) {
            const b = c.baseCredito ?? c.base;
            c = { ...c, categoria: "entrada_produtos", status: "ok", motivo: ant.credito ? "Toma crédito (marcado na tela)." : "Não toma crédito (marcado na tela).",
              ...comCredito(b, ant.credito, c.icms, c.ipi), credito: ant.credito, creditoOrigem: null };
          }
          Object.assign(dados, { categoria: c.categoria, status: c.status, motivo: c.motivo, base_calculo: c.base, pis: c.pis, cofins: c.cofins, icms: c.icms, ipi: c.ipi, iss: c.iss });
          if (c.baseCredito !== undefined) dados.base_credito = c.baseCredito;
          if (c.credito !== undefined && c.creditoOrigem) Object.assign(dados, { credito: c.credito, credito_origem: c.creditoOrigem });
        }
        if (cls.status !== "pendente" && ant?.decisao) Object.assign(dados, { decisao: null }); // XML completo chegou: vale a regra
        const { data: s, error } = await sb.from("fiscal_notas").upsert(dados, { onConflict: "origem,flow_id" }).select("id").single();
        if (error) throw new Error(`gravar nota ${linha.numero}: ${error.message}`);
        if (!ant) { (atuais ?? []).push({ ...dados, id: s.id }); porChave.set(`${origem}|${flowId}`, { ...dados, id: s.id }); }
      };
      const cancelar = async (origem: string, flowId: string, quando: string | null, motivo: string | null) => {
        const ant: any = porChave.get(`${origem}|${flowId}`);
        if (!ant) return; // nunca lançada: documento sem efeito
        if (ant.status === "cancelada") return;
        await sb.from("fiscal_notas").update({ status: "cancelada", cancelada_em: quando, justificativa_cancelamento: motivo, motivo: "Nota cancelada no Flow" }).eq("id", ant.id);
        await log(ant.id, ant.numero, `Nota ${ant.numero} cancelada — removida dos totais. Motivo: ${motivo || "não informado"}`);
        resumo.canceladas++;
      };
      const baixarXml = async (origem: string, flowId: string, caminho: string): Promise<string | null> => {
        if (temXml.has(`${origem}|${flowId}`)) {
          const { data } = await sb.from("fiscal_xml").select("xml").eq("origem", origem).eq("flow_id", flowId).single();
          return data?.xml ?? null;
        }
        if (downloads >= LIMITE_DOWNLOADS) { resumo.pendentesDeDownload++; return undefined as any; }
        downloads++;
        try {
          const xml = await flow(caminho, true);
          if (typeof xml === "string" && xml.trim().startsWith("<")) {
            await sb.from("fiscal_xml").upsert({ origem, flow_id: flowId, xml });
            temXml.add(`${origem}|${flowId}`); resumo.xmlBaixados++;
            return xml;
          }
        } catch (e) { resumo.avisos.push(`XML ${flowId}: ${(e as Error).message}`); }
        return null;
      };

      // 1) Notas recebidas (produto e serviço)
      const eventos = await paginas(`documentosEntrada/eventos/?dataEmissaoMaiorOuIgual=${DESDE}`, undefined, 50);
      for (const e of eventos) {
        const id = String(e.id);
        const cancelada = !!e.dataCancelamento || /cancel/i.test(e.situacao ?? "");
        if (cancelada) { await cancelar("recebida", id, e.dataCancelamento, e.justificativaCancelamento); continue; }
        const servico = !!e.tipoDocumentoNfse;
        const metodo = servico ? "obterArquivosNotasRecebidasNfse" : "obterArquivosNotasRecebidas";
        const xml = await baixarXml("recebida", id, `documentosEntrada/eventos/${metodo}?chavesNotas=${encodeURIComponent(e.chaveNfe ?? "")}&enviaXml=true&enviaPdf=false`);
        if (xml === undefined) continue; // limite de downloads desta execução: fica para a próxima
        const x = lerXml(xml ?? "");
        const correcoes = e.numeroCartaCorrecao > 0 ? [{ numero: e.numeroCartaCorrecao, data: e.dataCartaCorrecao, texto: e.cartaCorrecao }] : [];
        const valor = x.vNF ?? num(e.valorTotal);
        const base = {
          chave: e.chaveNfe, numero: String(x.numero ?? e.numeroNota ?? ""), tipo_doc: servico ? "nfse" : (x.tipo === "nfe" && e.nfeCompleta !== false ? "nfe" : "resumo"),
          direcao: "entrada", data_emissao: dataSP(e.dataEmissao), competencia: competencia(e.dataEmissao),
          emitente_cnpj: soDigitos(x.emitCnpj ?? e.documentoEmitente), emitente_nome: x.emitNome ?? e.nomeEmitente ?? null,
          dest_cnpj: soDigitos(x.destCnpj ?? e.cnpjDestinatario), dest_nome: x.destNome ?? e.nomeEmpresaDestinataria ?? null,
          cfops: x.cfops, csts: x.csts, ncms: x.ncms, descricao: x.descricao,
          valor_produtos: x.vProd, valor_servicos: x.vServ ?? (servico ? num(e.valorTotal) : null), valor_total: valor,
          pis_xml: servico ? (num(e.valorPis) ?? x.vPIS) : x.vPIS, cofins_xml: servico ? (num(e.valorCofins) ?? x.vCOFINS) : x.vCOFINS,
          icms_xml: x.vICMS, ipi_xml: x.vIPI, iss_xml: servico ? (num(e.valorIss) ?? x.vISS) : null,
          xml_completo: x.tipo === "nfe" || x.tipo === "nfse", correcoes,
          extras: { situacao: e.situacao, manifestacao: e.manifestacaoDestinatarioStatus, tpEmis: x.tpEmis, refNFe: x.refNFe, nfeCompleta: e.nfeCompleta },
        };
        const cls = servico ? classificarRecebidaServico(valor, base.pis_xml, base.cofins_xml, base.iss_xml) : classificarRecebidaProduto(x, e.nfeCompleta !== false, historicoCredito.get(soDigitos(x.emitCnpj ?? e.documentoEmitente) ?? "")?.credito ?? null);
        await salvar("recebida", id, base, cls); resumo.recebidas++;
      }

      // 2) Notas de produto emitidas pela LZ7
      const docs = (await paginas("v1/documentosSaida/?sortField=numeroNota&sortType=desc&carregarValorTotalNota=true&carregarCfops=true", (d) => (d.dataEmissao ?? "9") < DESDE))
        .filter((d) => (d.dataEmissao ?? "") >= DESDE && !d.homologacao);
      // Só vale nota AUTORIZADA na Sefaz. O Flow guarda também documentos "FINALIZADO" (nunca transmitidos) com o mesmo
      // número de uma nota autorizada; eles não são nota fiscal e saem da central (visto na tela do Flow em 14/11/2026).
      // Vale também para notas já gravadas: um documento que deixou de ser válido sai da apuração.
      const situacao = (d: any) => String(d.situacaoDocumento ?? d.situacao ?? "");
      // Situações do Flow (código da tela, 14/11/2026): "Autorizado", "Autorizado (Carta de Correção)", "Autorizado (ECONF)",
      // "Autorizado (Eventos)", "Aguardando Aprovação Carta Correção", "Aguardando Cancelamento", "Erro Cancelamento" = nota válida;
      // "Cancelado" = cancelada; "Em digitação", "Finalizado", "Rejeitada", "Aguardando Autorização" = ainda não é nota.
      const valida = (d: any) => { const x = situacao(d); return !x || /^autorizado|aguardando aprova|aguardando cancel|erro cancel/i.test(x); };
      const cancelada = (d: any) => !!d.dataCancelamento || /^cancelad/i.test(situacao(d));
      const naoAutorizados = docs.filter((d) => !cancelada(d) && !valida(d)).map((d) => String(d.id));
      resumo.situacoesSaida = Object.fromEntries([...new Set(docs.map(situacao))].map((x) => [x || "(vazio)", docs.filter((d) => situacao(d) === x).length]));
      if (naoAutorizados.length) {
        const sair = atuais.filter((n: any) => n.origem === "saida_produto" && naoAutorizados.includes(String(n.flow_id)));
        if (sair.length) {
          await sb.from("fiscal_notas").delete().eq("origem", "saida_produto").in("flow_id", sair.map((n: any) => n.flow_id));
          for (const n of sair) { porChave.delete(`saida_produto|${n.flow_id}`); atuais.splice(atuais.indexOf(n), 1); }
          await log(null, null, `${sair.length} documento(s) de saída não autorizados na Sefaz (em digitação, finalizado ou rejeitado) retirados da apuração: NF ${sair.map((n: any) => n.numero).join(", ")}`);
          resumo.naoAutorizadosRetirados = sair.length;
        }
      }
      const nomeDest = (x: any) => x?.cliente?.nomeRazaoSocial ?? x?.destinatarioRemetente?.nomeRazaoSocial ?? x?.nomeDestinatarioRemetente ?? x?.nomeCliente ?? null;
      const camposDetalhe = new Set<string>();
      for (const d of docs) {
        const id = String(d.id);
        if (naoAutorizados.includes(id)) continue;
        if (cancelada(d)) { await cancelar("saida_produto", id, d.dataCancelamento ?? null, d.motivoCancelamento ?? d.justificativaCancelamento ?? null); continue; }
        const ant: any = porChave.get(`saida_produto|${id}`);
        let det: any = null;
        if (!ant || ant.status === "pendente") {
          if (downloads >= LIMITE_DOWNLOADS) { resumo.pendentesDeDownload++; continue; }
          downloads++;
          det = await flow(`v1/documentosSaida/${id}`).catch(() => null);
          Object.keys(det ?? {}).forEach((k) => camposDetalhe.add(k));
        } else { // já classificada: não muda a classificação; só completa o destinatário se faltava
          const nome = nomeDest(d);
          if (nome && !ant.dest_nome) { await sb.from("fiscal_notas").update({ dest_nome: nome }).eq("id", ant.id); ant.dest_nome = nome; }
          continue;
        }
        const v = det ?? d;
        const cfops = unicos([...(Array.isArray(d.cfops) ? d.cfops : String(d.cfops ?? "").split(/[,;\s]+/)), ...(Array.isArray(v.itens) ? v.itens.map((i: any) => String(i.cfop ?? "")) : [])].map(String));
        const valor = num(v.valorTotalNotaFiscal ?? d.valorTotalNotaFiscal);
        const pisInf = num(v.valorTotalPis), cofinsInf = num(v.valorTotalCofins);
        const icmsInf = num(v.valorTotalIcms ?? v.valorIcms ?? v.valorTotalICMS), ipiInf = num(v.valorTotalIpi ?? v.valorIpi ?? v.valorTotalIPI);
        const linha = {
          chave: d.chaveDanfe ?? null, numero: String(d.numeroNota ?? ""), tipo_doc: "nfe", direcao: /entrada/i.test(d.entradaSaida ?? "") ? "entrada" : "saida",
          data_emissao: dataSP(d.dataEmissao), competencia: competencia(d.dataEmissao),
          emitente_cnpj: "41466492000192", emitente_nome: "LZ7 ENERGIA LTDA",
          dest_cnpj: soDigitos(v.cliente?.cnpjCpf ?? v.destinatarioRemetente?.cnpjCpf ?? null), dest_nome: nomeDest(v) ?? nomeDest(d),
          cfops, valor_produtos: num(v.valorTotalProdutos), valor_total: valor,
          pis_xml: pisInf, cofins_xml: cofinsInf, icms_xml: icmsInf, ipi_xml: ipiInf, xml_completo: !!det,
          extras: { entradaSaida: d.entradaSaida, situacaoDocumento: d.situacaoDocumento, serie: d.serieNota },
        };
        await salvar("saida_produto", id, linha, classificarEmitidaProduto(d.entradaSaida, cfops, valor, pisInf, cofinsInf, icmsInf, ipiInf)); resumo.saidaProdutos++;
      }
      resumo.camposDetalheSaida = [...camposDetalhe].filter((k) => /valor|pis|cofins|icms|ipi|cfop/i.test(k)).sort();

      // 3) Notas de serviço emitidas pela LZ7
      const nfs = (await paginas("v1/notasFiscaisServico/?sortField=dataCadastro&sortType=desc&carregarValorTotal=true"))
        .filter((n) => (n.dataAutorizacao ?? n.dataCompetencia ?? n.dataCadastro ?? "") >= DESDE);
      for (const n of nfs) {
        const id = String(n.id);
        if (n.dataCancelamento || /cancel/i.test(n.situacao ?? "")) { await cancelar("saida_servico", id, n.dataCancelamento, null); continue; }
        if (!/autoriz/i.test(n.situacao ?? "")) continue; // ainda não emitida
        let iss: number | null = null; let xml: string | null = null;
        if (n.linkDownloadXml) {
          if (temXml.has(`saida_servico|${id}`)) xml = (await sb.from("fiscal_xml").select("xml").eq("origem", "saida_servico").eq("flow_id", id).single()).data?.xml ?? null;
          else if (downloads < LIMITE_DOWNLOADS) {
            downloads++;
            try { const r = await fetch(n.linkDownloadXml); if (r.ok) { xml = await r.text(); if (xml.trim().startsWith("<")) { await sb.from("fiscal_xml").upsert({ origem: "saida_servico", flow_id: id, xml }); resumo.xmlBaixados++; } else xml = null; } }
            catch (e) { resumo.avisos.push(`XML NFS-e ${n.numeroNf}: ${(e as Error).message}`); }
          }
        }
        const x = lerXml(xml ?? ""); iss = x.vISS;
        const data = n.dataAutorizacao ?? n.dataCompetencia ?? n.dataCadastro;
        const valor = num(n.valorTotal);
        const linha = {
          chave: null, numero: String(n.numeroNf ?? ""), tipo_doc: "nfse", direcao: "saida", data_emissao: dataSP(data), competencia: competencia(data),
          emitente_cnpj: soDigitos(n.cnpjEmpresaEmissora) ?? "41466492000192", emitente_nome: "LZ7 ENERGIA LTDA",
          dest_cnpj: soDigitos(n.cliente?.cnpjCpf ?? null), dest_nome: n.cliente?.nomeRazaoSocial ?? null, descricao: x.descricao,
          valor_servicos: valor, valor_total: valor, pis_xml: num(n.servicoValorPis) ?? x.vPIS, cofins_xml: num(n.servicoValorCofins) ?? x.vCOFINS, iss_xml: iss,
          xml_completo: !!xml, extras: { aliquotaIss: n.servicoAliquotaIss, issRetido: n.servicoIssRetidoFonte, codigoServico: n.codigoServico ?? null },
        };
        await salvar("saida_servico", id, linha, classificarEmitidaServico(valor, linha.pis_xml, linha.cofins_xml, iss)); resumo.saidaServicos++;
      }
      await sb.from("sincronizacoes").update({ terminada_em: new Date().toISOString(), sucesso: true, registros: resumo.recebidas + resumo.saidaProdutos + resumo.saidaServicos }).eq("id", reg.id);
      return Response.json(resumo);
    } catch (e) {
      await sb.from("sincronizacoes").update({ terminada_em: new Date().toISOString(), sucesso: false, erro: String((e as Error).message ?? e).slice(0, 500) }).eq("id", reg.id);
      return Response.json({ erro: String((e as Error).message ?? e), ...resumo }, { status: 500 });
    }
  });
}
