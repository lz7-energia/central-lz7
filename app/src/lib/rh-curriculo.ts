import "server-only";
// Leitura simples do currículo (PDF com texto): nome, e-mail, telefone e cidade. A recrutadora confere antes de salvar.
import { extractText, getDocumentProxy } from "unpdf";
import { padronizarNome } from "./rh";

const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";
const IGNORAR = /curr[ií]culo|curriculum|vitae|resumo|perfil|objetivo|dados pessoais|contato|e-?mail|telefone|endere/i;

export type Leitura = { nome: string; email: string; whatsapp: string; cidade: string; lido: boolean };

export async function lerCurriculoPdf(bytes: Uint8Array): Promise<Leitura> {
  let texto = "";
  try {
    const pdf = await getDocumentProxy(bytes);
    const r = await extractText(pdf, { mergePages: true });
    texto = String(r.text || "");
  } catch {
    return { nome: "", email: "", whatsapp: "", cidade: "", lido: false };
  }
  return extrair(texto);
}

export function extrair(texto: string): Leitura {
  const t = texto.replace(/ /g, " ");
  const email = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [""])[0].toLowerCase();
  // Telefone BR: (43) 99999-1234, 43 9 9999 1234, +55 43 99999-1234…
  const tel = t.match(/(?:\+?55[\s-]?)?\(?\b([1-9]{2})\)?[\s-]?(9?\s?\d{4})[\s.-]?(\d{4})\b/);
  const whatsapp = tel ? `(${tel[1]}) ${tel[2].replace(/\s/g, "")}-${tel[3]}` : "";
  const cid = t.match(new RegExp(`([A-ZÀ-Ú][A-Za-zÀ-ú'. ]{2,40}?)\\s*[-/–,]\\s*(${UFS})\\b`));
  const cidade = cid ? `${cid[1].trim().replace(/^(Cidade|Endereço)\s*:?\s*/i, "")}/${cid[2]}` : "";
  // Nome: primeira linha "só de palavras", com 2 a 6 palavras, que não seja título nem contato.
  const linhas = t.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 15);
  let nome = "";
  for (const l of linhas) {
    if (IGNORAR.test(l) || /\d|@/.test(l)) continue;
    const p = l.split(/\s+/);
    if (p.length >= 2 && p.length <= 6 && p.every((w) => /^[A-Za-zÀ-ú'.-]+$/.test(w))) {
      nome = p.map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(" ");
      break;
    }
  }
  return { nome: padronizarNome(nome), email, whatsapp, cidade, lido: true };
}
