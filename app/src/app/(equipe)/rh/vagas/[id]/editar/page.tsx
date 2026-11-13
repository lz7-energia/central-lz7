import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { carregarListas } from "@/lib/rh-dados";
import { tituloVaga, type Vaga } from "@/lib/rh";
import { FormVaga } from "../../../Componentes";

export const metadata = { title: "Editar vaga" };
export const dynamic = "force-dynamic";

export default async function EditarVaga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const [{ data }, { perguntas }] = await Promise.all([sb.from("rh_vagas").select("*").eq("id", id).maybeSingle(), carregarListas()]);
  if (!data) notFound();
  const vaga = data as Vaga;
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href={`/rh/vagas/${vaga.id}`}>← {tituloVaga(vaga)}</Link></p>
      <h1>Editar vaga</h1>
      <FormVaga vaga={vaga} perguntas={perguntas} />
    </>
  );
}
