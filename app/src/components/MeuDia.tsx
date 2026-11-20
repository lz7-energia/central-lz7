import type { ItemDia } from "@/lib/meu-dia";

const ICONE = { planner: "☑️", pedido: "📥", "pedidos-novos": "🆕", previsao: "💰" } as const;

/** Atalho do planner na Início (as duas centrais), com os avisos ainda não lidos. */
export function AtalhoPlanner({ avisos }: { avisos: { id: number | string; texto: string }[] }) {
  return (
        <a href="/planner" className="atalho-planner">
          <span className="ap-icone" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
          </span>
          <span>
            <strong>Seu planner</strong>
            <span className="mudo">Agenda, matriz de Eisenhower e resumo, ligados ao ClickUp</span>
            {!!avisos.length && (
              <span className="ap-avisos">
                {avisos.map((a) => <span key={a.id}>🔔 {a.texto}</span>)}
              </span>
            )}
          </span>
          <span className="ap-seta" aria-hidden="true">→</span>
        </a>
  );
}

/** "Meu dia": o que é da pessoa hoje (lib/meu-dia.ts). */
export function MeuDia({ itens: dia }: { itens: ItemDia[] }) {
  return (
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
  );
}
