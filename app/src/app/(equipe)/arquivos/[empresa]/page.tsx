import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarArquivos } from "@/lib/arquivos-dados";
import { perfilAtual } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formato";
import { DadosUnidade, DocLinha, EnviarArquivos, NovaUnidade } from "../Componentes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documentos da empresa" };

export default async function Empresa({ params, searchParams }: { params: Promise<{ empresa: string }>; searchParams: Promise<{ u?: string }> }) {
  const [{ empresa }, { u: uParam }] = await Promise.all([params, searchParams]);
  const [{ empresas, unidades, tipos, documentos, pessoas }, perfil] = await Promise.all([carregarArquivos(), perfilAtual()]);
  const e = empresas.find((x) => x.id === empresa);
  if (!e) notFound();
  const us = unidades.filter((x) => x.empresa_id === e.id);
  const u = us.find((x) => x.id === uParam) ?? us[0];
  const hoje = hojeSP();
  const admin = perfil?.papel === "admin";
  const docs = u ? documentos.filter((d) => d.unidade_id === u.id) : [];
  const porTipo = [...tipos, { id: "", nome: "Sem tipo", restrito: false, ordem: 99 }]
    .map((t) => ({ t, l: docs.filter((d) => (d.tipo_id ?? "") === t.id) }))
    .filter((g) => g.l.length);

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/arquivos">← Documentos da empresa</Link></p>
      <div className="empresa-topo" style={{ ["--cor-emp" as string]: e.cor, ["--texto-emp" as string]: e.texto }}>
        <h1>{e.nome}{u && !u.unica ? <span className="et-unidade"> · {u.nome}</span> : null}</h1>
      </div>
      {!(us.length === 1 && us[0].unica) && (
        <nav className="abas-unidade" aria-label="Unidades">
          {us.map((x) => (
            <Link key={x.id} href={`/arquivos/${e.id}?u=${x.id}`} className={`aba-unidade${x.id === u?.id ? " ativa" : ""}`}>{x.nome}</Link>
          ))}
          <NovaUnidade empresaId={e.id} />
        </nav>
      )}
      {us.length === 1 && us[0].unica && <div className="abas-unidade"><NovaUnidade empresaId={e.id} /></div>}

      {u && (
        <div className="empresa-grade">
          <div className="empresa-col">
            <DadosUnidade key={u.id} u={u} />
            <EnviarArquivos unidadeId={u.id} tipos={tipos} />
          </div>
          <section className="cartao">
            <h2>Documentos ({docs.length})</h2>
            {porTipo.length === 0 && <p className="mudo">Nenhum documento ainda. Envie ao lado.</p>}
            {porTipo.map(({ t, l }) => (
              <div key={t.id || "sem"} className="grupo-tipo">
                <h3>{t.nome}{t.restrito ? " 🔒" : ""} <span className="mudo pequeno">({l.length})</span></h3>
                {l.map((d) => <DocLinha key={d.id} doc={d} tipos={tipos} empresas={empresas} unidades={unidades} pessoas={pessoas} hoje={hoje} admin={admin} />)}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
