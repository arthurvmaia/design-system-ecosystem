import type {
  ComponentCategory,
  MediaKind,
  RepresentationType,
  RuntimeKind,
  ScrollBehaviorKind,
  StructuralRole,
} from '@ds/shared';

/**
 * Nomeação por evidência — função pura.
 *
 * O V1 nomeava assim: primeiro `<h1..h4>` do bloco; na falta, o rótulo da
 * categoria em PT; na falta de categoria, `"Seção"`. Um hero cujo título está
 * dentro de uma imagem, ou desenhado no canvas, saía como "Seção". Nada do que a
 * captura descobriu — runtime, mídia, reação ao ponteiro, comportamento de
 * scroll — entrava no nome.
 *
 * Aqui o nome é composto: **base** (o que o item é) + **qualificadores** (o que o
 * torna reconhecível), na ordem de força da evidência. O resultado se parece com
 * o que a pessoa vê na Galeria: "Hero com partículas interativas", "Background
 * WebGL orbital", "Cards com reveal progressivo", "CTA final com vídeo de fundo".
 *
 * Nenhum qualificador entra sem evidência medida. "Interativas" só aparece se a
 * varredura de ponteiro registrou reação; "em loop" só se a observação temporal
 * mediu movimento.
 */

/** Base em PT-BR por categoria — o mesmo vocabulário que a Galeria já usa. */
const BASE_CATEGORIA: Partial<Record<ComponentCategory, string>> = {
  hero: 'Hero',
  background: 'Background',
  overlay: 'Sobreposição',
  header: 'Cabeçalho',
  nav: 'Navegação',
  footer: 'Rodapé',
  pricing: 'Planos',
  testimonial: 'Depoimentos',
  faq: 'Perguntas frequentes',
  cta: 'CTA',
  form: 'Formulário',
  feature: 'Recursos',
  card: 'Cards',
  button: 'Botões',
  badge: 'Selos',
  input: 'Campos',
  accordion: 'Acordeão',
  gallery: 'Galeria',
  stats: 'Números',
  'logo-cloud': 'Marcas',
  team: 'Equipe',
  timeline: 'Linha do tempo',
};

/** Base por papel estrutural — usada quando não há categoria melhor. */
const BASE_PAPEL: Partial<Record<StructuralRole, string>> = {
  header: 'Cabeçalho',
  nav: 'Navegação',
  hero: 'Hero',
  footer: 'Rodapé',
  form: 'Formulário',
  aside: 'Lateral',
  article: 'Artigo',
  list: 'Lista',
  card: 'Card',
  canvas: 'Cena',
  video: 'Vídeo',
  svg: 'Ilustração',
  iframe: 'Conteúdo embarcado',
  'media-group': 'Mídia',
};

/** Como nomear o runtime no rótulo — nomes que a pessoa reconhece. */
const ROTULO_RUNTIME: Partial<Record<RuntimeKind, string>> = {
  three: 'WebGL',
  pixi: 'WebGL',
  'webgl-cru': 'WebGL',
  'shader-cru': 'shader',
  'canvas-2d': 'canvas',
  lottie: 'Lottie',
  gsap: 'GSAP',
  p5: 'canvas',
  matter: 'física',
};

const ROTULO_MIDIA: Partial<Record<MediaKind, string>> = {
  video: 'vídeo',
  gif: 'GIF',
  'webp-animado': 'WebP animado',
  'avif-animado': 'AVIF animado',
  apng: 'APNG',
  'svg-animado': 'SVG animado',
  lottie: 'Lottie',
};

/** Qualificador de comportamento de scroll, quando ele define o item. */
const ROTULO_SCROLL: Partial<Record<ScrollBehaviorKind, string>> = {
  'viewport-reveal': 'reveal progressivo',
  sticky: 'sticky',
  parallax: 'parallax',
  'progress-transform': 'transição por scroll',
  'progress-opacity': 'fade por scroll',
  'progress-scale': 'zoom por scroll',
  'progress-blur': 'blur por scroll',
  'section-theme': 'troca de tema',
  'horizontal-scroll': 'scroll horizontal',
  'media-progress': 'mídia controlada por scroll',
};

