/**
 * Diferenciação de estados — funções puras.
 *
 * O coração da descoberta: uma interação só vale um novo estado se ela mudou
 * algo que importa. Aqui comparamos dois snapshots estruturados (antes/depois)
 * e produzimos (1) se houve mudança relevante e (2) uma assinatura estável para
 * deduplicar — dois caminhos que levam ao mesmo estado não viram dois registros.
 *
 * Nada aqui toca no navegador: recebe dados já coletados. É o que permite testar
 * a lógica de dedup e de "mudança relevante" sem abrir uma página.
 */

/** As propriedades computadas que observamos — as que revelam abrir/fechar/mover. */
export const COMPUTED_KEYS = [
  'display',
  'visibility',
  'opacity',
  'transform',
  'height',
  'maxHeight',
  'width',
  'backgroundColor',
  'backgroundImage',
  'color',
  'clipPath',
  'pointerEvents',
] as const;

export type StateSnapshot = {
  classes: string[];
  /** Atributos que carregam estado: aria-*, data-state, hidden, open, style. */
  attrs: Record<string, string>;
  computed: Record<string, string>;
  box: { w: number; h: number };
  childCount: number;
  textLen: number;
  visible: boolean;
  /**
   * Assinatura do conteúdo aberto FORA do elemento (portal): modal/menu/tooltip
   * que apareceu em outro ponto do DOM. Vazio quando nada foi revelado.
   */
  portalSignature: string;
  /**
   * Hash da subárvore do elemento (outerHTML). Muda quando um FILHO muda — o
   * reveal de hover, o conteúdo injetado por clique. Sem isto, só mudanças no
   * próprio elemento contam, e a maioria dos estados passa batido.
   */
  htmlSig: string;
};

/** Ruído de layout que não conta como mudança de estado (px de jitter). */
const LIMIAR_BOX_PX = 3;

export type SnapshotDiff = {
  changed: boolean;
  /** O que mudou, em rótulos legíveis (para log e para o `trigger`/label). */
  changes: string[];
  /** Abriu conteúdo em portal? Forte sinal de modal/dropdown/tooltip. */
  abriuPortal: boolean;
};

const setDiff = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return true;
  const sa = new Set(a);
  return b.some((x) => !sa.has(x));
};

const recordDiff = (a: Record<string, string>, b: Record<string, string>): string[] => {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  const mudou: string[] = [];
  for (const k of chaves) if (a[k] !== b[k]) mudou.push(k);
  return mudou;
};

/**
 * Compara dois snapshots e diz se a interação produziu um estado novo relevante.
 */
export const diffSnapshots = (before: StateSnapshot, after: StateSnapshot): SnapshotDiff => {
  const changes: string[] = [];

  if (setDiff(before.classes, after.classes)) changes.push('classes');

  const attrsMudados = recordDiff(before.attrs, after.attrs);
  if (attrsMudados.length > 0) changes.push(`atributos(${attrsMudados.join(',')})`);

  const compMudados = recordDiff(before.computed, after.computed);
  if (compMudados.length > 0) changes.push(`estilo(${compMudados.join(',')})`);

  if (Math.abs(before.box.w - after.box.w) > LIMIAR_BOX_PX) changes.push('largura');
  if (Math.abs(before.box.h - after.box.h) > LIMIAR_BOX_PX) changes.push('altura');
  if (before.childCount !== after.childCount) changes.push('filhos');
  if (before.textLen !== after.textLen) changes.push('conteúdo');
  if (before.visible !== after.visible) changes.push('visibilidade');
  if (before.htmlSig !== after.htmlSig) changes.push('subárvore');

  const abriuPortal =
    before.portalSignature !== after.portalSignature && after.portalSignature !== '';
  if (abriuPortal) changes.push('portal');

  return { changed: changes.length > 0, changes, abriuPortal };
};

/** Hash determinístico e curto (FNV-1a 32-bit) — sem dependências. */
export const hashString = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * Assinatura estável de um snapshot, para dedup. Junta só o que define o estado
 * visível — classes, atributos de estado, computed relevante, visibilidade e a
 * assinatura de portal — e ignora o resto (posição exata, texto completo).
 */
export const stateSignature = (s: StateSnapshot): string => {
  const partes = [
    [...s.classes].sort().join(' '),
    Object.entries(s.attrs)
      .filter(([k]) => /^(aria-|data-|hidden|open|checked|selected)/.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('|'),
    COMPUTED_KEYS.map((k) => s.computed[k] ?? '').join('|'),
    s.visible ? '1' : '0',
    s.portalSignature,
    s.htmlSig,
  ];
  return hashString(partes.join('##'));
};

/**
 * Adiciona um estado à coleção se ele for novo (assinatura inédita) e ainda
 * couber no teto. Retorna se entrou. Concentrar a política de dedup aqui evita
 * que a orquestração encha a lista de estados iguais.
 */
export const registrarEstado = (
  vistos: Set<string>,
  signature: string,
  limite: number,
): boolean => {
  if (vistos.has(signature)) return false;
  if (vistos.size >= limite) return false;
  vistos.add(signature);
  return true;
};
