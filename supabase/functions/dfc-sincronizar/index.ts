// Central LZ7 — DFC realizado: copia do Flow os títulos BAIXADOS do contas a pagar e a receber, com o rateio.
// SOMENTE LEITURA no Flow (só GET). Endereços confirmados em 23/11/2026 (explorador do DFC):
//   pagars/?carregarValor&carregarFornecedor&carregarNatureza&carregarCentroCusto&carregarBanco  → lista (sem valor pago, juros, OS)
//   pagars/{id}  → detalhe: valorpago, juros, multa, desconto, idOrdemServico, codigoProjeto, historicoEmissaoObservacao, rateios[]
//   recebers/?carregarNatureza&carregarCentroCusto&carregarBanco → lista já com valor recebido; recebers/{id} só para o rateio
//   naturezas/ (com grupo), centrosCusto/
// O Flow não filtra por data na lista: cada rodada lê as listas inteiras (como a sincronização principal) e só abre o detalhe
// de títulos novos ou que mudaram (assinatura), com limite de tempo por rodada; a primeira carga termina em algumas rodadas.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = (Deno.env.get("FLOW_API_BASE_URL") ?? "https://api.flow2.com.br/v1").replace(/\/$/, "");
const TOKEN = Deno.env.get("FLOW_API_TOKEN") ?? "";
const PAGINA = 100;
const TEMPO_DETALHES_MS = 80_000;  // tempo máximo abrindo detalhes por rodada
const INTERVALO_MINIMO_MIN = 10;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function dataISO(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100) / 100);
const txt = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

