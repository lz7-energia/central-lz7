import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { Topo } from "@/components/Topo";
import { veAdm } from "@/lib/centrais";

// Páginas da própria conta (perfil): valem para as duas centrais.
export default async function LayoutConta({ children }: { children: React.ReactNode }) {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar");
  return (
    <>
      <Topo perfil={perfil} central={veAdm(perfil) ? "adm" : "obras"} />
      <main className="pagina">{children}</main>
    </>
  );
}
