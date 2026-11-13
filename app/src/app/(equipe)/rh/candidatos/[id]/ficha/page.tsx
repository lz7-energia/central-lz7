import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { carregarListas } from "@/lib/rh-dados";
import { dataHoraEntrevista, nomeEtapa, tituloVaga, type Candidato, type Vaga } from "@/lib/rh";
import { Imprimir } from "./Imprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha do candidato" };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const cand = c as Candidato;
  const [{ data: v }, { perguntas, canais }] = await Promise.all([sb.from("rh_vagas").select("*").eq("id", cand.vaga_id).single(), carregarListas()]);
  const vaga = v as Vaga;
  const canal = canais.find((x) => x.id === cand.canal_id)?.nome;
  const respondidas = vaga.perguntas.map((pid) => perguntas.find((p) => p.id === pid)).filter(Boolean);
  return (
    <div className="ficha">
      <Imprimir />
      <header className="ficha-topo">
        <div><div className="mudo pequeno">Ficha do candidato · {tituloVaga(vaga)}</div><h1>{cand.nome}</h1></div>
        <img src="/icon.png" alt="" width={44} height={44} />
      </header>
      <table className="ficha-dados">
        <tbody>
          <tr><th>WhatsApp</th><td>{cand.whatsapp || "—"}</td><th>E-mail</th><td>{cand.email || "—"}</td></tr>
          <tr><th>Cidade</th><td>{cand.cidade || "—"}</td><th>Como chegou</th><td>{canal || "—"}{cand.indicado_por ? ` — ${cand.indicado_por}` : ""}</td></tr>
          <tr><th>Entrevista</th><td>{cand.entrevista_em ? dataHoraEntrevista(cand.entrevista_em) : "—"}</td><th>Etapa</th><td>{nomeEtapa(cand.etapa)}</td></tr>
          <tr><th>Nota da recrutadora</th><td colSpan={3}>{cand.nota ? `${"★".repeat(cand.nota)}${"☆".repeat(5 - cand.nota)} (${cand.nota}/5)` : "—"}</td></tr>
        </tbody>
      </table>
      <h2>Triagem</h2>
      <table className="ficha-resp">
        <tbody>
          {respondidas.map((p) => <tr key={p!.id}><th>{p!.texto}</th><td>{cand.respostas?.[String(p!.id)] || "—"}</td></tr>)}
        </tbody>
      </table>
      <h2>Observações da recrutadora</h2>
      <p className="ficha-texto">{cand.observacao || "—"}</p>
      <h2>Consideração final do gestor</h2>
      <div className="ficha-linhas">{cand.consideracao_gestor || ""}</div>
      <div className="ficha-assin"><span>Gestor: {vaga.gestor || "________________"}</span><span>☐ Aprovado &nbsp; ☐ Não aprovado</span></div>
    </div>
  );
}
