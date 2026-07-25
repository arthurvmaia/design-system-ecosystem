import type {
  Confidence,
  NormalizedBox,
  NormalizedPoint,
  PointerPath,
  PointerPathKind,
  PointerReaction,
  PointerResponse,
  PointerSpeed,
} from '@ds/shared';
import { type PaginaV2, moverPara } from '../browser/page.js';
import { SONDAR_PONTO_FN, chamar } from '../instrumentation/index.js';
import type { RawMedida } from '../mapper/raw.js';
import { diffPng } from '../observe/pixel.js';
import { construirTrajetoria, trajetoriaRefinamento, unirRegioes } from './pointer-paths.js';

/**
 * Varredura do ponteiro pela viewport.
 *
 * O V1 dava `hover` na caixa do elemento e pronto. Cena que reage ao cursor —
 * partículas com atração, tilt de card, cursor magnético, câmera WebGL, gradiente
 * radial que segue o mouse — nunca era provocada, porque o ponteiro nunca
 * atravessava a tela.
 *
 * ## Como isto não fica caro
 *
 * Percorrer cada pixel está fora de questão, e um screenshot por ponto também
 * (256 pontos × screenshot ≈ minutos). O desenho é em duas passadas:
 *
 * 1. **Passada esparsa e barata.** Um `evaluate` por ponto (`SONDAR_PONTO_FN`),
 *    que identifica o alvo e o mede junto. Nada de imagem. O que se procura aqui
 *    é *suspeita*: cursor de interação, elemento que mediu diferente entre duas
 *    visitas, canvas/vídeo sob o ponteiro, ou uma sonda periódica da viewport
 *    inteira (para pegar reação renderizada em OUTRO lugar da tela).
 * 2. **Confirmação com experimento.** Para cada suspeita, o par correto: mede com
 *    o ponteiro FORA, mede com o ponteiro DENTRO, compara. Sem isso não há como
 *    saber se a diferença veio do ponteiro ou de uma animação que já estava
 *    rodando — e é exatamente esse engano que faria toda página animada parecer
 *    "reativa ao cursor".
 * 3. **Refinamento.** Onde houve reação de PIXEL sem DOM (cena em canvas), o
 *    ponteiro volta com uma grade densa dentro da região, para delimitá-la.
 */

/** Posição neutra: canto onde é improvável haver alvo interativo. */
const NEUTRO: NormalizedPoint = { x: 0.995, y: 0.005 };

type Sonda = {
  ref: number | null;
  refAncestral: number | null;
  tag: string;
  semDomInterno: boolean;
  cursor: string;
  pointerEvents: string;
  medida: RawMedida;
  box: { x: number; y: number; w: number; h: number };
  normalizedBox: NormalizedBox;
};

/** Cursores que anunciam interação. */
const CURSOR_INTERATIVO =
  /^(pointer|grab|grabbing|move|zoom-in|zoom-out|crosshair|col-resize|row-resize|ew-resize|ns-resize)$/;

/** As propriedades cuja mudança conta como reação visual. */
const PROPS_DE_REACAO: Array<[keyof RawMedida, PointerReaction]> = [
  ['transform', 'transform'],
  ['opacity', 'opacity'],
  ['filter', 'filter'],
  ['backgroundColor', 'estilo'],
  ['backgroundImage', 'estilo'],
  ['backgroundPosition', 'estilo'],
  ['color', 'estilo'],
  ['boxShadow', 'estilo'],
  ['borderColor', 'estilo'],
];