export type EvidenciaNome = {
  /** Categoria decidida pela segmentação. */
  category: ComponentCategory;
  /** Papel estrutural do nó principal. */
  role: StructuralRole;
  /** Título visível do item, se houver (na língua do site — não traduzir). */
  heading?: string | null;
  /** Runtimes detectados. */
  runtimes: readonly RuntimeKind[];
  /** Mídias detectadas. */
  midias: readonly MediaKind[];
  /** A mídia/fundo é usada como FUNDO da seção. */
  midiaComoFundo: boolean;
  /** Movimento medido no tempo. */
  animado: boolean;
  /** Reage ao ponteiro (medido). */
  reageAoPonteiro: boolean;
  /** Há partículas identificadas (muitos elementos pequenos em movimento). */
  particulas: boolean;
  /** Comportamentos de scroll associados. */
  scroll: readonly ScrollBehaviorKind[];
  /**
   * Contagens estruturais medidas — a última linha ANTES de cair no texto
   * visível. "Grade de 6 itens" descreve; "Imobiliária Premiada 2023 R$…"
   * é a manchete do site virando nome de peça, exatamente o que o prompt do
   * classificador proíbe.
   */
  sinaisEstruturais?: {
    itensRepetidos: number;
    titulos: number;
    acoes: number;
    imagens: number;
  };
  /** Estados capturados (menu aberto, aba trocada…). */
  estados: readonly string[];
  /** Forma de preservação — muda o vocabulário do nome. */
  representacao: RepresentationType;
  /** Posição do item na página (0..1) — só para "final"/"inicial". */
  posicao?: number;
  /** Índice, para desambiguar homônimos. */
  indice?: number;
  /**
   * Texto visível do segmento (na língua do site) — última base antes do
   * genérico: um bloco sem título ainda é reconhecível pelo que está escrito
   * nele.
   */
  textoVisivel?: string | null;
  /**
   * Fundos DISTINTIVOS com dono (medidos no CSSOM). Só imagem/gradiente — cor
   * sólida não distingue um bloco de outro.
   */
  fundos?: readonly ('imagem' | 'gradiente')[];
};

