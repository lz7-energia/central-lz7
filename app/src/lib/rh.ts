// Recrutamento e seleção: tipos e regras usadas pelas telas.
export type Etapa = "inscrito" | "triagem" | "gestor" | "aprovado" | "reprovado";
export const ETAPAS: { id: Etapa; nome: string; cor: string }[] = [
  { id: "inscrito", nome: "Inscritos", cor: "cinza" },
  { id: "triagem", nome: "Triagem", cor: "azul" },
  { id: "gestor", nome: "Aprovação do gestor", cor: "amarelo" },
  { id: "aprovado", nome: "Aprovados", cor: "verde" },
  { id: "reprovado", nome: "Não aprovados", cor: "vermelho" },
];
export const nomeEtapa = (e: string | null) => ETAPAS.find((x) => x.id === e)?.nome ?? "—";

export type Pergunta = { id: number; texto: string; tipo: "sim_nao" | "escolha" | "numero" | "texto"; opcoes: string[]; padrao: boolean; ativo: boolean; ordem: number };
export type Motivo = { id: number; texto: string; ativo: boolean; ordem: number };
export type Canal = { id: number; nome: string; eh_indicacao: boolean; ativo: boolean; ordem: number };
export type Mensagem = { id: number; titulo: string; texto: string; ativo: boolean; ordem: number };
export type Vaga = {
  id: number; cargo: string; area: string; local: string | null; quantidade: number; gestor: string | null; contrato: string;
  descricao: string | null; aberta_em: string; previsao: string | null; fechada_em: string | null; perguntas: number[];
};
export type Candidato = {
  id: number; vaga_id: number; nome: string; whatsapp: string | null; email: string | null; cidade: string | null;
  canal_id: number | null; indicado_por: string | null; curriculo_path: string | null; curriculo_nome: string | null;
  etapa: Etapa; parou_em: Etapa | null; motivo_id: number | null; respostas: Record<string, string>; nota: number | null;
  observacao: string | null; consideracao_gestor: string | null; entrevista_em: string | null; recrutador_id: string | null;
  contratado_em: string | null; bonus_pago_em: string | null; lgpd_autorizou: boolean; criado_em: string; atualizado_em: string;
};

export const tituloVaga = (v: Pick<Vaga, "cargo" | "area" | "local">) => `${v.cargo} · ${v.area}${v.local ? " " + v.local : ""}`;

const br = (d: string) => d.split("-").reverse().join("/");
/** "12/11/2026 às 14:30" no horário de Brasília. */
export function dataHoraEntrevista(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${data} às ${hora}`;
}

/** Troca {nome}, {vaga}, {cidade}, {entrevista} na mensagem escolhida. */
export function preencherMensagem(texto: string, c: Pick<Candidato, "nome" | "cidade" | "entrevista_em">, v: Pick<Vaga, "cargo" | "area" | "local">) {
  return texto
    .replaceAll("{nome}", c.nome.split(" ")[0])
    .replaceAll("{vaga}", v.cargo)
    .replaceAll("{cidade}", c.cidade || v.local || "")
    .replaceAll("{entrevista}", c.entrevista_em ? dataHoraEntrevista(c.entrevista_em) : "(data a combinar)");
}

/** Link do WhatsApp com a mensagem pronta (o número ganha o 55 do Brasil se faltar). */
export function linkWhatsapp(numero: string | null, mensagem: string) {
  let n = (numero || "").replace(/\D/g, "");
  if (!n) return null;
  if (n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}

/** Bônus de indicação: 3 meses depois da contratação. */
export function dataDoBonus(contratadoEm: string | null) {
  if (!contratadoEm) return null;
  const d = new Date(contratadoEm + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
export { br as dataBr };
