import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { Topo } from "@/components/Topo";
import { veAdm } from "@/lib/centrais";

// Páginas que a equipe e a diretoria veem (a diretoria só lê).
export default async function LayoutGestao({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  // Quem é só da Central de Obras não entra na Administrativa.
  if (!veAdm(perfil)) redirect("/obras");
  return (
    <>
      <Topo perfil={perfil} />
      <main className="pagina">{children}</main>
    </>
  );
}
