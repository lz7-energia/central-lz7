import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente com a sessão de quem está logado (equipe). Respeita as regras de acesso (RLS). */
export async function supabaseUsuario() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chamado de um Server Component: o proxy já renova a sessão.
          }
        },
      },
    },
  );
}

/** Perfil de quem está logado, ou null se não for da equipe. */
export async function perfilAtual() {
  const sb = await supabaseUsuario();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("perfis")
    .select("id, nome, email, papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  return data as { id: string; nome: string; email: string; papel: "equipe" | "admin" | "diretoria"; ativo: boolean };
}
