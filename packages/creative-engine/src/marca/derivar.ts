import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { type LogosDerivadas, derivarLogos } from './derivar-navegador.js';

/**
 * O lado NODE da derivação das versões da logo.
 *
 * O algoritmo vive em `derivar-navegador.ts` e precisa de canvas, que não
 * existe em Node. Em vez de reimplementá-lo com uma biblioteca de canvas — uma
 * segunda implementação para divergir da primeira —, o motor injeta a MESMA
 * função numa página do Playwright e recolhe o resultado.
 *
 * É o mesmo arranjo de `comporPeca`: o navegador não é um detalhe de teste, é
 * onde a conta acontece.
 */

const MIME_POR_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** O símbolo entra na página embutido: sem rede, sem caminho absoluto da máquina. */
const embutir = (caminho: string): string => {
  const mime = MIME_POR_EXT[extname(caminho).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${readFileSync(caminho).toString('base64')}`;
};

const bytesDoDataUri = (dataUri: string): Uint8Array =>
  new Uint8Array(Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64'));

/** As três versões como bytes de PNG, prontas para o disco. */
export type LogosEmBytes = {
  readonly transparente: Uint8Array;
  readonly fundoBranco: Uint8Array;
  readonly fundoPreto: Uint8Array;
};

/**
 * O navegador de que esta função precisa, e nada além.
 *
 * Declarado por estrutura, como em `comporPeca`, para o pacote não depender do
 * tipo do Playwright: quem chama decide o ciclo de vida do navegador, que numa
 * rodada de várias marcas é a diferença entre subir o Chromium uma vez e subir
 * uma vez por marca.
 */
export type NavegadorParaDerivar = {
  newPage(opts?: { viewport?: { width: number; height: number } }): Promise<{
    setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
    evaluate<Retorno, Arg>(
      fn: (arg: Arg) => Promise<Retorno> | Retorno,
      arg: Arg,
    ): Promise<Retorno>;
    evaluate<Retorno>(expressao: string): Promise<Retorno>;
    close(): Promise<void>;
  }>;
};

/**
 * O ajudante que o TRANSPILADOR espera encontrar na página.
 *
 * O esbuild — que o `tsx` usa, e que o Next usa — preserva o nome das funções
 * embrulhando cada uma num `__name(fn, "nome")`. Isso é invisível no código
 * fonte e some no meio do arquivo compilado, mas atravessa junto quando a
 * função é serializada para dentro da página: lá `__name` não existe, e a
 * chamada morre com `ReferenceError` — que foi exatamente o que aconteceu na
 * primeira execução deste módulo.
 *
 * Declará-lo como identidade é o menor conserto possível e falha ALTO se um dia
 * outro ajudante aparecer: o erro é um `ReferenceError` nomeado dentro da
 * página, não um resultado errado em silêncio.
 */
const AJUDANTE_DO_TRANSPILADOR = 'globalThis.__name = globalThis.__name || ((alvo) => alvo)';

/**
 * Recorta o símbolo e devolve as três versões, por cálculo.
 *
 * Lança quando o recorte não é possível (fundo que não era liso, arquivo que
 * não carrega). Quem chama trata: nas duas frentes a decisão é a mesma, entregar
 * o símbolo como ele veio COM AVISO, em vez de um recorte que comeu metade do
 * desenho. Cair calado para um recorte ruim seria pior que não recortar.
 */
export const derivarLogosDaMarca = async (
  navegador: NavegadorParaDerivar,
  caminhoDoSimbolo: string,
): Promise<LogosEmBytes> => {
  const pagina = await navegador.newPage({ viewport: { width: 1024, height: 1024 } });
  try {
    // Uma página em branco de mesma origem: `canvas.toDataURL` recusa ler um
    // canvas "sujo", e uma página `about:blank` com imagem de data URI não suja.
    await pagina.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
    await pagina.evaluate<void>(AJUDANTE_DO_TRANSPILADOR);
    const versoes = await pagina.evaluate<LogosDerivadas, string>(
      derivarLogos,
      embutir(caminhoDoSimbolo),
    );
    return {
      transparente: bytesDoDataUri(versoes.transparente),
      fundoBranco: bytesDoDataUri(versoes.fundoBranco),
      fundoPreto: bytesDoDataUri(versoes.fundoPreto),
    };
  } finally {
    await pagina.close();
  }
};
