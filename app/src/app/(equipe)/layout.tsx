import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { Topo } from "@/components/Topo";

export default async function LayoutEquipe({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  // A diretoria só tem acesso aos recebíveis.
  if (perfil.papel === "diretoria") redirect("/recebiveis");

  return (
    <>
      <Topo nome={perfil.nome} papel={perfil.papel} />
      <main className="pagina">{children}</main>
    </>
  );
}
