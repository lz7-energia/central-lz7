import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { areaPorId, IconeArea } from "@/lib/areas";
import { resumoDasAreas } from "@/lib/resumo";
import { STATUS, STATUS_ABERTOS, type StatusPedido } from "@/lib/tipos";
import { data as fmtData, hojeSP } from "@/lib/formato";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: areaPorId(id)?.nome ?? "Área" };
}

type Linha = {
  id: number;
  protocolo: string;
  status: StatusPedido;
  prazo: string | null;
  tipos_pedido: { nome: string } | null;
  solicitantes: { nome: string } | null;
};

export default async function PaginaArea({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const area = areaPorId(id);
  if (!area) notFound();

  const sb = await supabaseUsuario();
  const [resumo, { data }] = await Promise.all([
    resumoDasAreas(),
    sb.from("pedidos")
      .select("id, protocolo, status, prazo, tipos_pedido(nome), solicitantes(nome)")
      .eq("setor_id", area.id).in("status", STATUS_ABERTOS)
      .order("prazo", { ascending: true, nullsFirst: false }).limit(8),
  ]);
  const pedidos = (data ?? []) as unknown as Linha[];
  const r = resumo.setores[area.id] ?? { abertos: 0, atrasados: 0 };
  const hoje = hojeSP();

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}>
        <Link href="/inicio">← Início</Link>
      </p>
      <div className={`cabecalho-area area-${area.id}`}>
        <div className="ca-icone">
          <IconeArea id={area.id} tamanho={32} />
        </div>
        <div>
          <h1>{area.nome}</h1>
          <p className="sub" style={{ marginBottom: 0 }}>{area.descricao}</p>
        </div>
      </div>

      <div className="resumo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {area.id === "fiscal" && (
          <Link href="/painel" className={`indicador${resumo.prontosFaturar ? " destaque" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="rotulo">Pronto pra faturar</div>
            <div className="numero">{resumo.prontosFaturar}</div>
            <div className="detalhe">no painel de faturamento</div>
          </Link>
        )}
        <div className="indicador">
          <div className="rotulo">Pedidos em aberto</div>
          <div className="numero">{r.abertos}</div>
          <div className="detalhe">abertos pelos colaboradores</div>
        </div>
        <div className="indicador">
          <div className="rotulo">Atrasados</div>
          <div className="numero" style={r.atrasados ? { color: "var(--perigo)" } : undefined}>{r.atrasados}</div>
          <div className="detalhe">passaram do prazo</div>
        </div>
      </div>

      <h2>Módulos</h2>
      <div className="grade-modulos">
        {area.modulos.map((m) =>
          m.href ? (
            <Link key={m.nome} href={m.href} className="modulo">
              <strong>{m.nome}</strong>
              <span>{m.descricao}</span>
            </Link>
          ) : (
            <div key={m.nome} className="modulo em-breve" aria-disabled="true">
              <strong>
                {m.nome} <span className="etiqueta cinza">em breve</span>
              </strong>
              <span>{m.descricao}</span>
            </div>
          ),
        )}
      </div>

      <div className="cabecalho" style={{ marginTop: 32, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Pedidos em aberto</h2>
        <Link href={`/pedidos?setor=${area.id}`} className="pequeno">
          Ver todos →
        </Link>
      </div>
      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Pedido</th>
              <th>Solicitante</th>
              <th>Status</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={5} className="vazio">
                  Nenhum pedido em aberto. 🎉
                </td>
              </tr>
            )}
            {pedidos.map((p) => {
              const atrasado = p.prazo && p.prazo < hoje;
              return (
                <tr key={p.id}>
                  <td>
                    <Link className="linha" href={`/pedidos/${p.id}`}>
                      {p.protocolo}
                    </Link>
                  </td>
                  <td>{p.tipos_pedido?.nome}</td>
                  <td>{p.solicitantes?.nome ?? <span className="mudo">Automático</span>}</td>
                  <td>
                    <span className={`etiqueta ${STATUS[p.status].cor}`}>{STATUS[p.status].rotulo}</span>
                  </td>
                  <td className={atrasado ? "atrasado" : ""}>{fmtData(p.prazo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
