import type { Metadata } from "next";
import Link from "next/link";
import { carregarListas, carregarVagas } from "@/lib/rh-dados";
import { ETAPAS, dataDoBonus, diasEntre, tituloVaga } from "@/lib/rh";
import { hojeSP } from "@/lib/formato";
import { BonusPago } from "./Componentes";

export const metadata: Metadata = { title: "Vagas e candidatos" };
export const dynamic = "force-dynamic";
const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export default async function Vagas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const [{ vagas, candidatos }, { canais }] = await Promise.all([carregarVagas(), carregarListas()]);
  const hoje = hojeSP();
  const fechadas = ver === "fechadas";
  const lista = vagas.filter((v) => (fechadas ? v.fechada_em : !v.fechada_em));
  const indicacao = new Set(canais.filter((c) => c.eh_indicacao).map((c) => c.id));
  const bonus = candidatos
    .filter((c) => c.etapa === "aprovado" && c.contratado_em && c.canal_id && indicacao.has(c.canal_id))
    .map((c) => ({ c, quando: dataDoBonus(c.contratado_em)! }))
    .sort((a, b) => Number(!!a.c.bonus_pago_em) - Number(!!b.c.bonus_pago_em) || a.quando.localeCompare(b.quando));

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/area/rh">← RH</Link></p>
      <div className="arq-topo">
        <div><h1>Vagas e candidatos</h1><p className="mudo" style={{ margin: 0 }}>Recrutamento e seleção</p></div>
        <div className="acoes">
          <Link href="/rh/config" className="botao secundario">Configurações</Link>
          <Link href="/rh/vagas/nova" className="botao">+ Nova vaga</Link>
        </div>
      </div>
      <div className="abas" style={{ margin: "16px 0", width: "fit-content" }}>
        <Link href="/rh" className={fechadas ? "" : "ativo"}>Abertas ({vagas.filter((v) => !v.fechada_em).length})</Link>
        <Link href="/rh?ver=fechadas" className={fechadas ? "ativo" : ""}>Fechadas ({vagas.filter((v) => v.fechada_em).length})</Link>
      </div>
      {lista.length === 0 && <div className="cartao mudo">{fechadas ? "Nenhuma vaga fechada." : "Nenhuma vaga aberta. Clique em “+ Nova vaga”."}</div>}
      <div className="vagas-grade">
        {lista.map((v) => {
          const dela = candidatos.filter((c) => c.vaga_id === v.id);
          const preenchidas = dela.filter((c) => c.etapa === "aprovado").length;
          const dias = Math.max(0, diasEntre(v.aberta_em, v.fechada_em ?? hoje));
          const atrasada = !v.fechada_em && v.previsao && v.previsao < hoje;
          return (
            <Link key={v.id} href={`/rh/vagas/${v.id}`} className="vaga-card">
              <div className="vaga-qtd"><strong>{v.quantidade}</strong><span>{v.quantidade === 1 ? "vaga" : "vagas"}</span></div>
              <div className="vaga-corpo">
                <h3>{tituloVaga(v)}</h3>
                <div className="vaga-info">
                  <span>Aberta em {br(v.aberta_em)} · <strong>{dias} {dias === 1 ? "dia" : "dias"}</strong>{v.fechada_em ? " (fechada)" : ""}</span>
                  <span className={atrasada ? "atrasado" : ""}>Previsão: {br(v.previsao)}{atrasada ? " · passou" : ""}</span>
                  {v.gestor && <span>Gestor: {v.gestor}</span>}
                  <span>{v.contrato} · {preenchidas}/{v.quantidade} preenchidas</span>
                </div>
                <div className="vaga-funil">
                  {ETAPAS.map((e) => {
                    const n = dela.filter((c) => c.etapa === e.id).length;
                    return <span key={e.id} title={e.nome} style={{ borderColor: e.cor }}>{e.nome} <strong>{n}</strong></span>;
                  })}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {bonus.length > 0 && (
        <section className="cartao" style={{ marginTop: 24 }}>
          <h2>Bônus de indicação</h2>
          <p className="mudo pequeno" style={{ marginTop: 0 }}>Contratados por indicação. O bônus vale depois de 3 meses; nessa data aparece uma tarefa no planner da recrutadora.</p>
          <div className="tabela-caixa"><table>
            <thead><tr><th>Contratado</th><th>Indicado por</th><th>Contratação</th><th>Bônus a partir de</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {bonus.map(({ c, quando }) => (
                <tr key={c.id}>
                  <td><Link href={`/rh/candidatos/${c.id}`}>{c.nome}</Link></td>
                  <td>{c.indicado_por || "—"}</td>
                  <td>{br(c.contratado_em)}</td>
                  <td>{br(quando)}</td>
                  <td>{c.bonus_pago_em ? <span className="rh-selo ok">Pago em {br(c.bonus_pago_em)}</span> : quando <= hoje ? <span className="rh-selo alerta">Liberado</span> : <span className="rh-selo">Aguardando {diasEntre(hoje, quando)} dias</span>}</td>
                  <td><BonusPago id={c.id} pago={!!c.bonus_pago_em} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
