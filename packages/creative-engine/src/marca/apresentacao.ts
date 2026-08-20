import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { type DadosDaApresentacao, htmlDaApresentacao } from './apresentacao-html.js';

/**
 * A apresentação impressa: o HTML vira PDF no mesmo navegador que compõe tudo.
 *
 * `page.pdf()` do Chromium mantém o TEXTO como texto — selecionável, buscável,
 * e copiável por quem receber. Um PDF feito de prints seria uma pilha de
 * imagens que ninguém consegue citar, e a referência que o dono aprovou é
 * explicitamente um documento que se lê, não uma galeria.
 */

const MIME_POR_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Um arquivo em disco vira data URI, para a página não depender de rede nem de caminho. */
export const comoDataUri = (caminho: string): string => {
  const mime = MIME_POR_EXT[extname(caminho).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${readFileSync(caminho).toString('base64')}`;
};

export type NavegadorParaApresentar = {
  newPage(opts?: { viewport?: { width: number; height: number } }): Promise<{
    setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
    pdf(opts: {
      width: string;
      height: string;
      printBackground: boolean;
      pageRanges?: string;
    }): Promise<Buffer>;
    evaluate<Retorno>(expressao: string): Promise<Retorno>;
    close(): Promise<void>;
  }>;
};

/** A medida de A4 paisagem em 96dpi, que é a grade em que as páginas foram desenhadas. */
export const LARGURA_DA_PAGINA = 1123;
export const ALTURA_DA_PAGINA = 794;

export type ApresentacaoPronta = {
  readonly pdf: Uint8Array;
  /** O HTML que a gerou. Ele é a fonte editável, e viaja com o pacote. */
  readonly html: string;
  /** Quantas páginas saíram, contadas no documento. */
  readonly paginas: number;
};

export const renderizarApresentacao = async (
  navegador: NavegadorParaApresentar,
  dados: DadosDaApresentacao,
): Promise<ApresentacaoPronta> => {
  const html = htmlDaApresentacao(dados);
  const pagina = await navegador.newPage({
    viewport: { width: LARGURA_DA_PAGINA, height: ALTURA_DA_PAGINA },
  });
  try {
    await pagina.setContent(html, { waitUntil: 'load' });
    /**
     * Esperar as fontes ANTES de imprimir.
     *
     * `waitUntil: 'load'` cobre as imagens, e não a fonte embutida: o Chromium
     * a carrega em paralelo e, sem esta espera, a primeira página sai na letra
     * de reserva. É a mesma armadilha que C11 pega nas peças, e aqui ela não
     * teria nem quem a acusasse.
     */
    await pagina.evaluate<void>('document.fonts.ready.then(() => undefined)');
    const paginas = await pagina.evaluate<number>("document.querySelectorAll('section.p').length");
    const pdf = await pagina.pdf({
      width: `${LARGURA_DA_PAGINA}px`,
      height: `${ALTURA_DA_PAGINA}px`,
      printBackground: true,
    });
    return { pdf: new Uint8Array(pdf), html, paginas };
  } finally {
    await pagina.close();
  }
};
