import "server-only";
// "Meu dia" na Início: o que é da pessoa hoje, de todas as áreas, numa lista só.
// Planner (atrasadas e de hoje, que já incluem frota, documentos, entrevistas e tarefas passadas), pedidos sob a responsabilidade
// dela vencendo ou atrasados, pedidos novos esperando aceite e previsões de pagamento combinadas para hoje (Recebíveis).
import { supabaseUsuario } from "@/lib/supabase/server";
import { DadosPlanner } from "@/lib/planner/dados";
import { Regras, todayS } from "@/lib/planner/regras";
import { STATUS_ABERTOS } from "@/lib/tipos";

export type ItemDia = {
  tipo: "planner" | "pedido" | "pedidos-novos" | "previsao";
  titulo: string; detalhe?: string; hora?: string;
  atrasado: boolean; href: string; origem?: { href: string; rotulo: string };
};

const br = (d: string) => d.split("-").reverse().join("/");

/** soPlanner: na Central de Obras só entram as tarefas do planner (pedidos e recebíveis são da Administrativa). */
export async function meuDia(pessoaId: string, { soPlanner = false } = {}): Promise<ItemDia[]> {
  const sb = await supabaseUsuario();
  const hoje = todayS();
  const [estado, { data: pedidos }, { data: novos }, { data: previsoes }] = await Promise.all([
    new DadosPlanner(pessoaId).estado().catch(() => null),
    soPlanner ? { data: [] } : sb.from("pedidos").select("id, protocolo, prazo, status, tipos_pedido(nome)").eq("responsavel_id", pessoaId).in("status", STATUS_ABERTOS).lte("prazo", hoje).order("prazo"),
    soPlanner ? { data: [] } : sb.from("pedidos").select("id", { count: "exact", head: false }).eq("status", "aberto").limit(50),
    soPlanner ? { data: [] } : sb.from("recebiveis").select("flow_id, cliente, cliente_apelido, nome_exibicao, id_cliente, valor_aberto").eq("estado", "vencido").eq("previsao", hoje).limit(30),
  ]);
  const itens: ItemDia[] = [];

  if (estado) {
    const r = new Regras(estado.settings, estado.events);
    for (const t of estado.tasks) {
      if (t.soCentral) continue; // acompanhamento de tarefa passada: quem faz é a outra pessoa
      const o = r.curOcc(t);
      if (!o || o.done || o.left > 0) continue;
      if (t.rec?.type === "daily" && o.date !== hoje) continue;
      const l = t.link && typeof t.link.href === "string" && t.link.href.startsWith("/") && !t.link.href.startsWith("//") ? t.link : undefined;
      itens.push({
        tipo: "planner", titulo: String(t.title || "Tarefa"), hora: t.time || undefined,
        detalhe: o.left < 0 ? `atrasada desde ${br(o.date)}` : t.de?.nome ? `de ${String(t.de.nome).split(" ")[0]}` : undefined,
        atrasado: o.left < 0, href: "/planner", origem: l,
      });
    }
  }
  for (const p of (pedidos ?? []) as unknown as { id: number; protocolo: string; prazo: string; tipos_pedido: { nome: string } | null }[]) {
    itens.push({ tipo: "pedido", titulo: `${p.tipos_pedido?.nome ?? "Pedido"} · ${p.protocolo}`, detalhe: p.prazo < hoje ? `previsão era ${br(p.prazo)}` : "previsão para hoje",
      atrasado: p.prazo < hoje, href: `/pedidos/${p.id}` });
  }
  if (novos?.length) itens.push({ tipo: "pedidos-novos", titulo: `${novos.length}${novos.length === 50 ? "+" : ""} pedido${novos.length === 1 ? "" : "s"} novo${novos.length === 1 ? "" : "s"} esperando aceite`, atrasado: false, href: "/pedidos" });
  for (const t of previsoes ?? []) {
    const nome = t.nome_exibicao || t.cliente_apelido || t.cliente || "Cliente";
    itens.push({ tipo: "previsao", titulo: `Previsão de pagamento hoje: ${nome}`,
      detalhe: Number(t.valor_aberto || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), atrasado: false,
      href: t.id_cliente ? `/clientes/${encodeURIComponent(t.id_cliente)}` : `/recebiveis?${new URLSearchParams({ aba: "vencidos", busca: nome })}` });
  }
  // atrasados primeiro, depois por hora
  return itens.sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || (a.hora ?? "99").localeCompare(b.hora ?? "99"));
}
