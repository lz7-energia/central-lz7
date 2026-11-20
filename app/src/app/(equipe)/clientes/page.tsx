import type { Metadata } from "next";
import Link from "next/link";
import { buscarClientes } from "@/lib/clientes";
import { moeda } from "@/lib/formato";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const termo = q.trim().slice(0, 100);
  const lista = await buscarClientes(termo);
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Clientes</h1>
          <p className="sub">Tudo de um cliente numa tela: pedido, obra, nota, títulos e financiamento.</p>
        </div>
      </div>
      <form className="busca-clientes" action="/clientes">
        <input type="search" name="q" defaultValue={termo} placeholder="Nome, apelido, CPF/CNPJ ou código do projeto" autoFocus aria-label="Buscar cliente" />
        <button className="botao">Buscar</button>
      </form>
      <p className="pequeno mudo" style={{ margin: "10px 0" }}>
        {termo ? `${lista.length}${lista.length === 80 ? "+" : ""} resultado${lista.length === 1 ? "" : "s"} para “${termo}”.` : "Clientes com títulos em aberto, os que têm mais vencido primeiro."}
      </p>
      {lista.length === 0 ? <p className="mudo">Nenhum cliente encontrado.</p> : (
        <div className="tabela-caixa"><table>
          <thead><tr><th>Cliente</th><th>CPF/CNPJ</th><th>Em aberto</th><th>Vencido</th></tr></thead>
          <tbody>{lista.map((c) => (
            <tr key={c.id}>
              <td><Link className="linha" href={`/clientes/${encodeURIComponent(c.id)}`}><b>{c.apelido || c.nome}</b></Link>
                {c.apelido && c.nome && c.apelido !== c.nome && <div className="pequeno mudo">{c.nome}</div>}</td>
              <td className="pequeno">{c.doc || "—"}</td>
              <td>{c.aberto ? <>{moeda(c.aberto)} <span className="pequeno mudo">· {c.titulos} título{c.titulos === 1 ? "" : "s"}</span></> : "—"}</td>
              <td className={c.vencido ? "atrasado" : ""}>{c.vencido ? moeda(c.vencido) : "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