/** Compara duas medidas e diz o que mudou. */
export const diferencaDeMedida = (antes: RawMedida, depois: RawMedida): PointerReaction[] => {
  const out = new Set<PointerReaction>();
  for (const [prop, reacao] of PROPS_DE_REACAO) {
    if (antes[prop] !== depois[prop]) out.add(reacao);
  }
  if (antes.classes !== depois.classes) out.add('dom');
  if (antes.childCount !== depois.childCount || antes.textLen !== depois.textLen) out.add('dom');
  if (antes.animacoes !== depois.animacoes) out.add('animacao');
  // Deslocamento da caixa sem mudança de transform é layout reagindo.
  if (
    Math.abs(antes.box.x - depois.box.x) > 1 ||
    Math.abs(antes.box.y - depois.box.y) > 1 ||
    Math.abs(antes.box.w - depois.box.w) > 1 ||
    Math.abs(antes.box.h - depois.box.h) > 1
  ) {
    out.add('transform');
  }
  return [...out];
};

export type OpcoesVarredura = {
  /** Trajetória a executar. */
  kind: PointerPathKind;
  /** Densidade/ordem da trajetória. */
  densidade?: number;
  speed?: PointerSpeed;
  /** Espera após cada movimento, antes de sondar (ms). */
  assentarMs?: number;
  /** Sonda a viewport inteira a cada N pontos (0 = nunca). */
  sondaVisualCada?: number;
  /** Progresso de scroll atual, só para registrar no manifesto. */
  scrollProgress?: number;
  /** Refina as regiões que reagiram por pixel. */
  refinar?: boolean;
  /** Teto de confirmações (cada uma custa 2 medidas + esperas). */
  maxConfirmacoes?: number;
  /** Delta de pixel a partir do qual a viewport conta como reativa. */
  limiarPixel?: number;
  signal?: AbortSignal;
  /** Região a que a varredura se limita (para refinamento). */
  regiao?: NormalizedBox;
  /** Prefixo de id, para os ids não colidirem entre viewports. */
  idPrefixo?: string;
};

export type ResultadoVarredura = {
  path: PointerPath;
  respostas: PointerResponse[];
  /** Refs que reagiram — alimenta a pontuação de candidatos. */
  refsReativos: Map<number, number>;
  /** Regiões reativas sem DOM (cenas em canvas). */
  regioesSemDom: NormalizedBox[];
  /** A viewport inteira reagiu ao ponteiro (reação renderizada em outro lugar). */
  viewportReativa: boolean;
};

const velocidadeParaPassos = (v: PointerSpeed | undefined): number =>
  v === 'lento' ? 6 : v === 'rapido' ? 1 : 3;

/**
 * Executa uma trajetória e mede as reações.
 *
 * Nunca toca no mouse do sistema: tudo é `page.mouse`, o ponteiro virtual do
 * Chromium. As coordenadas são normalizadas e convertidas contra a viewport
 * daquele instante, então a mesma varredura vale em qualquer resolução.
 */
