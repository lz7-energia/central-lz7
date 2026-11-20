import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { veAdm } from "@/lib/centrais";
import { IconeAreaObras } from "@/lib/areas-obras";

export const metadata: Metadata = { title: "Escolher central" };
export const dynamic = "force-dynamic";

/** Depois do login: quem entra nas duas centrais escolhe; quem é só de Obras vai direto. */
export default async function Escolher() {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  if (!veAdm(perfil)) redirect("/obras");
  return (
    <main className="escolher">
      <div className="esc-topo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} />
        <h1>Olá, {perfil.nome.split(" ")[0]}! Onde você quer entrar?</h1>
      </div>
      <div className="esc-opcoes">
        <Link href="/inicio" className="esc-card">
          <span className="esc-ic" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>
          </span>
          <strong>Central Administrativa</strong>
          <span>Fiscal, Financeiro, RH e ADM</span>
        </Link>
        <Link href="/obras" className="esc-card obras">
          <span className="esc-ic" aria-hidden="true"><IconeAreaObras id="obras" tamanho={34} /></span>
          <strong>Central de Obras</strong>
          <span>Compras, Logística e Obras</span>
        </Link>
      </div>
      <p className="esc-rodape">Dá para trocar a qualquer hora pelo botão ↔ no topo.</p>
    </main>
  );
}