async function flow(caminho: string): Promise<any> {
  // Tenta de novo em erro de rede (conexão caída) e em 429/5xx, com pausa crescente.
  for (let tentativa = 1; ; tentativa++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}/${caminho}`, { method: "GET", headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
    } catch (e) {
      if (tentativa < 4) { await espera(1500 * tentativa); continue; }
      throw new Error(`Flow ${caminho.split("?")[0]}: sem conexão (${String((e as Error)?.message ?? e).slice(0, 80)})`);
    }
    if (r.ok) return await r.json();
    if (tentativa < 4 && (r.status === 429 || r.status >= 500)) { await espera(2000 * tentativa); continue; }
    throw new Error(`Flow ${caminho.split("?")[0]}: HTTP ${r.status}`);
  }
}
async function todos(recurso: string, extra = ""): Promise<any[]> {
  const itens: any[] = [];
  for (let skip = 0; ; ) {
    const p = await flow(`${recurso}/?pageSize=${PAGINA}&skip=${skip}${extra}`);
    const lote: any[] = p?.itens ?? (Array.isArray(p) ? p : []);
    itens.push(...lote);
    skip += lote.length;
    if (!lote.length || !p?.itens || skip >= Number(p?.totalRecords ?? 0) || skip > 200_000) break;
  }
  return itens;
}
async function emLotes<T>(linhas: T[], fazer: (lote: T[]) => Promise<{ error: any }>) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await fazer(linhas.slice(i, i + 500));
    if (error) throw new Error(error.message ?? String(error));
  }
}

/** O que, na lista, indica que o título mudou (e o detalhe precisa ser lido de novo). */
export const assinatura = (t: any) =>
  JSON.stringify([dataISO(t.dataBaixa), num(t.valor ?? t.valorBruto), num(t.valorRecebido), !!t.temRateio, t.natureza?.id ?? null,
    t.centroCusto?.id ?? null, t.banco?.id ?? null, (t.fornecedor ?? t.cliente)?.id ?? t.idCliente ?? null]);

/** Linha da tabela a partir da lista (+ detalhe, quando lido). */
export function linhaTitulo(tipo: "pagar" | "receber", l: any, d: any | null, agora: string) {
  const pessoa = tipo === "pagar" ? l.fornecedor : (l.cliente ?? d?.cliente);
  const fonte = d ?? {};
  const competencia = (fonte.anoCompetencia ?? l.anoCompetencia) && (fonte.mesCompetencia ?? l.mesCompetencia)
    ? `${fonte.anoCompetencia ?? l.anoCompetencia}-${String(fonte.mesCompetencia ?? l.mesCompetencia).padStart(2, "0")}` : null;
  return {
    tipo, flow_id: String(l.id),
    numero: txt(l.numero ?? fonte.numero), parcela: l.parcela ?? fonte.parcela ?? null,
    data_baixa: dataISO(l.dataBaixa ?? fonte.dataBaixa),
    data_vencimento: dataISO(l.dataVencimentoReal ?? fonte.dataVencimentoReal),
    competencia,
    valor: tipo === "pagar" ? num(fonte.valor ?? l.valor) : num(l.valorBruto ?? fonte.valorBruto ?? fonte.valor),
    valor_pago: tipo === "pagar" ? num(fonte.valorpago ?? fonte.valorPago ?? l.valorPago) : num(l.valorRecebido ?? fonte.valorRecebido),
    juros: num(fonte.juros ?? l.juros), multa: num(fonte.multa ?? l.multa), desconto: num(fonte.desconto ?? l.desconto),
    pessoa_id: pessoa?.id != null ? String(pessoa.id) : (fonte.idFornecedor ?? fonte.idCliente ?? l.idCliente ?? null)?.toString() ?? null,
    pessoa: txt(pessoa?.apelido ?? pessoa?.nomeRazaoSocial),
    pessoa_razao: txt(pessoa?.nomeRazaoSocial),
    descricao: txt(tipo === "pagar" ? (fonte.historicoEmissaoObservacao ?? l.historicoEmissaoObservacao) : (l.historicoEmissao ?? fonte.historicoEmissao)),
    historico_baixa: txt(l.historicoBaixa ?? fonte.historicoBaixa),
    natureza_id: l.natureza?.id ?? fonte.idNatureza ?? null,
    centro_id: l.centroCusto?.id ?? fonte.idCentroCusto ?? fonte.idCentroReceita ?? null,
    banco: txt(l.banco?.apelido ?? l.banco?.nome),
    os: (fonte.idOrdemServico ?? l.idOrdemServico ?? l.ordemServico?.id) != null ? String(fonte.idOrdemServico ?? l.idOrdemServico ?? l.ordemServico?.id) : null,
    codigo_projeto: txt(fonte.codigoProjeto ?? l.codigoProjeto ?? fonte.obraProjeto ?? l.obraProjeto),
    tem_rateio: !!(l.temRateio ?? fonte.temRateio),
    detalhado: !!d,
    assinatura: assinatura(l),
    bruto: { lista: l, detalhe: d },
    sincronizado_em: agora,
  };
}

const baixado = (tipo: string, l: any) => (tipo === "pagar" ? l.baixado === true : l.situacao === "Baixado") && !!dataISO(l.dataBaixa);

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!TOKEN) return Response.json({ erro: "FLOW_API_TOKEN não configurado" }, { status: 500 });

  const desde = new Date(Date.now() - INTERVALO_MINIMO_MIN * 60_000).toISOString();
  const { data: recentes } = await sb.from("sincronizacoes").select("id").eq("recurso", "dfc").gte("iniciada_em", desde).is("sucesso", null).limit(1);
  if (recentes?.length) return Response.json({ ignorado: "já há uma sincronização do DFC rodando" }, { status: 429 });
  const { data: reg, error: eReg } = await sb.from("sincronizacoes").insert({ recurso: "dfc" }).select("id").single();
  if (eReg) return Response.json({ erro: eReg.message }, { status: 500 });

  try {
    const agora = new Date().toISOString();
    // 1) Cadastros
    const naturezas = await todos("naturezas");
    await emLotes(naturezas.map((n) => ({ id: n.id, descricao: n.descricao ?? `Natureza ${n.id}`, grupo_id: n.grupo?.id ?? n.idNaturezaGrupo ?? null,
      grupo: n.grupo?.descricao ?? null, pagar: n.pagar ?? null, sincronizado_em: agora })), (l) => sb.from("dfc_naturezas").upsert(l));
    const centros = await todos("centrosCusto");
    await emLotes(centros.map((c) => ({ id: c.id, codigo: txt(c.codigo), descricao: c.descricao ?? c.nome ?? `Centro ${c.id}`, sincronizado_em: agora })),
      (l) => sb.from("dfc_centros").upsert(l));

    // 2) Listas (baixados)
    const listas = {
      pagar: (await todos("pagars", "&carregarValor=true&carregarFornecedor=true&carregarNatureza=true&carregarCentroCusto=true&carregarBanco=true")).filter((l) => baixado("pagar", l)),
      receber: (await todos("recebers", "&carregarCliente=true&carregarNatureza=true&carregarCentroCusto=true&carregarBanco=true")).filter((l) => baixado("receber", l)),
    };

    // 3) O que já está no banco
    const ja = new Map<string, { assinatura: string; detalhado: boolean }>();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("dfc_titulos").select("tipo, flow_id, assinatura, detalhado").order("tipo").order("flow_id").range(de, de + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) ja.set(`${r.tipo}:${r.flow_id}`, r);
      if (!data || data.length < 1000) break;
    }

    // 4) Títulos que deixaram de estar baixados (estorno) ou sumiram do Flow: saem do DFC
    const vivos = new Set([...listas.pagar.map((l) => `pagar:${l.id}`), ...listas.receber.map((l) => `receber:${l.id}`)]);
    for (const tipo of ["pagar", "receber"] as const) {
      const sair = [...ja.keys()].filter((k) => k.startsWith(tipo + ":") && !vivos.has(k)).map((k) => k.split(":")[1]);
      for (let i = 0; i < sair.length; i += 200) {
        const { error } = await sb.from("dfc_titulos").delete().eq("tipo", tipo).in("flow_id", sair.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
    }

    // 5) Novos/mudados. Pagar sempre precisa do detalhe (valor pago, juros, OS, rateio); receber só se tiver rateio.
    const inicio = Date.now();
    let detalhes = 0, pendentes = 0, gravados = 0;
    for (const tipo of ["receber", "pagar"] as const) {
      const linhas: any[] = [], rateios: any[] = [], comRateioLidos: string[] = [];
      for (const l of listas[tipo]) {
        const atual = ja.get(`${tipo}:${l.id}`);
        const precisaDetalhe = tipo === "pagar" || !!l.temRateio;
        const mudou = !atual || atual.assinatura !== assinatura(l);
        if (!mudou && (atual!.detalhado || !precisaDetalhe)) continue;
        let d: any = null;
        if (precisaDetalhe) {
          if (Date.now() - inicio > TEMPO_DETALHES_MS) { pendentes++; if (atual) continue; }
          else {
            d = await flow(`${tipo === "pagar" ? "pagars" : "recebers"}/${l.id}`); detalhes++;
            await espera(120); // não pesar o Flow
          }
        }
        const linha = linhaTitulo(tipo, l, d, agora);
        linhas.push(linha);
        if (d) {
          comRateioLidos.push(String(l.id));
          for (const r of d.rateios ?? []) rateios.push({ tipo, flow_id: String(r.id), titulo_id: String(l.id), valor: num(r.valor) ?? 0,
            natureza_id: r.idNatureza ?? null, centro_id: r.idCentroCusto ?? r.idCentroReceita ?? null });
        }
      }
      await emLotes(linhas, (lote) => sb.from("dfc_titulos").upsert(lote, { onConflict: "tipo,flow_id" }));
      gravados += linhas.length;
      // rateio do título lido agora substitui o anterior
      for (let i = 0; i < comRateioLidos.length; i += 200) {
        const { error } = await sb.from("dfc_rateios").delete().eq("tipo", tipo).in("titulo_id", comRateioLidos.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      await emLotes(rateios, (lote) => sb.from("dfc_rateios").upsert(lote, { onConflict: "tipo,flow_id" }));
    }

    const resumo = { pagar_baixados: listas.pagar.length, receber_baixados: listas.receber.length, gravados, detalhes_lidos: detalhes, faltam_detalhes: pendentes };
    await sb.from("sincronizacoes").update({ terminada_em: new Date().toISOString(), registros: gravados, sucesso: true,
      erro: pendentes ? `Primeira carga em andamento: faltam ${pendentes} títulos (continua na próxima rodada)` : null }).eq("id", reg.id);
    return Response.json(resumo);
  } catch (e) {
    await sb.from("sincronizacoes").update({ terminada_em: new Date().toISOString(), sucesso: false, erro: String((e as Error)?.message ?? e).slice(0, 500) }).eq("id", reg.id);
    return Response.json({ erro: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
