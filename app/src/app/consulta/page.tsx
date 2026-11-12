import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServico } from "@/lib/supabase/servico";
import { STATUS, type StatusPedido } from "@/lib/tipos";
import { data as fmtData, dataHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Acompanhar pedido" };
export const dynamic = "force-dynamic";

type Consulta = {
  protocolo: string;
  setor: string;
  tipo: string;
  status: StatusPedido;
  criado_em: string;
  prazo: string | null;
  historico: { quando: string; tipo: string; para_status: StatusPedido | null; texto: string | null }[];
};

function descreverEvento(e: Consulta["historico"][number]) {
  if (e.tipo === "criado") return "Pedido aberto";
  if (e.tipo === "status" && e.para_status) return `Status: ${STATUS[e.para_status].rotulo}`;
  if (e.tipo === "aprovacao") return `Gestor: ${e.texto ?? ""}`;
  return e.texto ?? "";
}

export default async function ConsultaPedido({ searchParams }: { searchParams: Promise<{ p?: string; t?: string }> }) {
  const { p, t } = await searchParams;
  let pedido: Consulta | null = null;
  if (p && t && /^[0-9a-f]{48}$/.test(t)) {
    const { data } = await supabaseServico().rpc("consultar_pedido", { p_protocolo: p, p_token: t });
    pedido = (data as Consulta | null) ?? null;
  }

  return (
    <main className="pagina estreita">
      <Link href="/" className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} /> <span>Central</span>
      </Link>
      {!pedido ? (
        <div className="cartao" style={{ marginTop: 18 }}>
          <h1>Pedido não encontrado</h1>
          <p className="mudo">
            Use o link completo que você recebeu ao abrir o pedido (ele vem no e-mail de confirmação). Se perdeu o link, fale com o setor
            informando o número do protocolo.
          </p>
          <Link className="botao secundario" href="/portal">
            Abrir um novo pedido
          </Link>
        </div>
      ) : (
        <>
          <div className="cabecalho" style={{ marginTop: 18 }}>
            <div>
              <p className="mudo" style={{ margin: 0 }}>
                Protocolo
              </p>
              <div className="protocolo">{pedido.protocolo}</div>
            </div>
            <span className={`etiqueta ${STATUS[pedido.status].cor}`} style={{ fontSize: "0.9rem", padding: "4px 12px" }}>
              {STATUS[pedido.status].rotulo}
            </span>
          </div>
          <div className="cartao">
            <dl className="dados">
              <dt>Setor</dt>
              <dd>{pedido.setor}</dd>
              <dt>Tipo</dt>
              <dd>{pedido.tipo}</dd>
              <dt>Aberto em</dt>
              <dd>{dataHora(pedido.criado_em)}</dd>
              <dt>Previsão</dt>
              <dd>{pedido.prazo ? fmtData(pedido.prazo) : pedido.status === "aguardando_aprovacao" ? "Depois da aprovação" : "—"}</dd>
            </dl>
          </div>
          <div className="cartao">
            <h2>Andamento</h2>
            <ul className="historico">
              {pedido.historico.map((e, i) => (
                <li key={i}>
                  <div>{descreverEvento(e)}</div>
                  <div className="quando">{dataHora(e.quando)}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
