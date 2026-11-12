import type { Metadata } from "next";
import Link from "next/link";
import { carregarArquivos } from "@/lib/arquivos-dados";
import { perfilAtual } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formato";
import { DocLinha, EnviarArquivos } from "../Componentes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A classificar" };

export default async function AClassificar() {
  const [{ empresas, unidades, tipos, documentos, pessoas }, perfil] = await Promise.all([carregarArquivos(), perfilAtual()]);
  const soltos = documentos.filter((d) => !d.unidade_id);
  const hoje = hojeSP();
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/arquivos">← Documentos da empresa</Link></p>
      <h1>A classificar</h1>
      <p className="sub">Jogue aqui vários arquivos de uma vez e depois escolha a empresa, a unidade e o tipo de cada um em <strong>Editar</strong>.</p>
      <div className="empresa-grade">
        <div className="empresa-col"><EnviarArquivos unidadeId={null} tipos={tipos} titulo="Enviar para classificar" /></div>
        <section className="cartao">
          <h2>Esperando classificação ({soltos.length})</h2>
          {soltos.length ? soltos.map((d) => (
            <DocLinha key={d.id} doc={d} tipos={tipos} empresas={empresas} unidades={unidades} pessoas={pessoas} hoje={hoje} admin={perfil?.papel === "admin"} />
          )) : <p className="mudo">Nada para classificar. 👌</p>}
        </section>
      </div>
    </>
  );
}
