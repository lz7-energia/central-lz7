import type { Metadata } from "next";
import Link from "next/link";
import { supabaseUsuario } from "@/lib/supabase/server";
import type { Campo } from "@/lib/tipos";
import { EditorTipo, BotoesTipo } from "./Componentes";

export const metadata: Metadata = { title: "Tipos de pedido" };
export const dynamic = "force-dynamic";

type Tipo = { id: number; setor_id: string; nome: string; prazo_dias: number; campos: Campo[]; ativo: boolean; ordem: number };

export default async function TiposPedido({ searchParams }: { searchParams: Promise<{ editar?: string; novo?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseUsuario();
  const [{ data: setores }, { data: tipos }] = await Promise.all([
    sb.from("setores").select("id, nome").order("ordem"),
    sb.from("tipos_pedido").select("id, setor_id, nome, prazo_dias, campos, ativo, ordem").order("ordem").order("nome"),
  ]);
  const lista = (tipos ?? []) as Tipo[];
  const editando = sp.editar ? lista.find((t) => t.id === Number(sp.editar)) : null;
  const novoSetor = sp.novo && (setores ?? []).some((s) => s.id === sp.novo) ? sp.novo : null;

  if (editando || novoSetor) {
    return (
      <>
        <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/pedidos/tipos">← Tipos de pedido</Link></p>
        <h1>{editando ? `Editar: ${editando.nome}` : "Novo tipo de pedido"}</h1>
        <EditorTipo setores={setores ?? []} tipo={editando ?? null} setorInicial={novoSetor ?? editando?.setor_id ?? ""} />
      </>
    );
  }

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/pedidos">← Pedidos</Link></p>
      <div className="cabecalho">
        <div>
          <h1>Tipos de pedido</h1>
          <p className="sub">O que cada setor recebe pelo portal e as perguntas de cada tipo.</p>
        </div>
      </div>
      {(setores ?? []).map((s) => {
        const ativos = lista.filter((t) => t.setor_id === s.id && t.ativo);
        const fora = lista.filter((t) => t.setor_id === s.id && !t.ativo);
        return (
          <section key={s.id} className="cartao">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0 }}>{s.nome}</h2>
              <Link href={`/pedidos/tipos?novo=${s.id}`} className="botao pequeno">+ Novo tipo</Link>
            </div>
            {ativos.length === 0 && <p className="mudo pequeno">Nenhum tipo neste setor.</p>}
            <ul className="tipos-lista">
              {ativos.map((t) => (
                <li key={t.id}>
                  <div>
                    <strong>{t.nome}</strong>
                    <div className="mudo pequeno">{t.campos.length} pergunta(s) · prazo padrão {t.prazo_dias} dia(s)</div>
                  </div>
                  <BotoesTipo id={t.id} nome={t.nome} />
                </li>
              ))}
            </ul>
            {fora.length > 0 && (
              <details className="pequeno" style={{ marginTop: 8 }}>
                <summary className="mudo">Fora do portal ({fora.length})</summary>
                <ul className="tipos-lista">
                  {fora.map((t) => <li key={t.id}><span className="mudo">{t.nome}</span><BotoesTipo id={t.id} nome={t.nome} fora /></li>)}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}
