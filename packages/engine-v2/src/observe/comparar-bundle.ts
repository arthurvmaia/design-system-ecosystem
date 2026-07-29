import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VisualComparison } from '@ds/shared';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import { LIMIAR_POR_NATUREZA, diffPng } from './pixel.js';

/**
 * A pergunta que o resto da medição não responde: **parece igual?**
 *
 * Contar regras de CSS diz que o estilo viajou. Não diz que a peça se parece com
 * o que estava na página — um bundle pode levar 100% do CSS e sair errado por um
 * ancestral que não veio junto, por uma fonte que não carregou, por um fundo que
 * ficou noutro item. Todas essas falhas são invisíveis para quem conta regras.
 *
 * Aqui o bundle é ABERTO NO NAVEGADOR, sozinho, e o que ele desenha é comparado
 * com o print daquela mesma dobra na página de origem. É a única verificação que
 * fecha o laço, e é por isso que `visualComparisons` existia no manifesto desde
 * o começo — só era gravado vazio.
 *
 * Duas decisões que fazem a medida ser honesta:
 *
 * **O limiar depende da natureza da região.** Uma dobra estática que muda 3%
 * está errada; um canvas de partículas que muda 60% entre dois instantes está
 * certo, porque o bundle nunca vai reproduzir os mesmos pixels de um
 * `Math.random()`. `LIMIAR_POR_NATUREZA` já existia com essa regra escrita.
 *
 * **Tamanho diferente é `incomparável`, não "diferença de 100%".** Comparar
 * imagens de dimensões diferentes produziria um número que parece medição e não
 * é. Quando o recorte não fecha, a comparação simplesmente não entra.
 */

/** A natureza da região decide o limiar — nunca um número único para tudo. */
export const naturezaDoSegmento = (
  seg: SegmentoV2,
): 'estatica' | 'animada' | 'video' | 'canvas' | 'runtime-externo' => {
  const modo = seg.representation.renderMode;
  if (modo === 'video') return 'video';
  if (modo === 'canvas' || modo === 'webgl') return 'canvas';
  // Runtime que DESENHA o conteúdo (ícones, fundo em canvas, Tailwind por CDN):
  // o bundle depende de rede para ficar igual, e a primeira carga quase nunca
  // chega no mesmo instante. Exigir precisão aqui seria reprovar o que está
  // certo.
  const dependeDeRuntimeExterno = seg.representation.runtimes.some(
    (r) => r === 'iconify' || r === 'tailwind-cdn' || r === 'fundo-canvas',
  );
  if (dependeDeRuntimeExterno) return 'runtime-externo';
  if (modo === 'lottie' || modo === 'svg-animado' || modo === 'misto') return 'animada';
  if (seg.interactions.length > 0 && modo === 'html-js') return 'animada';
  return 'estatica';
};

/** O mínimo que a comparação precisa de uma página — para o teste não abrir navegador. */
export type PaginaParaComparar = {
  goto: (url: string) => Promise<void>;
  esperar: (ms: number) => Promise<void>;
  /**
   * Espera as fontes assentarem, com teto.
   *
   * Uma pausa fixa era o custo dominante por item — e quase sempre maior que o
   * necessario. Sem esperar, porem, o bundle e fotografado com a fonte de
   * reserva e a diferenca medida vira a da fonte, nao a do bundle.
   */
  esperarFontes: (tetoMs: number) => Promise<void>;
  evaluate: <T>(expressao: string) => Promise<T>;
  screenshot: (opts?: {
    clip?: { x: number; y: number; w: number; h: number };
  }) => Promise<Uint8Array>;
  fechar: () => Promise<void>;
};

export type EntradaComparacao = {
  segmento: SegmentoV2;
  /** Diretório do bundle escrito. */
  dirBundle: string;
  /** Caminho do print da dobra, relativo ao diretório de captura. */
  framePath: string;
};

/**
 * Onde a região começa dentro do bundle, e de que tamanho ela é.
 *
 * O `<body>` do documento compilado não tem reset, então a margem padrão de 8px
 * do navegador deslocaria tudo — comparar a partir de (0,0) daria diferença em
 * 100% dos casos, por um motivo que não tem nada a ver com fidelidade.
 *
 * As camadas de fundo recompostas também são puladas: elas são irmãs do
 * conteúdo e ficam ANTES dele, então o primeiro filho do body não é a região.
 */
const ORIGEM_DA_REGIAO_FN = `
() => {
  var corpo = document.body;
  if (!corpo) return null;
  var alvo = null;
  for (var i = 0; i < corpo.children.length; i++) {
    var f = corpo.children[i];
    if (f.hasAttribute('data-ds-camadas-de-fundo')) continue;
    var tag = f.tagName ? f.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'link') continue;
    alvo = f;
    break;
  }
  if (!alvo) return null;
  try { window.scrollTo(0, 0); } catch (e) {}
  var r = alvo.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}
`;

/** Dimensões de um PNG, lidas do cabeçalho IHDR. */
const dimensoesDoPng = (bytes: Uint8Array): { w: number; h: number } | null => {
  // PNG: 8 bytes de assinatura, 4 de tamanho, 'IHDR', então largura e altura.
  if (bytes.length < 24) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(12) !== 0x49484452) return null; // 'IHDR'
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
};

