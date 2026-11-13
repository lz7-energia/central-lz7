import Link from "next/link";
import { carregarListas } from "@/lib/rh-dados";
import { FormVaga } from "../../Componentes";

export const metadata = { title: "Nova vaga" };
export const dynamic = "force-dynamic";

export default async function NovaVaga() {
  const { perguntas } = await carregarListas();
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/rh">← Vagas</Link></p>
      <h1>Nova vaga</h1>
      <FormVaga vaga={null} perguntas={perguntas} />
    </>
  );
}
