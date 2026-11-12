import Link from "next/link";
import { sair } from "@/app/entrar/acoes";
import { urlDaFoto, type Perfil } from "@/lib/supabase/server";
import { Avatar } from "./Avatar";
import { Nav } from "./Nav";

export function Topo({ perfil }: { perfil: Perfil }) {
  const diretoria = perfil.papel === "diretoria";
  return (
    <header className="topo">
      <div className="topo-dentro">
        <Link href={diretoria ? "/recebiveis" : "/inicio"} className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} /> <span>Central</span>
        </Link>
        <Nav diretoria={diretoria} />
        <div className="usuario">
          <Link href="/perfil" className="usuario-link" title="Meu perfil">
            <Avatar nome={perfil.nome} foto={urlDaFoto(perfil.foto_caminho)} />
            <span className="usuario-nome">{perfil.nome.split(" ")[0]}</span>
          </Link>
          <form action={sair}>
            <button className="botao secundario pequeno">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
