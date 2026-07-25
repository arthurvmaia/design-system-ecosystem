import type {
  BackgroundDetection,
  ComponentCategory,
  ComponentKind,
  Confidence,
  EvidenceKind,
  ExecutedAction,
  FidelityV2,
  InteractionKind,
  MediaDetection,
  MediaKind,
  PointerResponse,
  RepresentationDecision,
  RuntimeDetection,
  RuntimeKind,
  ScrollBehavior,
  ScrollBehaviorKind,
  SegmentEvidence,
  StateGraph,
  StructuralNode,
  StructuralRole,
  SupportLevel,
  TemporalObservation,
  VisualLayer,
} from '@ds/shared';
import { contido, intersecao } from '../mapper/build-maps.js';
import type { BoxPx } from '../mapper/raw.js';
import { nomeEhGenerico, nomearPorEvidencia } from './naming.js';
import { type EvidenciaRepresentacao, classificarRepresentacao } from './representation.js';

/**
 * Segmentação PÓS-exploração.
 *
 * O V1 fazia isto primeiro, e por string: `parse(design-system.html)` e frações de
 * `outerHTML.length` decidiam o que era seção, embrulho e enfeite. Byte não é peso
 * visual — uma `<div>` com um sprite SVG inline de 40 KB era "60% do nível" e era
 * aberta; uma `<section>` cujo visual inteiro é um `<canvas>` mais 200 bytes de
 * marcação era 0,4% e virava fragmento solto.
 *
 * Aqui a segmentação é a ÚLTIMA etapa e consome evidência já medida: papel
 * semântico, área ocupada na viewport, contexto de empilhamento, fundo
 * compartilhado, movimento no tempo, reação ao ponteiro, comportamento de scroll,
 * estados capturados e runtime detectado. Cada segmento carrega os sinais que o
 * sustentam, para que um card errado seja depurável em vez de misterioso.
 */

// ── Escolha das seções ───────────────────────────────────────────────────────

const PAPEIS_DE_SECAO: ReadonlySet<StructuralRole> = new Set<StructuralRole>([
  'hero',
  'header',
  'nav',
  'main',
  'section',
  'article',
  'aside',
  'footer',
  'form',
]);

/**
 * Área mínima (fração da viewport) para um nó valer como seção por conta própria.
 * Substitui a fração de BYTES do V1 pela fração de TELA, que é a grandeza que a
 * pessoa percebe.
 */
const AREA_MINIMA_DE_SECAO = 0.06;

/**
 * Uma seção que contém outra e **não acrescenta nada** é embrulho. O teste não é
 * de tamanho: é de conteúdo próprio. Se todo o texto e toda a mídia do candidato
 * estão dentro de filhos que também são seções, ele é só a caixa.
 */
const ehEmbrulho = (candidato: StructuralNode, filhas: readonly StructuralNode[]): boolean => {
  if (filhas.length === 0) return false;
  const textoDasFilhas = filhas.reduce((s, f) => s + f.subtreeTextLength, 0);
  const textoProprio = candidato.subtreeTextLength - textoDasFilhas;
  // `main` com uma `<section>` dentro: nenhum texto próprio ⇒ embrulho.
  return textoProprio <= 24 && candidato.ownText.trim().length === 0;
};

export type SecaoEscolhida = {
  node: StructuralNode;
  hash: string;
  pageBox: BoxPx;
};

/**
 * Escolhe as seções. Descarta embrulhos, mantém as folhas semânticas, e admite
 * `<div>` que se comporta como seção (faixa de tela com conteúdo) — que é a
 * maioria dos sites modernos, onde nada é `<section>`.
 */
export const escolherSecoes = (mapa: readonly StructuralNode[]): SecaoEscolhida[] => {
  const porHash = new Map(mapa.map((n) => [n.fingerprint.hash, n]));
  const filhasDe = new Map<string, StructuralNode[]>();
  for (const n of mapa) {
    if (n.parent === null) continue;
    const lista = filhasDe.get(n.parent);
    if (lista === undefined) filhasDe.set(n.parent, [n]);
    else lista.push(n);
  }

  /** Descendentes que também são candidatos a seção. */
  const secoesDescendentes = (hash: string, profundidade = 0): StructuralNode[] => {
    if (profundidade > 12) return [];
    const out: StructuralNode[] = [];
    for (const f of filhasDe.get(hash) ?? []) {
      if (PAPEIS_DE_SECAO.has(f.role) && f.areaShare >= AREA_MINIMA_DE_SECAO) out.push(f);
      else out.push(...secoesDescendentes(f.fingerprint.hash, profundidade + 1));
    }
    return out;
  };

  const escolhidas: SecaoEscolhida[] = [];
  for (const n of mapa) {
    if (!PAPEIS_DE_SECAO.has(n.role)) continue;
    if (n.pageBox === undefined) continue;
    if (!n.visible) continue;
    // `nav`/`header`/`footer` valem mesmo pequenos: são landmarks, e uma barra de
    // navegação de 60px de altura é um componente legítimo.
    const landmark = n.role === 'nav' || n.role === 'header' || n.role === 'footer';
    if (!landmark && n.areaShare < AREA_MINIMA_DE_SECAO) continue;
    if (ehEmbrulho(n, secoesDescendentes(n.fingerprint.hash))) continue;
    escolhidas.push({ node: n, hash: n.fingerprint.hash, pageBox: n.pageBox });
  }

  // Remove aninhamento restante: se A contém B e ambos passaram, mantém os dois
  // só quando A tem conteúdo próprio relevante (já garantido por `ehEmbrulho`).
  // O que resta a fazer é ordenar pela posição na página — é a ordem da Galeria.
  escolhidas.sort((a, b) => a.pageBox.y - b.pageBox.y || a.pageBox.x - b.pageBox.x);
  // Dedup por hash (um nó pode aparecer duas vezes se o mapa tiver repetição).
  const vistos = new Set<string>();
  return escolhidas.filter((s) => {
    if (vistos.has(s.hash)) return false;
    vistos.add(s.hash);
    return porHash.has(s.hash);
  });
};

