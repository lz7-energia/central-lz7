import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { carregarListas } from "@/lib/rh-dados";
import { tituloVaga, type Candidato, type Vaga } from "@/lib/rh";
import { procurarRepetidos } from "../../acoes";
import { PainelCandidato } from "../../Componentes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await (await supabaseUsuario()).from("rh_candidatos").select("nome").eq("id", id).maybeSingle();
  return { title: data?.nome ?? "Candidato" };
}

export default async function PaginaCandidato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const cand = c as Candidato;
  const [{ data: v }, listas, repetidos] = await Promise.all([
    sb.from("rh_vagas").select("*").eq("id", cand.vaga_id).single(),
    carregarListas(),
    procurarRepetidos(cand.whatsapp ?? "", cand.email ?? "", cand.id),
  ]);
  const vaga = v as Vaga;
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href={`/rh/vagas/${vaga.id}`}>← {vaga.quantidade} {vaga.quantidade === 1 ? "vaga" : "vagas"} {tituloVaga(vaga)}</Link></p>
      <h1>{cand.nome}</h1>
      <PainelCandidato c={cand} vaga={vaga} repetidos={repetidos} {...listas} />
    </>
  );
}
