import type {
  BackgroundDetection,
  BackgroundSource,
  Confidence,
  LayerRole,
  MediaDetection,
  MediaKind,
  NodeRealm,
  RuntimeDetection,
  StructuralNode,
  StructuralRole,
  VisualLayer,
} from '@ds/shared';
import { RuntimeKind } from '@ds/shared';
import { montarFingerprint } from '../identity/fingerprint.js';
import type { BoxPx, RawColeta, RawInstrumentacao, RawNode } from './raw.js';

/**
 * Construção dos mapas — funções puras sobre a coleta crua.
 *
 * Aqui mora a correção do erro mais consequente do V1: **a posse de uma camada é
 * decidida por contenção geométrica, não por parentesco no DOM**. Um overlay
 * `position:fixed` que cobre o hero está, no DOM, no fim do `<body>`; um
 * background `position:absolute` pode estar num wrapper irmão. O V1 associava
 * por igualdade de id/classe depois da segmentação, e por isso o fundo ia para a
 * seção errada — ou virava um card preto avulso.
 *
 * Nada aqui abre navegador: recebe a coleta, devolve as estruturas do manifesto.
 * É o que permite testar "este overlay pertence ao hero" sem subir o Chromium.
 */

// ── Papéis ───────────────────────────────────────────────────────────────────

const PAPEIS_VALIDOS: ReadonlySet<string> = new Set<StructuralRole>([
  'document',
  'header',
  'nav',
  'hero',
  'main',
  'section',
  'article',
  'aside',
  'footer',
  'form',
  'list',
  'listitem',
  'card',
  'group',
  'button',
  'link',
  'heading',
  'text',
  'image',
  'video',
  'canvas',
  'svg',
  'iframe',
  'shadow-host',
  'media-group',
  'decoration',
  'unknown',
]);

const papelValido = (p: string): StructuralRole =>
  PAPEIS_VALIDOS.has(p) ? (p as StructuralRole) : 'unknown';

const CAMADAS_VALIDAS: ReadonlySet<string> = new Set<LayerRole>([
  'background',
  'overlay',
  'content',
  'decoration',
  'media',
  'sticky',
  'fixed',
  'portal',
]);

const camadaValida = (c: string): LayerRole =>
  CAMADAS_VALIDAS.has(c) ? (c as LayerRole) : 'content';

/**
 * Papéis que podem ser DONOS de camada. É a lista de "coisas que uma pessoa
 * chamaria de seção" — e inclui `hero`, que não é tag nenhuma mas é o que a
 * Galeria mostra.
 */
const PAPEIS_DE_SECAO: ReadonlySet<StructuralRole> = new Set<StructuralRole>([
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'form',
  'hero',
]);

// ── Geometria ────────────────────────────────────────────────────────────────

const area = (b: BoxPx): number => Math.max(0, b.w) * Math.max(0, b.h);

/** Área da interseção de duas caixas. */
export const intersecao = (a: BoxPx, b: BoxPx): number => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 <= x || y2 <= y ? 0 : (x2 - x) * (y2 - y);
};

/**
 * Fração de `dentro` que cai em `fora`. É a medida que decide posse: um fundo
 * inteiramente sobre o hero tem 1; um que vaza para a próxima seção tem menos.
 */
export const contido = (dentro: BoxPx, fora: BoxPx): number => {
  const a = area(dentro);
  return a === 0 ? 0 : intersecao(dentro, fora) / a;
};

/** Contenção a partir da qual consideramos "esta camada é daquela seção". */
export const LIMIAR_CONTENCAO = 0.72;

// ── Mapa estrutural ─────────────────────────────────────────────────────────

const realmDe = (r: RawNode['realm']): NodeRealm =>
  r === 'shadow-open' ? 'shadow-open' : 'document';

/**
 * Um nó `<section>`/faixa cheia que contém o `<h1>` é o hero — e o hero é o item
 * que o V1 mais errava, porque o hero raramente vem embrulhado.
 */
