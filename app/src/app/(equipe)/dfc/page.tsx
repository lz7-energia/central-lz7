import type { Metadata } from "next";
import { supabaseUsuario } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/paginar";
import { dataHora, hojeSP } from "@/lib/formato";
import { Dfc, type Lancamento, type SaldoBanco } from "./Dfc";

export const metadata: Metadata = { title: "Fluxo de caixa (DFC)" };
export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const diaAntes = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

export default async function PaginaDfc({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const q = await searchParams;
  const hoje = hojeSP();
  const de = q.de && DATA.test(q.de) ? q.de : hoje.slice(0, 8) + "01";
  const ate = q.ate && DATA.test(q.ate) && q.ate >= de ? q.ate : hoje;
  const sb = await supabaseUsuario();
  const [lanc, { data: resumos }, { data: sinc }] = await Promise.all([
    todasAsLinhas<Lancamento>((a, b) => sb.from("dfc_lancamentos").select("*").gte("data_baixa", de).lte("data_baixa", ate).order("chave").range(a, b)),
    sb.from("conc_docs").select("id, data").eq("colecao", "resumos"),
    sb.from("sincronizacoes").select("terminada_em, sucesso, erro").eq("recurso", "dfc").order("iniciada_em", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Saldo inicial = saldo final do extrato (conciliação) de cada banco na última conciliação que termina antes do início do período.
  const antes = diaAntes(de);
  const porBanco = new Map<string, SaldoBanco>();
  for (const r of resumos ?? []) {
    const x = r.data as { bancoId?: string; banco?: string; fim?: string; sFinE?: number | null };
    if (!x?.bancoId || !x.fim || x.fim > antes || x.sFinE == null) continue;
    const atual = porBanco.get(x.bancoId);
    if (!atual || x.fim > atual.ate) porBanco.set(x.bancoId, { banco: x.banco ?? x.bancoId, ate: x.fim, saldo: Number(x.sFinE) });
  }
  const saldos = [...porBanco.values()].sort((a, b) => a.banco.localeCompare(b.banco));

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Fluxo de caixa (DFC)</h1>
          <p className="sub">O que entrou e saiu de fato: títulos baixados no Flow, com o rateio. Saldo inicial da conciliação.</p>
        </div>
        <p className="pequeno mudo" style={{ margin: 0, textAlign: "right" }}>
          {sinc?.terminada_em ? `Dados do Flow de ${dataHora(sinc.terminada_em)}` : "Sincronização do DFC ainda não rodou"}
          {sinc?.erro && sinc.sucesso && <><br />{sinc.erro}</>}
        </p>
      </div>
      {sinc && sinc.sucesso === false && <div className="erro">A última sincronização do DFC falhou: {sinc.erro}</div>}
      {lanc.error && <div className="erro">Não foi possível carregar os lançamentos.</div>}
      <Dfc lancamentos={lanc.data} de={de} ate={ate} saldos={saldos} antes={antes} />
    </>
  );
}
