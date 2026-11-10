"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador: só para o tempo real da fila (a sessão vem dos cookies). */
export function supabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
