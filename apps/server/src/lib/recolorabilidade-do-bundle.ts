import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Recolorabilidade, medirRecolorabilidade } from '@ds/composer';

/**
 * Quanto de um bundle a marca do usuário alcança, lido do disco.
 *
 * Por que aqui e não no compilador: medir na compilação obrigaria a recapturar
 * o acervo inteiro para o número existir, e o número precisa valer para o que
 * já está em disco hoje. A conta é pura (`@ds/composer`), então mudar de lugar
 * depois é mover a chamada, não reescrever a medida.
 *
 * O cache é por MTIME do diretório de CSS: recompilar um bundle muda o
 * diretório e invalida sozinho. Sem ele a conta rodaria a cada listagem sobre
 * centenas de KB de CSS — medido no acervo: 450 literais de cor por bundle, e o
 * mesmo CSS repetido em todos os bundles do mesmo site.
 */

const cache = new Map<string, { mtimeMs: number; valor: Recolorabilidade }>();

/** `null` quando o bundle não tem CSS: sem folha, não há o que medir nem que declarar. */
export const recolorabilidadeDoBundle = (bundleDir: string): Recolorabilidade | null => {
  const cssDir = join(bundleDir, 'assets', 'css');
  if (!existsSync(cssDir)) return null;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(cssDir).mtimeMs;
  } catch {
    return null;
  }

  const emCache = cache.get(cssDir);
  if (emCache !== undefined && emCache.mtimeMs === mtimeMs) return emCache.valor;

  try {
    const css = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
    if (css.trim() === '') return null;
    const valor = medirRecolorabilidade(css);
    cache.set(cssDir, { mtimeMs, valor });
    return valor;
  } catch {
    // Folha ilegível não acusa a peça: o mesmo contrato do resto do pipeline.
    return null;
  }
};
