import "server-only";
// Ficha do cliente: junta o que a Central já tem do Flow (cadastro, pedidos/obras no painel, títulos) e os cards do Financiamento.
// Chave = id do cliente no Flow (clientes_flow.flow_id = titulos_receber.id_cliente = pedidosVenda.cliente.id).
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import type { Recebivel } from "@/lib/recebiveis";
import type { LinhaPainel } from "@/lib/tipos";

export type ClienteResumo = { id: string; nome: string; apelido: string | null; doc: string | null; aberto: number; vencido: number; titulos: number };
export type CardFin = { coluna: "Financiamento" | "Confirmação de pagamento"; titulo: string; valor: number; vendedor: string | null; entrada: string | null; obs: string | null };

const limpa = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const COD = /^\s*([A-Z]{2}\d{5,7}[A-Z]{0,4})\s*-/i;

/** Lista para a busca: com termo, procura no cadastro, nos títulos e nos pedidos; sem termo, os clientes com títulos em aberto. */
export async function buscarClientes(q: string): Promise<ClienteResumo[]> {
  const sb = await supabaseUsuario();
  const [{ data: tit }, { data: cad }] = await Promise.all([
    todasAsLinhas<Pick<Recebivel, "id_cliente" | "cliente" | "cliente_apelido" | "codigo_projeto" | "valor_aberto" | "estado" | "nome_exibicao">>((de, ate) =>
      sb.from("recebiveis").select("id_cliente, cliente, cliente_apelido, codigo_projeto, valor_aberto, estado, nome_exibicao").not("id_cliente", "is", null).order("flow_id").range(de, ate)),
    todasAsLinhas<{ flow_id: string; nome: string | null; apelido: string | null; cnpj_cpf: string | null }>((de, ate) =>
      sb.from("clientes_flow").select("flow_id, nome, apelido, cnpj_cpf").order("flow_id").range(de, ate)),
  ]);
  const mapa = new Map<string, ClienteResumo & { busca: string }>();
  const pegar = (id: string) => {
    let c = mapa.get(id);
    if (!c) { c = { id, nome: "", apelido: null, doc: null, aberto: 0, vencido: 0, titulos: 0, busca: "" }; mapa.set(id, c); }
    return c;
  };
  for (const c of cad ?? []) {
    const x = pegar(c.flow_id);
    x.nome = c.nome || x.nome; x.apelido = c.apelido || x.apelido; x.doc = c.cnpj_cpf;
    x.busca += ` ${c.nome ?? ""} ${c.apelido ?? ""} ${soDig(c.cnpj_cpf)}`;
  }
  for (const t of tit ?? []) {
    const x = pegar(t.id_cliente!);
    if (!x.nome) x.nome = t.cliente ?? ""; if (!x.apelido) x.apelido = t.cliente_apelido;
    x.busca += ` ${t.cliente ?? ""} ${t.cliente_apelido ?? ""} ${t.nome_exibicao ?? ""} ${t.codigo_projeto ?? ""}`;
    if (t.estado === "vencido" || t.estado === "a_vencer") { x.aberto += Number(t.valor_aberto || 0); x.titulos++; }
    if (t.estado === "vencido") x.vencido += Number(t.valor_aberto || 0);
  }
  const termo = limpa(q), dig = soDig(q);
  let lista = [...mapa.values()].filter((c) => c.nome || c.apelido);
  if (termo) lista = lista.filter((c) => { const b = limpa(c.busca); return b.includes(termo) || (dig.length >= 5 && b.includes(dig)); });
  else lista = lista.filter((c) => c.aberto > 0);
  lista.sort((a, b) => (termo ? 0 : b.vencido - a.vencido || b.aberto - a.aberto) || (a.apelido || a.nome).localeCompare(b.apelido || b.nome, "pt-BR"));
  return lista.slice(0, 80).map(({ busca: _b, ...c }) => { void _b; return c; });
}

export async function fichaDoCliente(id: string) {
  const sb = await supabaseUsuario();
  const [{ data: cad }, tit, ped, { data: fin }] = await Promise.all([
    sb.from("clientes_flow").select("flow_id, nome, apelido, cnpj_cpf, telefone, email").eq("flow_id", id).maybeSingle(),
    todasAsLinhas<Recebivel>((de, ate) => sb.from("recebiveis").select("*").eq("id_cliente", id).order("vencimento").range(de, ate)),
    sb.from("pedidos_venda").select("flow_id, numero, codigo_projeto, cliente, cliente_apelido, valor_total, data_pedido, responsavel").eq("bruto->cliente->>id", id).order("data_pedido", { ascending: false }),
    sb.from("fin_docs").select("data").eq("colecao", "pendentes").eq("id", "base").maybeSingle(),
  ]);
  const titulos = (tit.data ?? []) as Recebivel[];
  const pedidos = (ped.data ?? []) as { flow_id: string; numero: string | null; codigo_projeto: string | null; cliente: string | null; cliente_apelido: string | null; valor_total: number | null; data_pedido: string | null; responsavel: string | null }[];
  const { data: painel } = pedidos.length
    ? await sb.from("painel_faturamento").select("*").in("flow_id", pedidos.map((p) => p.flow_id))
    : { data: [] as LinhaPainel[] };
  const nome = cad?.nome || titulos[0]?.cliente || pedidos[0]?.cliente || "";
  const apelido = cad?.apelido || titulos[0]?.cliente_apelido || pedidos[0]?.cliente_apelido || null;
  if (!nome && !apelido) return null;

  // Financiamento: casa pelo código do projeto (início do título do card) ou pelo nome do cliente no título.
  const codigos = new Set([...pedidos.map((p) => p.codigo_projeto), ...titulos.map((t) => t.codigo_projeto)].filter(Boolean).map((c) => String(c).toUpperCase()));
  const nomes = [nome, apelido].map(limpa).filter((n) => n.length >= 6);
  const base = (fin?.data ?? {}) as Record<string, { t: string; v: number; vend?: string; ent?: string; obs?: string }[]>;
  const cards: CardFin[] = [];
  for (const [col, rot] of [["fin", "Financiamento"], ["conf", "Confirmação de pagamento"]] as const) {
    for (const r of base[col] || []) {
      const cod = String(r.t || "").match(COD)?.[1]?.toUpperCase();
      const t = limpa(r.t);
      if ((cod && codigos.has(cod)) || nomes.some((n) => t.includes(n))) {
        cards.push({ coluna: rot, titulo: r.t, valor: Number(r.v || 0), vendedor: r.vend || null, entrada: r.ent || null, obs: typeof r.obs === "string" ? r.obs : null });
      }
    }
  }
  return {
    id, nome, apelido, doc: cad?.cnpj_cpf ?? null, telefone: cad?.telefone ?? null, email: cad?.email ?? null,
    titulos, pedidos, painel: (painel ?? []) as LinhaPainel[], cards,
  };
}
