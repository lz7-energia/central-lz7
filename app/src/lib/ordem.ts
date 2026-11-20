// Ordem dos cards de cada pessoa (tabela tela_ordem). Funções puras.

export type OrdemTela = { areas?: string[]; obras?: string[]; modulos?: Record<string, string[]> };

/** Chave estável de um módulo: o endereço, ou o nome se ainda não tem página. */
export const chaveModulo = (m: { nome: string; href?: string }) => m.href ?? m.nome;

/** Põe os itens na ordem salva; itens novos (fora da lista salva) vão para o fim, na ordem de fábrica. */
export function aplicarOrdem<T>(itens: T[], salva: string[] | undefined, chave: (i: T) => string): T[] {
  if (!salva?.length) return itens;
  const pos = new Map(salva.map((c, i) => [c, i]));
  return itens
    .map((it, i) => ({ it, i, p: pos.get(chave(it)) }))
    .sort((a, b) => (a.p ?? salva.length + a.i) - (b.p ?? salva.length + b.i))
    .map((x) => x.it);
}
