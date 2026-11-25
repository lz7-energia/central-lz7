import "server-only";
import { todasAsLinhas } from "@/lib/paginar";
import type { supabaseUsuario } from "@/lib/supabase/server";

type Obra = { codigo: string; nome_card: string | null; cliente: string; cidade: string | null; entrada: string;
  material_previsto: string | null; material_entregue: string | null; inicio_previsto: string | null; fim_previsto: string | null;
  inicio_real: string | null; fim_real: string | null; equipe_id: string | null; codigo_provisorio: boolean; flow_situacao: string | null };
type Aviso = { id: number; obra: string; para: string; tipo: string; texto: string; criado_em: string };

export type ItemPendencia = { codigo: string; titulo: string; detalhe: string; avisoId?: number };
export type GrupoPendencia = { chave: string; area: "logistica" | "obras"; titulo: string; itens: ItemPendencia[]; ver: string; grave?: boolean };
export type ItemAgenda = { codigo: string; titulo: string; tipo: "entrega" | "instalacao"; quando: "hoje" | "amanhã"; detalhe: string };

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dif = (a: string, b: string) => Math.round((new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / 864e5);
const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const dias = (n: number) => `${n} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
const ha = (n: number) => (n <= 0 ? "hoje" : `há ${dias(n)}`);
const MINI = new Set(["de", "da", "do", "das", "dos", "e"]);
const nome = (s: string) => s.toLowerCase().split(/\s+/).map((w, i) => (MINI.has(w) && i ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
/** Mesmo nome da tela do cronograma: o nome do card sem o código e a potência; senão o cliente. */
export function tituloObra(o: { nome_card: string | null; cliente: string }) {
  const c = String(o.nome_card ?? "").replace(/^[A-Z0-9-]{6,}\s*-\s*/, "").replace(/\s*\(\s*[\d.,]+\s*kwp\s*\)\s*$/i, "").trim();
  return c ? (c === c.toUpperCase() ? nome(c) : c) : nome(o.cliente ?? "");
}

/** Números, pendências e agenda da Início de Obras (mesmas regras da tela do cronograma). */
export async function resumoObras(sb: Awaited<ReturnType<typeof supabaseUsuario>>) {
  const [{ data }, { data: avisos }] = await Promise.all([
    todasAsLinhas<Obra>((de, ate) => sb.from("obra_obras")
      .select("codigo, nome_card, cliente, cidade, entrada, material_previsto, material_entregue, inicio_previsto, fim_previsto, inicio_real, fim_real, equipe_id, codigo_provisorio, flow_situacao")
      .order("codigo").range(de, ate)),
    sb.from("obra_avisos").select("id, obra, para, tipo, texto, criado_em").is("resolvido_em", null).order("criado_em", { ascending: false }).limit(200),
  ]);
  const hoje = hojeSP(), amanha = somaDias(hoje, 1), dow = (new Date(hoje + "T12:00:00").getDay() + 6) % 7, s0 = somaDias(hoje, -dow), s1 = somaDias(s0, 6);
  const ab = data.filter((o) => !o.fim_real);
  const porCod = new Map(data.map((o) => [o.codigo, o]));
  const item = (o: Obra, detalhe: string): ItemPendencia => ({ codigo: o.codigo, titulo: tituloObra(o), detalhe });

  const novas = ab.filter((o) => !o.material_previsto && !o.material_entregue).sort((a, b) => a.entrada.localeCompare(b.entrada));
  const entAtr = ab.filter((o) => !o.material_entregue && o.material_previsto && o.material_previsto < hoje).sort((a, b) => a.material_previsto!.localeCompare(b.material_previsto!));
  const agendar = ab.filter((o) => !o.inicio_previsto && (o.material_previsto || o.material_entregue))
    .sort((a, b) => (a.material_entregue ?? a.material_previsto!).localeCompare(b.material_entregue ?? b.material_previsto!));
  const instAtr = ab.filter((o) => o.fim_previsto && o.fim_previsto < hoje).sort((a, b) => a.fim_previsto!.localeCompare(b.fim_previsto!));
  const avisosObras = (avisos ?? []).filter((a: Aviso) => a.para === "obras" && porCod.has(a.obra));
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const pendencias: GrupoPendencia[] = [
    { chave: "novas", area: "logistica", titulo: plural(novas.length, "obra nova sem previsão de entrega", "obras novas sem previsão de entrega"), ver: "/obras/cronograma#entregas",
      itens: novas.map((o) => item(o, `entrou ${ha(dif(hoje, o.entrada))}${o.cidade ? " · " + o.cidade : ""}`)) },
    { chave: "ent-atrasadas", area: "logistica", grave: true, titulo: plural(entAtr.length, "entrega atrasada", "entregas atrasadas"), ver: "/obras/cronograma#entregas",
      itens: entAtr.map((o) => item(o, `prevista para ${br(o.material_previsto!)}, atrasada há ${dias(dif(hoje, o.material_previsto!))}`)) },
    { chave: "avisos", area: "obras", titulo: plural(avisosObras.length, "aviso da logística", "avisos da logística"), ver: "/obras/cronograma#pendentes",
      itens: avisosObras.map((a: Aviso) => ({ ...item(porCod.get(a.obra)!, a.texto), avisoId: a.id })) },
    { chave: "agendar", area: "obras", titulo: plural(agendar.length, "obra para agendar a instalação", "obras para agendar a instalação"), ver: "/obras/cronograma#pendentes",
      itens: agendar.map((o) => item(o, o.material_entregue ? `material entregue ${ha(dif(hoje, o.material_entregue))}` : `material previsto para ${br(o.material_previsto!)}`)) },
    { chave: "inst-atrasadas", area: "obras", grave: true, titulo: plural(instAtr.length, "instalação atrasada", "instalações atrasadas"), ver: "/obras/cronograma#pendentes",
      itens: instAtr.map((o) => item(o, `deveria ter terminado em ${br(o.fim_previsto!)}, atrasada há ${dias(dif(hoje, o.fim_previsto!))}`)) },
  ].filter((g) => g.itens.length) as GrupoPendencia[];

  const agenda: ItemAgenda[] = [];
  for (const d of [hoje, amanha]) {
    const quando = d === hoje ? "hoje" : "amanhã";
    for (const o of ab) {
      if (!o.material_entregue && o.material_previsto === d) agenda.push({ codigo: o.codigo, titulo: tituloObra(o), tipo: "entrega", quando, detalhe: o.cidade ?? "" });
      const ini = o.inicio_previsto, fim = o.fim_previsto ?? o.inicio_previsto;
      if (ini && fim && ini <= d && fim >= d) agenda.push({ codigo: o.codigo, titulo: tituloObra(o), tipo: "instalacao", quando,
        detalhe: [o.cidade, ini !== fim ? `${br(ini)} a ${br(fim)}` : null].filter(Boolean).join(" · ") });
    }
  }

  return {
    abertas: ab.length,
    instSemana: ab.filter((o) => o.inicio_previsto && o.inicio_previsto <= s1 && (o.fim_previsto ?? o.inicio_previsto) >= s0).length,
    entSemana: ab.filter((o) => !o.material_entregue && o.material_previsto && o.material_previsto >= s0 && o.material_previsto <= s1).length,
    logistica: { atrasadas: entAtr.length, semPrevisao: novas.length },
    obras: {
      aAgendar: agendar.length + ab.filter((o) => !o.inicio_previsto && !o.material_previsto && !o.material_entregue).length,
      atrasadas: instAtr.length, avisos: avisosObras.length,
      avisosFlow: ab.filter((o) => o.codigo_provisorio || (o.flow_situacao && !["Aprovado", "Faturado"].includes(o.flow_situacao))).length,
    },
    pendencias, agenda,
  };
}
