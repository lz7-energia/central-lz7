import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { dataHora } from "@/lib/formato";
import { BotaoAtualizar } from "./BotaoAtualizar";

export const metadata: Metadata = { title: "Sistema" };
export const dynamic = "force-dynamic";

type Rodada = { iniciada_em: string; terminada_em: string | null; registros: number | null; sucesso: boolean | null; erro: string | null };
type Saude = {
  agora: string;
  sincronizacoes: { recurso: string; nome: string; rodadas: Rodada[] }[];
  agendamentos: { nome: string; quando: string; ativo: boolean; ultima: { inicio: string; status: string; mensagem: string | null } | null }[];
  planner: { nome: string; ligado: boolean; ultima: string | null; status: string | null; mensagem: string | null }[];
};

const situacao = (r?: Rodada) =>
  !r ? { t: "Nunca rodou", c: "cinza" } : r.sucesso === null ? { t: "Rodando", c: "alerta" } : r.sucesso ? { t: "Ok", c: "ok" } : { t: "Falhou", c: "perigo" };
const duracao = (r: Rodada) => (r.terminada_em ? `${Math.max(1, Math.round((Date.parse(r.terminada_em) - Date.parse(r.iniciada_em)) / 1000))} s` : "—");

// Página de bastidor: fora dos menus, só o administrador entra (outros recebem "não encontrada").
export default async function Sistema() {
  const perfil = await perfilAtual();
  if (perfil?.papel !== "admin") notFound();
  const sb = await supabaseUsuario();
  const { data, error } = await sb.rpc("admin_saude");
  if (error || !data) return <div className="erro">Não foi possível ler a saúde do sistema: {error?.message}</div>;
  const s = data as Saude;
  const minutos = (iso: string) => Math.round((Date.parse(s.agora) - Date.parse(iso)) / 60000);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Sistema</h1>
          <p className="sub">Bastidores: como estão as sincronizações com o Flow, os agendamentos e o planner. Só o administrador vê esta página.</p>
        </div>
      </div>

      <section className="cartao" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Sincronizações</h2>
        <div className="tabela-caixa"><table>
          <thead><tr><th>O quê</th><th>Situação</th><th>Última rodada</th><th>Registros</th><th>Últimas 8</th><th></th></tr></thead>
          <tbody>{s.sincronizacoes.map((x) => {
            const u = x.rodadas[0], st = situacao(u);
            const falhasSeguidas = x.rodadas.findIndex((r) => r.sucesso !== false);
            return (
              <tr key={x.recurso}>
                <td><b>{x.nome}</b></td>
                <td><span className={`chip-proj ${st.c}`}>{st.t}</span>
                  {falhasSeguidas >= 2 && <div className="pequeno atrasado">{falhasSeguidas} falhas seguidas</div>}
                  {u?.erro && <div className="pequeno mudo" style={{ maxWidth: 340 }}>{u.erro}</div>}</td>
                <td className="pequeno">{u ? <>{dataHora(u.iniciada_em)}<div className="mudo">há {minutos(u.iniciada_em)} min · {duracao(u)}</div></> : "—"}</td>
                <td className="pequeno">{u?.registros ?? "—"}</td>
                <td><span className="sist-historico">{[...x.rodadas].reverse().map((r, i) => (
                  <span key={i} className={situacao(r).c} title={`${dataHora(r.iniciada_em)} · ${situacao(r).t}${r.erro ? ` · ${r.erro}` : ""}`} />
                ))}</span></td>
                <td style={{ textAlign: "right" }}><BotaoAtualizar recurso={x.recurso} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="pequeno mudo" style={{ margin: "8px 0 0" }}>Cada função recusa uma nova rodada se outra rodou há menos de 10 minutos, para não pesar o Flow.</p>
      </section>

      <section className="cartao" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Agendamentos</h2>
        {s.agendamentos.length === 0 ? <p className="mudo">Nenhum agendamento encontrado.</p> : (
          <div className="tabela-caixa"><table>
            <thead><tr><th>Nome</th><th>Quando (UTC)</th><th>Ligado</th><th>Última execução</th></tr></thead>
            <tbody>{s.agendamentos.map((a) => (
              <tr key={a.nome}>
                <td className="pequeno"><b>{a.nome}</b></td>
                <td className="pequeno"><code>{a.quando}</code></td>
                <td>{a.ativo ? <span className="chip-proj ok">Sim</span> : <span className="chip-proj cinza">Não</span>}</td>
                <td className="pequeno">{a.ultima ? <>{dataHora(a.ultima.inicio)} · <span className={a.ultima.status === "succeeded" ? "" : "atrasado"}>{a.ultima.status === "succeeded" ? "ok" : a.ultima.status}</span>
                  {a.ultima.status !== "succeeded" && a.ultima.mensagem && <div className="mudo">{a.ultima.mensagem}</div>}</> : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="cartao">
        <h2 style={{ marginTop: 0 }}>Planner e ClickUp</h2>
        {s.planner.length === 0 ? <p className="mudo">Ninguém ligou o ClickUp ainda.</p> : (
          <div className="tabela-caixa"><table>
            <thead><tr><th>Pessoa</th><th>ClickUp</th><th>Última sincronização</th><th>Situação</th></tr></thead>
            <tbody>{s.planner.map((p) => (
              <tr key={p.nome}>
                <td><b>{p.nome}</b></td>
                <td>{p.ligado ? <span className="chip-proj ok">Ligado</span> : <span className="chip-proj cinza">Desligado</span>}</td>
                <td className="pequeno">{p.ultima ? <>{dataHora(p.ultima)} <span className="mudo">(há {minutos(p.ultima)} min)</span></> : "—"}</td>
                <td className="pequeno">{p.status === "erro" ? <span className="atrasado">Erro: {p.mensagem}</span> : p.status ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
