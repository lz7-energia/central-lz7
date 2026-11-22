import type { Metadata } from "next";
import { supabaseUsuario } from "@/lib/supabase/server";
import type { LinhaPainel } from "@/lib/tipos";
import { dataHora } from "@/lib/formato";
import { todasAsLinhas } from "@/lib/paginar";
import { Notas, type NotaAEmitir, type ObraOculta } from "./Notas";

export const metadata: Metadata = { title: "Notas a emitir" };

export default async function NotasAEmitir({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca = "" } = await searchParams;
  const sb = await supabaseUsuario();
  const [aEmitir, painel, { data: ocultasObra }, { data: cfg }, { data: pessoas }, { data: ultimas }] = await Promise.all([
    todasAsLinhas<NotaAEmitir>((de, ate) => sb.from("notas_a_emitir").select("*").order("chave").range(de, ate)),
    todasAsLinhas<LinhaPainel>((de, ate) =>
      sb.from("painel_faturamento").select("*").or("coluna.in.(faturado,recebido),oculto.eq.true").order("flow_id").range(de, ate)),
    sb.from("notas_ocultas_obra").select("codigo, alterado_por, alterado_em, obra_obras(cliente)"),
    sb.from("notas_config").select("responsavel").maybeSingle(),
    sb.from("perfis").select("id, nome, papel").eq("ativo", true).neq("papel", "obras").order("nome"),
    sb.from("sincronizacoes").select("recurso, terminada_em, sucesso").order("iniciada_em", { ascending: false }).limit(20),
  ]);
  const ultimaOk = (ultimas ?? []).find((s) => s.sucesso);
  const ultimaFalha = (ultimas ?? [])[0]?.sucesso === false ? ultimas![0] : null;
  const obras: ObraOculta[] = (ocultasObra ?? []).map((o: { codigo: string; alterado_por: string | null; alterado_em: string; obra_obras: unknown }) => ({
    codigo: o.codigo, alterado_por: o.alterado_por, alterado_em: o.alterado_em,
    cliente: (Array.isArray(o.obra_obras) ? o.obra_obras[0] : (o.obra_obras as { cliente?: string } | null))?.cliente ?? null,
  }));

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Notas a emitir</h1>
          <p className="sub">Obras concluídas sem nota, pelo Flow e pelo Cronograma de instalação.</p>
        </div>
        <p className="pequeno mudo" style={{ margin: 0 }}>
          {ultimaOk ? `Dados do Flow de ${dataHora(ultimaOk.terminada_em)}` : "Sincronização com o Flow ainda não configurada"}
        </p>
      </div>
      {ultimaFalha && <div className="erro">A última sincronização com o Flow ({ultimaFalha.recurso}) falhou. Os dados podem estar desatualizados.</div>}
      <Notas
        aEmitir={aEmitir.data}
        emitidas={painel.data.filter((l) => !l.oculto && (l.coluna === "faturado" || l.coluna === "recebido"))}
        ocultos={painel.data.filter((l) => l.oculto)}
        obrasOcultas={obras}
        responsavel={cfg?.responsavel ?? null}
        pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.nome ?? "Sem nome" }))}
        buscaInicial={busca}
      />
    </>
  );
}
