import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServico } from "@/lib/supabase/servico";
import type { Campo } from "@/lib/tipos";
import { dataHora, valorCampo } from "@/lib/formato";
import { FormDecisao } from "./FormDecisao";

export const metadata: Metadata = { title: "Aprovação de pedido" };
export const dynamic = "force-dynamic";

type Aprovacao = {
  protocolo: string;
  setor: string;
  tipo: string;
  campos: Campo[];
  dados: Record<string, string>;
  solicitante: string | null;
  criado_em: string;
  expira_em: string;
  decisao: "aprovado" | "recusado" | null;
  decidida_em: string | null;
  expirada: boolean;
};

// Abrir esta página NÃO aprova nada: leitores de e-mail costumam abrir links sozinhos.
// A decisão só vale com o clique em Aprovar ou Recusar.
export default async function PaginaAprovacao({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  let ap: Aprovacao | null = null;
  if (t && /^[0-9a-f]{48}$/.test(t)) {
    const { data } = await supabaseServico().rpc("ver_aprovacao", { p_token: t });
    ap = (data as Aprovacao | null) ?? null;
  }

  return (
    <main className="pagina estreita">
      <Link href="/" className="logo">
        LZ7 <span>Central</span>
      </Link>
      {!ap ? (
        <div className="cartao" style={{ marginTop: 18 }}>
          <h1>Link de aprovação inválido</h1>
          <p className="mudo">Confira se abriu o link completo do e-mail.</p>
        </div>
      ) : (
        <>
          <h1 style={{ marginTop: 18 }}>Aprovação de pedido</h1>
          <p className="sub">
            {ap.solicitante} · {ap.setor} · protocolo {ap.protocolo} · aberto em {dataHora(ap.criado_em)}
          </p>
          <div className="cartao">
            <h2>{ap.tipo}</h2>
            <dl className="dados">
              {ap.campos.map((c) => (
                <div key={c.chave} style={{ display: "contents" }}>
                  <dt>{c.rotulo}</dt>
                  <dd>{c.tipo === "arquivo" ? (ap.dados[c.chave] ? "Anexo enviado (a equipe da central confere)" : "—") : valorCampo(c.tipo, ap.dados[c.chave])}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="cartao">
            {ap.decisao ? (
              <div className="ok">
                Este pedido já foi {ap.decisao} em {dataHora(ap.decidida_em)}.
              </div>
            ) : ap.expirada ? (
              <div className="erro">Este link expirou. Peça para o solicitante abrir o pedido de novo.</div>
            ) : (
              <FormDecisao token={t!} />
            )}
          </div>
        </>
      )}
    </main>
  );
}
