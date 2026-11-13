import type { Metadata } from "next";
import Link from "next/link";
import { FormResposta } from "./[id]/Formularios";
import { supabaseUsuario } from "@/lib/supabase/server";
import { STATUS, STATUS_ABERTOS, type StatusPedido } from "@/lib/tipos";
import { data as fmtData, dataHora, hojeSP } from "@/lib/formato";
import { TempoReal } from "./TempoReal";

export const metadata: Metadata = { title: "Pedidos" };

type Linha = {
  id: number;
  protocolo: string;
  status: StatusPedido;
  prazo: string | null;
  criado_em: string;
  setor_id: string;
  origem: string;
  tipos_pedido: { nome: string } | null;
  solicitantes: { nome: string } | null;
  responsavel: { nome: string } | null;
};

type Filtros = { setor?: string; ver?: string; busca?: string };

function href(atual: Filtros, muda: Filtros) {
  const p = new URLSearchParams();
  const f = { ...atual, ...muda };
  if (f.setor) p.set("setor", f.setor);
  if (f.ver && f.ver !== "abertos") p.set("ver", f.ver);
  if (f.busca) p.set("busca", f.busca);
  const s = p.toString();
  return `/pedidos${s ? `?${s}` : ""}`;
}

export default async function Pedidos({ searchParams }: { searchParams: Promise<Filtros> }) {
  const filtros = await searchParams;
  const ver = filtros.ver || "abertos";
  const busca = (filtros.busca || "").trim();
  const sb = await supabaseUsuario();

  const [{ data: setores }, { data: abertos }] = await Promise.all([
    sb.from("setores").select("id, nome").order("ordem"),
    sb.from("pedidos").select("setor_id").in("status", STATUS_ABERTOS),
  ]);
  const contagem = new Map<string, number>();
  (abertos ?? []).forEach((p) => contagem.set(p.setor_id, (contagem.get(p.setor_id) ?? 0) + 1));

  let q = sb
    .from("pedidos")
    .select(
      "id, protocolo, status, prazo, criado_em, setor_id, origem, tipos_pedido(nome), solicitantes(nome), responsavel:perfis(nome)",
    )
    .order("criado_em", { ascending: false })
    .limit(300);
  if (filtros.setor) q = q.eq("setor_id", filtros.setor);
  if (busca) q = q.ilike("protocolo", `%${busca.replace(/[%_]/g, "")}%`);
  else if (ver === "abertos") q = q.in("status", STATUS_ABERTOS);
  else if (ver === "concluidos") q = q.in("status", ["concluido", "recusado", "cancelado"]);
  const { data, error } = await q;
  const pedidos = (data ?? []) as unknown as Linha[];
  const hoje = hojeSP();

  return (
    <>
      <TempoReal />
      <div className="cabecalho">
        <div>
          <h1>Pedidos</h1>
          <p className="sub">Fila de pedidos abertos pelos colaboradores e pelos módulos da central.</p>
        </div>
        <form className="filtros" style={{ margin: 0 }} action="/pedidos">
          {filtros.setor && <input type="hidden" name="setor" value={filtros.setor} />}
          <input type="search" name="busca" placeholder="Buscar protocolo" defaultValue={busca} aria-label="Buscar protocolo" />
        </form>
      </div>

      <div className="filtros">
        <div className="abas" aria-label="Setor">
          <Link href={href(filtros, { setor: undefined })} className={!filtros.setor ? "ativo" : ""}>
            Todos<span className="contador">{abertos?.length ?? 0}</span>
          </Link>
          {(setores ?? []).map((s) => (
            <Link key={s.id} href={href(filtros, { setor: s.id })} className={filtros.setor === s.id ? "ativo" : ""}>
              {s.nome}
              <span className="contador">{contagem.get(s.id) ?? 0}</span>
            </Link>
          ))}
        </div>
        <div className="abas" aria-label="Situação">
          {[
            ["abertos", "Em aberto"],
            ["concluidos", "Encerrados"],
            ["todos", "Todos"],
          ].map(([v, r]) => (
            <Link key={v} href={href(filtros, { ver: v, busca: undefined })} className={ver === v && !busca ? "ativo" : ""}>
              {r}
            </Link>
          ))}
        </div>
      </div>

      {error && <div className="erro">Não foi possível carregar os pedidos.</div>}

      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Pedido</th>
              <th>Solicitante</th>
              <th>Status</th>
              <th>Responsável</th>
              <th>Previsão</th>
              <th>Aberto em</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="vazio">
                  {busca ? "Nenhum pedido com esse protocolo." : "Nenhum pedido aqui."}
                </td>
              </tr>
            )}
            {pedidos.map((p) => {
              const atrasado = p.prazo && p.prazo < hoje && STATUS_ABERTOS.includes(p.status);
              return (
                <tr key={p.id}>
                  <td>
                    <Link className="linha" href={`/pedidos/${p.id}`}>
                      {p.protocolo}
                    </Link>
                  </td>
                  <td>
                    {p.tipos_pedido?.nome}
                    <div className="pequeno mudo">{(setores ?? []).find((s) => s.id === p.setor_id)?.nome}</div>
                  </td>
                  <td>{p.origem === "automatico" ? <span className="mudo">Automático</span> : p.solicitantes?.nome}</td>
                  <td>
                    <span className={`etiqueta ${STATUS[p.status].cor}`}>{STATUS[p.status].rotulo}</span>
                  </td>
                  <td>
                    {p.status === "aberto" ? <FormResposta id={p.id} prazo={p.prazo} compacto /> : p.responsavel?.nome ?? <span className="mudo">—</span>}
                  </td>
                  <td className={atrasado ? "atrasado" : ""}>
                    {fmtData(p.prazo)}
                    {atrasado && <div className="pequeno">atrasado</div>}
                  </td>
                  <td className="mudo pequeno">{dataHora(p.criado_em)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
