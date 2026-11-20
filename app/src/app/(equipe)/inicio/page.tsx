import type { Metadata } from "next";
import Link from "next/link";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS, IconeArea } from "@/lib/areas";
import { cumprimento, dataPorExtenso, resumoDasAreas } from "@/lib/resumo";
import { aplicarOrdem, type OrdemTela } from "@/lib/ordem";
import { Reordenar } from "./Reordenar";
import { meuDia } from "@/lib/meu-dia";
import { AtalhoPlanner, MeuDia } from "@/components/MeuDia";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function Inicio() {
  const sb = await supabaseUsuario();
  const [perfil, resumo, { data: avisos }, { data: tela }] = await Promise.all([
    perfilAtual(), resumoDasAreas(),
    sb.from("planner_avisos").select("id, texto").is("lido_em", null).order("criado_em", { ascending: false }).limit(5),
    sb.from("tela_ordem").select("ordem").maybeSingle(),
  ]);
  const areas = aplicarOrdem(AREAS, (tela?.ordem as OrdemTela | undefined)?.areas, (a) => a.id);
  const primeiroNome = perfil?.nome.split(" ")[0] ?? "";
  const dia = perfil ? await meuDia(perfil.id) : [];

  return (
    <>
      <div className="saudacao">
        <p className="mudo">{dataPorExtenso()}</p>
        <h1>
          {cumprimento()}, {primeiroNome}!
        </h1>
        <p className="sub">Escolha uma área para começar.</p>
      </div>
      <AtalhoPlanner avisos={avisos ?? []} />
      <MeuDia itens={dia} />

      <Reordenar lugar="areas" className="grade-areas" itens={areas.map((a) => {
          const r = resumo.setores[a.id] ?? { abertos: 0, atrasados: 0 };
          return { chave: a.id, rotulo: a.nome, conteudo: (
            <Link href={`/area/${a.id}`} className={`cartao-area area-${a.id}`}>
              <div className="ca-icone">
                <IconeArea id={a.id} />
              </div>
              <div className="ca-nome">{a.nome}</div>
              <div className="ca-desc">{a.descricao}</div>
              <div className="ca-numeros">
                {a.id === "fiscal" && (
                  <span className={resumo.prontosFaturar ? "destaque" : ""}>
                    <strong>{resumo.prontosFaturar}</strong> pronto{resumo.prontosFaturar === 1 ? "" : "s"} pra faturar
                  </span>
                )}
                <span>
                  <strong>{r.abertos}</strong> pedido{r.abertos === 1 ? "" : "s"} em aberto
                </span>
                {r.atrasados > 0 && (
                  <span className="atrasado">
                    <strong>{r.atrasados}</strong> atrasado{r.atrasados === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <span className="ca-ir" aria-hidden="true">
                →
              </span>
            </Link>
          ) };
        })} />
    </>
  );
}
