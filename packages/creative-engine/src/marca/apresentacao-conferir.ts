import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { type MedidaDaApresentacao, medirApresentacao } from './apresentacao-medir.js';
import type { NavegadorParaDerivar } from './derivar.js';
import { distanciaVisual, medirPeca } from './medir.js';

/**
 * A apresentação, MEDIDA.
 *
 * Ela nasceu sem régua, e a primeira consequência apareceu na primeira leitura:
 * um conceito de banner saiu recortado, com a headline cortada no meio, numa
 * página cujo propósito é mostrar a peça inteira. Quem viu foi o olho.
 *
 * Aqui a mesma técnica que pegou o texto fora do quadro nas peças: abrir no
 * navegador e comparar geometria, em vez de confiar no CSS.
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

const AJUDANTE_DO_TRANSPILADOR = 'globalThis.__name = globalThis.__name || ((alvo) => alvo)';

export const medirApresentacaoPronta = async (
  navegador: NavegadorParaDerivar & {
    newPage(opts?: { viewport?: { width: number; height: number } }): Promise<{
      setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
      evaluate<R, A>(fn: (a: A) => Promise<R> | R, a: A): Promise<R>;
      evaluate<R>(fn: () => R): Promise<R>;
      evaluate<R>(expressao: string): Promise<R>;
      close(): Promise<void>;
    }>;
  },
  html: string,
): Promise<MedidaDaApresentacao> => {
  const pagina = await navegador.newPage({ viewport: { width: 1123, height: 794 } });
  try {
    await pagina.setContent(html, { waitUntil: 'load' });
    await pagina.evaluate<void>('document.fonts.ready.then(() => undefined)');
    await pagina.evaluate<void>(AJUDANTE_DO_TRANSPILADOR);
    /*
     * A função vai INTEIRA, e não embrulhada.
     *
     * Um `() => medirApresentacao()` parece equivalente e não é: a injeção
     * serializa pelo `toString()`, e o embrulho carrega junto a referência ao
     * MÓDULO de onde a função veio — que na página não existe. O erro é um
     * `ReferenceError` com o nome que o transpilador inventou, e ele só aparece
     * na execução.
     */
    return await pagina.evaluate<MedidaDaApresentacao, null>(
      medirApresentacao as unknown as (a: null) => MedidaDaApresentacao,
      null,
    );
  } finally {
    await pagina.close();
  }
};

/**
 * A MENOR distância entre duas artes, e quantas há.
 *
 * É o número que responde "estão todas com a mesma ideia de arte?". Comparar
 * todos os pares e ficar com o MENOR é o certo: basta um par igual para o
 * cliente ver repetição, mesmo que os outros sejam diferentes.
 */
export const compararArtes = async (
  navegador: Parameters<typeof medirApresentacaoPronta>[0],
  caminhos: readonly string[],
): Promise<{ menorDistancia: number | null; quantas: number }> => {
  if (caminhos.length < 2) return { menorDistancia: null, quantas: caminhos.length };
  const pagina = await navegador.newPage({ viewport: { width: 64, height: 64 } });
  try {
    await pagina.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
    await pagina.evaluate<void>(AJUDANTE_DO_TRANSPILADOR);
    const assinaturas: number[][] = [];
    for (const caminho of caminhos) {
      const m = await pagina.evaluate<
        { assinatura: readonly number[] },
        { origem: string; modo: 'alfa' }
      >(medirPeca, { origem: embutir(caminho), modo: 'alfa' });
      assinaturas.push([...m.assinatura]);
    }
    let menor = Number.POSITIVE_INFINITY;
    for (let i = 0; i < assinaturas.length; i += 1) {
      for (let j = i + 1; j < assinaturas.length; j += 1) {
        const d = distanciaVisual(assinaturas[i] as number[], assinaturas[j] as number[]);
        if (Number.isFinite(d) && d < menor) menor = d;
      }
    }
    return {
      menorDistancia: Number.isFinite(menor) ? menor : null,
      quantas: caminhos.length,
    };
  } finally {
    await pagina.close();
  }
};
