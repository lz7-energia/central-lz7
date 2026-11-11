// As quatro áreas da central e os módulos de cada uma (planejamento no projeto "ADM").
// "ativo" tem página; "em breve" aparece na área para a equipe saber o que vem.

export type Modulo = { nome: string; descricao: string; href?: string };
export type Area = { id: "fiscal" | "financeiro" | "rh" | "adm"; nome: string; descricao: string; modulos: Modulo[] };

export const AREAS: Area[] = [
  {
    id: "fiscal",
    nome: "Fiscal",
    descricao: "Faturamento das obras, notas e obrigações",
    modulos: [
      { nome: "Painel de faturamento", descricao: "Da obra concluída ao recebimento", href: "/painel" },
      { nome: "Pedidos do Fiscal", descricao: "Solicitações abertas pelos colaboradores", href: "/pedidos?setor=fiscal" },
      { nome: "PIS/COFINS → CBS", descricao: "Parcial semanal e conferência da guia" },
      { nome: "Calendário de obrigações", descricao: "Guias, vencimentos e comprovantes" },
      { nome: "Canceladas e cartas de correção", descricao: "Histórico e motivos recorrentes" },
    ],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    descricao: "Boletos, recebimentos e caixa",
    modulos: [
      { nome: "Pedidos do Financeiro", descricao: "Pagamentos, reembolsos e cadastros", href: "/pedidos?setor=financeiro" },
      { nome: "Central de boletos", descricao: "DDA × nota × boleto lançado" },
      { nome: "Recebíveis e inadimplência", descricao: "Vencidos, previsões e motivos, do Flow", href: "/recebiveis" },
      { nome: "Régua de cobrança", descricao: "Mensagens de cobrança por WhatsApp e e-mail" },
      { nome: "Fluxo de caixa projetado", descricao: "A pagar, a receber e previsto × realizado" },
      { nome: "Conciliação bancária", descricao: "Extrato × movimento do Flow" },
    ],
  },
  {
    id: "rh",
    nome: "RH",
    descricao: "Recrutamento e seleção",
    modulos: [
      { nome: "Pedidos do RH", descricao: "Vagas, substituições e declarações", href: "/pedidos?setor=rh" },
      { nome: "Vagas e candidatos", descricao: "Funil: inscritos → triagem → entrevista → fechado" },
      { nome: "Agenda de entrevistas", descricao: "Autoagendamento entre os entrevistadores" },
      { nome: "Contratos PJ", descricao: "Contrato gerado e assinatura eletrônica" },
    ],
  },
  {
    id: "adm",
    nome: "ADM",
    descricao: "Solicitações, documentos e apoio",
    modulos: [
      { nome: "Pedidos do ADM", descricao: "Compras, manutenção, equipamentos e documentos", href: "/pedidos?setor=adm" },
      { nome: "Documentos da empresa", descricao: "Pastas, validades e versões" },
      { nome: "Certificado, contratos e frota", descricao: "Vencimentos e alertas" },
      { nome: "Mural e manuais", descricao: "Comunicados, procedimentos e contatos" },
    ],
  },
];

export const areaPorId = (id: string) => AREAS.find((a) => a.id === id) ?? null;

/** Ícones simples de cada área (desenho próprio, sem biblioteca). */
export function IconeArea({ id, tamanho = 28 }: { id: Area["id"]; tamanho?: number }) {
  const comum = { width: tamanho, height: tamanho, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "fiscal": // nota fiscal
      return (
        <svg {...comum}>
          <path d="M6 3h9l3 3v15l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21z" />
          <path d="M9 9h6M9 13h6M9 17h3" />
        </svg>
      );
    case "financeiro": // moedas
      return (
        <svg {...comum}>
          <ellipse cx="9" cy="7" rx="5" ry="2.5" />
          <path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
          <path d="M10 15.5c.9 1.2 2.9 2 5 2 2.8 0 5-1.1 5-2.5v-4c0-1.4-2.2-2.5-5-2.5" />
          <path d="M10 15.5v2.5c.9 1.2 2.9 2 5 2 2.8 0 5-1.1 5-2.5V15" />
        </svg>
      );
    case "rh": // pessoas
      return (
        <svg {...comum}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.6c2.6.1 4.4 2 5 5.4" />
        </svg>
      );
    default: // pasta / maleta
      return (
        <svg {...comum}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18" />
        </svg>
      );
  }
}