export const varrerPonteiro = async (
  page: PaginaV2,
  opts: OpcoesVarredura,
): Promise<ResultadoVarredura> => {
  const inicio = Date.now();
  const vp = page.viewport();
  const assentar = opts.assentarMs ?? 35;
  const passos = velocidadeParaPassos(opts.speed);
  const sondaCada = opts.sondaVisualCada ?? 16;
  const maxConfirmacoes = opts.maxConfirmacoes ?? 24;
  const limiarPixel = opts.limiarPixel ?? 0.004;
  const prefixo = opts.idPrefixo ?? 'p';

  const pontosBrutos =
    opts.kind === 'refinamento' && opts.regiao !== undefined
      ? trajetoriaRefinamento(opts.regiao, opts.densidade ?? 5)
      : construirTrajetoria(opts.kind, { densidade: opts.densidade, regiao: opts.regiao });
  const pontos = pontosBrutos;

  // Linha de base com o ponteiro FORA: é contra ela que a sonda visual compara.
  await moverPara(page, NEUTRO, { passos: 1 });
  await page.esperar(120);
  let baseVisual: Uint8Array | null = null;
  try {
    baseVisual = await page.screenshot();
  } catch {
    baseVisual = null;
  }

  // ── Passada 1: esparsa ────────────────────────────────────────────────────
  type Visita = { ponto: NormalizedPoint; sonda: Sonda; indice: number };
  const visitas: Visita[] = [];
  const porRef = new Map<number, Visita[]>();
  const suspeitas: Visita[] = [];
  const regioesPixel: NormalizedBox[] = [];
  let viewportReativa = false;

  for (let i = 0; i < pontos.length; i++) {
    if (opts.signal?.aborted === true) break;
    const ponto = pontos[i];
    if (ponto === undefined) continue;
    await moverPara(page, ponto, { passos });
    if (assentar > 0) await page.esperar(assentar);

    let sonda: Sonda | null = null;
    try {
      sonda = await page.evaluate<Sonda | null>(chamar(SONDAR_PONTO_FN, ponto.x, ponto.y));
    } catch {
      continue;
    }
    if (sonda === null) continue;

    const visita: Visita = { ponto, sonda, indice: i };
    visitas.push(visita);
    const ref = sonda.ref ?? sonda.refAncestral;
    if (ref !== null) {
      const lista = porRef.get(ref);
      if (lista === undefined) porRef.set(ref, [visita]);
      else lista.push(visita);
    }

    // Suspeita 1: cursor de interação.
    if (CURSOR_INTERATIVO.test(sonda.cursor)) suspeitas.push(visita);
    // Suspeita 2: cena sem DOM interno sob o ponteiro.
    else if (sonda.semDomInterno) suspeitas.push(visita);
    // Suspeita 3: o MESMO elemento mediu diferente entre duas visitas. Isso é
    // reação em movimento (o elemento respondeu ao ponteiro deslocando-se).
    else if (ref !== null) {
      const anteriores = porRef.get(ref) ?? [];
      const primeira = anteriores[0];
      if (
        primeira !== undefined &&
        primeira !== visita &&
        diferencaDeMedida(primeira.sonda.medida, sonda.medida).length > 0
      ) {
        suspeitas.push(visita);
      }
    }

    // Sonda visual periódica: pega reação pintada em OUTRO ponto da tela — uma
    // cena WebGL no topo que gira conforme o cursor no rodapé, por exemplo.
    if (sondaCada > 0 && baseVisual !== null && i > 0 && i % sondaCada === 0) {
      try {
        const agora = await page.screenshot();
        const d = diffPng(baseVisual, agora, { bloco: 32 });
        if (d.delta > limiarPixel) {
          viewportReativa = true;
          for (const r of d.regioes) regioesPixel.push(r);
        }
      } catch {
        // screenshot indisponível naquele instante: segue.
      }
    }
  }

  const duracao = Date.now() - inicio;

  // ── Passada 2: confirmação com experimento ───────────────────────────────
  const respostas: PointerResponse[] = [];
  const refsReativos = new Map<number, number>();
  const semDom: NormalizedBox[] = [];
  const jaConfirmado = new Set<string>();
  let confirmacoes = 0;

  const pathId = `${prefixo}_${opts.kind}`;

  for (const v of suspeitas) {
    if (opts.signal?.aborted === true) break;
    if (confirmacoes >= maxConfirmacoes) break;
    const ref = v.sonda.ref ?? v.sonda.refAncestral;
    const chave = `${ref ?? 'nodom'}:${Math.round(v.ponto.x * 50)}:${Math.round(v.ponto.y * 50)}`;
    if (jaConfirmado.has(chave)) continue;
    jaConfirmado.add(chave);
    confirmacoes++;

    const clip =
      v.sonda.box.w >= 4 && v.sonda.box.h >= 4
        ? {
            x: Math.max(0, Math.min(vp.width - 2, v.sonda.box.x)),
            y: Math.max(0, Math.min(vp.height - 2, v.sonda.box.y)),
            w: Math.max(2, Math.min(vp.width - Math.max(0, v.sonda.box.x), v.sonda.box.w)),
            h: Math.max(2, Math.min(vp.height - Math.max(0, v.sonda.box.y), v.sonda.box.h)),
          }
        : undefined;

    // Fora: o estado sem ponteiro.
    await moverPara(page, NEUTRO, { passos: 1 });
    await page.esperar(90);
    let fora: Sonda | null = null;
    let foraPixels: Uint8Array | null = null;
    try {
      fora = await page.evaluate<Sonda | null>(chamar(SONDAR_PONTO_FN, v.ponto.x, v.ponto.y));
      if (clip !== undefined) foraPixels = await page.screenshot({ clip });
    } catch {
      continue;
    }

    // Dentro: com o ponteiro no ponto.
    const t0 = Date.now();
    await moverPara(page, v.ponto, { passos });
    await page.esperar(90);
    let dentro: Sonda | null = null;
    let dentroPixels: Uint8Array | null = null;
    try {
      dentro = await page.evaluate<Sonda | null>(chamar(SONDAR_PONTO_FN, v.ponto.x, v.ponto.y));
      if (clip !== undefined) dentroPixels = await page.screenshot({ clip });
    } catch {
      continue;
    }
    const latencia = Date.now() - t0;
    if (fora === null || dentro === null) continue;

    const reacoes = new Set<PointerReaction>(diferencaDeMedida(fora.medida, dentro.medida));
    if (CURSOR_INTERATIVO.test(dentro.cursor) && dentro.cursor !== 'auto') reacoes.add('cursor');

    let deltaPixel = 0;
    if (foraPixels !== null && dentroPixels !== null) {
      const d = diffPng(foraPixels, dentroPixels, { bloco: 16 });
      deltaPixel = d.delta;
      if (deltaPixel > limiarPixel) {
        reacoes.add('pixels');
        if (v.sonda.semDomInterno) reacoes.add('canvas');
      }
    }

    if (reacoes.size === 0) continue;

    // Confiança: reação de pixel confirmada com experimento é alta; só cursor é
    // média (o CSS pode declarar `cursor:pointer` num elemento que nada faz).
    const soCursor = reacoes.size === 1 && reacoes.has('cursor');
    const confidence: Confidence = reacoes.has('pixels') ? 'alta' : soCursor ? 'media' : 'alta';

    respostas.push({
      id: `pr_${prefixo}_${respostas.length + 1}`,
      pathId,
      at: v.ponto,
      region: v.sonda.normalizedBox,
      domless: v.sonda.semDomInterno,
      reactions: [...reacoes],
      pixelDelta: deltaPixel,
      latencyMs: latencia,
      requests: [],
      confidence,
    });

    if (ref !== null && !v.sonda.semDomInterno) {
      refsReativos.set(ref, Math.max(refsReativos.get(ref) ?? 0, deltaPixel));
    }
    if (v.sonda.semDomInterno && reacoes.has('pixels')) {
      semDom.push(v.sonda.normalizedBox);
    }
  }

  // ── Refinamento das regiões sem DOM ──────────────────────────────────────
  const regioesSemDom = unirRegioes([...semDom, ...(viewportReativa ? regioesPixel : [])]);

  await moverPara(page, NEUTRO, { passos: 1 });

  return {
    path: {
      id: pathId,
      kind: opts.kind,
      speed: opts.speed ?? 'normal',
      points: pontos,
      viewport: { width: vp.width, height: vp.height },
      scrollProgress: opts.scrollProgress ?? 0,
      durationMs: duracao,
    },
    respostas,
    refsReativos,
    regioesSemDom,
    viewportReativa,
  };
};

/**
 * Decide se vale rodar as trajetórias complementares.
 *
 * A regra do pedido: complementares só com **orçamento E evidência de reação
 * visual**. Dez trajetórias numa página de texto é desperdício puro — e era esse
 * tipo de custo que fazia a extração levar minutos sem retorno.
 */
export const valeComplementares = (r: ResultadoVarredura): boolean =>
  r.viewportReativa ||
  r.regioesSemDom.length > 0 ||
  r.respostas.some((x) => x.reactions.includes('pixels') || x.reactions.includes('canvas'));
