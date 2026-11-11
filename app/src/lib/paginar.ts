import "server-only";

/**
 * O Supabase devolve no máximo N linhas por consulta ("Max rows" do projeto; 1000 por padrão, mas pode
 * ser menos). Busca em lotes e só para quando um lote volta VAZIO — assim funciona com qualquer limite,
 * e as telas nunca escondem registros sem avisar.
 * `consulta(de, ate)` deve montar a mesma consulta com `.range(de, ate)` e uma ordenação estável.
 */
export async function todasAsLinhas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  lote = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const linhas: T[] = [];
  for (let de = 0; de < 500_000; ) {
    const { data, error } = await consulta(de, de + lote - 1);
    if (error) return { data: linhas, error };
    if (!data || data.length === 0) break;
    linhas.push(...data);
    de += data.length; // avança pelo que veio de fato (o servidor pode cortar antes do pedido)
  }
  return { data: linhas, error: null };
}