const promoverHero = (nos: RawNode[]): Set<number> => {
  const heros = new Set<number>();
  // O `<h1>` mora no hero. Sobe do h1 até o primeiro ancestral que seja seção
  // (por papel) e esteja no topo da página.
  const porRef = new Map(nos.map((n) => [n.ref, n]));
  for (const n of nos) {
    if (!/^h1$/.test(n.tag)) continue;
    let atual: RawNode | undefined = n;
    let saltos = 0;
    while (atual !== undefined && saltos < 12) {
      const papel = papelValido(atual.papel);
      const noTopo = atual.pageBox.y < Math.max(200, atual.pageBox.h);
      if (PAPEIS_DE_SECAO.has(papel) && noTopo && atual.ref !== n.ref) {
        heros.add(atual.ref);
        break;
      }
      atual = atual.parentRef === null ? undefined : porRef.get(atual.parentRef);
      saltos++;
    }
  }
  return heros;
};

export const construirMapaEstrutural = (
  coleta: RawColeta,
): { nos: StructuralNode[]; porRef: Map<number, StructuralNode> } => {
  const heros = promoverHero(coleta.nos);
  const hashPorRef = new Map<number, string>();
  const parciais: Array<{ raw: RawNode; node: StructuralNode }> = [];

  for (const raw of coleta.nos) {
    const fingerprint = montarFingerprint({
      tag: raw.tag,
      role: raw.role,
      aria: raw.aria,
      dataAttrs: raw.dataAttrs,
      text: raw.text,
      classes: raw.classes,
      id: raw.id,
      semanticAncestor: raw.semanticAncestor,
      siblingIndex: raw.siblingIndex,
      structuralSignature: raw.structuralSignature,
      box: raw.normalizedBox,
      listeners: raw.listeners,
      cursor: raw.cursor,
    });
    hashPorRef.set(raw.ref, fingerprint.hash);

    const node: StructuralNode = {
      fingerprint,
      role: heros.has(raw.ref) ? 'hero' : papelValido(raw.papel),
      realm: realmDe(raw.realm),
      parent: null,
      depth: raw.depth ?? 0,
      pageBox: raw.pageBox,
      areaShare: raw.areaShare,
      ownText: raw.ownText,
      subtreeTextLength: raw.subtreeTextLength,
      mediaTags: raw.midiaTags,
      visible: raw.visivel,
    };
    parciais.push({ raw, node });
  }

  // Segunda passada: resolve o pai por hash (o ref é da sessão; o hash viaja).
  const nos: StructuralNode[] = [];
  const porRef = new Map<number, StructuralNode>();
  for (const { raw, node } of parciais) {
    const comPai: StructuralNode = {
      ...node,
      parent: raw.parentRef === null ? null : (hashPorRef.get(raw.parentRef) ?? null),
    };
    nos.push(comPai);
    porRef.set(raw.ref, comPai);
  }
  return { nos, porRef };
};

// ── Posse de camada ─────────────────────────────────────────────────────────

export type Secao = {
  ref: number;
  hash: string;
  pageBox: BoxPx;
  role: StructuralRole;
  /** Refs dos ancestrais no DOM, do mais próximo ao mais distante. */
  ancestrais: number[];
};

/** As seções candidatas a dona, das menores para as maiores. */
export const secoesCandidatas = (coleta: RawColeta, mapa: Map<number, StructuralNode>): Secao[] => {
  const porRef = new Map(coleta.nos.map((n) => [n.ref, n]));
  const out: Secao[] = [];
  for (const raw of coleta.nos) {
    const node = mapa.get(raw.ref);
    if (node === undefined) continue;
    if (!PAPEIS_DE_SECAO.has(node.role)) continue;
    // Uma "seção" de 20px de altura não é seção de nada.
    if (raw.pageBox.h < 40 || raw.pageBox.w < 80) continue;
    const ancestrais: number[] = [];
    let atual = raw.parentRef;
    let saltos = 0;
    while (atual !== null && saltos < 40) {
      ancestrais.push(atual);
      atual = porRef.get(atual)?.parentRef ?? null;
      saltos++;
    }
    out.push({
      ref: raw.ref,
      hash: node.fingerprint.hash,
      pageBox: raw.pageBox,
      role: node.role,
      ancestrais,
    });
  }
  // Menores primeiro: a dona é a seção mais específica que contém a camada.
  out.sort((a, b) => area(a.pageBox) - area(b.pageBox));
  return out;
};

