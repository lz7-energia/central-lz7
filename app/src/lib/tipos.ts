export type TipoCampo = "texto" | "texto_longo" | "numero" | "data" | "arquivo";

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
};

export type OpcoesPortal = {
  setores: { id: string; nome: string }[];
  tipos: { id: number; setor_id: string; nome: string; exige_aprovacao: boolean; campos: Campo[] }[];
  solicitantes: { id: number; nome: string }[];
};

export type StatusPedido =
  | "aguardando_aprovacao"
  | "aberto"
  | "em_andamento"
  | "aguardando"
  | "concluido"
  | "recusado"
  | "cancelado";

export const STATUS: Record<StatusPedido, { rotulo: string; cor: string }> = {
  aguardando_aprovacao: { rotulo: "Aguardando aprovação", cor: "roxo" },
  aberto: { rotulo: "Aberto", cor: "azul" },
  em_andamento: { rotulo: "Em andamento", cor: "amarelo" },
  aguardando: { rotulo: "Aguardando retorno", cor: "cinza" },
  concluido: { rotulo: "Concluído", cor: "verde" },
  recusado: { rotulo: "Recusado", cor: "vermelho" },
  cancelado: { rotulo: "Cancelado", cor: "cinza" },
};

/** Status que a equipe pode escolher na tela (aprovação só pelo gestor). */
export const STATUS_EQUIPE: StatusPedido[] = ["aberto", "em_andamento", "aguardando", "concluido", "cancelado"];

export const STATUS_ABERTOS: StatusPedido[] = ["aguardando_aprovacao", "aberto", "em_andamento", "aguardando"];

export type ColunaPainel = "em_execucao" | "pronto_faturar" | "faturado" | "recebido";

export const COLUNAS: { id: ColunaPainel; rotulo: string; dica: string }[] = [
  { id: "em_execucao", rotulo: "Em execução", dica: "OS ainda não chegou em Obra concluída" },
  { id: "pronto_faturar", rotulo: "Pronto pra faturar", dica: "Obra concluída e pedido sem NF-e" },
  { id: "faturado", rotulo: "Faturado", dica: "NF-e autorizada, recebimento em aberto" },
  { id: "recebido", rotulo: "Recebido", dica: "100% dos títulos recebidos" },
];

export type LinhaPainel = {
  flow_id: string;
  numero: string | null;
  codigo_projeto: string | null;
  cliente: string | null;
  valor_total: number | null;
  responsavel: string | null;
  os_numero: string | null;
  os_status: string | null;
  nf_numero: string | null;
  nf_emitida_em: string | null;
  total_titulos: number;
  total_recebido: number;
  pct_recebido: number;
  coluna: ColunaPainel;
  dias_parado: number | null;
  oculto: boolean;
  oculto_motivo: string | null;
  nota_manual: boolean;
  alterado_por: string | null;
  alterado_em: string | null;
};
