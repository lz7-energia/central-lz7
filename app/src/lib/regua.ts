// Régua de cobrança (Financeiro, /cobranca). Funções puras: a tela e os testes usam as mesmas.
// Regras (decisão de 17/11/2026):
//   • Entra na régua o título em aberto que vence hoje ou já venceu.
//   • Etapa devida = a etapa ativa de maior "dias" que já foi alcançada (dias desde o vencimento). Quem chega atrasado na régua
//     (ex.: 20 dias) recebe só a etapa atual (15), não as anteriores.
//   • Fica fora: recebido, excluído, marcado como financiamento, ou situação de cobrança que pausa a régua.
//   • Uma mensagem por cliente, com todos os títulos dele que estão devendo alguma etapa; vale a etapa mais avançada.

export type Etapa = { id: string; dias: number; nome: string; texto: string; ativo: boolean };
export type Envio = { id: number; lote: string; titulo_flow_id: string; etapa_id: string; canal: string; acao: "enviado" | "pulado"; telefone: string | null; texto: string | null; motivo: string | null; por: string | null; por_id: string | null; em: string };
export type TituloRegua = {
  flow_id: string; id_cliente: string | null; cliente: string | null; cliente_apelido: string | null; codigo_projeto: string | null;
  vencimento: string | null; valor_aberto: number; estado: string; financiamento: boolean; cobranca_situacao: string;
};
export type SituacaoRegua = { id: string; rotulo: string; pausa_regua: boolean };
export type Contato = { telefone: string | null; email: string | null; origem: "central" | "flow" | null };

export type ItemFila = TituloRegua & { dias: number; etapa: Etapa | null; ultimoEnvio: Envio | null; proxima: Etapa | null };
export type GrupoCliente = {
  chave: string; id_cliente: string | null; nome: string; razao: string | null; itens: ItemFila[]; etapa: Etapa;
  total: number; diasMax: number; contato: Contato; telefoneWa: string | null;
};
export type Pausado = TituloRegua & { dias: number; motivo: string };

export const diasDesde = (inicio: string, fim: string) =>
  Math.round((Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10)) - Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10))) / 86400000);

export const moedaBR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBR = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");

/** Telefone para o link do WhatsApp (55 + DDD + número). Null se não parecer um celular/fixo brasileiro. */
export function telefoneWhatsApp(t: string | null | undefined): string | null {
  let d = String(t ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return null;
}

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
const titulo = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)
  .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** Como chamar o cliente na mensagem: pessoa física → primeiro nome; empresa → razão social. */
export function nomeParaMensagem(razao: string | null, apelido: string | null): string {
  const base = (razao || apelido || "").replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "tudo bem";
  if (/\b(ltda|me|eireli|s\/?a|epp|mei|comercio|comércio|industria|indústria|servicos|serviços|cooperativa|associacao|associação)\b/i.test(base)) return titulo(base);
  return titulo(base.split(" ")[0]);
}

export function etapaDevida(etapas: Etapa[], dias: number): Etapa | null {
  let best: Etapa | null = null;
  for (const e of etapas) if (e.ativo && e.dias <= dias && (!best || e.dias > best.dias)) best = e;
  return best;
}
export function proximaEtapa(etapas: Etapa[], dias: number): Etapa | null {
  let best: Etapa | null = null;
  for (const e of etapas) if (e.ativo && e.dias > dias && (!best || e.dias < best.dias)) best = e;
  return best;
}

/** Monta o texto da etapa para um cliente. */
export function montarMensagem(etapa: Etapa, g: { nome: string; itens: { valor_aberto: number; vencimento: string | null; dias: number }[] }): string {
  const itens = [...g.itens].sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const total = itens.reduce((s, t) => s + t.valor_aberto, 0);
  const diasMax = Math.max(0, ...itens.map((t) => t.dias));
  const lista = itens.map((t) => `• ${moedaBR(t.valor_aberto)}, ${t.dias === 0 ? "vence hoje" : `vencimento ${dataBR(t.vencimento)}`}`).join("\n");
  return etapa.texto
    .replaceAll("{nome}", g.nome)
    .replaceAll("{lista}", lista)
    .replaceAll("{total}", moedaBR(total))
    .replaceAll("{dias}", String(diasMax))
    .replaceAll("{vencimento}", dataBR(itens[0]?.vencimento ?? null));
}

export function montarFila(p: {
  titulos: TituloRegua[]; etapas: Etapa[]; envios: Envio[]; situacoes: SituacaoRegua[];
  contatos: Map<string, Contato>; hoje: string;
}) {
  const pausa = new Map(p.situacoes.map((s) => [s.id, s]));
  const enviosPor = new Map<string, Envio[]>();
  for (const e of p.envios) { const l = enviosPor.get(e.titulo_flow_id) ?? []; l.push(e); enviosPor.set(e.titulo_flow_id, l); }
  for (const l of enviosPor.values()) l.sort((a, b) => (a.em < b.em ? 1 : -1));

  const devendo: ItemFila[] = []; const emDia: ItemFila[] = []; const pausados: Pausado[] = [];
  for (const t of p.titulos) {
    if (!t.vencimento || t.valor_aberto <= 0 || (t.estado !== "vencido" && t.estado !== "a_vencer")) continue;
    const dias = diasDesde(t.vencimento, p.hoje);
    if (dias < 0) continue;
    const sit = pausa.get(t.cobranca_situacao);
    if (t.financiamento) { pausados.push({ ...t, dias, motivo: "Pago por financiamento" }); continue; }
    if (sit?.pausa_regua) { pausados.push({ ...t, dias, motivo: sit.rotulo }); continue; }
    const etapa = etapaDevida(p.etapas, dias);
    const meus = enviosPor.get(t.flow_id) ?? [];
    const item: ItemFila = { ...t, dias, etapa, ultimoEnvio: meus[0] ?? null, proxima: proximaEtapa(p.etapas, dias) };
    if (!etapa) continue;
    // Etapa já feita (enviada ou pulada), ou uma etapa mais avançada já foi feita: em dia.
    const feitas = new Set(meus.map((e) => e.etapa_id));
    const diasFeitos = Math.max(-1, ...meus.map((e) => p.etapas.find((x) => x.id === e.etapa_id)?.dias ?? -1));
    if (feitas.has(etapa.id) || diasFeitos >= etapa.dias) emDia.push(item); else devendo.push(item);
  }

  const grupos = new Map<string, GrupoCliente>();
  for (const it of devendo) {
    const chave = it.id_cliente ?? `nome:${(it.cliente ?? it.cliente_apelido ?? it.flow_id).toLowerCase()}`;
    let g = grupos.get(chave);
    if (!g) {
      const contato = (it.id_cliente && p.contatos.get(it.id_cliente)) || { telefone: null, email: null, origem: null };
      g = { chave, id_cliente: it.id_cliente, nome: it.cliente_apelido || it.cliente || "Cliente sem nome", razao: it.cliente,
            itens: [], etapa: it.etapa!, total: 0, diasMax: 0, contato, telefoneWa: telefoneWhatsApp(contato.telefone) };
      grupos.set(chave, g);
    }
    g.itens.push(it);
    if (it.etapa!.dias > g.etapa.dias) g.etapa = it.etapa!;
    g.total = Math.round((g.total + it.valor_aberto) * 100) / 100;
    g.diasMax = Math.max(g.diasMax, it.dias);
  }
  const paraEnviar = [...grupos.values()].sort((a, b) => b.etapa.dias - a.etapa.dias || b.diasMax - a.diasMax || b.total - a.total);
  return { paraEnviar, emDia, pausados };
}
