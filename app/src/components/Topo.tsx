import Link from "next/link";
import { sair } from "@/app/entrar/acoes";
import { Nav } from "./Nav";

export function Topo({ nome, papel }: { nome: string; papel: string }) {
  const diretoria = papel === "diretoria";
  return (
    <header className="topo">
      <div className="topo-dentro">
        <Link href={diretoria ? "/recebiveis" : "/inicio"} className="logo">
          LZ7 <span>Central</span>
        </Link>
        <Nav diretoria={diretoria} />
        <div className="usuario">
          <span>{nome}</span>
          <form action={sair}>
            <button className="botao secundario pequeno">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
