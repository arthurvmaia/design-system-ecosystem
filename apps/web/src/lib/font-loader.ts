import { findFont, googleFontsCss2Url } from '@ds/shared/fonts';

/**
 * Carregador de fontes centralizado para o preview do editor.
 *
 * Injeta UM `<link>` do Google Fonts por família e deduplica: pedir a mesma
 * família duas vezes (ou a cada render) não gera `<link>` repetido. É o que
 * evita o problema clássico de encher o `<head>` de tags iguais.
 *
 * Só o editor usa isto (preview em tempo real). O SITE GERADO importa as fontes
 * pelo seu próprio `<link>`, montado no gerador a partir de `@ds/shared`.
 */

const carregadas = new Set<string>();

/** Garante que a família está carregada no documento (idempotente). */
export const loadFont = (family: string, weights?: number[]): void => {
  if (typeof document === 'undefined') return;
  const def = findFont(family);
  const fam = def?.family ?? family.split(',')[0]?.trim() ?? '';
  if (fam === '' || carregadas.has(fam)) return;

  const pesos = weights ?? def?.weights ?? [400, 700];
  const url = googleFontsCss2Url([{ family: fam, weights: pesos }]);
  if (url === null) return;

  carregadas.add(fam);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.fontLoader = fam;
  document.head.appendChild(link);
};
