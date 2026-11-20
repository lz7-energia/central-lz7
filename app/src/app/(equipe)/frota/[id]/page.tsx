import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseUsuario } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formato";
import { alertasDoVeiculo, consumoMedio, placaBonita, type Abastecimento, type DocFrota, type Manutencao, type MotoristaHist, type Multa, type Veiculo } from "@/lib/frota";
import { listasFrota } from "@/lib/frota-dados";
import { BotaoTarefa } from "@/components/BotaoTarefa";
import { EditarVeiculo, Secoes } from "../Componentes";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sb = await supabaseUsuario();
  const { data } = await sb.from("frota_veiculos").select("placa").eq("id", id).maybeSingle();
  return { title: data ? `Frota · ${placaBonita(data.placa)}` : "Frota" };
}

const dt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export default async function Carro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseUsuario();
  const [{ data: v }, { data: docs }, { data: man }, { data: mul }, { data: abs }, { data: hist }, listas] = await Promise.all([
    sb.from("frota_veiculos").select("*").eq("id", id).maybeSingle(),
    sb.from("frota_documentos").select("*").eq("veiculo_id", id).order("vencimento", { nullsFirst: false }),
    sb.from("frota_manutencoes").select("*").eq("veiculo_id", id).order("data", { ascending: false }),
    sb.from("frota_multas").select("*").eq("veiculo_id", id).order("data_infracao", { ascending: false }),
    sb.from("frota_abastecimentos").select("*").eq("veiculo_id", id).order("data", { ascending: false }).limit(200),
    sb.from("frota_motoristas").select("*").eq("veiculo_id", id).order("de", { ascending: false }).order("id", { ascending: false }),
    listasFrota(),
  ]);
  if (!v) notFound();
  const c = v as Veiculo;
  const hoje = hojeSP();
  const nome = (cid: string | null) => (cid ? listas.colabs.find((x) => x.id === cid)?.nome ?? "—" : "—");
  const alertas = alertasDoVeiculo(c, (docs ?? []) as DocFrota[], (mul ?? []) as Multa[], hoje);
  const abastecimentos = (abs ?? []) as Abastecimento[];
  const consumo = consumoMedio(abastecimentos);
  const mes = hoje.slice(0, 7);
  const gastoMes = abastecimentos.filter((a) => a.data.startsWith(mes)).reduce((s, a) => s + Number(a.valor || 0), 0)
    + ((man ?? []) as Manutencao[]).filter((a) => a.data.startsWith(mes)).reduce((s, a) => s + Number(a.valor || 0), 0);
  const placa = placaBonita(c.placa);
  const unidade = listas.unidades.find((u) => u.id === c.unidade_id);
  const empresa = listas.empresas.find((e) => e.id === c.empresa_id);

  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/frota">← Frota</Link></p>
      <div className="cabecalho" style={{ flexWrap: "wrap" }}>
        <div>
          <h1><span className="frota-placa grande">{placa}</span> {[c.marca, c.modelo].filter(Boolean).join(" ")}</h1>
          <p className="sub">{[c.ano, c.cor, empresa?.nome, unidade && unidade.nome !== "Única" ? unidade.nome : null].filter(Boolean).join(" · ") || " "}
            {!c.ativo && <span className="etiqueta cinza" style={{ marginLeft: 8 }}>fora de uso</span>}</p>
        </div>
        <span className="frota-acoes">
          <BotaoTarefa className="botao secundario pequeno" titulo={`${placa}: `} link={{ href: `/frota/${c.id}`, rotulo: `Frota · ${placa}` }} />
          <EditarVeiculo v={c} listas={listas} />
        </span>
      </div>

      {alertas.length > 0 && <div className="frota-alertas" style={{ marginBottom: 16 }}>{alertas.map((a, i) => <span key={i} className={`validade v-${a.tipo}`}>{a.texto}</span>)}</div>}

      <div className="resumo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="indicador"><div className="rotulo">Motorista</div><div className="numero" style={{ fontSize: "1.1rem" }}>{c.motorista_colab_id ? nome(c.motorista_colab_id) : <span className="mudo">ninguém</span>}</div>
          {c.motorista_colab_id && <div className="detalhe"><a href="/colaboradores">ver na folha</a></div>}</div>
        <div className="indicador"><div className="rotulo">Km atual</div><div className="numero">{c.km_atual != null ? c.km_atual.toLocaleString("pt-BR") : "—"}</div><div className="detalhe">{c.km_atualizado_em ? `em ${dt(c.km_atualizado_em)}` : " "}</div></div>
        <div className="indicador"><div className="rotulo">Próxima revisão</div><div className="numero" style={{ fontSize: "1.1rem" }}>{[c.revisao_km ? `${c.revisao_km.toLocaleString("pt-BR")} km` : null, c.revisao_data ? dt(c.revisao_data) : null].filter(Boolean).join(" ou ") || "—"}</div></div>
        <div className="indicador"><div className="rotulo">Gasto no mês</div><div className="numero" style={{ fontSize: "1.1rem" }}>{gastoMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div><div className="detalhe">{consumo ? `consumo médio ${consumo.toFixed(1).replace(".", ",")} km/l` : "abastecimento + manutenção"}</div></div>
      </div>

      <div className="duas-colunas" style={{ marginTop: 16 }}>
        <div>
          <Secoes veiculoId={c.id} hoje={hoje} colabs={listas.colabs}
            docs={docs ?? []} manutencoes={man ?? []} multas={mul ?? []} abastecimentos={abastecimentos} />
        </div>
        <div>
          <section className="cartao">
            <h2>Dados do carro</h2>
            <dl className="dados" style={{ gridTemplateColumns: "100px 1fr" }}>
              <dt>Renavam</dt><dd>{c.renavam || "—"}</dd>
              <dt>Chassi</dt><dd>{c.chassi || "—"}</dd>
              <dt>Responsável</dt><dd>{listas.perfis.find((p) => p.id === c.responsavel_id)?.nome || <span className="mudo">ninguém (sem avisos no planner)</span>}</dd>
              {c.obs && <><dt>Observações</dt><dd style={{ whiteSpace: "pre-wrap" }}>{c.obs}</dd></>}
              <dt>Alterado</dt><dd className="pequeno">{c.alterado_por ?? "—"}</dd>
            </dl>
          </section>
          <section className="cartao">
            <h2>Quem dirigiu</h2>
            {(hist ?? []).length === 0 ? <p className="mudo">Sem histórico.</p> : (
              <ul className="frota-hist">{((hist ?? []) as MotoristaHist[]).map((h) => (
                <li key={h.id}><b>{nome(h.colab_id)}</b><span className="mudo pequeno"> · {dt(h.de)} → {h.ate ? dt(h.ate) : "hoje"}</span></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
