import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Áreas da equipe: exigem login. O resto (portal, consulta, aprovação) é aberto.
const PROTEGIDAS = ["/inicio", "/area", "/painel", "/pedidos", "/recebiveis", "/perfil", "/arquivos", "/arquivos-abrir", "/rh", "/rh-curriculo", "/colaboradores", "/_blob"];

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  // Renova a sessão (não remover: mantém o login vivo).
  const {
    data: { user },
  } = await sb.auth.getUser();

  const caminho = request.nextUrl.pathname;
  if (!user && PROTEGIDAS.some((p) => caminho === p || caminho.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?volta=${encodeURIComponent(caminho)}`;
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: ["/inicio", "/area/:path*", "/painel/:path*", "/pedidos/:path*", "/recebiveis/:path*", "/recebiveis", "/perfil", "/arquivos", "/arquivos/:path*", "/arquivos-abrir/:path*", "/rh", "/rh/:path*", "/rh-curriculo/:path*", "/colaboradores", "/colaboradores/:path*", "/_blob/:path*", "/planner", "/planner/api/:path*", "/entrar", "/"],
};
