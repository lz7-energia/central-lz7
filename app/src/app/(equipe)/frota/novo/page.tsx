import type { Metadata } from "next";
import Link from "next/link";
import { listasFrota } from "@/lib/frota-dados";
import { FormVeiculo } from "../Componentes";

export const metadata: Metadata = { title: "Novo carro" };
export const dynamic = "force-dynamic";

export default async function NovoCarro() {
  const listas = await listasFrota();
  return (
    <>
      <p className="pequeno" style={{ marginBottom: 8 }}><Link href="/frota">← Frota</Link></p>
      <h1>Novo carro</h1>
      <FormVeiculo listas={listas} />
    </>
  );
}
