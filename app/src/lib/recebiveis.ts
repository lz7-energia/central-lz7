export type EstadoTitulo = "vencido" | "a_vencer" | "recebido";
export type SituacaoCobranca = "sem_contato" | "cobrado" | "negociando" | "promessa" | "juridico" | "outro";

export const SITUACOES: Record<SituacaoCobranca, { rotulo: string; cor: string }> = {
  sem_contato: { rotulo: "Sem contato", cor: "vermelho" },
  cobrado: { rotulo: "Cobrado", cor: "amarelo" },
  negociando: { rotulo: "Negociando", cor: "azul" },
  promessa: { rotulo: "Promessa de pagamento", cor: "verde" },
  juridico: { rotulo: "Jurídico", cor: "roxo" },
  outro: { rotulo: "Outro", cor: "cinza" },
};

export type Recebivel = {
  flow_id: string;
  cliente: string | null;
  codigo_projeto: string | null;
  pedido_flow_id: string | null;
  vencimento: string | null;
  recebido_em: string | null;
  valor: number;
  valor_recebido: number;
  valor_aberto: number;
  situacao_flow: string | null;
  estado: EstadoTitulo;
  dias_atraso: number | null;
  cobranca_situacao: SituacaoCobranca;
  previsao: string | null;
  motivo: string | null;
  alterado_por: string | null;
  alterado_em: string | null;
};

export type Atualizacao = {
  id: number;
  concluida_por: string | null;
  concluida_em: string;
  qtd_vencidos: number;
  valor_vencido: number;
  qtd_sem_previsao: number;
  observacao: string | null;
};

/** Primeiro e último dia do mês atual em São Paulo (AAAA-MM-DD). */
export function mesAtual(hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: `${hoje.slice(0, 7)}-${String(fim).padStart(2, "0")}` };
}
