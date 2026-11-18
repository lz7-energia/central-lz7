import type { Metadata } from "next";
import Link from "next/link";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/formato";
import { todasAsLinhas } from "@/lib/paginar";
import type { Contato, Envio, Etapa, SituacaoRegua, TituloRegua } from "@/lib/regua";
import { Regua } from "./Regua";

export const metadata: Metadata = { title: "Régua de cobrança" };
export const dynamic = "force-dynamic";

export default async function Cobranca() {
  const perfil = await perfilAtual();
  const sb = await supabaseUsuario();
  const hoje = hojeSP();
  const desde = new Date(Date.now() - 400 * 86400000).toISOString();

  const [tits, { data: etapas }, envs, { data: sits }, clis, { data: manuais }] = await Promise.all([
    todasAsLinhas<TituloRegua>((de, ate) => sb.from("recebiveis")
      .select("flow_id, id_cliente, cliente, cliente_apelido, codigo_projeto, vencimento, valor_aberto, estado, financiamento, cobranca_situacao")
      .order("flow_id").range(de, ate)),
    sb.from("cobranca_regua_etapas").select("id, dias, nome, texto, ativo").order("dias"),
    todasAsLinhas<Envio>((de, ate) => sb.from("cobranca_envios").select("*").gte("em", desde).order("id").range(de, ate)),
    sb.from("cobranca_situacoes").select("id, rotulo, pausa_regua, grupo, ativo, ordem").order("ordem").order("rotulo"),
    todasAsLinhas<{ flow_id: string; telefone: string | null; email: string | null }>((de, ate) =>
      sb.from("clientes_flow").select("flow_id, telefone, email").order("flow_id").range(de, ate)),
    sb.from("cliente_contatos").select("id_cliente, telefone, email"),
  ]);

  const contatos: Record<string, Contato> = {};
  for (const c of clis.data) contatos[c.flow_id] = { telefone: c.telefone, email: c.email, origem: c.telefone || c.email ? "flow" : null };
  for (const c of manuais ?? []) {
    const flow = contatos[c.id_cliente];
    contatos[c.id_cliente] = { telefone: c.telefone ?? flow?.telefone ?? null, email: c.email ?? flow?.email ?? null, origem: "central" };
  }
  const erro = tits.error || envs.error || clis.error;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Régua de cobrança</h1>
          <p className="sub">A Central monta a mensagem de cada etapa; você confere, abre o WhatsApp e o envio fica registrado.</p>
        </div>
        <Link className="botao secundario pequeno" href="/recebiveis">Recebíveis</Link>
      </div>
      {erro && <div className="erro">Não foi possível carregar tudo. Recarregue a página.</div>}
      <Regua
        hoje={hoje}
        titulos={tits.data}
        etapas={(etapas ?? []) as Etapa[]}
        envios={envs.data}
        situacoes={(sits ?? []) as (SituacaoRegua & { grupo: string; ativo: boolean })[]}
        contatos={contatos}
        meuId={perfil?.id ?? null}
      />
    </>
  );
}
