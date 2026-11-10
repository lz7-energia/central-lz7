import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { sair } from "../entrar/acoes";
import { Nav } from "./Nav";

export default async function LayoutEquipe({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");

  return (
    <>
      <header className="topo">
        <div className="topo-dentro">
          <Link href="/pedidos" className="logo">
            LZ7 <span>Central</span>
          </Link>
          <Nav />
          <div className="usuario">
            <span>{perfil.nome}</span>
            <form action={sair}>
              <button className="botao secundario pequeno">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="pagina">{children}</main>
    </>
  );
}
