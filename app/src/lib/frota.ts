// Frota (ADM, /frota): tipos e funções puras. Motorista = colaborador da folha (plat_docs, colecao 'colab').

export type Veiculo = {
  id: string; placa: string; modelo: string; marca: string | null; ano: string | null; cor: string | null;
  renavam: string | null; chassi: string | null; empresa_id: string | null; unidade_id: string | null;
  motorista_colab_id: string | null; responsavel_id: string | null;
  km_atual: number | null; km_atualizado_em: string | null; revisao_km: number | null; revisao_data: string | null;
  ativo: boolean; obs: string | null; alterado_por: string | null; alterado_em: string;
};
export type DocFrota = { id: string; veiculo_id: string; tipo: string; descricao: string | null; vencimento: string | null; aviso_dias: number; valor: number | null; obs: string | null; alterado_por: string | null };
export type Manutencao = { id: string; veiculo_id: string; data: string; km: number | null; tipo: string; descricao: string | null; oficina: string | null; valor: number | null; alterado_por: string | null };
export type Multa = { id: string; veiculo_id: string; data_infracao: string; colab_id: string | null; descricao: string | null; valor: number | null; vencimento: string | null; situacao: "pendente" | "paga" | "recorrida" | "cancelada"; obs: string | null; alterado_por: string | null };
export type Abastecimento = { id: string; veiculo_id: string; data: string; litros: number | null; valor: number | null; km: number | null; colab_id: string | null; posto: string | null; alterado_por: string | null };
export type MotoristaHist = { id: number; veiculo_id: string; colab_id: string; de: string; ate: string | null };
export type Colab = { id: string; nome: string; setor: string | null; desligado: boolean };

export const TIPOS_DOC = ["Licenciamento (CRLV)", "Seguro", "IPVA", "Vistoria", "Outro"];
export const TIPOS_MANUTENCAO = ["Revisão", "Troca de óleo", "Pneus", "Freios", "Elétrica", "Funilaria", "Outro"];
export const SITUACOES_MULTA: Record<Multa["situacao"], string> = { pendente: "Pendente", paga: "Paga", recorrida: "Recorrida", cancelada: "Cancelada" };

export const placaBonita = (p: string) => {
  const s = (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
};

const dias = (de: string, ate: string) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400000);

export type Alerta = { tipo: "vencido" | "vencendo"; texto: string; data?: string };

/** Alertas do carro: documentos vencidos/vencendo, revisão por data ou km, multas pendentes. */
export function alertasDoVeiculo(v: Veiculo, docs: DocFrota[], multas: Multa[], hoje: string): Alerta[] {
  const a: Alerta[] = [];
  for (const d of docs) {
    if (!d.vencimento) continue;
    const n = dias(hoje, d.vencimento);
    if (n < 0) a.push({ tipo: "vencido", texto: `${d.tipo} vencido há ${-n} dia${n === -1 ? "" : "s"}`, data: d.vencimento });
    else if (n <= d.aviso_dias) a.push({ tipo: "vencendo", texto: `${d.tipo} vence em ${n} dia${n === 1 ? "" : "s"}`, data: d.vencimento });
  }
  if (v.revisao_data) {
    const n = dias(hoje, v.revisao_data);
    if (n < 0) a.push({ tipo: "vencido", texto: `Revisão atrasada (${-n} dia${n === -1 ? "" : "s"})`, data: v.revisao_data });
    else if (n <= 15) a.push({ tipo: "vencendo", texto: `Revisão em ${n} dia${n === 1 ? "" : "s"}`, data: v.revisao_data });
  }
  if (v.revisao_km && v.km_atual != null) {
    const falta = v.revisao_km - v.km_atual;
    if (falta <= 0) a.push({ tipo: "vencido", texto: `Revisão por km passou (${(-falta).toLocaleString("pt-BR")} km)` });
    else if (falta <= 1000) a.push({ tipo: "vencendo", texto: `Revisão em ${falta.toLocaleString("pt-BR")} km` });
  }
  for (const m of multas) {
    if (m.situacao !== "pendente") continue;
    const venc = m.vencimento ? dias(hoje, m.vencimento) : null;
    a.push({ tipo: venc != null && venc < 0 ? "vencido" : "vencendo", texto: `Multa pendente${m.vencimento ? ` (vence ${m.vencimento.split("-").reverse().join("/")})` : ""}`, data: m.vencimento ?? undefined });
  }
  return a.sort((x, y) => (x.tipo === y.tipo ? (x.data ?? "9").localeCompare(y.data ?? "9") : x.tipo === "vencido" ? -1 : 1));
}

/** Consumo médio (km/l) entre abastecimentos com km, do mais antigo ao mais novo. */
export function consumoMedio(abs: Abastecimento[]): number | null {
  const c = abs.filter((x) => x.km != null && x.litros).sort((a, b) => a.km! - b.km!);
  if (c.length < 2) return null;
  const km = c[c.length - 1].km! - c[0].km!;
  const litros = c.slice(1).reduce((s, x) => s + Number(x.litros), 0);
  return litros > 0 && km > 0 ? km / litros : null;
}

/** Colaboradores da folha a partir das linhas de plat_docs (colab). */
export function colabsDaFolha(linhas: { id: string; data: Record<string, unknown> }[]): Colab[] {
  return linhas
    .map((l) => ({ id: l.id, nome: String(l.data?.nome ?? "").trim(), setor: (l.data?.setor as string) || null, desligado: !!l.data?.desligamento }))
    .filter((c) => c.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
