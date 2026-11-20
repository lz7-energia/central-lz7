// Leitura do contrato padrão da LZ7 (Clicksign) para cadastrar a obra. Funções puras, testáveis sem o banco.
// Nada é deduzido: o que o texto não traz volta null, e a tela mostra tudo para conferência antes de salvar.

export type DadosContrato = {
  codigo: string | null; nome_contrato: string | null; nome_card: string | null;
  cliente: string | null; cpf_cnpj: string | null; endereco: string | null; cidade: string | null; uf: string | null; cep: string | null;
  zona: "Urbano" | "Rural" | null; kwp: number | null; geracao_kwh: number | null; modulos: number | null;
  equipamentos: { produto: string; quantidade: number }[]; estrutura: string | null;
  valor: number | null; forma_pagamento: string | null; financiamento: boolean | null;
  assinado_em: string | null; email_cliente: string | null; lido: boolean;
};

const ESTRUTURAS = ["Colonial", "Fibromadeira", "Fibrometal", "Fibrocimento", "Metálico", "Solo", "Carport", "Kalhetão", "Laje"];
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const num = (s: string | undefined | null) => { if (!s) return null; const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MINI = new Set(["de", "da", "do", "das", "dos", "e"]);
const nomeBonito = (s: string) => s.trim().toLowerCase().split(/\s+/).map((w, i) => (MINI.has(w) && i ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** Código da obra no padrão WB260500COL (2 letras + 6 dígitos + 3 letras) ou outro com letras/dígitos/hífen. */
export const CODIGO_OBRA = /\b([A-Z]{2}\d{6}[A-Z]{3})\b/;

/** Nome do arquivo → nome do contrato ("1114") e sugestão de nome do card ("Fabiano – 8 de Abril"). */
export function doNomeDoArquivo(arquivo: string) {
  const base = arquivo.replace(/\.[a-z0-9]+$/i, "").replace(/^[0-9a-f]{8}-/i, "").trim(); // tira prefixo de upload
  const cod = base.toUpperCase().match(CODIGO_OBRA)?.[1] ?? null;
  const m = base.match(/^([A-Za-z0-9]+)[_\s-]+(.+)$/);
  const nomeContrato = m ? m[1] : base;
  const resto = m ? m[2].replace(/_/g, " ").trim() : "";
  const partes = resto.split(/\s+/);
  const card = resto ? `${nomeBonito(partes[0])}${partes.length > 1 ? " – " + nomeBonito(partes.slice(1).join(" ")) : ""}` : null;
  return { nome_contrato: nomeContrato || null, nome_card: card, codigo: cod };
}

export function lerTextoContrato(texto: string, arquivo = ""): DadosContrato {
  const t = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const plano = t.replace(/\s*\n\s*/g, " ");
  const arq = doNomeDoArquivo(arquivo);

  // Contratante: parágrafo antes de "doravante denominado(a) Contratante"
  const ct = plano.match(/Contratada;\s*(.+?),\s*inscrit[oa](?:\(a\))?\s+no\s+(CPF|CNPJ)\s+sob\s+n[°º]?\s*([\d./-]+).*?(?:residente e domiciliad[oa](?:\(a\))?|com sede)\s+n[ao]\s+(.+?),\s*doravante denominad[oa](?:\(a\))?\s+Contratante/i);
  let cliente: string | null = null, doc: string | null = null, endereco: string | null = null, cidade: string | null = null, uf: string | null = null, cep: string | null = null;
  let zona: DadosContrato["zona"] = null;
  if (ct) {
    cliente = ct[1].trim();
    doc = ct[3].replace(/[.,]$/, "");
    endereco = ct[4].trim();
    const c = endereco.match(/,\s*([^,]+?)\s*-\s*([A-Z]{2}),?\s*(\d{5}-?\d{3})?\s*$/);
    if (c) { cidade = c[1].trim(); uf = c[2]; cep = c[3] ?? null; }
    zona = /\brural\b|assentamento|s[ií]tio|ch[aá]cara|fazenda|estrada|linha\s/i.test(endereco) ? "Rural" : null;
  }

  const kwp = num(plano.match(/pot[eê]ncia definida\s*d?\s*e?\s*([\d.,]+)\s*kWp/i)?.[1] ?? plano.match(/([\d.,]+)\s*kWp/i)?.[1]);
  const geracao = num(plano.match(/estimada de\s*([\d.,]+)\s*kWh/i)?.[1]);

  // Tabela de equipamentos (entre "PRODUTOS QUANTIDADE" e "1.4")
  const equipamentos: DadosContrato["equipamentos"] = [];
  const bloco = t.match(/PRODUTOS\s+QUANTIDADE\s*\n([\s\S]+?)\n\s*1\.4\b/i)?.[1] ?? "";
  for (const linha of bloco.split("\n")) {
    const m = linha.trim().match(/^(.+?);?\s+(\d{1,5})$/);
    if (m) equipamentos.push({ produto: m[1].replace(/;$/, "").trim(), quantidade: Number(m[2]) });
  }
  const modulos = equipamentos.filter((e) => /^m[óo]dulo/i.test(e.produto)).reduce((s, e) => s + e.quantidade, 0) || null;
  // tipo de telhado: a palavra depois de "junto a estrutura" no kit de fixação (não "estrutura metálica", que é o kit)
  const kit = equipamentos.find((e) => /estrutura/i.test(e.produto))?.produto ?? plano;
  const tipo = semAcento(kit.match(/junto (?:a|à) estrutura\s+(?:de\s+)?([A-Za-zÀ-ú]+)/i)?.[1] ?? kit.match(/estrutura\s+(?:de\s+)?([A-Za-zÀ-ú]+)\s*;?\s*$/i)?.[1] ?? "");
  const estrutura = tipo ? ESTRUTURAS.find((e) => semAcento(e).startsWith(tipo.slice(0, 6))) ?? null : null;

  // Pagamento (2.1)
  const valor = num(plano.match(/totaliza-se em R\$\s*([\d.,]+)/i)?.[1]);
  let forma = plano.match(/2\.1\.1\s*[–-]\s*(.+?)\s*2\.1\.2/i)?.[1]?.trim().replace(/\.$/, "") ?? null;
  if (forma && forma.length > 300) forma = forma.slice(0, 300);
  const financiamento = forma ? /sol\s*f[áa]cil|financ|cons[óo]rcio|banco|bv\b|santander|sicredi|sicoob|cresol|caixa|\d+\s*x\s*de/i.test(forma) : null;

  // Registro da Clicksign: data da assinatura do contratante e e-mail
  let assinado: string | null = null;
  const nomeCli = cliente ? semAcento(cliente).split(" ")[0] : "";
  const ass = [...t.matchAll(/([^\n]+)\n\s*CPF:[^\n]*\n\s*Assinou em (\d{1,2}) (\w{3}) (\d{4})/gi)];
  const doCliente = ass.find((a) => nomeCli && semAcento(a[1]).includes(nomeCli)) ?? ass[ass.length - 1];
  if (doCliente) {
    const mes = MESES[semAcento(doCliente[3]).slice(0, 3)];
    if (mes) assinado = `${doCliente[4]}-${String(mes).padStart(2, "0")}-${doCliente[2].padStart(2, "0")}`;
  }
  const emails = [...plano.matchAll(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\s+para assinar/gi)].map((m) => m[1].toLowerCase());
  const email = emails.find((e) => !e.endsWith("@lz7energia.com.br")) ?? null;

  const codigo = arq.codigo ?? plano.toUpperCase().match(CODIGO_OBRA)?.[1] ?? null;
  return {
    codigo, nome_contrato: arq.nome_contrato, nome_card: arq.nome_card,
    cliente: cliente ? cliente.toUpperCase() : null, cpf_cnpj: doc, endereco, cidade, uf, cep, zona,
    kwp, geracao_kwh: geracao, modulos, equipamentos, estrutura,
    valor, forma_pagamento: forma, financiamento, assinado_em: assinado, email_cliente: email,
    lido: !!(cliente || kwp || valor),
  };
}