// ── Categoria por evidência ──────────────────────────────────────────────────

const CATEGORIA_POR_PAPEL: Partial<Record<StructuralRole, ComponentCategory>> = {
  hero: 'hero',
  header: 'header',
  nav: 'nav',
  footer: 'footer',
  form: 'form',
};

/**
 * Pistas de vocabulário. Continuam existindo — um `id="pricing"` é evidência
 * legítima —, mas agora são o ÚLTIMO recurso, depois da semântica e do conteúdo.
 * No V1 eram a única fonte, e por isso um site em inglês sem id descritivo caía
 * inteiro em `other`.
 *
 * Todo termo aceita plural (`s?`). O V1 escrevia `\btestimonial\b`, que **nunca**
 * casa com `id="testimonials"` — o `\b` exige não-palavra depois, e `s` é palavra.
 * Como id de seção em inglês é plural na esmagadora maioria dos casos
 * (`testimonials`, `features`, `stats`), a pista mais comum era justamente a que
 * não funcionava.
 */
const PISTAS: ReadonlyArray<readonly [ComponentCategory, RegExp]> = [
  ['hero', /\b(heroe?s?|banners?|jumbotrons?|mastheads?|capa)\b/i],
  ['pricing', /\b(pricing|prices?|planos?|precos?|preços?|assinaturas?|tiers?)\b/i],
  [
    'testimonial',
    /\b(testimonials?|depoimentos?|reviews?|avaliacoes?|avaliações?|avaliacao|avaliação)\b/i,
  ],
  ['faq', /\b(faqs?|perguntas?|duvidas?|dúvidas?)\b/i],
  ['cta', /\b(cta|call-to-action|contato|contact|newsletter|inscreva)\b/i],
  ['accordion', /\b(accordions?|collapse|sanfona)\b/i],
  ['gallery', /\b(gallery|galleries|galeria|portfolios?|portfólios?|work|trabalhos?|projetos?)\b/i],
  ['stats', /\b(stats?|metrics?|numbers?|numeros?|números?|resultados?|counters?)\b/i],
  ['logo-cloud', /\b(logos?|clients?|brands?|marcas?|parceiros?|trusted)\b/i],
  ['team', /\b(teams?|equipe|about|sobre|quem-somos)\b/i],
  ['timeline', /\b(timelines?|roadmaps?|processo|etapas?|steps?|linha-do-tempo)\b/i],
  ['feature', /\b(features?|servicos?|serviços?|services?|solucoes?|soluções?|expertise)\b/i],
  ['card', /\b(cards?|grids?|tiles?)\b/i],
];

export type SinaisDeConteudo = {
  /** Texto do segmento. */
  texto: string;
  /** Quantos títulos (h1–h6) tem. */
  titulos: number;
  /** Quantos cards/itens repetidos. */
  itensRepetidos: number;
  /** Quantos botões/links de ação. */
  acoes: number;
  /** Quantas imagens. */
  imagens: number;
  /** Quantos valores monetários no texto. */
  precos: number;
  /** Quantas perguntas (interrogação). */
  perguntas: number;
  /** Quantos campos de formulário. */
  campos: number;
};

/**
 * Categoria a partir de evidência real, na ordem: papel semântico → conteúdo →
 * vocabulário de id/classe.
 */
