import type { Metadata } from "next";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import type { Atualizacao, Recebivel, Situacao } from "@/lib/recebiveis";
import { dataHora, hojeSP } from "@/lib/formato";
import { Tabela } from "./Tabela";
import { todasAsLinhas } from "@/lib/paginar";

export const metadata: Metadata = { title: "Recebíveis" };
export const dynamic = "force-dynamic";

export default async function Recebiveis() {
  const perfil = await perfilAtual();
  const sb = await supabaseUsuario();
  const hoje = hojeSP();

  const [{ data, error }, { data: atualizacoes }, { data: sinc }, { data: sits }] = await Promise.all([
    todasAsLinhas<Recebivel>((de, ate) => sb.from("recebiveis").select("*").order("flow_id").range(de, ate)),
    sb.from("cobranca_atualizacoes").select("*").order("concluida_em", { ascending: false }).limit(6),
    sb.from("titulos_receber").select("sincronizado_em").order("sincronizado_em", { ascending: false }).limit(1),
    sb.from("cobranca_situacoes").select("*").order("ordem").order("rotulo"),
  ]);
  const titulos = data;
  const historico = (atualizacoes ?? []) as Atualizacao[];
  const ultima = historico[0];

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Recebíveis e inadimplência</h1>
          <p className="sub">Títulos do Contas a Receber do Flow, com as anotações de cobrança da equipe.</p>
        </div>
        <p className="pequeno mudo" style={{ margin: 0 }}>
          {sinc?.[0] ? `Dados do Flow de ${dataHora(sinc[0].sincronizado_em)}` : "Sem dados do Flow ainda"}
        </p>
      </div>
      {error && <div className="erro">Não foi possível carregar os títulos.</div>}
      <div className={`faixa-atualizacao${ultima ? "" : " pendente"}`}>
        {ultima ? (
          <>
            <strong>Última atualização concluída:</strong> {dataHora(ultima.concluida_em)} por {ultima.concluida_por}
            {ultima.observacao && <span className="mudo"> — “{ultima.observacao}”</span>}
          </>
        ) : (
          <strong>Nenhuma atualização concluída ainda.</strong>
        )}
      </div>
      <Tabela titulos={titulos} historico={historico} situacoes={(sits ?? []) as Situacao[]} podeEditar={!!perfil} hoje={hoje} />
    </>
  );
}
