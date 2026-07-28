import type { HTMLElement } from 'node-html-parser';

/**
 * Primitivas da subdivisão fina.
 *
 * Nasceram como const locais de `padroes.ts` (o passe global de sistemas) e
 * foram extraídas para cá quando o motor V2 ganhou o passe de subdivisão POR
 * SEÇÃO (`@ds/engine-v2/segment/subdividir.ts`): os dois passes precisam
 * concordar sobre o que é "o mesmo estilo", e a única forma de garantir isso é
 * usarem exatamente as mesmas funções.
 */

/**
 * Assinatura visual de um elemento: as classes que descrevem aparência, sem as
 * que descrevem posição.
 *
 * Dois botões iguais em estilo mas em cantos opostos da página têm classes de
 * margem diferentes. Sem descartar essas, cada botão vira uma "variação" e a
 * família cresce até virar lixo.
 */
export const CLASSE_DE_POSICAO =
  /^(m[trblxy]?-|p[trblxy]?-|w-|h-|min-|max-|top-|left-|right-|bottom-|inset-|z-|order-|col-|row-|absolute|relative|fixed|sticky|float-|clear-|translate|gap-|space-)/;

export const assinatura = (node: HTMLElement): string => {
  const classe = node.getAttribute('class') ?? '';
  return classe
    .split(/\s+/)
    .filter((c) => c.length > 0 && !CLASSE_DE_POSICAO.test(c))
    .sort()
    .join(' ');
};

/** Agrupa por assinatura, preservando a ordem de aparição. */
export const porAssinatura = (nodes: HTMLElement[]): Map<string, HTMLElement[]> => {
  const mapa = new Map<string, HTMLElement[]>();
  for (const n of nodes) {
    const chave = assinatura(n);
    if (chave === '') continue;
    const atual = mapa.get(chave);
    if (atual) atual.push(n);
    else mapa.set(chave, [n]);
  }
  return mapa;
};

export const embrulhar = (partes: string[], legenda: string): string =>
  `<div data-ds-amostra="${legenda}" class="flex flex-col gap-6 p-8">\n${partes.join('\n')}\n</div>`;

/** Âncora que se veste de botão: tem fundo ou borda e cantos tratados. */
export const PARECE_BOTAO = /\b(bg-|border|rounded|btn|button)/;

/** Superfície: algo com canto, borda ou sombra que carrega conteúdo dentro. */
export const PARECE_CARD = /\b(rounded|border|shadow|backdrop-blur|glass|card)/;
