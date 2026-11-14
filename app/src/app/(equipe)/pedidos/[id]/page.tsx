import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { STATUS, type Campo, type StatusPedido } from "@/lib/tipos";
import { dataHora, valorCampo } from "@/lib/formato";
import { CartaoConcluir, FormAtendimento, FormComentario, FormResposta } from "./Formularios";
import { TempoReal } from "../TempoReal";

export const metadata: Metadata = { title: "Pedido" };

type Pedido = {
  id: number;
  protocolo: string;
  status: StatusPedido;
  prazo: string | null;
  criado_em: string;
  origem: string;
  dados: Record<string, string>;
  vinculo: Record<string, string>;
  responsavel_id: string | null;
  setores: { nome: string };
  tipos_pedido: { nome: string; campos: Campo[] };
  solicitantes: { nome: string; email: string | null; gestor_email: string | null } | null;
};

type Evento = {
  id: number;
  tipo: string;
  de_status: StatusPedido | null;
  para_status: StatusPedido | null;
  texto: string | null;
  autor: string | null;
  visivel_solicitante: boolean;
  criado_em: string;
};

function descrever(e: Evento) {
  switch (e.tipo) {
    case "criado":
      return "Pedido aberto";
    case "status":
      return `${e.de_status ? STATUS[e.de_status].rotulo : "—"} → ${e.para_status ? STATUS[e.para_status].rotulo : "—"}`;
    case "aprovacao":
      return `Gestor: ${e.texto}`;
    case "responsavel":
      return e.texto ? `Responsável: ${e.texto}` : "Responsável removido";
    default:
      return e.texto;
  }
}

export default async function DetalhePedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) notFound();
  const sb = await supabaseUsuario();

  const [{ data }, { data: eventos }, { data: equipe }, { data: aprovacoes }] = await Promise.all([
    sb
      .from("pedidos")
      .select(
        "id, protocolo, status, prazo, criado_em, origem, dados, vinculo, responsavel_id, setores(nome), tipos_pedido(nome, campos), solicitantes(nome, email, gestor_email)",
      )
      .eq("id", num)
      .maybeSingle(),
    sb.from("pedido_eventos").select("*").eq("pedido_id", num).order("criado_em"),
    sb.from("perfis").select("id, nome").eq("ativo", true).order("nome"),
    sb.from("aprovacoes").select("aprovador_email, expira_em, decisao, decidida_em").eq("pedido_id", num),
  ]);
  if (!data) notFound();
  const p = data as unknown as Pedido;

  // Anexos: links temporários (10 minutos) gerados com a sessão de quem está vendo.
  const links: Record<string, string> = {};
  await Promise.all(
    p.tipos_pedido.campos
      .filter((c) => c.tipo === "arquivo" && p.dados[c.chave])
      .map(async (c) => {
        const { data: s } = await sb.storage.from("anexos").createSignedUrl(p.dados[c.chave], 600);
        if (s?.signedUrl) links[c.chave] = s.signedUrl;
      }),
  );

  return (
    <>
      <TempoReal pedidoId={p.id} />
      <p className="pequeno" style={{ marginBottom: 8 }}>
        <Link href="/pedidos">← Pedidos</Link>
      </p>
      <div className="cabecalho">
        <div>
          <h1>
            {p.tipos_pedido.nome} <span className="mudo" style={{ fontWeight: 500 }}>· {p.protocolo}</span>
          </h1>
          <p className="sub">
            {p.setores.nome} · {p.origem === "automatico" ? "aberto automaticamente" : `aberto por ${p.solicitantes?.nome}`} em{" "}
            {dataHora(p.criado_em)}
          </p>
        </div>
        <span className={`etiqueta ${STATUS[p.status].cor}`} style={{ fontSize: "0.9rem", padding: "4px 12px" }}>
          {STATUS[p.status].rotulo}
        </span>
      </div>

      <div className="duas-colunas">
        <div>
          <div className="cartao">
            <h2>Dados do pedido</h2>
            <dl className="dados">
              {p.tipos_pedido.campos.map((c) => (
                <div key={c.chave} style={{ display: "contents" }}>
                  <dt>{c.rotulo}</dt>
                  <dd>
                    {c.tipo === "arquivo" ? (
                      links[c.chave] ? (
                        <a href={links[c.chave]} target="_blank" rel="noopener noreferrer">
                          Abrir anexo ({p.dados[c.chave].split("/").pop()})
                        </a>
                      ) : p.dados[c.chave] ? (
                        <span className="mudo">Anexo indisponível</span>
                      ) : (
                        "—"
                      )
                    ) : (
                      valorCampo(c.tipo, p.dados[c.chave])
                    )}
                  </dd>
                </div>
              ))}
              {p.solicitantes && (
                <>
                  <dt>Contato do solicitante</dt>
                  <dd>{p.solicitantes.email ?? "sem e-mail cadastrado"}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="cartao">
            <h2>Histórico</h2>
            <ul className="historico" style={{ marginBottom: 20 }}>
              {((eventos ?? []) as Evento[]).map((e) => (
                <li key={e.id} className={e.visivel_solicitante ? "" : "interno"}>
                  <div>{descrever(e)}</div>
                  <div className="quando">
                    {dataHora(e.criado_em)} · {e.autor ?? "Sistema"}
                    {!e.visivel_solicitante && " · interno"}
                  </div>
                </li>
              ))}
            </ul>
            <FormComentario id={p.id} />
          </div>
        </div>

        <div>
          {p.status === "aberto" && <FormResposta id={p.id} prazo={p.prazo} />}
          {p.solicitantes && !["recusado", "cancelado"].includes(p.status) && (
            <CartaoConcluir id={p.id} status={p.status} protocolo={p.protocolo} nome={p.solicitantes.nome} email={p.solicitantes.email} />
          )}
          <FormAtendimento
            id={p.id}
            status={p.status}
            responsavelId={p.responsavel_id}
            prazo={p.prazo}
            equipe={equipe ?? []}
          />
          {(aprovacoes ?? []).length > 0 && (
            <div className="cartao">
              <h2>Aprovação</h2>
              {(aprovacoes ?? []).map((a, i) => (
                <p key={i} className="pequeno" style={{ margin: 0 }}>
                  {a.aprovador_email}
                  <br />
                  {a.decisao
                    ? `${a.decisao === "aprovado" ? "Aprovado" : "Recusado"} em ${dataHora(a.decidida_em)}`
                    : `Pendente · link vale até ${dataHora(a.expira_em)}`}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
