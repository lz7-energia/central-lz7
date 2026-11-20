import Link from "next/link";
import Script from "next/script";
import { BotaoTarefa } from "./BotaoTarefa";
import { sair } from "@/app/entrar/acoes";
import { urlDaFoto, type Perfil } from "@/lib/supabase/server";
import { inicioDe, veAdm, type Central } from "@/lib/centrais";
import { Avatar } from "./Avatar";
import { Nav } from "./Nav";

export function Topo({ perfil, central = "adm" }: { perfil: Perfil; central?: Central }) {
  const duas = veAdm(perfil); // entra nas duas centrais
  return (
    <header className={`topo${central === "obras" ? " topo-obras" : ""}`}>
      <div className="topo-dentro">
        <Link href={inicioDe(central)} className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo-lz7-branco.png" alt="LZ7" width={376} height={156} /> <span>{central === "obras" ? "Obras" : "Central"}</span>
        </Link>
        <Nav central={central} />
        <div className="usuario">
          {duas && (
            <Link href="/escolher" className="botao secundario pequeno topo-trocar" title="Trocar de central">
              {central === "obras" ? "↔ Administrativa" : "↔ Obras"}
            </Link>
          )}
          <BotaoTarefa className="botao secundario pequeno topo-tarefa" title="Criar tarefa no planner com link para esta tela">+ Tarefa</BotaoTarefa>
          <Link href="/perfil" className="usuario-link" title="Meu perfil">
            <Avatar nome={perfil.nome} foto={urlDaFoto(perfil.foto_caminho)} />
            <span className="usuario-nome">{perfil.nome.split(" ")[0]}</span>
          </Link>
          <form action={sair}>
            <button className="botao secundario pequeno">Sair</button>
          </form>
        </div>
      </div>
      <Script src="/tarefa-app/tarefa.js?v=1" strategy="afterInteractive" />
    </header>
  );
}
