import "server-only";

/**
 * O Supabase devolve no máximo 1000 linhas por consulta. Busca em lotes até acabar,
 * para as telas nunca esconderem registros sem avisar.
 * `consulta(de, ate)` deve montar a mesma consulta com `.range(de, ate)` e uma ordenação estável.
 */
export async function todasAsLinhas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  lote = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += lote) {
    const { data, error } = await consulta(de, de + lote - 1);
    if (error) return { data: linhas, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < lote || de > 200_000) break;
  }
  return { data: linhas, error: null };
}
