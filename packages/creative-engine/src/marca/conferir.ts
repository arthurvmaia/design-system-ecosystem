import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { MarcaParaAceite } from '@ds/shared';
import type { NavegadorParaDerivar } from './derivar.js';
import { type MedidaDaPeca, type ModoDeLeitura, distanciaDeSilhueta, medirPeca } from './medir.js';

/**
 * O lado NODE da medição da marca: abre os arquivos num navegador e devolve o
 * que a régua cobra.
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

/**
 * Como reconhecer a marca em cada versão.
 *
 * Cada uma guarda a forma de um jeito, e é por isso que o modo é por versão: na
 * transparente ela está no alfa, na de fundo branco ela é o que NÃO é branco, e
 * na monocromática ela é o que é claro. Ler as três do mesmo jeito daria três
 * silhuetas diferentes para o mesmo desenho, e M4 reprovaria uma marca correta.
 */
const MODO_POR_PECA: Record<string, ModoDeLeitura> = {
  logotipo: 'alfa',
  'logotipo-fundo-branco': 'sobre-claro',
  'logotipo-fundo-preto': 'sobre-escuro',
};

export type MedidasDaMarca = {
  readonly porPeca: Record<string, MedidaDaPeca>;
  /** A MAIOR distância entre duas das versões. É ela que M4 confere. */
  readonly distanciaEntreVersoes: number | null;
};

/**
 * Mede os arquivos da marca.
 *
 * `arquivos` é `{ peca: caminho }`. Peça ausente simplesmente não é medida — a
 * régua trata a ausência, e inventar uma medida aqui seria dar o número que ela
 * usaria para aprovar.
 */
export const medirMarca = async (
  navegador: NavegadorParaDerivar,
  arquivos: Readonly<Record<string, string>>,
): Promise<MedidasDaMarca> => {
  const pagina = await navegador.newPage({ viewport: { width: 64, height: 64 } });
  try {
    await pagina.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
    await pagina.evaluate<void>(AJUDANTE_DO_TRANSPILADOR);

    const porPeca: Record<string, MedidaDaPeca> = {};
    for (const [peca, caminho] of Object.entries(arquivos)) {
      porPeca[peca] = await pagina.evaluate<MedidaDaPeca, { origem: string; modo: ModoDeLeitura }>(
        medirPeca,
        { origem: embutir(caminho), modo: MODO_POR_PECA[peca] ?? 'alfa' },
      );
    }

    /**
     * A distância é entre as VERSÕES, e não contra o símbolo de origem.
     *
     * O original não foi recortado nem recentrado, então ele difere das três
     * por construção — compará-lo reprovaria toda marca correta. O que prova
     * "a mesma marca em três roupas" é as três concordarem entre si: elas saem
     * do mesmo desenho, e três gerações independentes não sairiam.
     */
    const silhuetas = Object.keys(MODO_POR_PECA)
      .map((peca) => porPeca[peca]?.silhueta)
      .filter((s): s is readonly number[] => s !== undefined);
    let distanciaEntreVersoes: number | null = null;
    if (silhuetas.length >= 2) {
      let maior = 0;
      for (let i = 0; i < silhuetas.length; i += 1) {
        for (let j = i + 1; j < silhuetas.length; j += 1) {
          const d = distanciaDeSilhueta(silhuetas[i] as number[], silhuetas[j] as number[]);
          if (Number.isFinite(d) && d > maior) maior = d;
        }
      }
      distanciaEntreVersoes = maior;
    }

    return { porPeca, distanciaEntreVersoes };
  } finally {
    await pagina.close();
  }
};

/** As medidas no formato que a régua espera. */
export const paraARegua = (
  medidas: MedidasDaMarca,
): Pick<MarcaParaAceite, 'pecas' | 'distanciaEntreVersoes'> => ({
  pecas: Object.fromEntries(
    Object.entries(medidas.porPeca).map(([peca, m]) => [
      peca,
      {
        largura: m.largura,
        altura: m.altura,
        alfaMinimo: m.alfaMinimo,
        alfaMaximo: m.alfaMaximo,
        fracaoIntermediaria: m.fracaoIntermediaria,
      },
    ]),
  ) as MarcaParaAceite['pecas'],
  distanciaEntreVersoes: medidas.distanciaEntreVersoes,
});
