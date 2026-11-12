import type { Metadata } from "next";
import Link from "next/link";
import { opcoesPortal } from "@/lib/portal";
import { FormPortal } from "./FormPortal";

export const metadata: Metadata = { title: "Abrir um pedido" };
export const dynamic = "force-dynamic";

export default async function Portal() {
  const opcoes = await opcoesPortal();

  return (
    <main className="pagina estreita">
      <Link href="/" className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} /> <span>Central</span>
      </Link>
      <h1 style={{ marginTop: 18 }}>Abrir um pedido</h1>
      <p className="sub">Escolha o setor, o tipo de pedido e preencha os dados. Você recebe um número de protocolo para acompanhar.</p>
      {opcoes ? (
        <FormPortal opcoes={opcoes} chaveAntirrobo={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null} />
      ) : (
        <div className="cartao">
          <div className="erro">O portal está indisponível agora. Tente de novo em alguns minutos.</div>
        </div>
      )}
    </main>
  );
}