/**
 * Compara cada bundle com o print da dobra correspondente.
 *
 * Não lança: uma comparação que não dá certo some da lista em vez de derrubar a
 * captura. O que a captura mediu é caro demais para ser perdido por causa de
 * uma verificação.
 */
/** Por que um item ficou de fora. Cobertura silenciosa é cobertura mentirosa. */
export type MotivoDePular =
  | 'sem-arquivo'
  | 'print-ilegivel'
  | 'sem-regiao'
  | 'tamanho-diferente'
  /**
   * O orçamento acabou antes de a lista terminar.
   *
   * Era o único caminho de saída que não contava nada — um `break` calado. E
   * era justamente o mais frequente: medido, ele explicava 3 dos 7 itens que
   * "sumiam" entre a lista e o resultado. Corte por tempo é uma limitação como
   * qualquer outra e precisa aparecer.
   */
  | 'orcamento'
  | 'erro';

export type ResultadoComparacao = {
  comparacoes: VisualComparison[];
  /** Quantos itens ficaram de fora, por motivo. */
  pulados: Record<MotivoDePular, number>;
};

export const compararBundlesComOriginal = async (opts: {
  pagina: PaginaParaComparar;
  entradas: readonly EntradaComparacao[];
  dirCaptura: string;
  /** Corta a lista quando o orçamento acaba. */
  cancelado?: () => boolean;
}): Promise<ResultadoComparacao> => {
  const saida: VisualComparison[] = [];
  const pulados: Record<MotivoDePular, number> = {
    'sem-arquivo': 0,
    'print-ilegivel': 0,
    'sem-regiao': 0,
    'tamanho-diferente': 0,
    orcamento: 0,
    erro: 0,
  };

  for (let i = 0; i < opts.entradas.length; i++) {
    const e = opts.entradas[i];
    if (e === undefined) continue;
    if (opts.cancelado?.() === true) {
      pulados.orcamento += opts.entradas.length - i;
      break;
    }

    const indexPath = join(e.dirBundle, 'index.html');
    const framePath = join(opts.dirCaptura, e.framePath);
    if (!existsSync(indexPath) || !existsSync(framePath)) {
      pulados['sem-arquivo']++;
      continue;
    }

    let original: Uint8Array;
    try {
      original = readFileSync(framePath);
    } catch {
      pulados['print-ilegivel']++;
      continue;
    }
    const dim = dimensoesDoPng(original);
    if (dim === null || dim.w < 8 || dim.h < 8) {
      pulados['print-ilegivel']++;
      continue;
    }

    try {
      await opts.pagina.goto(`file:///${indexPath.replace(/\\/g, '/')}`);
      // Fonte web e imagem preguiçosa precisam de um instante. Sem isto o
      // bundle é fotografado com a fonte de fallback e a diferença medida é a
      // da fonte, não a do bundle.
      await opts.pagina.esperarFontes(900);

      const origem = await opts.pagina.evaluate<{
        x: number;
        y: number;
        w: number;
        h: number;
      } | null>(`(${ORIGEM_DA_REGIAO_FN})()`);
      if (origem === null) {
        pulados['sem-regiao']++;
        continue;
      }

      // O recorte tem as dimensões do PRINT, a partir de onde a região começa
      // no bundle. Assim as duas imagens têm o mesmo tamanho e a comparação
      // fala do conteúdo, não do enquadramento.
      const doBundle = await opts.pagina.screenshot({
        clip: { x: origem.x, y: origem.y, w: dim.w, h: dim.h },
      });

      const natureza = naturezaDoSegmento(e.segmento);
      const limiar = LIMIAR_POR_NATUREZA[natureza];
      const r = diffPng(original, doBundle);
      if (r.incomparavel) {
        pulados['tamanho-diferente']++;
        continue;
      }

      saida.push({
        a: 'captura',
        b: 'bundle',
        nature: natureza,
        threshold: limiar,
        delta: Math.min(1, Math.max(0, r.delta)),
        ok: r.delta <= limiar,
        masked: [],
      });
    } catch {
      // Bundle que não abre, recorte fora da viewport, decode que falhou: a
      // comparação daquele item não existe. Melhor que um número inventado.
      pulados.erro++;
    }
  }

  return { comparacoes: saida, pulados };
};

/** O resumo que vira log e limitação: quantos passaram, quantos não, quantos ficaram de fora. */
export const resumirComparacoes = (
  r: ResultadoComparacao,
): { total: number; ok: number; piorDelta: number; pulados: number; porMotivo: string } => {
  let ok = 0;
  let pior = 0;
  for (const c of r.comparacoes) {
    if (c.ok) ok++;
    if (c.delta > pior) pior = c.delta;
  }
  const motivos = Object.entries(r.pulados)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${m}:${n}`)
    .join(' ');
  return {
    total: r.comparacoes.length,
    ok,
    piorDelta: Math.round(pior * 1000) / 1000,
    pulados: Object.values(r.pulados).reduce((a, b) => a + b, 0),
    porMotivo: motivos,
  };
};
