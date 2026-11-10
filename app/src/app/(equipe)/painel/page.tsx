import type { Metadata } from "next";
import { supabaseUsuario } from "@/lib/supabase/server";
import type { LinhaPainel } from "@/lib/tipos";
import { dataHora } from "@/lib/formato";
import { Quadro } from "./Quadro";

export const metadata: Metadata = { title: "Faturamento" };

export default async function Painel() {
  const sb = await supabaseUsuario();
  const [{ data, error }, { data: ultimas }] = await Promise.all([
    sb.from("painel_faturamento").select("*").limit(5000),
    sb.from("sincronizacoes").select("recurso, terminada_em, sucesso, erro").order("iniciada_em", { ascending: false }).limit(20),
  ]);
  const linhas = (data ?? []) as LinhaPainel[];
  const ultimaOk = (ultimas ?? []).find((s) => s.sucesso);
  const ultimaFalha = (ultimas ?? [])[0]?.sucesso === false ? ultimas![0] : null;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Painel de faturamento</h1>
          <p className="sub">Pedidos de venda do Flow, da execução ao recebimento.</p>
        </div>
        <p className="pequeno mudo" style={{ margin: 0 }}>
          {ultimaOk ? `Dados do Flow de ${dataHora(ultimaOk.terminada_em)}` : "Sincronização com o Flow ainda não configurada"}
        </p>
      </div>
      {ultimaFalha && (
        <div className="erro">
          A última sincronização com o Flow ({ultimaFalha.recurso}) falhou. Os dados podem estar desatualizados.
        </div>
      )}
      {error && <div className="erro">Não foi possível carregar o painel.</div>}
      <Quadro linhas={linhas} />
    </>
  );
}
