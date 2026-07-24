/**
 * Planejamento de ações em lote — lógica pura, testável sem banco.
 *
 * Concentra a regra de idempotência do "curtir vários": um segmento que já está
 * na Biblioteca é pulado (não duplica), um id que não existe é reportado como
 * ausente, e só o que resta de fato entra. As rotas usam isto e depois só
 * executam as escritas.
 */

export type PlanoLote<T extends { id: string; inLibrary: boolean }> = {
  /** Segmentos que devem ser criados na Biblioteca. */
  toAdd: T[];
  /** Ids que já estavam na Biblioteca — pulados (idempotência). */
  already: string[];
  /** Ids pedidos que não existem mais. */
  missing: string[];
};

export const planBatchLike = <T extends { id: string; inLibrary: boolean }>(
  segmentIds: string[],
  segments: T[],
): PlanoLote<T> => {
  const porId = new Map(segments.map((s) => [s.id, s]));
  const vistos = new Set<string>();
  const toAdd: T[] = [];
  const already: string[] = [];
  const missing: string[] = [];

  for (const id of segmentIds) {
    if (vistos.has(id)) continue; // dedup dos ids repetidos no pedido
    vistos.add(id);
    const seg = porId.get(id);
    if (seg === undefined) {
      missing.push(id);
      continue;
    }
    if (seg.inLibrary) {
      already.push(id);
      continue;
    }
    toAdd.push(seg);
  }

  return { toAdd, already, missing };
};
