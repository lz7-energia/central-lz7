import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { Topo } from "@/components/Topo";

// Páginas que a equipe e a diretoria veem (a diretoria só lê).
export default async function LayoutGestao({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  return (
    <>
      <Topo nome={perfil.nome} papel={perfil.papel} />
      <main className="pagina">{children}</main>
    </>
  );
}
