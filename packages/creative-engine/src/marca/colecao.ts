import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { FormatoDaCapa } from './colecao-navegador.js';
import type { NavegadorParaDerivar } from './derivar.js';

/**
 * O lado NODE das capas de coleção: abre a imagem gerada num navegador e
 * devolve o PNG já no formato da marca.
 *
 * Mesmo arranjo de `derivarLogosDaMarca`: o cálculo mora no navegador porque
 * precisa de canvas, e o motor o injeta numa página em vez de manter uma
 * segunda implementação em Node.
 */

const MIME_POR_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const embutir = (caminho: string): string => {
  const mime = MIME_POR_EXT[extname(caminho).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${readFileSync(caminho).toString('base64')}`;
};

/** O mesmo ajudante que `derivar.ts` declara, e pela mesma razão. */
const AJUDANTE_DO_TRANSPILADOR = 'globalThis.__name = globalThis.__name || ((alvo) => alvo)';

/** O lado do arquivo entregue. 1024 é o mesmo das versões da logo. */
export const LADO_DA_CAPA = 1024;

/**
 * Recorta as capas de coleção no formato da marca.
 *
 * `arquivos` é `{ nome da coleção: caminho da imagem gerada }`. Devolve os PNGs
 * prontos, na mesma chave — quem grava em disco é o comando, porque é ele que
 * sabe onde a pasta do job fica.
 */
export const recortarCapasDeColecao = async (
  navegador: NavegadorParaDerivar,
  opts: {
    readonly arquivos: Readonly<Record<string, string>>;
    readonly formato: FormatoDaCapa;
    readonly lado?: number;
  },
): Promise<Record<string, Uint8Array>> => {
  const lado = opts.lado ?? LADO_DA_CAPA;
  const pagina = await navegador.newPage({ viewport: { width: 64, height: 64 } });
  try {
    await pagina.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    const { desenharCapaDeColecao } = await import('./colecao-navegador.js');

    const saida: Record<string, Uint8Array> = {};
    for (const [nome, caminho] of Object.entries(opts.arquivos)) {
      const entrada = {
        imagem: embutir(caminho),
        formato: opts.formato,
        lado,
      };
      // A função inteira viaja como texto: `page.evaluate` avalia uma EXPRESSÃO,
      // e passar `() => f()` carregaria a referência ao MÓDULO, que não existe
      // dentro da página.
      const dataUri = await pagina.evaluate<string>(
        `(async () => { ${AJUDANTE_DO_TRANSPILADOR}; const f = ${desenharCapaDeColecao.toString()}; return await f(${JSON.stringify(entrada)}); })()`,
      );
      const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
      saida[nome] = new Uint8Array(Buffer.from(base64, 'base64'));
    }
    return saida;
  } finally {
    await pagina.close();
  }
};
