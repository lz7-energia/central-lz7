// Central de Obras: áreas e módulos (esqueleto de 20/11/2026; módulos sem href = "em breve").
import type { Modulo } from "@/lib/areas";

export type AreaObras = { id: "compras" | "logistica" | "obras"; nome: string; descricao: string; modulos: Modulo[] };

export const AREAS_OBRAS: AreaObras[] = [
  {
    id: "compras", nome: "Compras", descricao: "Material de obra: cotação, aprovação, chegada e simulação de kit",
    modulos: [
      { nome: "Cotação e aprovação", icone: "contrato", descricao: "Fornecedores, preços, prazo e quem aprovou" },
      { nome: "Previsão de chegada", icone: "calendario", descricao: "Data prometida pelo fornecedor; atrasou, a obra fica marcada" },
      { nome: "Simulação de preço de kit", icone: "caixa", descricao: "Monta o kit e calcula o preço (a planilha da empresa, aqui dentro)" },
    ],
  },
  {
    id: "logistica", nome: "Logística", descricao: "Entregas, rotas e recebimento de material",
    modulos: [
      { nome: "Agenda de entregas", icone: "agenda", descricao: "Material atrasado, previsto e sem previsão, por obra", href: "/obras/cronograma#entregas" },
      { nome: "Rotas do dia", icone: "carro", descricao: "Entregas e instalações do dia agrupadas por cidade e carro" },
      { nome: "Recebimento de material", icone: "documentos", descricao: "Chegou, conferido ou com divergência" },
    ],
  },
  {
    id: "obras", nome: "Obras", descricao: "Cronograma de instalação, equipes, homologação e pós-obra",
    modulos: [
      { nome: "Cronograma de instalação", icone: "calendario", descricao: "Calendário por mês e por equipe, fila de agendamento, alertas e nova obra pelo contrato", href: "/obras/cronograma" },
      { nome: "Equipes de instalação", icone: "equipe", descricao: "Quem é de cada equipe, base, cor e quantas obras faz por dia", href: "/obras/cronograma#equipes" },
      { nome: "Homologação na Copel", icone: "alerta", descricao: "Acesso, vistoria, troca de medidor, prazos e pendências" },
      { nome: "Pós-obra e garantia", icone: "pedidos", descricao: "Chamados de manutenção, visita técnica e garantia" },
      { nome: "Indicadores de obras", icone: "quadro", descricao: "Previsto × realizado, prazo da entrada ao fim, atrasos por mês e por equipe", href: "/obras/cronograma#relatorios" },
    ],
  },
];

export const areaObrasPorId = (id: string) => AREAS_OBRAS.find((a) => a.id === id);

export function IconeAreaObras({ id, tamanho = 28 }: { id: AreaObras["id"]; tamanho?: number }) {
  const comum = { width: tamanho, height: tamanho, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "compras": // carrinho
      return <svg {...comum}><path d="M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>;
    case "logistica": // caminhão
      return <svg {...comum}><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 9.5h4l3 3.2v2.8h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>;
    case "obras": // painel solar
      return <svg {...comum}><path d="M4 14 6.5 5h11L20 14z" /><path d="M5.3 9.5h13.4M10 5l-1 9M14 5l1 9" /><path d="M12 14v4M8.5 20h7" /></svg>;
  }
}
