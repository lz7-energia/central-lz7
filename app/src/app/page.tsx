import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";

export default async function Inicio() {
  // Quem é da equipe e já está logado vai direto pra página inicial.
  if (await perfilAtual()) redirect("/inicio");

  return (
    <main className="inicio">
      <div className="cartao">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} /> <span>Central</span>
        </div>
        <h1>Precisa de algo de outra área?</h1>
        <p className="mudo">Abra um pedido para o Financeiro, Fiscal, RH ou ADM e acompanhe pelo número de protocolo.</p>
        <div className="acoes">
          <Link className="botao" href="/portal">
            Abrir um pedido
          </Link>
          <Link className="botao secundario" href="/entrar">
            Entrar (equipe da central)
          </Link>
        </div>
      </div>
    </main>
  );
}
