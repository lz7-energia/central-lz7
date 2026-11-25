import type { Metadata } from "next";
import type React from "react";
import Link from "next/link";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS_OBRAS, IconeAreaObras } from "@/lib/areas-obras";
import { cumprimento, dataPorExtenso } from "@/lib/resumo";
import { aplicarOrdem, type OrdemTela } from "@/lib/ordem";
import { meuDia } from "@/lib/meu-dia";
import { AtalhoPlanner, MeuDia } from "@/components/MeuDia";
import { Reordenar } from "../../(equipe)/inicio/Reordenar";
import { resumoObras } from "@/lib/obras-resumo";

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
  const [dia, r] = await Promise.all([perfil ? meuDia(perfil.id, { soPlanner: true }) : Promise.resolve([]), resumoObras(sb)]);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const numeros: Record<string, React.ReactNode> = {
    compras: <span className="mudo">Em breve</span>,
    logistica: (<>
      <span className={r.logistica.atrasadas ? "atrasado" : ""}><strong>{r.logistica.atrasadas}</strong> {r.logistica.atrasadas === 1 ? "entrega atrasada" : "entregas atrasadas"}</span>
      <span className={r.logistica.semPrevisao ? "destaque" : ""}><strong>{r.logistica.semPrevisao}</strong> sem previsão de entrega</span>
    </>),
    obras: (<>
      <span className={r.obras.aAgendar ? "destaque" : ""}><strong>{r.obras.aAgendar}</strong> {r.obras.aAgendar === 1 ? "obra a agendar" : "obras a agendar"}</span>
      <span className={r.obras.atrasadas ? "atrasado" : ""}><strong>{r.obras.atrasadas}</strong> {r.obras.atrasadas === 1 ? "instalação atrasada" : "instalações atrasadas"}</span>
      {!!r.obras.avisosFlow && <span className="destaque"><strong>{r.obras.avisosFlow}</strong> com aviso do Flow</span>}
    </>),
  };

  return (
    <>
      <div className="saudacao">
        <p className="mudo">{dataPorExtenso()}</p>
        <h1>{cumprimento()}, {perfil?.nome.split(" ")[0] ?? ""}!</h1>
        <p className="sub">Central de Obras: compras, logística e obras.</p>
      </div>
      <a href="/obras/cronograma" className="atalho-cronograma">
        <span className="ac-icone" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 3v3M16 3v3" /><path d="M7 13.5h4M13 13.5h4M7 17h4" /></svg>
        </span>
        <span className="ac-texto">
          <strong>Cronograma de instalação</strong>
          <span className="mudo">Entregas da logística e instalações das obras no mesmo calendário, com filtros e lista de projetos</span>
        </span>
        <span className="ac-numeros">
          <span><strong>{r.instSemana}</strong> {r.instSemana === 1 ? "instalação" : "instalações"} nesta semana</span>
          <span><strong>{r.entSemana}</strong> {r.entSemana === 1 ? "entrega prevista" : "entregas previstas"}</span>
          <span className="mudo">{plural(r.abertas, "obra em aberto", "obras em aberto")}</span>
        </span>
        <span className="ap-seta" aria-hidden="true">→</span>
      </a>
      <AtalhoPlanner avisos={avisos ?? []} />
      <MeuDia itens={dia} />

      <Reordenar lugar="central-obras" className="grade-areas grade-obras" itens={areas.map((a) => ({
        chave: a.id, rotulo: a.nome, conteudo: (
          <Link href={`/obras/${a.id}`} className={`cartao-area area-o-${a.id}`}>
            <div className="ca-icone"><IconeAreaObras id={a.id} /></div>
            <div className="ca-nome">{a.nome}</div>
            <div className="ca-desc">{a.descricao}</div>
            <div className="ca-numeros">{numeros[a.id]}</div>
            <span className="ca-ir" aria-hidden="true">→</span>
          </Link>
        ),
      }))} />
    </>
  );
}
