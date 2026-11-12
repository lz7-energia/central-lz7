import type { Metadata } from "next";
import Link from "next/link";
import { carregarArquivos } from "@/lib/arquivos-dados";
import { perfilAtual } from "@/lib/supabase/server";
import { situacao } from "@/lib/arquivos";
import { hojeSP } from "@/lib/formato";
import { DocLinha } from "./Componentes";

export const metadata: Metadata = { title: "Documentos da empresa" };
export const dynamic = "force-dynamic";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function Arquivos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [{ empresas, unidades, tipos, documentos, pessoas }, perfil] = await Promise.all([carregarArquivos(), perfilAtual()]);
  const hoje = hojeSP();
  const admin = perfil?.papel === "admin";
  const aClassificar = documentos.filter((d) => !d.unidade_id).length;
  const atencao = documentos
    .map((d) => ({ d, s: situacao(d, hoje) }))
    .filter((x) => x.d.unidade_id && x.s && x.s.tipo !== "ok")
    .sort((a, b) => a.s!.dias - b.s!.dias);

  const termo = sem(q.trim());
  const achados = termo
    ? documentos.filter((d) => {
        const u = unidades.find((x) => x.id === d.unidade_id);
        const e = empresas.find((x) => x.id === u?.empresa_id);
        const t = tipos.find((x) => x.id === d.tipo_id);
        return sem([d.titulo, d.arquivo_nome, d.observacao, u?.nome, e?.nome, t?.nome].filter(Boolean).join(" ")).includes(termo);
      })
    : [];

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/area/adm">← ADM</Link></p>
      <div className="arq-topo">
        <div>
          <h1>Documentos da empresa</h1>
          <p className="sub" style={{ marginBottom: 0 }}>Contratos, certidões, licenças e tudo mais, por empresa e unidade.</p>
        </div>
        <Link href="/arquivos/a-classificar" className="botao secundario">A classificar{aClassificar ? ` (${aClassificar})` : ""}</Link>
      </div>

      <form className="busca-arq" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar documento: locação, alvará, CNPJ, nome do arquivo…" aria-label="Buscar documento" />
        <button className="botao">Buscar</button>
        {q && <Link href="/arquivos" className="botao secundario">Limpar</Link>}
      </form>

      {q ? (
        <section className="cartao">
          <h2>{achados.length} resultado(s) para “{q}”</h2>
          {achados.length ? achados.map((d) => (
            <DocLinha key={d.id} doc={d} tipos={tipos} empresas={empresas} unidades={unidades} pessoas={pessoas} hoje={hoje} admin={admin} mostrarOnde />
          )) : <p className="mudo">Nada encontrado. Tente outra palavra.</p>}
        </section>
      ) : (
        <>
          {atencao.length > 0 && (
            <section className="cartao atencao-arq">
              <h2>Vencendo ou vencidos ({atencao.length})</h2>
              {atencao.slice(0, 8).map(({ d }) => (
                <DocLinha key={d.id} doc={d} tipos={tipos} empresas={empresas} unidades={unidades} pessoas={pessoas} hoje={hoje} admin={admin} mostrarOnde />
              ))}
            </section>
          )}
          <div className="grade-empresas">
            {empresas.map((e) => {
              const us = unidades.filter((u) => u.empresa_id === e.id);
              const docs = documentos.filter((d) => us.some((u) => u.id === d.unidade_id));
              const alerta = (ids: string[]) => docs.filter((d) => ids.includes(d.unidade_id!) && situacao(d, hoje)?.tipo !== "ok" && d.validade).length;
              const unica = us.length === 1 && us[0].unica;
              return (
                <section key={e.id} className="cartao-empresa" style={{ ["--cor-emp" as string]: e.cor, ["--texto-emp" as string]: e.texto }}>
                  <Link href={`/arquivos/${e.id}`} className="ce-topo">
                    <span className="ce-nome">{e.nome}</span>
                    <span className="ce-conta">{docs.length} documento{docs.length === 1 ? "" : "s"}</span>
                  </Link>
                  <div className="ce-corpo">
                    {unica ? (
                      <Link href={`/arquivos/${e.id}`} className="ce-unidade">
                        <span>Abrir documentos</span>
                        {alerta(us.map((u) => u.id)) > 0 && <span className="ce-alerta">⚠ {alerta(us.map((u) => u.id))} vencendo</span>}
                        <span aria-hidden="true">→</span>
                      </Link>
                    ) : us.map((u) => {
                      const n = docs.filter((d) => d.unidade_id === u.id).length, a = alerta([u.id]);
                      return (
                        <Link key={u.id} href={`/arquivos/${e.id}?u=${u.id}`} className="ce-unidade">
                          <span>{u.nome}</span>
                          <span className="mudo pequeno">{n} doc{n === 1 ? "" : "s"}</span>
                          {a > 0 && <span className="ce-alerta">⚠ {a}</span>}
                          <span aria-hidden="true">→</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