export type PosseDecidida = {
  ownerSection: string | null;
  ownerEvidence: string[];
  ownerConfidence: Confidence;
};

/**
 * Decide de quem é a camada.
 *
 * Ordem: **DOM + geometria concordam** (prova), depois **só geometria** (o caso
 * do absoluto/fixed que o DOM não explica), depois nada. Deixar `null` é uma
 * resposta legítima e melhor que grudar no errado — foi grudando no errado que o
 * V1 pôs overlay na seção de cima.
 *
 * `fixed` recebe tratamento próprio: ele não pertence a seção nenhuma de fato
 * (viaja com a viewport), então a posse sai por maior sobreposição e a confiança
 * é rebaixada, com a evidência dizendo isso.
 */
export const decidirPosse = (
  camada: RawNode,
  secoes: readonly Secao[],
  ancestraisDaCamada: readonly number[],
): PosseDecidida => {
  const ehFixo = camada.stacking.position === 'fixed';
  const caixa = camada.pageBox;

  // Contenção: a primeira (menor) seção que contém a camada.
  let porGeometria: Secao | null = null;
  let melhorFracao = 0;
  for (const s of secoes) {
    if (s.ref === camada.ref) continue;
    const fracao = contido(caixa, s.pageBox);
    if (fracao >= LIMIAR_CONTENCAO) {
      porGeometria = s;
      melhorFracao = fracao;
      break; // já ordenadas da menor para a maior
    }
    if (fracao > melhorFracao) melhorFracao = fracao;
  }

  // Ancestral no DOM que é seção.
  const ancestralSecao = secoes.find((s) => ancestraisDaCamada.includes(s.ref)) ?? null;

  if (ehFixo) {
    // Fixo: a posse é por sobreposição, e isso precisa estar dito.
    let melhor: { s: Secao; f: number } | null = null;
    for (const s of secoes) {
      const f = intersecao(caixa, s.pageBox) / Math.max(1, area(caixa));
      if (melhor === null || f > melhor.f) melhor = { s, f };
    }
    if (melhor !== null && melhor.f > 0.25) {
      return {
        ownerSection: melhor.s.hash,
        ownerEvidence: [
          'camada fixa: posse por maior sobreposição na viewport',
          `sobreposição ${(melhor.f * 100).toFixed(0)}%`,
        ],
        // Baixa de propósito: um elemento fixo cobre várias seções ao rolar.
        ownerConfidence: 'baixa',
      };
    }
    return {
      ownerSection: null,
      ownerEvidence: ['camada fixa sem seção predominante'],
      ownerConfidence: 'nenhuma',
    };
  }

  if (ancestralSecao !== null && porGeometria !== null && ancestralSecao.ref === porGeometria.ref) {
    return {
      ownerSection: ancestralSecao.hash,
      ownerEvidence: [
        'ancestral no DOM',
        `contenção geométrica ${(melhorFracao * 100).toFixed(0)}%`,
      ],
      ownerConfidence: 'alta',
    };
  }
  if (porGeometria !== null) {
    return {
      ownerSection: porGeometria.hash,
      ownerEvidence: [
        `contenção geométrica ${(melhorFracao * 100).toFixed(0)}%`,
        ancestralSecao === null
          ? 'sem ancestral de seção no DOM'
          : 'o ancestral no DOM não é a seção que a contém visualmente',
      ],
      ownerConfidence: 'media',
    };
  }
  if (ancestralSecao !== null) {
    return {
      ownerSection: ancestralSecao.hash,
      ownerEvidence: ['apenas ancestral no DOM (sem contenção geométrica)'],
      ownerConfidence: 'baixa',
    };
  }
  return {
    ownerSection: null,
    ownerEvidence: ['sem dono identificável'],
    ownerConfidence: 'nenhuma',
  };
};

/**
 * Ordem de pintura resolvida. Não é o algoritmo completo da especificação (que
 * exige a árvore de contextos inteira), mas é o suficiente para responder "quem
 * cobre quem" dentro de uma seção: contexto, z-index, e ordem no documento como
 * desempate — que é exatamente a regra do CSS quando o z-index empata.
 */
