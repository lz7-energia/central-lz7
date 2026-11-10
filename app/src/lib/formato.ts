const FUSO = "America/Sao_Paulo";

export function moeda(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function data(v: string | null | undefined) {
  if (!v) return "—";
  // Datas puras (AAAA-MM-DD) não passam por fuso, pra não "voltar" um dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split("-");
    return `${d}/${m}/${a}`;
  }
  return new Date(v).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

export function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hoje em São Paulo, no formato AAAA-MM-DD. */
export function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

export function valorCampo(tipo: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (tipo === "numero") return moeda(v as string);
  if (tipo === "data") return data(String(v));
  return String(v);
}
