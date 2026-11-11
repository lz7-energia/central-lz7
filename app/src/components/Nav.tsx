"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const EQUIPE = [
  { href: "/inicio", rotulo: "Início" },
  { href: "/pedidos", rotulo: "Pedidos" },
  { href: "/painel", rotulo: "Faturamento" },
  { href: "/recebiveis", rotulo: "Recebíveis" },
];
const DIRETORIA = [{ href: "/recebiveis", rotulo: "Recebíveis" }];

export function Nav({ diretoria = false }: { diretoria?: boolean }) {
  const caminho = usePathname();
  return (
    <nav className="nav">
      {(diretoria ? DIRETORIA : EQUIPE).map((i) => (
        <Link key={i.href} href={i.href} className={caminho.startsWith(i.href) ? "ativo" : ""}>
          {i.rotulo}
        </Link>
      ))}
      {!diretoria && (
        <Link href="/portal" target="_blank">
          Portal ↗
        </Link>
      )}
    </nav>
  );
}
