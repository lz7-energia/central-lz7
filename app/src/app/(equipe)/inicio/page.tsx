import type { Metadata } from "next";
import Link from "next/link";
import { perfilAtual } from "@/lib/supabase/server";
import { AREAS, IconeArea } from "@/lib/areas";
import { cumprimento, dataPorExtenso, resumoDasAreas } from "@/lib/resumo";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function Inicio() {
  const [perfil, resumo] = await Promise.all([perfilAtual(), resumoDasAreas()]);
  const primeiroNome = perfil?.nome.split(" ")[0] ?? "";

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
        <span><strong>Seu planner</strong><span className="mudo">Agenda, matriz de Eisenhower e resumo, ligados ao ClickUp</span></span>
        <span className="ap-seta" aria-hidden="true">→</span>
      </a>

      <div className="grade-areas">
        {AREAS.map((a) => {
          const r = resumo.setores[a.id] ?? { abertos: 0, atrasados: 0 };
          return (
            <Link key={a.id} href={`/area/${a.id}`} className={`cartao-area area-${a.id}`}>
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
          );
        })}
      </div>
    </>
  );
}
