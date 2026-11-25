import type { GrupoPendencia } from "@/lib/obras-resumo";
import { avisoCiente } from "./acoes";

const link = (codigo: string) => `/obras/cronograma#obra=${encodeURIComponent(codigo)}`;

/** Pendências da Central de Obras, de cara na Início: uma linha por tipo, que abre a lista de obras ao clicar.
 *  Somem quando a obra é preenchida; avisos da logística ficam abertos (pedem "Ciente"). */
export function Pendencias({ grupos, area }: { grupos: GrupoPendencia[]; area: "obras" | "logistica" | null }) {
  const meus = grupos.filter((g) => !area || g.area === area);
  return (
    <section className="ob-pend">
      <div className="md-cab"><h2>Pendências{area ? (area === "obras" ? " de obras" : " da logística") : ""}</h2></div>
      {!meus.length && <p className="mudo" style={{ margin: 0 }}>Nada pendente. 👌</p>}
      {meus.map((g) => (
        <details key={g.chave} className={`ob-grupo${g.grave ? " grave" : ""}`} open={g.chave === "avisos"}>
          <summary>
            <strong>{g.titulo}</strong>
            {!area && <span className="etiqueta cinza">{g.area === "obras" ? "Obras" : "Logística"}</span>}
          </summary>
          <ul>
            {g.itens.slice(0, 8).map((i) => (
              <li key={i.codigo + (i.avisoId ?? "")}>
                <a href={link(i.codigo)}><b>{i.titulo}</b> <span className="mudo">· {i.detalhe}</span></a>
                {i.avisoId && (
                  <form action={avisoCiente}><input type="hidden" name="id" value={i.avisoId} /><button className="botao-mini">Ciente</button></form>
                )}
              </li>
            ))}
          </ul>
          <a href={g.ver} className="pequeno ob-ver">{g.itens.length > 8 ? `Ver as ${g.itens.length}` : "Abrir no cronograma"} →</a>
        </details>
      ))}
    </section>
  );
}
