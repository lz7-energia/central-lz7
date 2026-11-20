import type { Perfil } from "@/lib/supabase/server";

// Duas centrais no mesmo sistema: Administrativa (a de sempre) e Obras.
// Perfil "obras" entra só na de Obras; equipe, admin e diretoria entram nas duas.
export type Central = "adm" | "obras";
export const veAdm = (p: Pick<Perfil, "papel">) => p.papel !== "obras";
export const veObras = (_p: Pick<Perfil, "papel">) => true;
export const inicioDe = (c: Central) => (c === "obras" ? "/obras" : "/inicio");
