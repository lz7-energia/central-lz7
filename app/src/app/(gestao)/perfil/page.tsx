import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { perfilAtual, urlDaFoto } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { FormDados, FormFoto, FormSenha } from "./Formularios";

export const metadata: Metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

const PAPEIS = { admin: "Administrador", equipe: "Equipe da central", diretoria: "Diretoria" };

export default async function Perfil() {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  const foto = urlDaFoto(perfil.foto_caminho);

  return (
    <>
      <div className="perfil-topo">
        <Avatar nome={perfil.nome} foto={foto} tamanho={88} />
        <div>
          <h1>{perfil.nome}</h1>
          <p className="mudo" style={{ margin: 0 }}>
            {perfil.cargo ? `${perfil.cargo} · ` : ""}{PAPEIS[perfil.papel]} · {perfil.email}
          </p>
        </div>
      </div>
      <div className="grade-perfil">
        <section className="cartao">
          <h2>Foto</h2>
          <FormFoto temFoto={Boolean(foto)} />
        </section>
        <section className="cartao">
          <h2>Seus dados</h2>
          <FormDados nome={perfil.nome} cargo={perfil.cargo ?? ""} telefone={perfil.telefone ?? ""} email={perfil.email} />
        </section>
        <section className="cartao">
          <h2>Trocar senha</h2>
          <FormSenha />
        </section>
      </div>
    </>
  );
}
