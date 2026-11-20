import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { IconeModulo } from "@/lib/areas";
import { areaObrasPorId, IconeAreaObras } from "@/lib/areas-obras";
import { aplicarOrdem, chaveModulo, type OrdemTela } from "@/lib/ordem";
import { Reordenar } from "../../../(equipe)/inicio/Reordenar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  return { title: areaObrasPorId(area)?.nome ?? "Obras" };
}

export default async function AreaObras({ params }: { params: Promise<{ area: string }> }) {
  const { area: id } = await params;
  const area = areaObrasPorId(id);
  if (!area) notFound();
  const sb = await supabaseUsuario();
  const { data: tela } = await sb.from("tela_ordem").select("ordem").maybeSingle();
  const modulos = aplicarOrdem(area.modulos, (tela?.ordem as OrdemTela | undefined)?.modulos?.[`obras-${area.id}`], chaveModulo);

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/obras">← Início</Link></p>
      <div className={`cabecalho-area area-o-${area.id}`}>
        <div className="ca-icone"><IconeAreaObras id={area.id} /></div>
        <div>
          <h1>{area.nome}</h1>
          <p className="sub">{area.descricao}</p>
        </div>
      </div>
      <Reordenar lugar={`obras-${area.id}`} className={`grade-modulos area-o-${area.id}`} titulo={<h2 style={{ margin: 0 }}>Módulos</h2>}
        itens={modulos.map((m) => ({ chave: chaveModulo(m), rotulo: m.nome, conteudo: m.href ? (
          <Link href={m.href} className="modulo">
            <span className="mod-icone"><IconeModulo id={m.icone} /></span>
            <strong>{m.nome}</strong>
            <span>{m.descricao}</span>
          </Link>
        ) : (
          <div className="modulo em-breve" aria-disabled="true">
            <span className="mod-icone"><IconeModulo id={m.icone} /></span>
            <strong>{m.nome} <span className="etiqueta cinza">em breve</span></strong>
            <span>{m.descricao}</span>
          </div>
        ) }))} />
    </>
  );
}
