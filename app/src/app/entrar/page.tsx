import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilAtual } from "@/lib/supabase/server";
import { FormLogin } from "./FormLogin";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const { volta } = await searchParams;
  if (await perfilAtual()) redirect(volta || "/inicio");

  return (
    <main className="inicio">
      <div className="cartao" style={{ textAlign: "left" }}>
        <Link href="/" className="logo">
          LZ7 <span>Central</span>
        </Link>
        <h1>Entrar</h1>
        <p className="sub">Acesso da equipe da central.</p>
        <FormLogin volta={volta || "/inicio"} />
        <p className="rodape-portal">
          Quer abrir um pedido? <Link href="/portal">Use o portal</Link>, não precisa de login.
        </p>
      </div>
    </main>
  );
}