export const inferirCategoria = (
  node: StructuralNode,
  sinais: SinaisDeConteudo,
  membros: readonly VisualLayer[],
  temFundoDominante: boolean,
): { categoria: ComponentCategory; evidencia: string } => {
  const porPapel = CATEGORIA_POR_PAPEL[node.role];
  if (porPapel !== undefined) return { categoria: porPapel, evidencia: `papel:${node.role}` };

  // Conteúdo: o que a seção efetivamente mostra.
  if (sinais.campos >= 2) return { categoria: 'form', evidencia: `${sinais.campos} campos` };
  if (sinais.precos >= 2 && sinais.itensRepetidos >= 2) {
    return {
      categoria: 'pricing',
      evidencia: `${sinais.precos} preços em ${sinais.itensRepetidos} itens`,
    };
  }
  if (sinais.perguntas >= 3) {
    return { categoria: 'faq', evidencia: `${sinais.perguntas} perguntas` };
  }
  if (sinais.itensRepetidos >= 3 && sinais.imagens >= sinais.itensRepetidos - 1) {
    return { categoria: 'gallery', evidencia: `${sinais.itensRepetidos} itens com imagem` };
  }
  if (sinais.itensRepetidos >= 3 && sinais.titulos >= 3) {
    return { categoria: 'feature', evidencia: `${sinais.itensRepetidos} itens com título` };
  }
  if (sinais.itensRepetidos >= 2) {
    return { categoria: 'card', evidencia: `${sinais.itensRepetidos} itens repetidos` };
  }
  if (sinais.acoes >= 1 && sinais.texto.length < 400 && sinais.titulos >= 1) {
    return { categoria: 'cta', evidencia: 'título curto com ação' };
  }
  // Fundo dominante e pouco texto: é o efeito, não a seção de conteúdo.
  if (temFundoDominante && sinais.texto.length < 24) {
    const soFundo = membros.every((m) => m.role !== 'content');
    if (soFundo) return { categoria: 'background', evidencia: 'só camadas de fundo' };
  }
  if (membros.some((m) => m.role === 'portal')) {
    return { categoria: 'overlay', evidencia: 'conteúdo em portal' };
  }

  const vocabulario = [
    node.fingerprint.id ?? '',
    ...node.fingerprint.stableClasses,
    node.fingerprint.text,
  ].join(' ');
  for (const [cat, re] of PISTAS) {
    if (re.test(vocabulario)) return { categoria: cat, evidencia: `vocabulário:${cat}` };
  }
  return { categoria: 'other', evidencia: 'sem evidência de categoria' };
};

// ── Validação ────────────────────────────────────────────────────────────────

export type VereditoSegmento = { ok: boolean; motivos: string[] };

/**
 * O segmento vale a Galeria?
 *
 * Esta função é o antídoto direto do card preto. No V1, um candidato promovido por
 * conter `<canvas>` **pulava a validação inteira** (`if (hint === undefined)`), e o
 * `htmlSnippet` gravado era `<canvas></canvas>` — um retângulo escuro no preview.
 *
 * Aqui a pergunta é: **existe substância verificada?** Texto de verdade, mídia com
 * conteúdo comprovado, fundo com asset ou gradiente que cobre área, ou movimento
 * medido. Um canvas sem contexto observado e sem movimento medido não é um
 * componente — é um elemento vazio, e vai para a Revisão com o motivo escrito.
 */