export const ordemDePintura = (raw: RawNode, indiceNoDocumento: number): number => {
  const z = raw.stacking.zIndex === 'auto' ? 0 : Number.parseInt(raw.stacking.zIndex, 10) || 0;
  const foraDoFluxo =
    raw.stacking.position === 'absolute' ||
    raw.stacking.position === 'fixed' ||
    raw.stacking.position === 'sticky' ||
    raw.stacking.position === 'relative';
  // z-index domina; posicionado ganha de estático; empate vai para a ordem no DOM.
  return z * 1_000_000 + (foraDoFluxo ? 1000 : 0) + Math.min(999, indiceNoDocumento);
};

export const construirCamadas = (
  coleta: RawColeta,
  mapa: Map<number, StructuralNode>,
): VisualLayer[] => {
  const secoes = secoesCandidatas(coleta, mapa);
  const porRef = new Map(coleta.nos.map((n) => [n.ref, n]));

  const camadas: VisualLayer[] = [];
  const auxiliar: Array<{ raw: RawNode; ordem: number; idx: number }> = [];

  coleta.nos.forEach((raw, i) => {
    const node = mapa.get(raw.ref);
    if (node === undefined) return;
    const ancestrais: number[] = [];
    let atual = raw.parentRef;
    let saltos = 0;
    while (atual !== null && saltos < 40) {
      ancestrais.push(atual);
      atual = porRef.get(atual)?.parentRef ?? null;
      saltos++;
    }
    const posse = decidirPosse(raw, secoes, ancestrais);
    const ordem = ordemDePintura(raw, i);

    // Dono do contexto de empilhamento: o ancestral mais próximo que cria um.
    let contextOwner: string | null = null;
    for (const a of ancestrais) {
      const pai = porRef.get(a);
      if (pai?.stacking.createsContext === true) {
        contextOwner = mapa.get(a)?.fingerprint.hash ?? null;
        break;
      }
    }

    camadas.push({
      fingerprint: node.fingerprint,
      role: camadaValida(raw.camada),
      ownerSection: posse.ownerSection,
      ownerEvidence: posse.ownerEvidence,
      ownerConfidence: posse.ownerConfidence,
      stacking: {
        zIndex: raw.stacking.zIndex,
        createsContext: raw.stacking.createsContext,
        contextOwner,
        position: raw.stacking.position,
        opacity: raw.stacking.opacity,
        transform: raw.stacking.transform,
        filter: raw.stacking.filter,
        backdropFilter: raw.stacking.backdropFilter,
        mixBlendMode: raw.stacking.mixBlendMode,
        isolation: raw.stacking.isolation,
        mask: raw.stacking.mask,
        clipPath: raw.stacking.clipPath,
        overflow: raw.stacking.overflow,
        pointerEvents: raw.stacking.pointerEvents,
      },
      paintOrder: ordem,
      pageBox: raw.pageBox,
      normalizedBox: raw.normalizedBox,
      coveredBy: [],
      covers: [],
      pseudo: raw.pseudo,
      inseparable: false,
    });
    auxiliar.push({ raw, ordem, idx: camadas.length - 1 });
  });

  // ── Quem cobre quem, dentro da mesma seção ────────────────────────────────
  // Restringir à seção mantém o custo em O(k²) por seção em vez de O(n²) na
  // página — e é a única comparação que significa algo: camadas de seções
  // diferentes não disputam a mesma área.
  const porSecao = new Map<string, number[]>();
  camadas.forEach((c, i) => {
    const chave = c.ownerSection ?? '∅';
    const lista = porSecao.get(chave);
    if (lista === undefined) porSecao.set(chave, [i]);
    else lista.push(i);
  });

  const MAX_PARES = 400;
  for (const indices of porSecao.values()) {
    if (indices.length > 60) continue; // seção com camadas demais: não vale o custo
    let pares = 0;
    for (let a = 0; a < indices.length && pares < MAX_PARES; a++) {
      for (let b = a + 1; b < indices.length && pares < MAX_PARES; b++) {
        const ia = indices[a];
        const ib = indices[b];
        if (ia === undefined || ib === undefined) continue;
        const ca = camadas[ia];
        const cb = camadas[ib];
        const ra = auxiliar.find((x) => x.idx === ia);
        const rb = auxiliar.find((x) => x.idx === ib);
        if (ca === undefined || cb === undefined || ra === undefined || rb === undefined) continue;
        // Só interessa se um cobre área significativa do outro.
        const sobre = intersecao(ra.raw.pageBox, rb.raw.pageBox);
        if (sobre <= 0) continue;
        const fracaoA = sobre / Math.max(1, area(ra.raw.pageBox));
        const fracaoB = sobre / Math.max(1, area(rb.raw.pageBox));
        if (Math.max(fracaoA, fracaoB) < 0.3) continue;
        pares++;
        // Descendente pinta por cima do ancestral, independente de z-index.
        const bDescendeDeA = rb.raw.parentRef !== null && ehDescendente(rb.raw, ra.raw, porRef);
        const aDescendeDeB = ra.raw.parentRef !== null && ehDescendente(ra.raw, rb.raw, porRef);
        const aCobre = aDescendeDeB ? true : bDescendeDeA ? false : ra.ordem > rb.ordem;
        if (aCobre) {
          ca.covers.push(cb.fingerprint.hash);
          cb.coveredBy.push(ca.fingerprint.hash);
        } else {
          cb.covers.push(ca.fingerprint.hash);
          ca.coveredBy.push(cb.fingerprint.hash);
        }
      }
    }
  }

  // ── Inseparabilidade ─────────────────────────────────────────────────────
  // Um fundo que cobre a seção E tem conteúdo por cima é parte da experiência
  // daquela seção — não um item solto. Continua podendo ser emitido como
  // referência própria, mas nunca EM VEZ da seção.
  const secaoPorHash = new Map(secoes.map((s) => [s.hash, s]));
  for (const c of camadas) {
    if (c.role !== 'background' && c.role !== 'overlay' && c.role !== 'media') continue;
    const secao = c.ownerSection === null ? undefined : secaoPorHash.get(c.ownerSection);
    if (secao === undefined || c.pageBox === undefined) continue;
    const cobreASecao = contido(secao.pageBox, c.pageBox) >= 0.6;
    const temConteudoPorCima = c.coveredBy.length > 0;
    c.inseparable = cobreASecao && temConteudoPorCima;
  }

  return camadas;
};

