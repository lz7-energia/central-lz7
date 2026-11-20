import type { Metadata } from "next";
import Link from "next/link";
import { supabaseUsuario } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formato";
import { alertasDoVeiculo, placaBonita, type DocFrota, type Multa, type Veiculo } from "@/lib/frota";
import { listasFrota } from "@/lib/frota-dados";

export const metadata: Metadata = { title: "Frota" };
export const dynamic = "force-dynamic";

export default async function Frota({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const sb = await supabaseUsuario();
  const [{ data: v }, { data: d }, { data: m }, listas] = await Promise.all([
    sb.from("frota_veiculos").select("*").order("placa"),
    sb.from("frota_documentos").select("*"),
    sb.from("frota_multas").select("*"),
    listasFrota(),
  ]);
  const hoje = hojeSP();
  const todos = (v ?? []) as Veiculo[];
  const inativos = ver === "inativos";
  const carros = todos.filter((c) => c.ativo !== inativos);
  const docs = (d ?? []) as DocFrota[], multas = (m ?? []) as Multa[];
  const nome = (id: string | null) => (id ? listas.colabs.find((c) => c.id === id)?.nome ?? "—" : null);
  const empresa = (id: string | null) => listas.empresas.find((e) => e.id === id)?.nome;
  const comAlerta = carros.map((c) => ({ c, a: alertasDoVeiculo(c, docs.filter((x) => x.veiculo_id === c.id), multas.filter((x) => x.veiculo_id === c.id), hoje) }));
  const vencidos = comAlerta.reduce((s, x) => s + x.a.filter((a) => a.tipo === "vencido").length, 0);

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/area/adm">← ADM</Link></p>
      <div className="cabecalho">
        <div>
          <h1>Frota</h1>
          <p className="sub">Carros, motoristas, documentos, manutenção, multas e abastecimento. O motorista aparece na ficha dele no RH.</p>
        </div>
        <Link href="/frota/novo" className="botao">+ Carro</Link>
      </div>
      <div className="resumo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="indicador"><div className="rotulo">Carros em uso</div><div className="numero">{todos.filter((c) => c.ativo).length}</div></div>
        <div className="indicador"><div className="rotulo">Sem motorista</div><div className="numero">{todos.filter((c) => c.ativo && !c.motorista_colab_id).length}</div></div>
        <div className="indicador"><div className="rotulo">Vencidos / atrasados</div><div className="numero" style={vencidos ? { color: "var(--perigo)" } : undefined}>{vencidos}</div></div>
        <div className="indicador"><div className="rotulo">Multas pendentes</div><div className="numero">{multas.filter((x) => x.situacao === "pendente").length}</div></div>
      </div>
      <div className="abas" style={{ marginTop: 20, width: "fit-content" }}>
        <Link href="/frota" className={inativos ? "" : "ativo"}>Em uso</Link>
        <Link href="/frota?ver=inativos" className={inativos ? "ativo" : ""}>Fora de uso</Link>
      </div>
      {carros.length === 0 ? <p className="mudo" style={{ marginTop: 16 }}>{inativos ? "Nenhum carro fora de uso." : "Nenhum carro cadastrado ainda. Clique em “+ Carro”."}</p> : (
        <div className="frota-cards">
          {comAlerta.map(({ c, a }) => (
            <Link key={c.id} href={`/frota/${c.id}`} className="frota-card">
              <div className="frota-placa">{placaBonita(c.placa)}</div>
              <div className="frota-modelo">{[c.marca, c.modelo, c.ano].filter(Boolean).join(" ") || "Modelo não informado"}</div>
              <div className="pequeno">{nome(c.motorista_colab_id) ? <>🧑 {nome(c.motorista_colab_id)}</> : <span className="mudo">Sem motorista</span>}</div>
              <div className="pequeno mudo">{[empresa(c.empresa_id), c.km_atual != null ? `${c.km_atual.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ")}</div>
              {a.length > 0 && <div className="frota-alertas">{a.slice(0, 3).map((x, i) => <span key={i} className={`validade v-${x.tipo}`}>{x.texto}</span>)}{a.length > 3 && <span className="pequeno mudo">+{a.length - 3}</span>}</div>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
