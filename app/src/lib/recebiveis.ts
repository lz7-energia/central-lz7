export type EstadoTitulo = "vencido" | "a_vencer" | "recebido";
export type Grupo = "inadimplente" | "negociacao" | "aguardando" | "outro";

/** Grupos das situações de cobrança (cores validadas para daltonismo; ver skill dataviz). */
export const GRUPOS: Record<Grupo, { rotulo: string; cor: string; etiqueta: string }> = {
  inadimplente: { rotulo: "Inadimplente", cor: "#c4320a", etiqueta: "vermelho" },
  negociacao: { rotulo: "Em negociação", cor: "#2563c9", etiqueta: "azul" },
  aguardando: { rotulo: "Aguardando terceiro", cor: "#d99a06", etiqueta: "amarelo" },
  outro: { rotulo: "Outro", cor: "#7c5cc4", etiqueta: "roxo" },
};
export const ORDEM_GRUPOS: Grupo[] = ["inadimplente", "negociacao", "aguardando", "outro"];

export type Situacao = { id: string; rotulo: string; grupo: Grupo; ordem: number; ativo: boolean; padrao: boolean };

export const FAIXAS = [
  { id: "1-30", rotulo: "1 a 30 dias", min: 1, max: 30 },
  { id: "31-60", rotulo: "31 a 60 dias", min: 31, max: 60 },
  { id: "61-90", rotulo: "61 a 90 dias", min: 61, max: 90 },
  { id: "90+", rotulo: "Mais de 90 dias", min: 91, max: Infinity },
] as const;
export type FaixaId = (typeof FAIXAS)[number]["id"];
export const faixaDe = (dias: number | null) => FAIXAS.find((f) => (dias ?? 0) >= f.min && (dias ?? 0) <= f.max)?.id ?? "1-30";

export type Recebivel = {
  flow_id: string;
  cliente: string | null;
  cliente_apelido: string | null;
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
  cobranca_situacao: string;
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

/**
 * Nome para mostrar: apelido do Flow → razão social → código do projeto (que no Flow já traz o nome,
 * ex.: "WB260131COL - SILAS EMANOEL MORAIS (9.76 KWp)"). As linhas de apoio só aparecem se acrescentarem algo.
 */
export function nomesDoCliente(t: { cliente_apelido: string | null; cliente: string | null; codigo_projeto: string | null }) {
  const limpo = (v: string | null) => (v ?? "").trim();
  const principal = limpo(t.cliente_apelido) || limpo(t.cliente) || limpo(t.codigo_projeto) || "Cliente não identificado";
  const vistos = [principal.toLowerCase()];
  const apoio: string[] = [];
  for (const v of [limpo(t.cliente), limpo(t.codigo_projeto)]) {
    const baixo = v.toLowerCase();
    if (v && !vistos.some((x) => x.includes(baixo))) {
      apoio.push(v);
      vistos.push(baixo);
    }
  }
  return { principal, apoio };
}
