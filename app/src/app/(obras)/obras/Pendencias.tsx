import type { GrupoPendencia, ItemAgenda } from "@/lib/obras-resumo";
import { avisoCiente } from "./acoes";

const link = (codigo: string) => `/obras/cronograma#obra=${encodeURIComponent(codigo)}`;

/** Pendências da Central de Obras, de cara na Início: somem quando a obra é preenchida (ou com "Ciente", nos avisos). */
export function Pendencias({ grupos, area }: { grupos: GrupoPendencia[]; area: "obras" | "logistica" | null }) {
  const meus = grupos.filter((g) => !area || g.area === area);
  return (
    <section className="ob-pend">
      <div className="md-cab"><h2>Pendências{area ? (area === "obras" ? " de obras" : " da logística") : ""}</h2></div>
      {!meus.length && <p className="mudo">Nada pendente. 👌</p>}
      {meus.map((g) => (
        <div key={g.chave} className={`ob-grupo${g.grave ? " grave" : ""}`}>
          <div className="ob-grupo-cab">
            <strong>{g.titulo}</strong>
            {!area && <span className="etiqueta cinza">{g.area === "obras" ? "Obras" : "Logística"}</span>}
            <a href={g.ver} className="pequeno">ver todas</a>
          </div>
          <ul>
            {g.itens.slice(0, 5).map((i) => (
              <li key={i.codigo + (i.avisoId ?? "")}>
                <a href={link(i.codigo)}><b>{i.titulo}</b> <span className="mudo">· {i.detalhe}</span></a>
                {i.avisoId && (
                  <form action={avisoCiente}><input type="hidden" name="id" value={i.avisoId} /><button className="botao-mini">Ciente</button></form>
                )}
              </li>
            ))}
            {g.itens.length > 5 && <li className="mudo pequeno">e mais {g.itens.length - 5}…</li>}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Meu dia de Obras: entregas e instalações de hoje e amanhã (a área da pessoa primeiro). */
export function AgendaObras({ itens, area }: { itens: ItemAgenda[]; area: "obras" | "logistica" | null }) {
  const ordem = area === "logistica" ? ["entrega", "instalacao"] : ["instalacao", "entrega"];
  const blocos = (["hoje", "amanhã"] as const).map((q) => ({ q, l: itens.filter((i) => i.quando === q).sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo)) }));
  return (
    <section className="ob-agenda">
      <div className="md-cab"><h2>Meu dia de Obras</h2></div>
      {blocos.map(({ q, l }) => (
        <div key={q}>
          <h3 className="ob-quando">{q === "hoje" ? "Hoje" : "Amanhã"}</h3>
          {!l.length ? <p className="mudo pequeno">Nenhuma entrega nem instalação.</p> : (
            <ul>{l.map((i) => (
              <li key={i.tipo + i.codigo}><a href={link(i.codigo)}>
                <span className={`etiqueta ${i.tipo === "entrega" ? "azul" : "verde"}`}>{i.tipo === "entrega" ? "Entrega" : "Instalação"}</span>{" "}
                <b>{i.titulo}</b>{i.detalhe && <span className="mudo"> · {i.detalhe}</span>}
              </a></li>
            ))}</ul>
          )}
        </div>
      ))}
    </section>
  );
}
