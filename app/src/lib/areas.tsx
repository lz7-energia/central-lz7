// As quatro áreas da central e os módulos de cada uma (planejamento no projeto "ADM").
// "ativo" tem página; "em breve" aparece na área para a equipe saber o que vem.

export type Modulo = { nome: string; descricao: string; icone: IconeModuloId; href?: string };
export type Area = { id: "fiscal" | "financeiro" | "rh" | "adm"; nome: string; descricao: string; modulos: Modulo[] };

export const AREAS: Area[] = [
  {
    id: "fiscal",
    nome: "Fiscal",
    descricao: "Faturamento das obras, notas e obrigações",
    modulos: [
      { nome: "Painel de faturamento", icone: "quadro", descricao: "Da obra concluída ao recebimento", href: "/painel" },
      { nome: "Pedidos do Fiscal", icone: "pedidos", descricao: "Solicitações abertas pelos colaboradores", href: "/pedidos?setor=fiscal" },
      { nome: "PIS/COFINS → CBS", icone: "imposto", descricao: "Parcial semanal e conferência da guia" },
      { nome: "Calendário de obrigações", icone: "calendario", descricao: "Guias, vencimentos e comprovantes" },
      { nome: "Canceladas e cartas de correção", icone: "cancelada", descricao: "Histórico e motivos recorrentes" },
    ],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    descricao: "Boletos, recebimentos e caixa",
    modulos: [
      { nome: "Pedidos do Financeiro", icone: "pedidos", descricao: "Pagamentos, reembolsos e cadastros", href: "/pedidos?setor=financeiro" },
      { nome: "Central de boletos", icone: "boleto", descricao: "DDA × nota × boleto lançado" },
      { nome: "Recebíveis e inadimplência", icone: "recebiveis", descricao: "Vencidos, previsões e motivos, do Flow", href: "/recebiveis" },
      { nome: "Régua de cobrança", icone: "cobranca", descricao: "Mensagens de cobrança por WhatsApp e e-mail" },
      { nome: "Fluxo de caixa projetado", icone: "caixa", descricao: "A pagar, a receber e previsto × realizado" },
      { nome: "Conciliação bancária", icone: "conciliacao", descricao: "Extrato × movimento do Flow" },
    ],
  },
  {
    id: "rh",
    nome: "RH",
    descricao: "Recrutamento e seleção",
    modulos: [
      { nome: "Pedidos do RH", icone: "pedidos", descricao: "Vagas, substituições e declarações", href: "/pedidos?setor=rh" },
      { nome: "Vagas e candidatos", icone: "vagas", descricao: "Funil: inscritos → triagem → entrevista → fechado" },
      { nome: "Agenda de entrevistas", icone: "agenda", descricao: "Autoagendamento entre os entrevistadores" },
      { nome: "Contratos PJ", icone: "contrato", descricao: "Contrato gerado e assinatura eletrônica" },
    ],
  },
  {
    id: "adm",
    nome: "ADM",
    descricao: "Solicitações, documentos e apoio",
    modulos: [
      { nome: "Pedidos do ADM", icone: "pedidos", descricao: "Compras, manutenção, equipamentos e documentos", href: "/pedidos?setor=adm" },
      { nome: "Documentos da empresa", icone: "documentos", descricao: "Pastas, validades e versões" },
      { nome: "Certificado, contratos e frota", icone: "alerta", descricao: "Vencimentos e alertas" },
      { nome: "Mural e manuais", icone: "mural", descricao: "Comunicados, procedimentos e contatos" },
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

export type IconeModuloId =
  | "quadro" | "pedidos" | "imposto" | "calendario" | "cancelada" | "boleto" | "recebiveis" | "cobranca"
  | "caixa" | "conciliacao" | "vagas" | "agenda" | "contrato" | "documentos" | "alerta" | "mural";

/** Ícone de cada módulo (desenho próprio, traço de 24 px). */
export function IconeModulo({ id, tamanho = 22 }: { id: IconeModuloId; tamanho?: number }) {
  const comum = { width: tamanho, height: tamanho, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const caminhos: Record<IconeModuloId, React.ReactNode> = {
    quadro: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16M5.5 8h1.5M11.5 8h1.5M11.5 11h1.5M17.5 8h1" /></>,
    pedidos: <><path d="M4 13l2.5-8h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 13h4.5l1 2h5l1-2H20" /></>,
    imposto: <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="16" r="2" /><path d="M18 6L6 18" /></>,
    calendario: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" /></>,
    cancelada: <><path d="M6 3h9l3 3v15H6z" /><path d="M9.5 11.5l5 5M14.5 11.5l-5 5" /></>,
    boleto: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9v6M10 9v6M12.5 9v6M15 9v6M17 9v6" /></>,
    recebiveis: <><path d="M3 17l5-5 4 3 8-8" /><path d="M15 7h5v5" /></>,
    cobranca: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
    caixa: <><path d="M4 20V10M10 20V5M16 20v-7M20 20H3" /></>,
    conciliacao: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
    vagas: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.7-3.6 3.3-6 6.5-6 1.6 0 3 .5 4.1 1.5M18 14v6M15 17h6" /></>,
    agenda: <><rect x="3.5" y="5" width="12" height="12" rx="2" /><path d="M3.5 9h12M7 3v3M12 3v3" /><circle cx="17" cy="17" r="4" /><path d="M17 15.3V17l1.2 1" /></>,
    contrato: <><path d="M6 3h9l3 3v6M6 3v18h6" /><path d="M9 8h5M9 11.5h6" /><path d="M14.5 20.5l1-3.5 4-4a1.4 1.4 0 0 1 2 2l-4 4z" /></>,
    documentos: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    alerta: <><path d="M12 3l8 3v6c0 4.4-3.4 7.8-8 9-4.6-1.2-8-4.6-8-9V6z" /><path d="M12 8v4.5M12 15.8v.2" /></>,
    mural: <><path d="M4 10v4l3 .5L15 19V5L7 9.5z" /><path d="M7 14.5L8.5 20M18 9.5a3 3 0 0 1 0 5" /></>,
  };
  return <svg {...comum}>{caminhos[id]}</svg>;
}
