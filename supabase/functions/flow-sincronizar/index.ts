// Central LZ7 — sincronização com o Flow (Everflow). SOMENTE LEITURA no Flow.
// Copia pedidos de venda, itens, OS, notas de produto (documentosSaida), clientes e contas a receber para o banco da central; as telas leem do banco.
// Agendada pelo pg_cron (ver supabase/README.md). Ignora chamadas com menos de 10 minutos de intervalo,
// para nunca pesar a API do Flow mesmo se alguém chamar o endereço repetidas vezes.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = (Deno.env.get("FLOW_API_BASE_URL") ?? "https://api.flow2.com.br/v1").replace(/\/$/, "");
const TOKEN = Deno.env.get("FLOW_API_TOKEN") ?? "";
const INTERVALO_MINIMO_MIN = 10;
const TAMANHO_PAGINA = 100;

// Status da OS no Flow: usamos a descrição curta ("Obra concluída."), que é o que está em status_os_faturamento.
const statusDaOS = (s: any): string | null => s?.descricao ?? null;

function dataISO(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

const numero = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flow(caminho: string): Promise<any> {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`${BASE}/${caminho}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
    if (r.ok) return await r.json();
    if (tentativa < 3 && (r.status === 429 || r.status >= 500)) {
      await espera(2000 * tentativa);
      continue;
    }
    throw new Error(`Flow ${caminho.split("?")[0]}: HTTP ${r.status}`);
  }
}

/** Lê todas as páginas de um recurso (paginação por deslocamento: pageSize + skip). */
async function todos(recurso: string): Promise<any[]> {
  const itens: any[] = [];
  for (let skip = 0; ; ) {
    const pagina = await flow(`${recurso}/?pageSize=${TAMANHO_PAGINA}&skip=${skip}`);
    const lote: any[] = pagina?.itens ?? [];
    itens.push(...lote);
    skip += lote.length;
    if (lote.length === 0 || skip >= Number(pagina?.totalRecords ?? 0) || skip > 100_000) break;
  }
  return itens;
}

/** Lê todas as linhas de uma tabela da central (o Supabase corta cada consulta no "Max rows" do projeto). */
async function lerTudo(sb: any, tabela: string, colunas: string): Promise<any[]> {
  const linhas: any[] = [];
  for (let de = 0; de < 500_000; ) {
    const { data, error } = await sb.from(tabela).select(colunas).order("flow_id").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    linhas.push(...data);
    de += data.length; // avança pelo que veio de fato (o "Max rows" do projeto pode ser menor que 1000)
  }
  return linhas;
}

async function emLotes<T>(linhas: T[], fazer: (lote: T[]) => Promise<{ error: any }>) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await fazer(linhas.slice(i, i + 500));
    if (error) throw new Error(error.message ?? String(error));
  }
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!TOKEN) return Response.json({ erro: "FLOW_API_TOKEN não configurado" }, { status: 500 });

  // Trava: no máximo uma sincronização a cada 10 minutos (inclui uma que ainda esteja rodando).
  const desde = new Date(Date.now() - INTERVALO_MINIMO_MIN * 60_000).toISOString();
  const { data: recentes } = await sb
    .from("sincronizacoes").select("id")
    .eq("recurso", "flow").gte("iniciada_em", desde).or("sucesso.is.null,sucesso.eq.true").limit(1);
  if (recentes?.length) return Response.json({ ignorado: "houve sincronização há menos de 10 minutos" }, { status: 429 });

  const { data: registro, error: erroRegistro } = await sb
    .from("sincronizacoes").insert({ recurso: "flow" }).select("id").single();
  if (erroRegistro) return Response.json({ erro: erroRegistro.message }, { status: 500 });

  try {
    const agora = new Date().toISOString();

    // 1) Leitura do Flow (em sequência, para não pesar a API)
    const pedidos = await todos("pedidosVenda");
    const itens = await todos("pedidosVenda/itens");
    const ordens = await todos("ordensServico");
    const titulos = await todos("recebers");
    const documentos = await todos("documentosSaida"); // página "Notas de Produto" do Flow
    const clientes = await todos("clientes"); // cadastro de clientes (nome e apelido de todos)
    const cadastro = new Map(clientes.map((c) => [String(c.id), c]));

    // 2) Pedidos de venda. O valor do pedido é a soma dos itens (o total do cabeçalho vem vazio na API).
    const somaItens = new Map<string, number>();
    for (const it of itens) {
      const id = String(it.idPedidoVenda);
      somaItens.set(id, (somaItens.get(id) ?? 0) + Number(it.total ?? 0));
    }
    const idsPedidos = new Set(pedidos.map((p) => String(p.id)));
    // Sem a coluna "responsavel": ela é definida na central e o upsert não pode apagá-la.
    const linhasPedidos = pedidos.map((p) => ({
      flow_id: String(p.id),
      numero: String(p.id),
      codigo_projeto: p.codigoProjeto || null,
      cliente: cadastro.get(String(p.cliente?.id))?.nomeRazaoSocial || p.cliente?.nomeRazaoSocial || p.cliente?.apelido || null,
      cliente_apelido: cadastro.get(String(p.cliente?.id))?.apelido || p.cliente?.apelido || null,
      valor_total: somaItens.has(String(p.id)) ? Math.round(somaItens.get(String(p.id))! * 100) / 100 : null,
      data_pedido: dataISO(p.dataEmissao),
      bruto: p,
      sincronizado_em: agora,
    }));
    await emLotes(linhasPedidos, (l) => sb.from("pedidos_venda").upsert(l, { onConflict: "flow_id" }));

    // 3) Ordens de serviço. "status_desde" é marcado pela central (o Flow não informa a data da troca de status).
    const osAntigas = await lerTudo(sb, "ordens_servico", "flow_id, status, status_desde");
    const antigas = new Map(osAntigas.map((o: any) => [o.flow_id, o]));
    const os = new Map<string, any>();
    for (const p of pedidos) {
      // Reserva: status de OS que já vem no pedido, caso a OS não apareça na lista de OS.
      if (p.ordemServico?.id && p.ordemServicoStatus) {
        os.set(String(p.ordemServico.id), { flow_id: String(p.ordemServico.id), pedido: String(p.id), status: statusDaOS(p.ordemServicoStatus), bruto: { origem: "pedidosVenda" } });
      }
    }
    for (const o of ordens) {
      const pedido = (o.idsPedidosVendas ?? []).map(String).find((id: string) => idsPedidos.has(id));
      if (!pedido) continue;
      os.set(String(o.id), { flow_id: String(o.id), pedido, status: statusDaOS(o.statusChamado), bruto: o });
    }
    const linhasOS = [...os.values()].map((o) => {
      const antiga: any = antigas.get(o.flow_id);
      return {
        flow_id: o.flow_id,
        pedido_flow_id: o.pedido,
        numero: o.flow_id,
        status: o.status,
        status_desde: antiga && antiga.status === o.status && antiga.status_desde ? antiga.status_desde : agora,
        bruto: o.bruto,
        sincronizado_em: agora,
      };
    });
    await emLotes(linhasOS, (l) => sb.from("ordens_servico").upsert(l, { onConflict: "flow_id" }));

    // 4) Notas fiscais. Ordem de ligação nota → pedido:
    //    a) nota de "Notas de Produto" (documentosSaida) que informa o pedido;
    //    b) número de NF-e que vem na OS;
    //    c) nota de "Notas de Produto" sem pedido: mesmo cliente, emitida depois do pedido, pedido ainda sem nota
    //       (com mais de um candidato, escolhe pelo valor; sem certeza, não liga);
    //    d) pedido com situação "Faturado" sem nota encontrada: nota sem número.
    const notas = new Map<string, any>();
    const notaDoPedido = new Set<string>();
    const numerosUsados = new Set<string>();
    const adicionar = (n: any) => {
      notas.set(n.flow_id, { situacao: "autorizada", sincronizado_em: agora, ...n });
      notaDoPedido.add(n.pedido_flow_id);
      if (n.numero) numerosUsados.add(String(n.numero));
    };
    const pedidoPorId = new Map(pedidos.map((p) => [String(p.id), p]));
    const osCancelada = new Set(linhasOS.filter((o) => o.status === "Cancelado").map((o) => o.pedido_flow_id));

    const docsValidos = documentos.filter((d) =>
      !d.dataCancelamento && !d.homologacao && !/^e/i.test(String(d.entradaSaida ?? "")) &&
      !/cancel|deneg|rejeit|inutiliz|digita/i.test(String(d.situacaoDocumento ?? "")) && d.numeroNota != null);
    const notaDeDocumento = (d: any, pedido: string, vinculo: string) => ({
      flow_id: `doc-${d.id}`, pedido_flow_id: pedido, numero: String(d.numeroNota),
      serie: d.serieNota != null ? String(d.serieNota) : null, chave_acesso: d.chaveDanfe || null,
      valor: numero(d.valorTotalNotaFiscal), emitida_em: dataISO(d.dataEmissao),
      bruto: { origem: `documentosSaida (${vinculo})`, ...d },
    });

    // a) documento que informa o pedido
    const docsUsados = new Set<string>();
    for (const d of docsValidos) {
      const pedido = (d.idsPedidosVenda ?? []).map(String).find((id: string) => idsPedidos.has(id));
      if (!pedido) continue;
      adicionar(notaDeDocumento(d, pedido, "pedido informado na nota"));
      docsUsados.add(String(d.id));
    }
    // b) NF-e que vem na OS
    for (const o of ordens) {
      const pedido = (o.idsPedidosVendas ?? []).map(String).find((id: string) => idsPedidos.has(id));
      if (!pedido) continue;
      for (const nf of o.numerosNotasFiscaisProduto ?? []) {
        if (nf?.id == null || (nf.numeroNota != null && numerosUsados.has(String(nf.numeroNota)))) continue;
        adicionar({
          flow_id: `nfp-${nf.id}`, pedido_flow_id: pedido,
          numero: nf.numeroNota != null ? String(nf.numeroNota) : null,
          emitida_em: dataISO(pedidoPorId.get(pedido)?.dataFaturamento), bruto: { origem: "OS", ...nf },
        });
      }
    }
    // c) documento sem pedido: mesmo cliente
    let ambiguas = 0;
    const docsPorData = docsValidos
      .filter((d) => !docsUsados.has(String(d.id)) && !numerosUsados.has(String(d.numeroNota)))
      .sort((a, b) => String(a.dataEmissao).localeCompare(String(b.dataEmissao)));
    for (const d of docsPorData) {
      const cliente = d.idCliente ?? d.destinatarioRemetente?.idCliente;
      const emissao = dataISO(d.dataEmissao);
      if (cliente == null) continue;
      const candidatos = pedidos.filter((p) =>
        String(p.cliente?.id) === String(cliente) && !notaDoPedido.has(String(p.id)) && !osCancelada.has(String(p.id)) &&
        (!emissao || !dataISO(p.dataEmissao) || dataISO(p.dataEmissao)! <= emissao));
      let escolhido: any = null;
      if (candidatos.length === 1) escolhido = candidatos[0];
      else if (candidatos.length > 1) {
        const valorNota = Number(d.valorTotalNotaFiscal ?? 0);
        const perto = candidatos.filter((p) => {
          const v = somaItens.get(String(p.id));
          return v && valorNota && Math.abs(v - valorNota) <= Math.max(1, v * 0.02);
        });
        if (perto.length === 1) escolhido = perto[0];
        else ambiguas++;
      }
      if (!escolhido) continue;
      adicionar(notaDeDocumento(d, String(escolhido.id), "mesmo cliente"));
      docsUsados.add(String(d.id));
    }
    // d) pedido "Faturado" sem nota encontrada
    for (const p of pedidos) {
      if (p.situacao === "Faturado" && !notaDoPedido.has(String(p.id))) {
        adicionar({
          flow_id: `pv-${p.id}`, pedido_flow_id: String(p.id), numero: null,
          emitida_em: dataISO(p.dataFaturamento), bruto: { origem: "situacao do pedido = Faturado" },
        });
      }
    }
    await emLotes([...notas.values()], (l) => sb.from("notas_fiscais").upsert(l, { onConflict: "flow_id" }));
    // A lista do Flow é completa: nota que sumiu ou foi cancelada sai da central e o pedido volta a "Pronto pra faturar".
    const notasAntigas = await lerTudo(sb, "notas_fiscais", "flow_id");
    const remover = notasAntigas.map((n: any) => n.flow_id).filter((id: string) => !notas.has(id));
    await emLotes(remover, (l) => sb.from("notas_fiscais").delete().in("flow_id", l));

    // 5) Contas a receber. Título baixado conta 100%; cancelado fica de fora.
    //    Nome do cliente: o título traz só o código (idCliente); o nome vem dos pedidos e das notas do mesmo cliente.
    const nomeCliente = new Map<string, string>();
    const apelidoCliente = new Map<string, string>();
    for (const d of documentos) {
      const id = d.idCliente ?? d.destinatarioRemetente?.idCliente;
      if (id == null) continue;
      if (d.destinatarioRemetente?.nomeRazaoSocial) nomeCliente.set(String(id), d.destinatarioRemetente.nomeRazaoSocial);
      if (d.destinatarioRemetente?.apelido) apelidoCliente.set(String(id), d.destinatarioRemetente.apelido);
    }
    for (const p of pedidos) {
      if (p.cliente?.id == null) continue;
      if (p.cliente.nomeRazaoSocial) nomeCliente.set(String(p.cliente.id), p.cliente.nomeRazaoSocial);
      if (p.cliente.apelido) apelidoCliente.set(String(p.cliente.id), p.cliente.apelido);
    }
    // O cadastro de clientes do Flow tem a palavra final.
    for (const [id, c] of cadastro) {
      if (c.nomeRazaoSocial) nomeCliente.set(id, c.nomeRazaoSocial);
      if (c.apelido) apelidoCliente.set(id, c.apelido);
    }
    const linhasTitulos = titulos
      .filter((t) => !/cancel/i.test(String(t.situacao ?? "")))
      .map((t) => {
        const valor = Number(t.valorBruto ?? t.valorTotal ?? 0);
        const baixado = t.situacao === "Baixado";
        const pedido = t.idCabPedidoVenda != null && idsPedidos.has(String(t.idCabPedidoVenda)) ? String(t.idCabPedidoVenda) : null;
        return {
          flow_id: String(t.id),
          pedido_flow_id: pedido,
          codigo_projeto: t.codigoProjeto || null,
          id_cliente: t.idCliente != null ? String(t.idCliente) : null,
          cliente: (t.idCliente != null ? nomeCliente.get(String(t.idCliente)) : null) ??
            (pedido ? pedidoPorId.get(pedido)?.cliente?.nomeRazaoSocial : null) ?? null,
          situacao: t.situacao ?? null,
          cliente_apelido: (t.idCliente != null ? apelidoCliente.get(String(t.idCliente)) : null) ??
            (pedido ? pedidoPorId.get(pedido)?.cliente?.apelido : null) ?? null,
          valor,
          valor_recebido: baixado ? valor : Math.min(Number(numero(t.valorRecebido) ?? 0), valor),
          vencimento: dataISO(t.dataVencimentoReal ?? t.dataVencimentoNominal),
          recebido_em: baixado ? dataISO(t.dataBaixa) : null,
          bruto: t,
          sincronizado_em: agora,
        };
      });
    await emLotes(linhasTitulos, (l) => sb.from("titulos_receber").upsert(l, { onConflict: "flow_id" }));
    const idsTitulos = new Set(linhasTitulos.map((t) => t.flow_id));
    const titulosAntigos = await lerTudo(sb, "titulos_receber", "flow_id");
    const titulosRemover = titulosAntigos.map((t: any) => t.flow_id).filter((id: string) => !idsTitulos.has(id));
    await emLotes(titulosRemover, (l) => sb.from("titulos_receber").delete().in("flow_id", l));

    const resumo = {
      pedidos: linhasPedidos.length, itens: itens.length, ordens: linhasOS.length,
      notas: notas.size, notasProduto: documentos.length, clientes: clientes.length, notasSemCerteza: ambiguas, titulos: linhasTitulos.length,
    };
    await sb.from("sincronizacoes").update({
      terminada_em: new Date().toISOString(), sucesso: true,
      registros: resumo.pedidos + resumo.ordens + resumo.notas + resumo.titulos,
    }).eq("id", registro.id);
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    const erro = String((e as Error)?.message ?? e).slice(0, 500);
    await sb.from("sincronizacoes").update({ terminada_em: new Date().toISOString(), sucesso: false, erro }).eq("id", registro.id);
    return Response.json({ ok: false, erro }, { status: 500 });
  }
});
