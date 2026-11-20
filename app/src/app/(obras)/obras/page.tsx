import type { Metadata } from "next";
import Link from "next/link";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS_OBRAS, IconeAreaObras } from "@/lib/areas-obras";
import { cumprimento, dataPorExtenso } from "@/lib/resumo";
import { aplicarOrdem, type OrdemTela } from "@/lib/ordem";
import { meuDia } from "@/lib/meu-dia";
import { AtalhoPlanner, MeuDia } from "@/components/MeuDia";
import { Reordenar } from "../../(equipe)/inicio/Reordenar";

export const metadata: Metadata = { title: "Central de Obras" };
export const dynamic = "force-dynamic";

export default async function InicioObras() {
  const sb = await supabaseUsuario();
  const [perfil, { data: avisos }, { data: tela }] = await Promise.all([
    perfilAtual(),
    sb.from("planner_avisos").select("id, texto").is("lido_em", null).order("criado_em", { ascending: false }).limit(5),
    sb.from("tela_ordem").select("ordem").maybeSingle(),
  ]);
  const areas = aplicarOrdem(AREAS_OBRAS, (tela?.ordem as OrdemTela | undefined)?.obras, (a) => a.id);
  const dia = perfil ? await meuDia(perfil.id, { soPlanner: true }) : [];

  return (
    <>
      <div className="saudacao">
        <p className="mudo">{dataPorExtenso()}</p>
        <h1>{cumprimento()}, {perfil?.nome.split(" ")[0] ?? ""}!</h1>
        <p className="sub">Central de Obras: compras, logística e obras.</p>
      </div>
      <AtalhoPlanner avisos={avisos ?? []} />
      <MeuDia itens={dia} />

      <Reordenar lugar="central-obras" className="grade-areas grade-obras" itens={areas.map((a) => ({
        chave: a.id, rotulo: a.nome, conteudo: (
          <Link href={`/obras/${a.id}`} className={`cartao-area area-o-${a.id}`}>
            <div className="ca-icone"><IconeAreaObras id={a.id} /></div>
            <div className="ca-nome">{a.nome}</div>
            <div className="ca-desc">{a.descricao}</div>
            <div className="ca-numeros"><span className="mudo">{a.modulos.length} módulos em construção</span></div>
            <span className="ca-ir" aria-hidden="true">→</span>
          </Link>
        ),
      }))} />
    </>
  );
}
