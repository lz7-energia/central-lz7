"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/navegador";

/** Recarrega a fila quando um pedido é criado ou alterado (sem precisar apertar F5). */
export function TempoReal({ pedidoId }: { pedidoId?: number }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseNavegador();
    let espera: ReturnType<typeof setTimeout> | undefined;
    const canal = sb
      .channel(pedidoId ? `pedido-${pedidoId}` : "fila-pedidos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", ...(pedidoId ? { filter: `id=eq.${pedidoId}` } : {}) },
        () => {
          clearTimeout(espera);
          espera = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(espera);
      sb.removeChannel(canal);
    };
  }, [router, pedidoId]);
  return null;
}
