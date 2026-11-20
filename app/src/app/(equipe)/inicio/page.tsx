import type { Metadata } from "next";
import Link from "next/link";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { AREAS, IconeArea } from "@/lib/areas";
import { cumprimento, dataPorExtenso, resumoDasAreas } from "@/lib/resumo";
import { aplicarOrdem, type OrdemTela } from "@/lib/ordem";
import { Reordenar } from "./Reordenar";
import { meuDia } from "@/lib/meu-dia";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function Inicio() {
  const sb = await supabaseUsuario();
  const [perfil, resumo, { data: avisos }, { data: tela }] = await Promise.all([
    perfilAtual(), resumoDasAreas(),
    sb.from("planner_avisos").select("id, texto").is("lido_em", null).order("criado_em", { ascending: false }).limit(5),
    sb.from("tela_ordem").select("ordem").maybeSingle(),
  ]);
  const areas = aplicarOrdem(AREAS, (tela?.ordem as OrdemTela | undefined)?.areas, (a) => a.id);
  const primeiroNome = perfil?.nome.split(" ")[0] ?? "";
  const dia = perfil ? await meuDia(perfil.id) : [];
  const ICONE = { planner: "☑️", pedido: "📥", "pedidos-novos": "🆕", previsao: "💰" } as const;

  return (
    <>
      <div className="saudacao">
        <p className="mudo">{dataPorExtenso()}</p>
        <h1>
          {cumprimento()}, {primeiroNome}!
        </h1>
        <p className="sub">Escolha uma área para começar.</p>
      </div>
      <a href="/planner" className="atalho-planner">
        <span className="ap-icone" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
        </span>
        <span>
          <strong>Seu planner</strong>
          <span className="mudo">Agenda, matriz de Eisenhower e resumo, ligados ao ClickUp</span>
          {!!avisos?.length && (
            <span className="ap-avisos">
              {avisos.map((a) => <span key={a.id}>🔔 {a.texto}</span>)}
            </span>
          )}
        </span>
        <span className="ap-seta" aria-hidden="true">→</span>
      </a>

      <section className="meu-dia">
        <div className="md-cab">
          <h2>Meu dia</h2>
          <span className="mudo pequeno">{dia.length ? `${dia.length} ${dia.length === 1 ? "coisa" : "coisas"} para hoje${dia.some((i) => i.atrasado) ? `, ${dia.filter((i) => i.atrasado).length} atrasada${dia.filter((i) => i.atrasado).length === 1 ? "" : "s"}` : ""}` : ""}</span>
        </div>
        {dia.length === 0 ? <p className="mudo" style={{ margin: 0 }}>Nada atrasado nem para hoje. 👌</p> : (
          <ul className="md-lista">
            {dia.slice(0, 12).map((i, n) => (
              <li key={n} className={i.atrasado ? "atrasado" : ""}>
                <span className="md-ic" aria-hidden="true">{ICONE[i.tipo]}</span>
                <a href={i.href} className="md-tit">{i.hora && <b className="md-hora">{i.hora}</b>}{i.titulo}</a>
                {i.detalhe && <span className="md-det">{i.detalhe}</span>}
                {i.origem && <a href={i.origem.href} className="md-origem" title={i.origem.rotulo}>↗ abrir</a>}
              </li>
            ))}
          </ul>
        )}
        {dia.length > 12 && <p className="pequeno" style={{ margin: "8px 0 0" }}><a href="/planner">Ver tudo no planner →</a></p>}
      </section>

      <Reordenar lugar="areas" className="grade-areas" itens={areas.map((a) => {
          const r = resumo.setores[a.id] ?? { abertos: 0, atrasados: 0 };
          return { chave: a.id, rotulo: a.nome, conteudo: (
            <Link href={`/area/${a.id}`} className={`cartao-area area-${a.id}`}>
              <div className="ca-icone">
                <IconeArea id={a.id} />
              </div>
              <div className="ca-nome">{a.nome}</div>
              <div className="ca-desc">{a.descricao}</div>
              <div className="ca-numeros">
                {a.id === "fiscal" && (
                  <span className={resumo.prontosFaturar ? "destaque" : ""}>
                    <strong>{resumo.prontosFaturar}</strong> pronto{resumo.prontosFaturar === 1 ? "" : "s"} pra faturar
                  </span>
                )}
                <span>
                  <strong>{r.abertos}</strong> pedido{r.abertos === 1 ? "" : "s"} em aberto
                </span>
                {r.atrasados > 0 && (
                  <span className="atrasado">
                    <strong>{r.atrasados}</strong> atrasado{r.atrasados === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <span className="ca-ir" aria-hidden="true">
                →
              </span>
            </Link>
          ) };
        })} />
    </>
  );
}
