import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { carregarListas } from "@/lib/rh-dados";
import { ETAPAS, diasEntre, tituloVaga, type Candidato, type Vaga } from "@/lib/rh";
import { hojeSP } from "@/lib/formato";
import { BotaoFecharVaga, CartaoCandidato, NovoCandidato } from "../../Componentes";

export const dynamic = "force-dynamic";
const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await (await supabaseUsuario()).from("rh_vagas").select("cargo, area, local").eq("id", id).maybeSingle();
  return { title: data ? tituloVaga(data) : "Vaga" };
}

export default async function PaginaVaga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const [{ data: v }, { data: cs }, { canais, motivos }] = await Promise.all([
    sb.from("rh_vagas").select("*").eq("id", id).maybeSingle(),
    sb.from("rh_candidatos").select("*").eq("vaga_id", id).order("criado_em"),
    carregarListas(),
  ]);
  if (!v) notFound();
  const vaga = v as Vaga;
  const candidatos = (cs ?? []) as Candidato[];
  const hoje = hojeSP();
  const dias = Math.max(0, diasEntre(vaga.aberta_em, vaga.fechada_em ?? hoje));
  const atrasada = !vaga.fechada_em && vaga.previsao && vaga.previsao < hoje;
  const preenchidas = candidatos.filter((c) => c.etapa === "aprovado").length;
  const nomeCanal = (cid: number | null) => canais.find((c) => c.id === cid)?.nome ?? null;

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/rh">← Vagas</Link></p>
      <div className="arq-topo">
        <div>
          <h1>{vaga.quantidade} {vaga.quantidade === 1 ? "vaga" : "vagas"} {tituloVaga(vaga)}</h1>
          <p className="mudo" style={{ margin: 0 }}>
            Aberta em {br(vaga.aberta_em)} ({dias} dias) · <span className={atrasada ? "atrasado" : ""}>previsão {br(vaga.previsao)}</span>
            {vaga.gestor ? ` · gestor ${vaga.gestor}` : ""} · {vaga.contrato} · {preenchidas}/{vaga.quantidade} preenchidas
            {vaga.fechada_em ? ` · fechada em ${br(vaga.fechada_em)}` : ""}
          </p>
        </div>
        <div className="acoes">
          <Link href={`/rh/vagas/${vaga.id}/editar`} className="botao secundario pequeno">Editar vaga</Link>
          <BotaoFecharVaga id={vaga.id} fechada={!!vaga.fechada_em} />
        </div>
      </div>
      {vaga.descricao && <p className="pequeno" style={{ whiteSpace: "pre-wrap" }}>{vaga.descricao}</p>}
      <div style={{ margin: "16px 0" }}><NovoCandidato vagaId={vaga.id} canais={canais} motivos={motivos} /></div>
      <div className="funil">
        {ETAPAS.map((e) => {
          const col = candidatos.filter((c) => c.etapa === e.id);
          return (
            <div key={e.id} className="funil-col">
              <div className="funil-topo" style={{ borderTopColor: e.cor }}><span>{e.nome}</span><strong>{col.length}</strong></div>
              {col.map((c) => <CartaoCandidato key={c.id} c={c} canal={nomeCanal(c.canal_id)} />)}
              {col.length === 0 && <p className="mudo pequeno" style={{ textAlign: "center" }}>—</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
