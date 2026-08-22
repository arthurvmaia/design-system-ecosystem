import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { type ImagemDoIco, montarIco } from './ico.js';
import { type PecaDoPacote, htmlDaPecaDaMarca, medirQuadro } from './pacote-navegador.js';

/**
 * As peças derivadas do símbolo, do lado NODE.
 *
 * Nenhuma delas gasta crédito: são o mesmo símbolo reescalado, acompanhado do
 * nome em tipografia, ou recortado. É a fatia do brandbook que a referência
 * mostra em cinco páginas e que custa zero — e é por isso que 22 seções custam
 * 9 gerações, e não 22.
 */

/** Os tamanhos de favicon que a referência entrega. */
export const LADOS_DO_FAVICON = [16, 32, 48, 180, 512] as const;

/**
 * Os lados que entram no `.ico`.
 *
 * Só os três pequenos: o `.ico` é para a aba e para o atalho do sistema, e os
 * grandes (180 para iOS, 512 para PWA) são referenciados por `<link>` como PNG.
 * Enfiá-los no container inflaria o arquivo que TODA página carrega.
 */
export const LADOS_DO_ICO = [16, 32, 48] as const;

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

/** O mesmo ajudante que os outros módulos do navegador declaram, e pela mesma razão. */
const AJUDANTE_DO_TRANSPILADOR = 'globalThis.__name = globalThis.__name || ((alvo) => alvo)';

export type NavegadorParaPacote = {
  newPage(opts?: { viewport?: { width: number; height: number } }): Promise<{
    setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
    evaluate<Retorno, Arg>(
      fn: (arg: Arg) => Promise<Retorno> | Retorno,
      arg: Arg,
    ): Promise<Retorno>;
    evaluate<Retorno>(fn: () => Retorno): Promise<Retorno>;
    evaluate<Retorno>(expressao: string): Promise<Retorno>;
    screenshot(opts: {
      type: 'png';
      omitBackground?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    }): Promise<Buffer>;
    close(): Promise<void>;
  }>;
};

export type EntradaDoPacote = {
  /** O caminho do símbolo recortado (a versão transparente). */
  readonly simbolo: string;
  readonly nome: string;
  readonly cor: string;
  /** O `@font-face` da fonte da marca, com o arquivo dentro. */
  readonly fonteCss: string;
  readonly familia: string | null;
};

/** Desenha UMA peça e devolve os bytes do PNG. */
const desenhar = async (
  navegador: NavegadorParaPacote,
  entrada: EntradaDoPacote,
  peca: PecaDoPacote,
  lado: number,
  fundo: string | null,
): Promise<Uint8Array> => {
  // A janela nasce folgada porque a largura do lockup só se conhece depois de
  // medir: recortar pelo que foi medido é o que evita a faixa vazia dos lados,
  // que numa logo desalinha tudo o que a usa depois.
  const pagina = await navegador.newPage({
    viewport: { width: Math.max(2048, lado * 4), height: Math.max(1024, lado * 2) },
  });
  try {
    await pagina.setContent(
      htmlDaPecaDaMarca({
        simbolo: embutir(entrada.simbolo),
        nome: entrada.nome,
        cor: entrada.cor,
        fonteCss: entrada.fonteCss,
        familia: entrada.familia,
        peca,
        lado,
        fundo,
      }),
      { waitUntil: 'load' },
    );
    await pagina.evaluate<void>(AJUDANTE_DO_TRANSPILADOR);
    const caixa = await pagina.evaluate<{ largura: number; altura: number }>(medirQuadro);
    const png = await pagina.screenshot({
      type: 'png',
      omitBackground: fundo === null,
      clip: { x: 0, y: 0, width: caixa.largura, height: caixa.altura },
    });
    return new Uint8Array(png);
  } finally {
    await pagina.close();
  }
};

export type PacoteDerivado = {
  /** Peça → bytes do PNG. */
  readonly pngs: Readonly<Record<string, Uint8Array>>;
  /** O `favicon.ico`, com os três tamanhos pequenos dentro. */
  readonly ico: Uint8Array;
};

/**
 * Deriva o pacote inteiro a partir do símbolo.
 *
 * Uma página por peça, e não uma por tamanho de favicon reaproveitada: o
 * recorte depende da medida do quadro, que muda com a peça. Subir e derrubar
 * páginas é barato perto de errar o recorte de uma logo.
 */
export const derivarPacoteDaMarca = async (
  navegador: NavegadorParaPacote,
  entrada: EntradaDoPacote,
): Promise<PacoteDerivado> => {
  const pngs: Record<string, Uint8Array> = {};

  pngs['lockup-horizontal'] = await desenhar(navegador, entrada, 'lockup-horizontal', 512, null);
  pngs['lockup-vertical'] = await desenhar(navegador, entrada, 'lockup-vertical', 512, null);
  pngs['nome-por-extenso'] = await desenhar(navegador, entrada, 'nome-por-extenso', 256, null);

  const paraOIco: ImagemDoIco[] = [];
  for (const lado of LADOS_DO_FAVICON) {
    const png = await desenhar(navegador, entrada, 'simbolo', lado, null);
    pngs[`favicon-${lado}`] = png;
    if ((LADOS_DO_ICO as readonly number[]).includes(lado)) paraOIco.push({ lado, png });
  }

  return { pngs, ico: montarIco(paraOIco) };
};
