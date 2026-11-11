"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/inicio", rotulo: "Início" },
  { href: "/pedidos", rotulo: "Pedidos" },
  { href: "/painel", rotulo: "Faturamento" },
];

export function Nav() {
  const caminho = usePathname();
  return (
    <nav className="nav">
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} className={caminho.startsWith(i.href) ? "ativo" : ""}>
          {i.rotulo}
        </Link>
      ))}
      <Link href="/portal" target="_blank">
        Portal ↗
      </Link>
    </nav>
  );
}
