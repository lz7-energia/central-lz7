// Central de arquivos (ADM): tipos e regras de validade, usados pelas telas.
export type Empresa = { id: string; nome: string; cor: string; texto: string; ordem: number };
export type Unidade = {
  id: string; empresa_id: string; nome: string; unica: boolean; cnpj: string | null; ie: string | null; im: string | null;
  endereco: string | null; observacao: string | null; ordem: number;
};
export type Tipo = { id: string; nome: string; restrito: boolean; ordem: number };
export type Documento = {
  id: string; unidade_id: string | null; tipo_id: string | null; titulo: string; arquivo_nome: string; tamanho: number | null;
  mime: string | null; validade: string | null; aviso_dias: number; restrito: boolean; observacao: string | null;
  responsavel_id: string | null; enviado_em: string;
};

/** Situação da validade: vencido, vencendo (dentro do aviso) ou em dia. */
export function situacao(d: Pick<Documento, "validade" | "aviso_dias">, hoje: string) {
  if (!d.validade) return null;
  const dias = Math.round((Date.parse(d.validade + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86400000);
  if (dias < 0) return { tipo: "vencido" as const, dias, texto: `venceu há ${-dias} d` };
  if (dias <= d.aviso_dias) return { tipo: "vencendo" as const, dias, texto: dias === 0 ? "vence hoje" : `vence em ${dias} d` };
  return { tipo: "ok" as const, dias, texto: "em dia" };
}

export const tamanhoLegivel = (b: number | null) => (!b ? "" : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const tituloDoArquivo = (nome: string) => nome.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || nome;
