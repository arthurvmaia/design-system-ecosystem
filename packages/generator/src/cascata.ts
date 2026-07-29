import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ler o CSS de um bundle NA ORDEM CERTA.
 *
 * Parece detalhe e não é: em CSS, ordem é significado. Duas regras de mesma
 * especificidade são decididas por quem vem depois, e o compilador
 * (`css-organize.ts`) separa as folhas justamente numa ordem pensada —
 * tokens → layout → componentes → animações → interações → runtime — para que
 * nada inverta.
 *
 * O gerador desfazia esse trabalho com um `readdirSync().sort()`: ordem
 * alfabética dá `animations → components → interactions → layout → runtime →
 * tokens`, com as folhas externas de nome hexadecimal embaralhadas no meio. O
 * resultado é um site que carrega todo o CSS certo e ainda assim sai errado —
 * o tipo de falha que ninguém encontra lendo o código, porque não há nada
 * faltando.
 *
 * A ordem verdadeira já está escrita no `index.html` do bundle: é a sequência
 * dos `<link rel="stylesheet">`. Esta função lê de lá.
 */

/** O que aconteceu na leitura — o chamador decide se avisa ou se falha. */
export type LeituraDeCss = {
  css: string;
  /** De onde veio: os `<link>` do index, o `styles.css` legado, ou nada. */
  origem: 'links' | 'styles.css' | 'vazio';
  /** Arquivos referenciados no index que não existem em disco. */
  faltando: string[];
};

const cssReferenciadoNoIndex = (bundleDir: string): string[] => {
  const indexPath = join(bundleDir, 'index.html');
  if (!existsSync(indexPath)) return [];
  try {
    const html = readFileSync(indexPath, 'utf8');
    return [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/gi)]
      .map((m) => m[1] ?? '')
      .filter((h) => h.length > 0 && !h.includes('..') && !/^[a-z]+:/i.test(h));
  } catch {
    return [];
  }
};

export const lerCssDoBundle = (bundleDir: string): LeituraDeCss => {
  const hrefs = cssReferenciadoNoIndex(bundleDir);
  if (hrefs.length > 0) {
    const faltando: string[] = [];
    const partes = hrefs.map((h) => {
      const p = join(bundleDir, h);
      if (!existsSync(p)) {
        faltando.push(h);
        return '';
      }
      return readFileSync(p, 'utf8');
    });
    return { css: partes.join('\n'), origem: 'links', faltando };
  }

  // Bundle legado: uma folha só, sem index que declare ordem.
  const legado = join(bundleDir, 'styles.css');
  if (existsSync(legado)) {
    return { css: readFileSync(legado, 'utf8'), origem: 'styles.css', faltando: [] };
  }

  // Último recurso: existe pasta de CSS mas o index não referencia nada. Ler em
  // ordem alfabética é um chute, mas é melhor que devolver um site sem estilo —
  // desde que o chamador diga em voz alta que foi um chute.
  const cssDir = join(bundleDir, 'assets', 'css');
  if (existsSync(cssDir)) {
    const arquivos = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .sort();
    if (arquivos.length > 0) {
      return {
        css: arquivos.map((f) => readFileSync(join(cssDir, f), 'utf8')).join('\n'),
        origem: 'vazio',
        faltando: [],
      };
    }
  }

  return { css: '', origem: 'vazio', faltando: [] };
};
