import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedBox, VisualComparison } from '@ds/shared';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import { LIMIAR_POR_NATUREZA, diffPng, melhorJanela } from './pixel.js';
import { decodePng } from './png.js';

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

/**
 * A natureza da região decide o limiar — nunca um número único para tudo.
 *
 * `temMovimentoMedido` é a observação temporal DESTA região: um pixel em
 * movimento medido vale mais que qualquer classificação. Sem ele, a decisão
 * era cega ao que o próprio motor mediu, e o acervo tinha os dois regimes
 * errados ao mesmo tempo: um site com tudo em 0,75 aprovando 45% de diferença
 * e outro com tudo em 0,02 reprovando 3%.
 */
export const naturezaDoSegmento = (
  seg: SegmentoV2,
  temMovimentoMedido?: boolean,
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
  if (temMovimentoMedido === true) return 'animada';
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
  /**
   * Regiões dinâmicas MEDIDAS pela observação temporal, já convertidas para o
   * espaço do recorte (0..1). Vídeo, marquee e canvas mudam entre dois
   * instantes por natureza — sem a máscara, o item reprovava por um motivo que
   * não é defeito. Elas eram medidas, tinham schema, e `masked` saía `[]` nas
   * 58 comparações do acervo.
   */
  mascaras?: NormalizedBox[];
  /** A observação temporal viu movimento cobrindo esta região? */
  temMovimentoMedido?: boolean;
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
export const ORIGEM_DA_REGIAO_FN = `
() => {
  var corpo = document.body;
  if (!corpo) return null;
  var alvo = null;
  for (var i = 0; i < corpo.children.length; i++) {
    var f = corpo.children[i];
    if (f.hasAttribute('data-ds-camadas-de-fundo')) continue;
    // O aviso da referencia visual e conversa do app com quem cura, nao a
    // regiao. Elege-lo fazia o recorte sair do canto do aviso e o delta
    // explodir num item que estava certo.
    if (f.hasAttribute('data-ds-aviso')) continue;
    var tag = f.tagName ? f.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'link') continue;
    alvo = f;
    break;
  }
  if (!alvo) return null;
  // O MESMO estado do print de referência: a referência foi tirada com a
  // seção rolada para dentro da viewport e o reveal assentado. Fotografar o
  // bundle em scroll zero comparava dois instantes diferentes por construção,
  // e toda peça com animação de entrada reprovava pelo estado, não pelo
  // conteúdo.
  try { alvo.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch (e) {
    try { window.scrollTo(0, 0); } catch (e2) {}
  }
  var r = alvo.getBoundingClientRect();
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
    // A viewport vem junto para o recorte poder ser preso a ela: pedir um
    // recorte que passa da borda devolve uma imagem menor, e a comparação
    // descartava o item por "tamanho diferente" — enquadramento virando
    // veredito de fidelidade.
    vw: window.innerWidth,
    vh: window.innerHeight
  };
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
   * Referência visual é O PRÓPRIO frame embrulhado num <img>: compará-la com o
   * frame aprovaria de graça exatamente a classe que o motor declarou não
   * reproduzível, inflando a cobertura. Tautologia não é verificação.
   */
  | 'referencia-visual'
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
  /**
   * Quanto tempo ainda resta para esta fase, em ms.
   *
   * `cancelado` sozinho não bastava. Ele só vira `true` DEPOIS que o teto já
   * estourou, e cada item custa ~1,5 s — então a fase passava do próprio limite
   * pelo custo do último item que ela começou. Medido: teto de 9,6 s, gasto de
   * 14 s, 46% além. Com o tempo restante em mãos, ela não COMEÇA um item que
   * não cabe.
   */
  restanteMs?: () => number;
  /** Custo estimado de um item. Sobe sozinho conforme os itens reais medem. */
  custoInicialMs?: number;
}): Promise<ResultadoComparacao> => {
  const saida: VisualComparison[] = [];
  const pulados: Record<MotivoDePular, number> = {
    'sem-arquivo': 0,
    'print-ilegivel': 0,
    'sem-regiao': 0,
    'tamanho-diferente': 0,
    'referencia-visual': 0,
    orcamento: 0,
    erro: 0,
  };

  // O custo de um item, aprendido com os itens já feitos. Começa numa
  // estimativa e é corrigido pela medição — um bundle pesado numa máquina lenta
  // custa muito mais que um leve, e um número fixo erraria nos dois sentidos.
  let custoPorItem = opts.custoInicialMs ?? 1_800;
  let feitos = 0;
  let gasto = 0;

  for (let i = 0; i < opts.entradas.length; i++) {
    const e = opts.entradas[i];
    if (e === undefined) continue;
    if (opts.cancelado?.() === true) {
      pulados.orcamento += opts.entradas.length - i;
      break;
    }
    // Não começar o que não cabe. `cancelado` só acusa depois do estouro.
    const restante = opts.restanteMs?.();
    if (restante !== undefined && restante < custoPorItem) {
      pulados.orcamento += opts.entradas.length - i;
      break;
    }
    const inicioDoItem = Date.now();

    if (e.segmento.representation.type === 'referencia-visual') {
      pulados['referencia-visual']++;
      continue;
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

      // Duas leituras com 400 ms entre elas, DE PROPÓSITO: a primeira rola a
      // região para dentro da viewport (dispara o reveal por scroll), a espera
      // é a MESMA que o print de referência recebeu na origem, e a segunda
      // mede a região já assentada. Sem isso a comparação media estado, não
      // fidelidade: print pós-reveal contra bundle em scroll zero.
      await opts.pagina.evaluate<unknown>(`(${ORIGEM_DA_REGIAO_FN})()`);
      await opts.pagina.esperar(400);
      const origem = await opts.pagina.evaluate<{
        x: number;
        y: number;
        w: number;
        h: number;
        vw: number;
        vh: number;
      } | null>(`(${ORIGEM_DA_REGIAO_FN})()`);
      if (origem === null) {
        pulados['sem-regiao']++;
        continue;
      }

      // O recorte tem as dimensões do PRINT, a partir de onde a região começa
      // no bundle. Assim as duas imagens têm o mesmo tamanho e a comparação
      // fala do conteúdo, não do enquadramento.
      //
      // E ele é PRESO À VIEWPORT antes de sair. Quando a região começava baixo
      // na página, o recorte pedido passava da borda e o navegador devolvia uma
      // imagem menor — que caía em `tamanho-diferente` e sumia da cobertura por
      // um motivo de enquadramento, não de fidelidade. Ajustar a origem para
      // trás preserva o tamanho do recorte, que é o que a comparação exige.
      const x = Math.max(0, Math.min(origem.x, origem.vw - dim.w));
      const y = Math.max(0, Math.min(origem.y, origem.vh - dim.h));
      if (dim.w > origem.vw || dim.h > origem.vh) {
        // O print é maior que a viewport do bundle: nem recuando cabe. Isso é
        // incomparável de verdade, e não um erro de enquadramento.
        pulados['tamanho-diferente']++;
        continue;
      }
      const doBundle = await opts.pagina.screenshot({
        clip: { x, y, w: dim.w, h: dim.h },
      });

      const natureza = naturezaDoSegmento(e.segmento, e.temMovimentoMedido);
      const limiar = LIMIAR_POR_NATUREZA[natureza];
      const mascaras = e.mascaras ?? [];
      const r = diffPng(original, doBundle, { mascaras });
      if (r.incomparavel) {
        pulados['tamanho-diferente']++;
        continue;
      }

      // Se reprovou, procurar a MENOR diferença numa janela de ±8 px antes de
      // condenar. Em tira fina (frames de 80 px no acervo), um deslocamento de
      // nada altera quase todas as linhas — e "3 px mais baixo" é enquadramento
      // que vira DADO (`offset`), não infidelidade.
      let delta = Math.min(1, Math.max(0, r.delta));
      let offset: { x: number; y: number } | undefined;
      if (delta > limiar && !r.degradado) {
        try {
          const MARGEM = 8;
          const ex = Math.max(0, x - MARGEM);
          const ey = Math.max(0, y - MARGEM);
          const ew = Math.min(origem.vw - ex, dim.w + 2 * MARGEM);
          const eh = Math.min(origem.vh - ey, dim.h + 2 * MARGEM);
          const expandida = decodePng(
            await opts.pagina.screenshot({ clip: { x: ex, y: ey, w: ew, h: eh } }),
          );
          const offsets: Array<{ dx: number; dy: number }> = [];
          for (let dy = -MARGEM; dy <= MARGEM; dy += 4) {
            for (let dx = -MARGEM; dx <= MARGEM; dx += 4) offsets.push({ dx, dy });
          }
          const m = melhorJanela(decodePng(original), expandida, x - ex, y - ey, offsets, {
            mascaras,
          });
          if (m.delta < delta) {
            delta = Math.min(1, Math.max(0, m.delta));
            if (m.dx !== 0 || m.dy !== 0) offset = { x: m.dx, y: m.dy };
          }
        } catch {
          // a busca de deslocamento é refinamento; sem ela vale o delta direto
        }
      }

      saida.push({
        a: 'captura',
        b: 'bundle',
        // O dono, escrito na hora em que ele é conhecido. Sem isto a leitura
        // dependia da ordem do array, que qualquer item pulado quebra calado.
        segmentHash: e.segmento.hash,
        position: e.segmento.position,
        nature: natureza,
        threshold: limiar,
        delta,
        ok: delta <= limiar,
        masked: mascaras,
        ...(offset !== undefined ? { offset } : {}),
      });
    } catch {
      // Bundle que não abre, recorte fora da viewport, decode que falhou: a
      // comparação daquele item não existe. Melhor que um número inventado.
      pulados.erro++;
    } finally {
      // A estimativa aprende com o que aconteceu, inclusive com os itens que
      // falharam: eles também consomem tempo.
      feitos++;
      gasto += Date.now() - inicioDoItem;
      custoPorItem = Math.max(250, Math.round(gasto / feitos));
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
