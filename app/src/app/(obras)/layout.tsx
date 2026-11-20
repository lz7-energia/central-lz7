import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { Topo } from "@/components/Topo";

// Central de Obras: qualquer perfil ativo (obras, equipe, admin e diretoria).
export default async function LayoutObras({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  return (
    <>
      <Topo perfil={perfil} central="obras" />
      <main className="pagina central-obras">{children}</main>
    </>
  );
}
