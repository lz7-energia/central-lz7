import Link from "next/link";
import { carregarListas } from "@/lib/rh-dados";
import { ListaEditavel } from "../Componentes";

export const metadata = { title: "Configurações do recrutamento" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const { perguntas, motivos, canais, mensagens } = await carregarListas();
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/rh">← Vagas</Link></p>
      <h1>Configurações do recrutamento</h1>
      <div className="config-grade">
        <ListaEditavel tabela="rh_perguntas" titulo="Perguntas da triagem" itens={perguntas} ajuda="Lista geral. Cada vaga escolhe quais usa; “já vem marcada” = sugerida em vaga nova." />
        <ListaEditavel tabela="rh_mensagens" titulo="Mensagens de WhatsApp" itens={mensagens} ajuda="Use {nome}, {vaga}, {cidade} e {entrevista}: o site troca pelos dados do candidato." />
        <ListaEditavel tabela="rh_motivos" titulo="Motivos de não aprovação" itens={motivos} />
        <ListaEditavel tabela="rh_canais" titulo="Como o candidato chegou" itens={canais} ajuda="Marque “é indicação” para pedir quem indicou e controlar o bônus de 3 meses." />
      </div>
    </>
  );
}
