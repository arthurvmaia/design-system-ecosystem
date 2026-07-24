/**
 * Estado de seleção da Galeria — funções puras sobre um `Set<string>` de ids.
 *
 * Fonte da verdade única (um `Set` no componente), sem tocar no banco. Estas
 * funções cobrem o que a UI precisa: alternar um item, marcar/limpar os
 * visíveis, calcular o estado indeterminado do "selecionar todos", e podar ids
 * que deixaram de existir (após excluir ou re-segmentar).
 */

export type SelectionState = ReadonlySet<string>;

export const toggle = (sel: SelectionState, id: string): Set<string> => {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export const clear = (): Set<string> => new Set();

/** Todos os ids visíveis estão selecionados (e há pelo menos um)? */
export const isAllSelected = (sel: SelectionState, visibleIds: string[]): boolean =>
  visibleIds.length > 0 && visibleIds.every((id) => sel.has(id));

/** Parte — mas não todos — dos visíveis selecionados → indeterminado. */
export const isIndeterminate = (sel: SelectionState, visibleIds: string[]): boolean => {
  const n = visibleIds.reduce((acc, id) => acc + (sel.has(id) ? 1 : 0), 0);
  return n > 0 && n < visibleIds.length;
};

/** Quantos dos visíveis estão selecionados. */
export const countIn = (sel: SelectionState, visibleIds: string[]): number =>
  visibleIds.reduce((acc, id) => acc + (sel.has(id) ? 1 : 0), 0);

/**
 * Alterna "selecionar todos os visíveis": se todos já estão, remove os visíveis;
 * senão, adiciona todos os visíveis (preservando seleção fora do filtro atual).
 */
export const toggleAllVisible = (sel: SelectionState, visibleIds: string[]): Set<string> => {
  const next = new Set(sel);
  if (isAllSelected(sel, visibleIds)) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
};

/** Descarta ids que não existem mais na lista atual (some após excluir/re-segmentar). */
export const prune = (sel: SelectionState, existingIds: string[]): Set<string> => {
  const existing = new Set(existingIds);
  const next = new Set<string>();
  for (const id of sel) if (existing.has(id)) next.add(id);
  return next;
};
