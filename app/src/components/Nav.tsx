"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Central } from "@/lib/centrais";

const ADM = [
  { href: "/inicio", rotulo: "Início" },
  { href: "/pedidos", rotulo: "Pedidos" },
  { href: "/painel", rotulo: "Faturamento" },
  { href: "/recebiveis", rotulo: "Recebíveis" },
  { href: "/clientes", rotulo: "Clientes" },
];
const OBRAS = [
  { href: "/obras", rotulo: "Início", exato: true },
  { href: "/obras/compras", rotulo: "Compras" },
  { href: "/obras/logistica", rotulo: "Logística" },
  { href: "/obras/obras", rotulo: "Obras" },
];

export function Nav({ central = "adm" }: { central?: Central }) {
  const caminho = usePathname();
  const itens: { href: string; rotulo: string; exato?: boolean }[] = central === "obras" ? OBRAS : ADM;
  return (
    <nav className="nav">
      {itens.map((i) => (
        <Link key={i.href} href={i.href} className={(i.exato ? caminho === i.href : caminho.startsWith(i.href)) ? "ativo" : ""}>
          {i.rotulo}
        </Link>
      ))}
      {/* Página própria (fora do app React): link comum. */}
      <a href="/planner">Planner</a>
      {central === "adm" && (
        <Link href="/portal" target="_blank">
          Portal ↗
        </Link>
      )}
    </nav>
  );
}