/** Corta um título longo sem cortar palavra no meio. */
const encurtar = (texto: string, max = 40): string => {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.5 ? corte.slice(0, espaco) : corte).trim()}…`;
};

/**
 * A base do nome. Prioridade: categoria específica > papel estrutural > título
 * visível > genérico.
 *
 * O título visível entra DEPOIS da categoria de propósito: "Hero" diz mais na
 * Galeria do que a manchete do site, e a manchete vira qualificador. Mas quando
 * não há categoria nem papel úteis, o título é melhor que "Seção".
 */
const baseDoNome = (ev: EvidenciaNome): { base: string; usouTitulo: boolean } => {
  const porCategoria = BASE_CATEGORIA[ev.category];
  if (porCategoria !== undefined) return { base: porCategoria, usouTitulo: false };
  const porPapel = BASE_PAPEL[ev.role];
  if (porPapel !== undefined) return { base: porPapel, usouTitulo: false };
  if (ev.heading && ev.heading.trim().length >= 3) {
    return { base: encurtar(ev.heading), usouTitulo: true };
  }
  // Em vez de "Seção", diga o que o item É pela representação.
  if (ev.representacao === 'capsula-runtime') return { base: 'Cena', usouTitulo: false };
  if (ev.representacao === 'referencia-visual')
    return { base: 'Referência visual', usouTitulo: false };
  // Descrição ESTRUTURAL antes do texto visível: o que o bloco É, medido,
  // vale mais do que as primeiras palavras do conteúdo dele.
  const est = ev.sinaisEstruturais;
  if (est !== undefined) {
    if (est.itensRepetidos >= 2)
      return { base: `Grade de ${est.itensRepetidos} itens`, usouTitulo: false };
    // Imagens NÃO entram aqui de propósito: o qualificador de fundo distintivo
    // ("… com imagem de fundo") já nomeia melhor esse caso, e é testado.
    if (est.acoes >= 1 && est.titulos >= 1) return { base: 'Chamada com ação', usouTitulo: false };
  }
  // Última linha antes do genérico: o texto visível do bloco. É o que a pessoa
  // vê no card — "Bloco" não diz nada; as primeiras palavras do conteúdo dizem.
  if (ev.textoVisivel && ev.textoVisivel.trim().length >= 3) {
    return { base: encurtar(ev.textoVisivel, 32), usouTitulo: true };
  }
  return { base: 'Bloco', usouTitulo: false };
};

/**
 * Qualificadores, em ordem de força. No máximo dois entram no nome — três já
 * viram frase, e a Galeria mostra o resto nos selos.
 */
const qualificadores = (ev: EvidenciaNome): string[] => {
  const q: string[] = [];

  // Runtime primeiro: é a informação que muda o que a pessoa pode fazer com o item.
  const runtimeLabel = ev.runtimes
    .map((r) => ROTULO_RUNTIME[r])
    .find((r): r is string => r !== undefined);
  if (runtimeLabel !== undefined) {
    if (ev.particulas) q.push(`partículas ${runtimeLabel === 'WebGL' ? 'WebGL' : runtimeLabel}`);
    else if (ev.reageAoPonteiro) q.push(`${runtimeLabel} interativo`);
    else if (ev.animado) q.push(`${runtimeLabel} em loop`);
    else q.push(runtimeLabel);
  } else if (ev.particulas) {
    q.push(ev.reageAoPonteiro ? 'partículas interativas' : 'partículas');
  }

  // Mídia: "com vídeo de fundo" é exatamente o que distingue dois CTAs.
  const midiaLabel = ev.midias
    .map((m) => ROTULO_MIDIA[m])
    .find((m): m is string => m !== undefined);
  if (midiaLabel !== undefined && runtimeLabel === undefined) {
    q.push(ev.midiaComoFundo ? `${midiaLabel} de fundo` : midiaLabel);
  }

  // Comportamento de scroll.
  const scrollLabel = ev.scroll
    .map((s) => ROTULO_SCROLL[s])
    .find((s): s is string => s !== undefined);
  if (scrollLabel !== undefined) q.push(scrollLabel);

  // Reação ao ponteiro sem runtime nomeado: hover magnético, tilt.
  if (ev.reageAoPonteiro && runtimeLabel === undefined && !ev.particulas) {
    q.push('hover magnético');
  }

  // Estados: "com menu expandido" desambigua uma navegação de outra.
  const estado = ev.estados[0];
  if (estado !== undefined && estado.trim().length > 0 && q.length < 2) {
    q.push(estado.trim());
  }

  return q;
};

/**
 * Monta o nome final. Determinístico: a mesma evidência sempre produz o mesmo
 * nome — o que importa porque o nome vira identidade na Galeria e na Biblioteca.
 */
export const nomearPorEvidencia = (ev: EvidenciaNome): { nome: string; evidencias: string[] } => {
  const { base, usouTitulo } = baseDoNome(ev);
  const quals = qualificadores(ev).slice(0, 2);
  const evidencias: string[] = [`base:${base}`];

  let nome = base;
  if (quals.length > 0) {
    nome = `${base} com ${quals.join(' e ')}`;
    for (const q of quals) evidencias.push(`qualificador:${q}`);
  } else if (!usouTitulo && ev.heading && ev.heading.trim().length >= 3) {
    // Sem qualificador de comportamento, o título visível é o melhor desempate —
    // e é o que a pessoa reconhece. Mantido na língua do site, sem tradução.
    nome = `${base} — ${encurtar(ev.heading, 32)}`;
    evidencias.push('titulo-visivel');
  }

  // Nome ainda genérico e sem comportamento medido: o fundo DISTINTIVO (CSSOM,
  // com dono geométrico) é a última evidência que separa um bloco de outro.
  if (quals.length === 0 && nomeEhGenerico(nome)) {
    const fundo = ev.fundos?.[0];
    if (fundo !== undefined) {
      nome = `${base} com ${fundo === 'imagem' ? 'imagem' : 'gradiente'} de fundo`;
      evidencias.push(`fundo:${fundo}`);
    }
  }

  // "final" / "inicial" só quando a posição é informativa e o nome ainda é curto.
  if (ev.posicao !== undefined && quals.length === 0 && ev.category === 'cta') {
    if (ev.posicao > 0.8) {
      nome = nome.replace(base, `${base} final`);
      evidencias.push('posicao:fim');
    }
  }

  if (ev.indice !== undefined && ev.indice > 0) {
    nome = `${nome} (${ev.indice + 1})`;
    evidencias.push(`indice:${ev.indice}`);
  }

  return { nome, evidencias };
};

/**
 * O nome é genérico? Usado pela comparação V1 x V2 para medir a redução — e para
 * o compilador avisar quando uma seção não deu evidência nenhuma.
 *
 * "Seção", "Bloco", "Div" e afins contam como genéricos; o mesmo nome com
 * qualificador não conta, porque aí ele diz algo.
 */
const GENERICOS =
  /^(se[çc][ãa]o|bloco|div|container|wrapper|elemento|item|conte[úu]do|grupo)(\s+\d+)?$/i;

export const nomeEhGenerico = (nome: string): boolean => GENERICOS.test(nome.trim());