export const validarSegmentoV2 = (opts: {
  texto: string;
  midias: readonly MediaDetection[];
  backgrounds: readonly BackgroundDetection[];
  temMovimento: boolean;
  temRuntime: boolean;
  representacao: RepresentationDecision;
  /** A referência visual tem frame de fallback gravado? */
  temFrameDeFallback: boolean;
  areaShare: number;
}): VereditoSegmento => {
  const motivos: string[] = [];
  const temTexto = opts.texto.trim().length >= 12;

  // Mídia COM substância — não basta a tag existir.
  const midiaComSubstancia = opts.midias.some((m) => {
    if (m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2') {
      // Canvas só conta se algo foi desenhado (movimento medido) ou se há runtime
      // identificado que o desenha. Sem isso é um retângulo vazio.
      return opts.temMovimento || opts.temRuntime;
    }
    if (m.kind === 'video') return Boolean(m.src) || Boolean(m.poster) || opts.temMovimento;
    if (m.kind === 'iframe') return Boolean(m.src);
    return Boolean(m.src) || (m.intrinsic?.width ?? 0) > 0 || m.kind === 'svg-animado';
  });

  const fundoComSubstancia = opts.backgrounds.some(
    (b) => b.assetUrls.length > 0 || /gradient|url\(/i.test(b.cssValue) || b.animated,
  );

  if (!temTexto && !midiaComSubstancia && !fundoComSubstancia) {
    // Diagnóstico específico, porque "bloco vazio" não ajuda ninguém a corrigir.
    const canvasVazio = opts.midias.some(
      (m) =>
        (m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2') &&
        !opts.temMovimento &&
        !opts.temRuntime,
    );
    if (canvasVazio) {
      motivos.push(
        'Canvas sem nada desenhado: nenhum movimento foi medido e nenhum runtime foi identificado. Preservar isto produziria um card vazio.',
      );
    } else {
      motivos.push('Sem texto, sem mídia com conteúdo e sem fundo — não há o que curar.');
    }
  }

  if (opts.representacao.type === 'referencia-visual' && !opts.temFrameDeFallback) {
    motivos.push(
      'Referência visual sem frame de fallback: não há como mostrar o item, e mostrar uma área vazia seria pior que não mostrar.',
    );
  }

  if (opts.areaShare < 0.004 && !temTexto) {
    motivos.push('Ocupa área desprezível na tela e não tem texto — é decoração, não componente.');
  }

  return { ok: motivos.length === 0, motivos: [...new Set(motivos)] };
};

// ── Montagem ─────────────────────────────────────────────────────────────────

export type EntradaSegmentacao = {
  structuralMap: readonly StructuralNode[];
  visualLayers: readonly VisualLayer[];
  backgroundDetections: readonly BackgroundDetection[];
  mediaDetections: readonly MediaDetection[];
  runtimeDetections: readonly RuntimeDetection[];
  temporalObservations: readonly TemporalObservation[];
  pointerResponses: readonly PointerResponse[];
  scrollObservations: readonly ScrollBehavior[];
  stateGraph?: StateGraph;
  safeActions: readonly ExecutedAction[];
  /** HTML capturado por hash de elemento — o DOM que a exploração viu. */
  htmlPorHash: ReadonlyMap<string, string>;
  /** Frames gravados por hash (referência visual / estado). */
  framePorHash: ReadonlyMap<string, string>;
  /** URLs de asset que têm cópia local. */
  assetsLocais: ReadonlySet<string>;
  /** Scripts de que a página depende e que NÃO foram obtidos. */
  scriptsNaoLocalizados: number;
  /** Animações CSS que de fato rodaram (nome → contagem). */
  animacoesCssQueRodaram: readonly string[];
  /** Shadow roots fechados encontrados. */
  shadowFechados: number;
  viewport: { width: number; height: number };
  pageHeight: number;
};

export type SegmentoV2 = {
  /** Índice de posição na página. */
  position: number;
  category: ComponentCategory;
  kind: ComponentKind;
  name: string;
  htmlSnippet: string;
  /** Hash da seção que originou o segmento. */
  hash: string;
  evidence: SegmentEvidence;
  representation: RepresentationDecision;
  fidelity: FidelityV2;
  support: SupportLevel;
  interactions: InteractionKind[];
  /** Limitações honestas, prontas para a UI. */
  limitations: string[];
};

export type RejeitadoV2 = {
  hash: string;
  category: ComponentCategory;
  name: string;
  htmlSnippet: string;
  motivos: string[];
};

export type ResultadoSegmentacaoV2 = {
  segmentos: SegmentoV2[];
  rejeitados: RejeitadoV2[];
};

/** Conta sinais de conteúdo a partir do HTML do segmento. Barato e suficiente. */
export const contarSinais = (html: string): SinaisDeConteudo => {
  const semTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const contar = (re: RegExp): number => (html.match(re) ?? []).length;
  return {
    texto: semTags,
    titulos: contar(/<h[1-6][\s>]/gi),
    // Itens repetidos: `<li>`, ou irmãos com a mesma assinatura de classe.
    itensRepetidos: Math.max(contar(/<li[\s>]/gi), contarRepetidos(html)),
    acoes: contar(/<(?:button|a)[\s>]/gi),
    imagens: contar(/<(?:img|picture)[\s>]/gi),
    precos: contar(
      /(?:R\$|\$|€|£)\s?\d|(?:\d+[.,]\d{2})\s?(?:\/|por|per)\s?(?:m[êe]s|ano|month|year)/gi,
    ),
    perguntas: contar(/\?/g),
    campos: contar(/<(?:input|textarea|select)[\s>]/gi),
  };
};

/** Irmãos com a MESMA lista de classes — a assinatura de um grid de cards. */
const contarRepetidos = (html: string): number => {
  const classes = new Map<string, number>();
  for (const m of html.matchAll(/<div[^>]*\bclass="([^"]{8,})"/gi)) {
    const c = (m[1] ?? '').trim();
    if (c.length === 0) continue;
    classes.set(c, (classes.get(c) ?? 0) + 1);
  }
  let maior = 0;
  for (const n of classes.values()) if (n > maior) maior = n;
  return maior >= 2 ? maior : 0;
};

/** Kind da Galeria a partir da categoria e da representação. */
const kindDe = (
  categoria: ComponentCategory,
  representacao: RepresentationDecision,
): ComponentKind => {
  if (categoria === 'background') return 'effect';
  if (representacao.type === 'capsula-runtime') return 'animation';
  if (representacao.type === 'referencia-visual') return 'asset';
  if (categoria === 'hero' || categoria === 'header' || categoria === 'footer') return 'layout';
  return 'component';
};

/** Peso de cada tipo de evidência. Explícito para o card ser depurável. */
const PESO: Record<EvidenceKind, number> = {
  semantica: 5,
  rotulo: 5,
  layout: 3,
  proximidade: 2,
  'espaco-visual': 2,
  stacking: 3,
  'fundo-compartilhado': 4,
  comportamento: 4,
  estado: 4,
  scroll: 3,
  interacao: 3,
  runtime: 4,
  'pixel-diff': 4,
  'secao-controladora': 3,
  assets: 2,
  heading: 3,
};

const confiancaPorPeso = (total: number): Confidence =>
  total >= 14 ? 'alta' : total >= 8 ? 'media' : total > 0 ? 'baixa' : 'nenhuma';

/**
 * Monta os segmentos a partir das evidências.
 *
 * A ordem interna importa e é a inversa do V1: primeiro se sabe o que a seção É
 * (membros, fundo, mídia, runtime, movimento, estados), depois se decide a forma
 * de preservação, depois se valida, e só então se nomeia — porque o nome depende
 * da representação escolhida.
 */
export const segmentarPorEvidencia = (entrada: EntradaSegmentacao): ResultadoSegmentacaoV2 => {
  const secoes = escolherSecoes(entrada.structuralMap);
  const porHash = new Map(entrada.structuralMap.map((n) => [n.fingerprint.hash, n]));
  const camadasPorSecao = new Map<string, VisualLayer[]>();
  for (const c of entrada.visualLayers) {
    if (c.ownerSection === null) continue;
    const lista = camadasPorSecao.get(c.ownerSection);
    if (lista === undefined) camadasPorSecao.set(c.ownerSection, [c]);
    else lista.push(c);
  }

  const segmentos: SegmentoV2[] = [];
  const rejeitados: RejeitadoV2[] = [];
  let posicao = 0;

  for (const secao of secoes) {
    const node = porHash.get(secao.hash);
    if (node === undefined) continue;
    const membros = camadasPorSecao.get(secao.hash) ?? [];
    const hashesMembros = new Set(membros.map((m) => m.fingerprint.hash));
    hashesMembros.add(secao.hash);

    // ── Coleta das evidências desta seção ──────────────────────────────────
    const backgrounds = entrada.backgroundDetections.filter(
      (b) => b.ownerSection === secao.hash || hashesMembros.has(b.fingerprint.hash),
    );
    const midias = entrada.mediaDetections.filter(
      (m) => m.ownerSection === secao.hash || hashesMembros.has(m.fingerprint.hash),
    );
    const temporais = entrada.temporalObservations.filter((t) => hashesMembros.has(t.target));
    const ponteiro = entrada.pointerResponses.filter((p) => {
      if (p.fingerprint !== undefined && hashesMembros.has(p.fingerprint.hash)) return true;
      // Reação sem DOM: pertence à seção se a região cai dentro dela.
      if (p.region === undefined || node.pageBox === undefined) return false;
      const emPx: BoxPx = {
        x: p.region.x * entrada.viewport.width,
        y: p.region.y * entrada.viewport.height,
        w: p.region.w * entrada.viewport.width,
        h: p.region.h * entrada.viewport.height,
      };
      return intersecao(emPx, node.pageBox) > 0;
    });
    const scroll = entrada.scrollObservations.filter((s) => {
      const alvo = `${s.target.id ?? ''} ${s.target.classes.join(' ')}`.trim();
      if (alvo.length === 0) return false;
      return [...hashesMembros].some((h) => {
        const n = porHash.get(h);
        if (n === undefined) return false;
        const mesmoId = s.target.id !== null && s.target.id === n.fingerprint.id;
        const classesEmComum = s.target.classes.filter((c) =>
          n.fingerprint.stableClasses.includes(c),
        );
        return mesmoId || classesEmComum.length >= 2;
      });
    });
    const estados = (entrada.stateGraph?.nodes ?? []).filter(
      (s) => s.scope !== null && hashesMembros.has(s.scope),
    );
    const acoes = entrada.safeActions.filter(
      (a) => a.target !== null && hashesMembros.has(a.target),
    );
    const runtimes = entrada.runtimeDetections.filter((r) => {
      // Runtime pertence à seção quando controla um alvo dela, OU quando a seção
      // tem canvas/lottie e o runtime é do tipo que os desenha.
      if (r.targets.some((t) => hashesMembros.has(t))) return true;
      const temCena = midias.some(
        (m) =>
          m.kind === 'canvas-2d' ||
          m.kind === 'webgl' ||
          m.kind === 'webgl2' ||
          m.kind === 'lottie',
      );
      const desenhaCena =
        r.kind === 'three' ||
        r.kind === 'pixi' ||
        r.kind === 'webgl-cru' ||
        r.kind === 'canvas-2d' ||
        r.kind === 'lottie' ||
        r.kind === 'shader-cru' ||
        r.kind === 'p5';
      return temCena && desenhaCena;
    });

    const html = entrada.htmlPorHash.get(secao.hash) ?? '';
    const sinais = contarSinais(html);
    const temMovimento = temporais.some((t) => t.moving);
    const movimentoPorCss =
      temMovimento &&
      temporais.every((t) => t.domStable === false) === false &&
      entrada.animacoesCssQueRodaram.length > 0 &&
      runtimes.length === 0;
    const reageAoPonteiro = ponteiro.some(
      (p) =>
        p.reactions.includes('pixels') ||
        p.reactions.includes('transform') ||
        p.reactions.includes('filter'),
    );
    const regiaoReativaSemDom = ponteiro.some((p) => p.domless && p.reactions.includes('pixels'));
    const temFundoDominante = backgrounds.some((b) => b.coversSection);

    // Assets do segmento: dos fundos, das mídias.
    const assetsDoSegmento = new Set<string>();
    for (const b of backgrounds) for (const u of b.assetUrls) assetsDoSegmento.add(u);
    for (const m of midias) {
      if (m.src !== undefined && m.src.length > 0) assetsDoSegmento.add(m.src);
      if (m.poster !== undefined && m.poster.length > 0) assetsDoSegmento.add(m.poster);
      for (const s of m.sources) assetsDoSegmento.add(s);
    }
    const externos = [...assetsDoSegmento].filter((u) => !entrada.assetsLocais.has(u));

    // ── Representação ──────────────────────────────────────────────────────
    const midiaKinds: MediaKind[] = [...new Set(midias.map((m) => m.kind))];
    const runtimeKinds: RuntimeKind[] = [...new Set(runtimes.map((r) => r.kind))];
    const temIframeCross = midias.some(
      (m) => m.kind === 'iframe' && m.limitations.some((l) => /outra origem/.test(l)),
    );
    const dependeDeJs =
      runtimes.length > 0 ||
      estados.length > 0 ||
      acoes.some((a) => a.hadEffect) ||
      /<script[\s>]/i.test(html) ||
      /\son[a-z]+\s*=/i.test(html);

    const evidenciaRepr: EvidenciaRepresentacao = {
      runtimes: runtimeKinds,
      midias: midiaKinds,
      assetsLocais: externos.length === 0,
      assetsExternos: externos.length,
      scriptsNaoLocalizados: entrada.scriptsNaoLocalizados,
      iframeCrossOrigin: temIframeCross,
      shadowFechado: entrada.shadowFechados > 0 && node.realm === 'shadow-closed',
      estadosCapturados: estados.length,
      movimentoMedido: temMovimento,
      movimentoPorCss,
      reageAoPonteiro,
      regiaoReativaSemDom,
      dependeDeJs,
      bootstrapIdentificado: runtimes.some((r) => r.scripts.length > 0 && r.confidence !== 'baixa'),
    };
    const representacao = classificarRepresentacao(evidenciaRepr);

    // ── Categoria e validação ──────────────────────────────────────────────
    const { categoria, evidencia: evidenciaCategoria } = inferirCategoria(
      node,
      sinais,
      membros,
      temFundoDominante,
    );

    const temFrame =
      entrada.framePorHash.has(secao.hash) ||
      temporais.some((t) => t.frames.length > 0) ||
      estados.some((e) => e.frameRef !== undefined);

    const veredito = validarSegmentoV2({
      texto: sinais.texto,
      midias,
      backgrounds,
      temMovimento,
      temRuntime: runtimes.length > 0,
      representacao,
      temFrameDeFallback: temFrame,
      areaShare: node.areaShare,
    });

    // ── Nome ───────────────────────────────────────────────────────────────
    const scrollKinds: ScrollBehaviorKind[] = [...new Set(scroll.map((s) => s.kind))];
    const particulas = detectarParticulas(html, membros, temMovimento);
    const heading = primeiroTitulo(html);
    const { nome, evidencias: evidenciasDoNome } = nomearPorEvidencia({
      category: categoria,
      role: node.role,
      heading,
      runtimes: runtimeKinds,
      midias: midiaKinds,
      midiaComoFundo: midias.some((m) => m.asBackground),
      animado: temMovimento,
      reageAoPonteiro,
      particulas,
      scroll: scrollKinds,
      estados: estados.map((e) => e.label),
      representacao: representacao.type,
      posicao: entrada.pageHeight > 0 ? secao.pageBox.y / entrada.pageHeight : undefined,
    });

    if (!veredito.ok) {
      rejeitados.push({
        hash: secao.hash,
        category: categoria,
        name: nome,
        htmlSnippet: html,
        motivos: veredito.motivos,
      });
      continue;
    }

    // ── Evidência auditável ────────────────────────────────────────────────
    const sinaisEvidencia: SegmentEvidence['signals'] = [];
    const add = (kind: EvidenceKind, detail: string): void => {
      sinaisEvidencia.push({ kind, weight: PESO[kind], detail });
    };
    if (CATEGORIA_POR_PAPEL[node.role] !== undefined || PAPEIS_DE_SECAO.has(node.role)) {
      add('semantica', `papel ${node.role}`);
    }
    if (node.areaShare >= AREA_MINIMA_DE_SECAO) {
      add('layout', `ocupa ${(node.areaShare * 100).toFixed(0)}% da viewport`);
    }
    if (backgrounds.length > 0) {
      add('fundo-compartilhado', `${backgrounds.length} camada(s) de fundo desta seção`);
    }
    if (membros.some((m) => m.stacking.createsContext)) {
      add('stacking', 'membros no mesmo contexto de empilhamento');
    }
    if (temMovimento) add('pixel-diff', `movimento medido (Δ até ${maiorDelta(temporais)})`);
    if (reageAoPonteiro) add('comportamento', `${ponteiro.length} reação(ões) ao ponteiro`);
    if (estados.length > 0) add('estado', `${estados.length} estado(s) capturados`);
    if (scroll.length > 0) add('scroll', scrollKinds.join(', '));
    if (runtimes.length > 0) add('runtime', runtimes.map((r) => r.label).join(', '));
    if (assetsDoSegmento.size > 0) add('assets', `${assetsDoSegmento.size} asset(s)`);
    if (sinais.titulos > 0) add('heading', `${sinais.titulos} título(s)`);
    if (evidenciaCategoria.length > 0) add('semantica', `categoria por ${evidenciaCategoria}`);

    const pesoTotal = sinaisEvidencia.reduce((s, x) => s + x.weight, 0);

    const evidence: SegmentEvidence = {
      segmentId: secao.hash,
      members: [...hashesMembros],
      signals: sinaisEvidencia,
      backgroundIds: backgrounds.map((b) => b.id),
      mediaIds: midias.map((m) => m.id),
      runtimeIds: runtimes.map((r) => r.id),
      stateIds: estados.map((e) => e.id),
      pointerResponseIds: ponteiro.map((p) => p.id),
      scrollIds: scroll.map((s) => s.id),
      assetKeys: [...assetsDoSegmento],
      nameEvidence: evidenciasDoNome,
      confidence: confiancaPorPeso(pesoTotal),
    };

    const fidelity = montarFidelidade({
      representacao,
      temTexto: sinais.texto.length >= 12,
      temMovimento,
      movimentoPorCss,
      backgrounds,
      midias,
      externos: externos.length,
      totalAssets: assetsDoSegmento.size,
      estados: estados.length,
      acoes,
      ponteiro,
      scroll,
      runtimes,
      temFrame,
    });

    const interactions = inferirInteracoesDoSegmento({ estados, acoes, ponteiro, scroll, html });

    segmentos.push({
      position: posicao,
      category: categoria,
      kind: kindDe(categoria, representacao),
      name: nome,
      htmlSnippet: html,
      hash: secao.hash,
      evidence,
      representation: representacao,
      fidelity,
      support: seloDe(fidelity, representacao),
      interactions,
      limitations: [
        ...representacao.limitations,
        ...backgrounds.flatMap((b) => b.limitations),
        ...midias.flatMap((m) => m.limitations),
        ...runtimes.flatMap((r) => r.limitations),
        ...(nomeEhGenerico(nome)
          ? ['O nome saiu genérico: a seção não apresentou evidência suficiente.']
          : []),
      ].slice(0, 12),
    });
    posicao++;
  }

  return { segmentos, rejeitados };
};

const maiorDelta = (obs: readonly TemporalObservation[]): string => {
  let maior = 0;
  for (const o of obs) if (o.pixelDelta > maior) maior = o.pixelDelta;
  return `${(maior * 100).toFixed(1)}%`;
};

const primeiroTitulo = (html: string): string | null => {
  const m = /<h[1-4][^>]*>([\s\S]{1,200}?)<\/h[1-4]>/i.exec(html);
  if (m?.[1] === undefined) return null;
  const texto = m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return texto.length >= 3 ? texto : null;
};

/**
 * Partículas: muitos elementos pequenos e iguais, ou uma cena com movimento e
 * vocabulário de partícula. Não é adivinhação por nome de classe sozinho — exige
 * movimento medido.
 */
const detectarParticulas = (
  html: string,
  membros: readonly VisualLayer[],
  temMovimento: boolean,
): boolean => {
  if (!temMovimento) return false;
  if (/\b(particle|particulas|partículas|starfield|confetti|sparkle)\b/i.test(html)) return true;
  const pequenos = membros.filter(
    (m) => m.normalizedBox !== undefined && m.normalizedBox.w < 0.03 && m.normalizedBox.h < 0.03,
  );
  return pequenos.length >= 12;
};

// ── Fidelidade e selo ────────────────────────────────────────────────────────

const montarFidelidade = (opts: {
  representacao: RepresentationDecision;
  temTexto: boolean;
  temMovimento: boolean;
  movimentoPorCss: boolean;
  backgrounds: readonly BackgroundDetection[];
  midias: readonly MediaDetection[];
  externos: number;
  totalAssets: number;
  estados: number;
  acoes: readonly ExecutedAction[];
  ponteiro: readonly PointerResponse[];
  scroll: readonly ScrollBehavior[];
  runtimes: readonly RuntimeDetection[];
  temFrame: boolean;
}): FidelityV2 => {
  const portatil = opts.representacao.type === 'componente-portatil';
  const capsula = opts.representacao.type === 'capsula-runtime';
  const referencia = opts.representacao.type === 'referencia-visual';

  const f: FidelityV2 = {
    estrutura: portatil ? 'portatil' : referencia ? 'referencia-visual' : 'capturado',
    css: portatil || capsula ? 'portatil' : 'referencia-visual',
    visual: referencia ? 'referencia-visual' : opts.temFrame ? 'capturado' : 'detectado',
    assets:
      opts.totalAssets === 0
        ? 'ausente'
        : opts.externos === 0
          ? 'portatil'
          : opts.externos < opts.totalAssets
            ? 'parcial'
            : 'externo',
    // A dimensão que o V1 não tinha: movimento MEDIDO, não declarado.
    temporal: opts.temMovimento
      ? opts.movimentoPorCss
        ? 'portatil'
        : capsula
          ? 'runtime-preservado'
          : 'referencia-visual'
      : 'ausente',
    animation: opts.temMovimento ? (opts.movimentoPorCss ? 'replayable' : 'capturado') : 'ausente',
    background:
      opts.backgrounds.length === 0
        ? 'ausente'
        : opts.backgrounds.every((b) => b.assetUrls.length === 0 || b.assetUrls.every(() => true))
          ? 'capturado'
          : 'detectado',
    media: opts.midias.length === 0 ? 'ausente' : opts.externos === 0 ? 'portatil' : 'externo',
    runtime:
      opts.runtimes.length === 0
        ? 'ausente'
        : capsula
          ? 'runtime-preservado'
          : referencia
            ? 'referencia-visual'
            : 'externo',
    portability: portatil ? 'portatil' : capsula ? 'runtime-preservado' : 'referencia-visual',
    // Validação só sobe no validador — aqui nunca nasce validado.
    validation: 'ausente',
  };

  // Interações: cada uma no estado em que de fato parou.
  const houveClique = opts.acoes.some((a) => a.hadEffect && a.kind !== 'hover');
  f.click = houveClique ? (opts.estados > 0 ? 'replayable' : 'capturado') : 'ausente';
  const houveHover = opts.ponteiro.some((p) => p.reactions.length > 0);
  f.hover = houveHover ? 'replayable' : 'ausente';
  f.pointer = opts.ponteiro.some((p) => p.domless)
    ? // Reação de cena sem DOM: detectada e gravada, não reproduzível como componente.
      referencia || capsula
      ? 'referencia-visual'
      : 'detectado'
    : houveHover
      ? 'capturado'
      : 'ausente';
  f.scroll =
    opts.scroll.length === 0
      ? 'ausente'
      : opts.scroll.some((s) => s.scrub)
        ? 'replayable'
        : 'capturado';
  f.keyboard = opts.acoes.some((a) => a.kind === 'teclado' && a.hadEffect)
    ? 'capturado'
    : 'ausente';
  f.drag = 'ausente';

  return f;
};

/**
 * Selo agregado, no vocabulário que a Galeria já mostra. Derivado das dimensões —
 * nunca o contrário. `completo` exige que nada esteja pendente.
 */
export const seloDe = (f: FidelityV2, r: RepresentationDecision): SupportLevel => {
  if (r.type === 'referencia-visual') return 'visual';
  if (f.assets === 'externo' || f.runtime === 'externo') return 'externo';
  if (r.type === 'capsula-runtime') return 'parcial';
  const pendentes = [f.click, f.pointer, f.scroll, f.temporal].filter(
    (d) => d === 'detectado' || d === 'capturado' || d === 'associado',
  );
  if (pendentes.length > 0) return 'parcial';
  if (f.assets === 'parcial') return 'parcial';
  return 'completo';
};

const inferirInteracoesDoSegmento = (opts: {
  estados: readonly { label: string }[];
  acoes: readonly ExecutedAction[];
  ponteiro: readonly PointerResponse[];
  scroll: readonly ScrollBehavior[];
  html: string;
}): InteractionKind[] => {
  const out = new Set<InteractionKind>();
  for (const a of opts.acoes) {
    if (!a.hadEffect) continue;
    if (a.kind === 'abrir-modal' || a.kind === 'fechar-modal') out.add('modal');
    else if (a.kind === 'trocar-tab') out.add('tab');
    else if (a.kind.includes('accordion')) out.add('toggle');
    else if (a.kind.includes('menu')) out.add('toggle');
    else if (a.kind.includes('carousel')) out.add('carousel');
    else if (a.kind === 'abrir-tooltip') out.add('tooltip');
    else if (a.kind === 'teclado') out.add('keyboard');
    else if (a.kind === 'hover') out.add('hover');
    else out.add('click');
  }
  if (opts.ponteiro.length > 0) out.add('hover');
  if (opts.ponteiro.some((p) => p.domless)) out.add('pointer');
  if (opts.scroll.length > 0) out.add('scroll');
  if (opts.scroll.some((s) => s.trigger === 'viewport')) out.add('viewport');
  if (/:hover|hover:/i.test(opts.html)) out.add('hover');
  if (/:focus|focus-visible/i.test(opts.html)) out.add('focus');
  return [...out];
};

export { contido };