const ehDescendente = (
  candidato: RawNode,
  possivelAncestral: RawNode,
  porRef: Map<number, RawNode>,
): boolean => {
  let atual = candidato.parentRef;
  let saltos = 0;
  while (atual !== null && saltos < 60) {
    if (atual === possivelAncestral.ref) return true;
    atual = porRef.get(atual)?.parentRef ?? null;
    saltos++;
  }
  return false;
};

// ── Backgrounds ─────────────────────────────────────────────────────────────

const FONTES_VALIDAS: ReadonlySet<string> = new Set<BackgroundSource>([
  'css-color',
  'css-image',
  'css-gradient',
  'css-multiple',
  'css-image-set',
  'css-cross-fade',
  'mask-image',
  'border-image',
  'pseudo-before',
  'pseudo-after',
  'css-variable',
  'img-element',
  'picture-element',
  'svg-inline',
  'svg-external',
  'video-element',
  'canvas-element',
  'iframe-element',
  'absolute-child',
]);

export const construirBackgrounds = (
  coleta: RawColeta,
  mapa: Map<number, StructuralNode>,
  camadas: readonly VisualLayer[],
): BackgroundDetection[] => {
  const porHash = new Map(camadas.map((c) => [c.fingerprint.hash, c]));
  const out: BackgroundDetection[] = [];
  let n = 0;

  for (const raw of coleta.backgrounds) {
    const node = mapa.get(raw.ref);
    if (node === undefined) continue;
    const camada = porHash.get(node.fingerprint.hash);
    const source: BackgroundSource = FONTES_VALIDAS.has(raw.source)
      ? (raw.source as BackgroundSource)
      : 'css-image';

    // Cor sólida sozinha, em elemento que não cobre nada, não é "um fundo" —
    // é a cor de um botão. Só entra como entidade quando cobre área.
    if (source === 'css-color' && !raw.cobreSecao) continue;

    const variaveis = Object.keys(raw.variables).length > 0;
    const limitations: string[] = [];
    if (raw.assetUrls.length === 0 && /url\(/.test(raw.cssValue)) {
      limitations.push('Referência de imagem no CSS que não pôde ser resolvida para URL absoluta.');
    }

    n++;
    out.push({
      id: `bg_${n}`,
      source: variaveis && source === 'css-color' ? 'css-variable' : source,
      fingerprint: node.fingerprint,
      ownerSection: camada?.ownerSection ?? null,
      cssValue: raw.cssValue,
      variables: raw.variables,
      assetUrls: raw.assetUrls,
      // `animated` NÃO sai daqui: o CSS declarar `animation` não prova que algo
      // se move (pode estar pausado, com duração 0, ou fora da viewport). Quem
      // decide é a observação temporal, que reescreve este campo.
      animated: false,
      animationEvidence: raw.declaraAnimacao
        ? [`CSS declara animation: ${raw.cssValue.slice(0, 60) || 'keyframes'}`]
        : [],
      runtime: undefined,
      coversSection: raw.cobreSecao,
      confidence: camada?.ownerConfidence ?? 'baixa',
      limitations,
    });
  }
  return out;
};

// ── Mídia ───────────────────────────────────────────────────────────────────

const MIDIAS_VALIDAS: ReadonlySet<string> = new Set<MediaKind>([
  'video',
  'gif',
  'webp-animado',
  'avif-animado',
  'apng',
  'svg-animado',
  'svg-estatico',
  'imagem',
  'lottie',
  'canvas-2d',
  'webgl',
  'webgl2',
  'iframe',
  'audio',
]);

export const construirMidias = (
  coleta: RawColeta,
  mapa: Map<number, StructuralNode>,
  camadas: readonly VisualLayer[],
): MediaDetection[] => {
  const porHash = new Map(camadas.map((c) => [c.fingerprint.hash, c]));
  const out: MediaDetection[] = [];
  let n = 0;

  for (const raw of coleta.midias) {
    const node = mapa.get(raw.ref);
    if (node === undefined) continue;
    const camada = porHash.get(node.fingerprint.hash);
    const kind: MediaKind = MIDIAS_VALIDAS.has(raw.kind ?? '') ? (raw.kind as MediaKind) : 'imagem';

    const limitations: string[] = [];
    if (kind === 'iframe' && raw.mesmaOrigem === false) {
      limitations.push('Iframe de outra origem: o conteúdo interno não é acessível.');
    }
    if (kind === 'video' && (raw.readyState ?? 0) === 0) {
      limitations.push('O vídeo não tinha dados carregados no momento da captura.');
    }
    if ((kind === 'webgl' || kind === 'webgl2' || kind === 'canvas-2d') && !raw.contextoDetectado) {
      limitations.push(
        'Canvas sem contexto observado: nada foi desenhado durante a captura, ou o contexto foi criado antes da instrumentação.',
      );
    }
    // `webp`/`avif` por extensão pode ser estático. Honestidade: a extensão não
    // prova animação, então a decisão fica com a observação temporal.
    const porExtensaoTalvezAnimado =
      raw.formatoPorExtensao === 'webp' || raw.formatoPorExtensao === 'avif';
    if (porExtensaoTalvezAnimado) {
      limitations.push(
        `Formato ${raw.formatoPorExtensao} pode ser estático ou animado; a animação foi verificada por observação temporal.`,
      );
    }

    n++;
    out.push({
      id: `md_${n}`,
      kind,
      fingerprint: node.fingerprint,
      ownerSection: camada?.ownerSection ?? null,
      src: raw.src || undefined,
      sources: raw.sources ?? [],
      poster: raw.poster || undefined,
      playback: raw.playback,
      intrinsic: raw.intrinsic,
      asBackground: raw.asBackground,
      appearance: 'inicial',
      // Preenchidos pela observação temporal e pela varredura de ponteiro.
      animated: false,
      pointerReactive: false,
      scrollReactive: false,
      confidence: camada?.ownerConfidence ?? 'baixa',
      limitations,
    });
  }
  return out;
};

// ── Runtimes ────────────────────────────────────────────────────────────────

/**
 * Os tipos de runtime aceitos — DERIVADOS do enum, não copiados dele.
 *
 * Isto era uma lista escrita à mão, gêmea do `RuntimeKind` de `@ds/shared`, e
 * ela divergiu na primeira oportunidade: os três runtimes que desenham o
 * conteúdo (`iconify`, `tailwind-cdn`, `fundo-canvas`) entraram no enum e não
 * aqui, então chegavam ao mapeador e saíam como `desconhecido`.
 *
 * O efeito foi silencioso e caro. A detecção funcionava, o STACK mostrava os
 * três pelo nome, e mesmo assim nenhum segmento era classificado como cápsula —
 * porque o `kind` que a classificação lia já não era o `kind` que o coletor
 * havia produzido. Nenhum erro, nenhum aviso: só uma resposta errada.
 *
 * Duas listas que precisam concordar acabam discordando. Uma só, não.
 */
const RUNTIMES_VALIDOS: ReadonlySet<string> = new Set<string>(RuntimeKind.options);

/** Runtimes que sabemos rodar dentro de uma cápsula isolada. */
const ENCAPSULAVEIS: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>([
  'three',
  'pixi',
  'webgl-cru',
  'canvas-2d',
  'lottie',
  'gsap',
  'anime',
  'p5',
  'matter',
  'shader-cru',
  'web-animations',
]);

/**
 * Confiança por força da evidência. Global exposto no `window` e contexto gráfico
 * criado são fatos; nome de arquivo é indício (um bundle chamado `three.js` pode
 * ser qualquer coisa).
 */
const confiancaDaEvidencia = (evidencias: readonly string[]): Confidence => {
  const forte = evidencias.some((e) => e.startsWith('global window.') || e.startsWith('contexto '));
  if (forte) return 'alta';
  const media = evidencias.some((e) => e.startsWith('elemento ') || e.includes('Animations'));
  if (media) return 'media';
  return 'baixa';
};

export const construirRuntimes = (inst: RawInstrumentacao): RuntimeDetection[] => {
  const out: RuntimeDetection[] = [];
  let n = 0;
  for (const raw of inst.runtimes) {
    const kind: RuntimeKind = RUNTIMES_VALIDOS.has(raw.kind)
      ? (raw.kind as RuntimeKind)
      : 'desconhecido';
    if (raw.evidence.length === 0) continue; // sem evidência não entra — regra do pedido
    n++;
    const confidence = confiancaDaEvidencia(raw.evidence);
    const limitations: string[] = [];
    if (confidence === 'baixa') {
      limitations.push(
        'Detectado apenas pelo nome do arquivo: o bundle pode conter outra coisa. Não tratado como fato.',
      );
    }
    out.push({
      id: `rt_${n}`,
      kind,
      label: raw.label,
      version: raw.version || undefined,
      evidence: raw.evidence,
      confidence,
      scripts: raw.scripts,
      targets: [],
      assets: [],
      encapsulable: ENCAPSULAVEIS.has(kind) && confidence !== 'baixa',
      limitations,
    });
  }

  // Loop de rAF sem runtime nomeado: existe movimento e não sabemos de quem é.
  // Registrar isso é melhor que calar — vira limitação honesta no item.
  if (inst.rafCount > 30 && out.length === 0) {
    out.push({
      id: 'rt_raf',
      kind: 'desconhecido',
      label: 'loop de animação não identificado',
      evidence: [
        `${inst.rafCount} chamadas a requestAnimationFrame`,
        ...inst.rafOrigens.slice(0, 3).map((o) => `origem ${o.url} (${o.chamadas}x)`),
      ],
      confidence: 'media',
      scripts: inst.rafOrigens.slice(0, 5).map((o) => o.url),
      targets: [],
      assets: [],
      encapsulable: false,
      limitations: [
        'Há um loop de animação em execução, mas a biblioteca não foi identificada: não é encapsulável.',
      ],
    });
  }

  return out;
};
