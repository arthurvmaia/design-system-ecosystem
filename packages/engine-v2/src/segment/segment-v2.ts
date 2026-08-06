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
  ScrollViewportPass,
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
import type { CamadasDePagina } from './camadas-de-pagina.js';
import type { ComportamentoCandidato } from './comportamentos.js';
import { nomeEhGenerico, nomearPorEvidencia } from './naming.js';
import type { PecaCandidata } from './pecas.js';
import { type EvidenciaRepresentacao, classificarRepresentacao } from './representation.js';
import { type FilhoDeSecao, subdividirPorEvidencia, subdividirSecao } from './subdividir.js';

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
 * Esta função é o antídoto direto do card preto E do card decorativo. Um
 * componente precisa de ESTRUTURA E PROPÓSITO PRÓPRIOS: texto de verdade,
 * ações, campos, títulos ou mídia de conteúdo (imagem, vídeo, embed).
 *
 * Efeito visual — canvas animado, gradiente, fundo com asset, orbe — NÃO é
 * substância sozinho. Quando o efeito pertence a uma seção real, o visual dela
 * já o carrega (o HTML da seção contém o efeito e o CSS viaja no bundle);
 * promovê-lo a card independente é o que enchia a Biblioteca de fragmentos.
 * A regra prefere rejeitar (com motivo humano, revisável em Pendências) a
 * promover algo sem valor de reutilização.
 */
export const validarSegmentoV2 = (opts: {
  texto: string;
  /** Sinais de conteúdo/função contados no HTML da seção. */
  sinais: SinaisDeConteudo;
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

  // Mídia DE CONTEÚDO — imagem, vídeo, embed, ilustração. Canvas/WebGL ficam
  // de fora de propósito: são efeito, não conteúdo.
  const midiaDeConteudo = opts.midias.some((m) => {
    if (m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2') return false;
    if (m.kind === 'video') return Boolean(m.src) || Boolean(m.poster) || opts.temMovimento;
    if (m.kind === 'iframe') return Boolean(m.src);
    return Boolean(m.src) || (m.intrinsic?.width ?? 0) > 0 || m.kind === 'svg-animado';
  });

  // Função de interface: botões/links, campos, títulos, preços.
  const temFuncao =
    opts.sinais.acoes > 0 ||
    opts.sinais.campos > 0 ||
    opts.sinais.titulos > 0 ||
    opts.sinais.precos > 0;

  // Imagens contadas no HTML também são conteúdo (ex.: faixa de logos sem
  // uma palavra) — mesmo quando não viraram MediaDetection.
  const temConteudo = temTexto || temFuncao || midiaDeConteudo || opts.sinais.imagens > 0;

  // Efeitos presentes (para o motivo certo quando faltar conteúdo).
  const canvasComMovimento = opts.midias.some(
    (m) =>
      (m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2') &&
      (opts.temMovimento || opts.temRuntime),
  );
  const fundoDecorativo = opts.backgrounds.some(
    (b) => b.assetUrls.length > 0 || /gradient|url\(/i.test(b.cssValue) || b.animated,
  );

  if (!temConteudo) {
    // Diagnóstico específico, porque "bloco vazio" não ajuda ninguém a corrigir.
    const canvasVazio = opts.midias.some(
      (m) =>
        (m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2') &&
        !opts.temMovimento &&
        !opts.temRuntime,
    );
    if (canvasComMovimento || fundoDecorativo) {
      motivos.push(
        'Efeito visual sem conteúdo próprio (canvas, gradiente ou fundo animado). Sozinho ele não vira componente — quando pertence a uma seção de verdade, o visual dela já o carrega.',
      );
    } else if (canvasVazio) {
      motivos.push(
        'Canvas sem nada desenhado: nenhum movimento foi medido e nenhum runtime foi identificado. Preservar isto produziria um card vazio.',
      );
    } else {
      motivos.push('Sem texto, sem ação e sem mídia de conteúdo — não há o que curar.');
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
  /**
   * Paradas do percurso de scroll. Ligam cada observação temporal à tela em que
   * ela foi feita (`temporalIds`) e ao que estava visível ali (`visible`) — é o
   * que permite atribuir movimento a uma dobra sem inventar.
   */
  scrollPasses?: readonly ScrollViewportPass[];
  pointerResponses: readonly PointerResponse[];
  scrollObservations: readonly ScrollBehavior[];
  stateGraph?: StateGraph;
  safeActions: readonly ExecutedAction[];
  /** HTML capturado por hash de elemento — o DOM que a exploração viu. */
  htmlPorHash: ReadonlyMap<string, string>;
  /** Frames gravados por hash (referência visual / estado). */
  framePorHash: ReadonlyMap<string, string>;
  /**
   * Peças escolhidas por evidência medida (card, botão, mockup, mídia), com a
   * dobra que as contém. É o insumo da subdivisão fina — sem elas ela cai no
   * caminho antigo, que adivinha por nome de classe.
   */
  pecas?: readonly PecaCandidata[];
  /**
   * Camadas que atravessam a página inteira (fundo animado, gradientes fixos).
   * Viram componente próprio DEPOIS das dobras: não pertencem a nenhuma delas.
   */
  camadasDePagina?: CamadasDePagina;
  /**
   * Comportamentos que viram componente (revelar ao rolar, parallax, fixar).
   * Saem depois das dobras, como as camadas de página: o comportamento é do
   * site, não de uma seção só.
   */
  comportamentos?: readonly ComportamentoCandidato[];
  /**
   * Os degraus de rampa que cada elemento usa, por hash.
   *
   * Vem pronto do mapeador porque a rampa é da PÁGINA: derivá-la por segmento
   * daria escalas diferentes para cada dobra, e a escala é justamente o que
   * vale no site inteiro.
   */
  tokensPorHash?: ReadonlyMap<string, readonly string[]>;
  /** URLs de asset que têm cópia local. */
  assetsLocais: ReadonlySet<string>;
  /** Scripts de que a página depende e que NÃO foram obtidos. */
  scriptsNaoLocalizados: number;
  /**
   * Alguma folha de estilo externa do documento ficou SEM cópia local. O bundle
   * sai sem parte dos estilos — o CSS de nenhum segmento pode se dizer portátil.
   */
  cssExternoFaltando: boolean;
  /**
   * Runtimes cujo script passou a VIAJAR dentro do bundle.
   *
   * Muda a resposta da classificação: um fundo em canvas cujo script está no
   * .zip desenha offline, e chamá-lo de dependência de rede seria tão errado
   * quanto o silêncio anterior. O Iconify NÃO entra aqui de propósito — ver
   * : a biblioteca viaja, o traçado de cada ícone continua
   * vindo de uma API.
   */
  runtimesQueViajam?: readonly RuntimeKind[];
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
  /** Print da dobra (relativo a `capture-v2/`), quando houve. */
  framePath?: string;
  /**
   * As camadas de fundo que passam ATRÁS desta seção, no HTML delas.
   *
   * O problema que isto resolve: o fundo de uma página (feixes de luz, blobs,
   * grão, canvas animado) é um irmão do conteúdo, não um filho — mora no
   * `<body>`, com `position:fixed`, atrás de tudo. A segmentação o emitia como
   * item próprio, e ele nunca era recomposto atrás de ninguém. O resultado é a
   * seção que na origem tinha feixes de luz saindo com fundo morto, e nada
   * explicando por quê: o CSS está lá, o HTML está lá, e a camada que os
   * ligava ficou noutro item.
   *
   * O bundle materializa estas camadas **dentro do shell, antes do nó da
   * região**, na posição original. `position:fixed` e `z-index` voltam a
   * compor porque a ordem de irmãos e o contexto de empilhamento são os mesmos.
   *
   * A camada continua existindo como item próprio na Galeria — ela é curável
   * por direito. O que muda é que deixa de ser SÓ isso.
   */
  camadasDeFundo?: string[];
  /**
   * Subcomponentes extraídos de dentro da seção (botão, card, badge…). Só
   * seção aprovada tem filhos — ver `subdividirSecao`.
   */
  filhos: FilhoDeSecao[];
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

/**
 * Ícones do segmento: quantos vieram desenhados e quantos ficaram como casca.
 *
 * `<iconify-icon icon="solar:home"></iconify-icon>` no HTML capturado é uma
 * promessa, não um desenho — o traçado vem de uma API externa e mora num shadow
 * root. Se a leitura pegou o SVG, ele viaja como `<span data-ds-icone="inline">`
 * e a peça deixa de depender de qualquer runtime. Se não pegou, a caixa aparece
 * vazia no site entregue, e o app precisa dizer isso em vez de prometer uma
 * peça portátil.
 */
export const contarIcones = (html: string): { inline: number; pendentes: number } => {
  const inline = (html.match(/data-ds-icone\s*=\s*"inline"/gi) ?? []).length;
  let pendentes = 0;
  for (const m of html.matchAll(
    /<(iconify-icon|ion-icon|lord-icon)\b[^>]*>([\s\S]{0,120}?)<\/\1>/gi,
  )) {
    if (!/<svg\b/i.test(m[2] ?? '')) pendentes++;
  }
  pendentes += (html.match(/<(?:iconify-icon|ion-icon|lord-icon)\b[^>]*\/>/gi) ?? []).length;
  pendentes += (html.match(/data-ds-icone\s*=\s*"nao-desenhado"/gi) ?? []).length;
  return { inline, pendentes };
};

/**
 * Quais camadas de fundo passam atrás de uma dobra.
 *
 * Interseção de caixa, e não contenção: uma camada `position:fixed` do tamanho
 * da tela tem `pageBox` no topo do documento e a dobra pode estar a 3000px de
 * distância — exigir contenção deixaria toda seção abaixo da primeira sem
 * fundo. O que importa é se a camada COBRE aquele trecho quando ele está na
 * tela, e camada fixa cobre sempre.
 *
 * Fica em ordem estável (a da lista de camadas) para o bundle empilhar sempre
 * igual: fundo que troca de ordem entre duas compilações é um fundo diferente.
 */
export const camadasQuePassamAtras = (opts: {
  no: StructuralNode;
  camadas: CamadasDePagina | undefined;
  visualLayers: readonly VisualLayer[];
  htmlPorHash: ReadonlyMap<string, string>;
}): string[] => {
  const { no, camadas, visualLayers, htmlPorHash } = opts;
  const todas = [...(camadas?.comRuntime ?? []), ...(camadas?.soCss ?? [])];
  const caixaDaDobra = no.pageBox;
  const porHashDeCamada = new Map(visualLayers.map((c) => [c.fingerprint.hash, c]));

  const saida: string[] = [];
  for (const h of todas) {
    if (!htmlPorHash.has(h)) continue;
    const camada = porHashDeCamada.get(h);
    // Sem medida da camada, o caminho honesto é incluir: uma camada escolhida
    // por `escolherCamadasDePagina` já é, por definição, fundo de página.
    if (camada === undefined) {
      saida.push(h);
      continue;
    }
    // Camada fixa acompanha a rolagem: ela está atrás de tudo, por definição.
    // O `pageBox` dela mede onde ela estava no instante da captura, não onde
    // ela pinta — usá-lo como filtro descartaria justamente o caso comum.
    const fixa = camada.stacking.position === 'fixed';
    if (fixa) {
      saida.push(h);
      continue;
    }
    const caixaDaCamada = camada.pageBox;
    if (caixaDaCamada === undefined || caixaDaDobra === undefined) {
      saida.push(h);
      continue;
    }
    if (intersecao(caixaDaCamada, caixaDaDobra) > 0) saida.push(h);
  }
  return saida;
};

/**
 * Quais runtimes são donos de um trecho da página.
 *
 * A pergunta é sempre a mesma, para uma dobra ou para a camada de fundo: qual
 * script precisa rodar para ESTE pedaço existir como ele era. A regra vive aqui
 * uma vez só porque, quando ela viveu em dois lugares, os dois discordaram: a
 * camada de fundo pegava "todo runtime com script" e ficava com o Tailwind e o
 * Iconify no lugar do runtime da cena. Com os donos errados, o classificador não
 * encontrava bootstrap nenhum e o fundo animado caía em referência visual, isto
 * é, virava um PNG parado.
 *
 * `temFundoAtras` separa quem tem um canvas de fundo por trás de si de quem não
 * tem: atribuir o fundo a todas as seções transformaria em cápsula até o rodapé
 * de texto, que nada perde.
 */
export const runtimesDonosDe = (opts: {
  hashes: readonly string[];
  runtimes: readonly RuntimeDetection[];
  midias: readonly MediaDetection[];
  iconesPendentes: number;
  temFundoAtras: boolean;
}): RuntimeDetection[] => {
  const { hashes, runtimes, midias, iconesPendentes, temFundoAtras } = opts;
  const alvos = new Set(hashes);
  const temCena = midias.some(
    (m) =>
      m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2' || m.kind === 'lottie',
  );
  return runtimes.filter((r) => {
    // Posse declarada: o runtime aponta para um nó deste trecho.
    if (r.targets.some((t) => alvos.has(t))) return true;
    // Os que DESENHAM não declaram alvo. O Iconify não "controla" um nó: ele
    // substitui o conteúdo de cada tag de ícone, então a posse é pela presença
    // de ícone por desenhar.
    if (r.kind === 'iconify') return iconesPendentes > 0;
    if (r.kind === 'fundo-canvas') return temFundoAtras;
    // O Tailwind por CDN compila as classes de todo mundo. Isso não impede
    // nada por si: quem trata disso é a evidência de CSS capturado.
    if (r.kind === 'tailwind-cdn') return true;
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
};

/**
 * As limitações de um segmento, sem repetição e com teto.
 *
 * Elas vêm de várias fontes — a decisão de representação, cada fundo, cada
 * mídia, cada runtime, cada comportamento observado — e várias delas dizem a
 * MESMA frase quando o item tem mais de um alvo. Um parallax com dois alvos
 * mostrava duas vezes "Parallax aproximado por keyframes de translateY
 * vinculados ao progresso", uma embaixo da outra, na ficha que a pessoa lê.
 *
 * Repetir não acrescenta informação e tira credibilidade do resto da lista:
 * quem vê a mesma frase duas vezes passa a ler as outras com menos atenção.
 */
export const limitacoesDe = (fontes: readonly string[]): string[] =>
  [...new Set(fontes.map((l) => l.trim()).filter((l) => l.length > 0))].slice(0, 12);

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

  /** Os degraus que aparecem dentro de um conjunto de membros, sem repetir. */
  const tokensDe = (hashes: Iterable<string>): string[] => {
    const mapa = entrada.tokensPorHash;
    if (mapa === undefined) return [];
    const ids = new Set<string>();
    for (const h of hashes) for (const id of mapa.get(h) ?? []) ids.add(id);
    return [...ids].sort();
  };
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
    const temporais = temporaisDaSecao({
      observacoes: entrada.temporalObservations,
      passes: entrada.scrollPasses ?? [],
      hashesMembros,
      pageBox: secao.pageBox,
      alturaDaViewport: entrada.viewport.height,
    });
    const ponteiro = entrada.pointerResponses.filter((p) => {
      if (p.fingerprint !== undefined && hashesMembros.has(p.fingerprint.hash)) return true;
      // Reação sem DOM: pertence à seção se a região cai dentro dela.
      if (p.region === undefined || node.pageBox === undefined) return false;
      // A região é relativa à VIEWPORT; o pageBox é coordenada de PÁGINA. O
      // scroll da parada é o que liga os dois — sem ele, medido no acervo,
      // 100% das reações caíam nos segmentos do topo e tudo abaixo tinha zero.
      // Resposta antiga (sem scrollY) continua com o comportamento de sempre.
      const emPx: BoxPx = {
        x: p.region.x * entrada.viewport.width,
        y: p.region.y * entrada.viewport.height + (p.scrollY ?? 0),
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
    const html = entrada.htmlPorHash.get(secao.hash) ?? '';
    // Ícones que ficaram como casca dentro DESTA seção, e os que já vieram
    // desenhados. É o que decide se a biblioteca de ícones ainda faz falta —
    // um item cujos ícones foram todos trazidos para o HTML não depende dela.
    const icones = contarIcones(html);

    // As camadas de fundo que passam ATRÁS desta dobra. Calculado aqui, antes
    // dos runtimes, porque é o que decide se o script que pinta o fundo pesa
    // sobre esta seção: uma dobra que não tem camada atrás não perde nada se o
    // canvas não desenhar.
    const camadasDeFundo = camadasQuePassamAtras({
      no: node,
      camadas: entrada.camadasDePagina,
      visualLayers: entrada.visualLayers,
      htmlPorHash: entrada.htmlPorHash,
    });

    const runtimes = runtimesDonosDe({
      hashes: [...hashesMembros],
      runtimes: entrada.runtimeDetections,
      midias,
      iconesPendentes: icones.pendentes,
      temFundoAtras: camadasDeFundo.length > 0,
    });

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
      iconesNaoDesenhados: icones.pendentes,
      iconesInline: icones.inline,
      // O Tailwind por CDN injeta um `<style>` com o resultado da compilação, e
      // o coletor lê `document.styleSheets` DEPOIS de a página rodar — então na
      // prática o CSS vem junto. Só quando a coleta inteira falhou é que a
      // dependência do CDN é real.
      cssCompiladoCapturado: !entrada.cssExternoFaltando,
      runtimesLocais: entrada.runtimesQueViajam ?? [],
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
      sinais,
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
    // Fundos que DISTINGUEM (imagem/gradiente, medidos no CSSOM): entram no nome
    // quando nenhuma evidência mais forte falou — cor sólida fica de fora.
    const fundosDistintivos = [
      ...new Set(
        backgrounds
          .map((b) =>
            b.assetUrls.length > 0 || /url\(/i.test(b.cssValue)
              ? ('imagem' as const)
              : /gradient\(/i.test(b.cssValue)
                ? ('gradiente' as const)
                : null,
          )
          .filter((f): f is 'imagem' | 'gradiente' => f !== null),
      ),
    ];
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
      textoVisivel: sinais.texto,
      fundos: fundosDistintivos,
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
      tokenIds: tokensDe(hashesMembros),
      nameEvidence: evidenciasDoNome,
      confidence: confiancaPorPeso(pesoTotal),
    };

    const fidelity = montarFidelidade({
      representacao,
      cssExternoFaltando: entrada.cssExternoFaltando,
      temTexto: sinais.texto.length >= 12,
      temMovimento,
      movimentoPorCss,
      backgrounds,
      midias,
      externos: externos.length,
      totalAssets: assetsDoSegmento.size,
      assetsLocais: entrada.assetsLocais,
      estados: estados.length,
      acoes,
      ponteiro,
      scroll,
      runtimes,
      temFrame,
    });

    const interactions = inferirInteracoesDoSegmento({ estados, acoes, ponteiro, scroll, html });

    // Subdivisão fina, SÓ depois do veredito: as peças reutilizáveis de dentro
    // da seção (botão, card, mockup…). Seção rejeitada não deixa descendência.
    //
    // Preferência pela MEDIÇÃO: as peças que o navegador viu dentro desta dobra.
    // O caminho por string entra quando não houve medição (captura antiga) ou
    // quando ela não rendeu nada aqui — nunca os dois, para não duplicar peça.
    const pecasDaSecao = (entrada.pecas ?? []).filter((p) => p.secaoHash === secao.hash);
    const porEvidencia = subdividirPorEvidencia(pecasDaSecao, entrada.htmlPorHash, html.length);
    const filhos =
      porEvidencia.length > 0
        ? porEvidencia
        : subdividirSecao({ category: categoria, htmlSnippet: html });

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
      camadasDeFundo,
      limitations: limitacoesDe([
        ...representacao.limitations,
        ...backgrounds.flatMap((b) => b.limitations),
        ...midias.flatMap((m) => m.limitations),
        ...runtimes.flatMap((r) => r.limitations),
        ...(nomeEhGenerico(nome)
          ? ['O nome saiu genérico: a seção não apresentou evidência suficiente.']
          : []),
      ]),
      framePath: entrada.framePorHash.get(secao.hash),
      filhos,
    });
    posicao++;
  }

  // ── Fundo da página ────────────────────────────────────────────────────────
  // Depois das dobras, e não dentro de nenhuma: estas camadas atravessam todas.
  for (const grupo of ['comRuntime', 'soCss'] as const) {
    const hashes = (entrada.camadasDePagina?.[grupo] ?? []).filter((h) =>
      entrada.htmlPorHash.has(h),
    );
    if (hashes.length === 0) continue;

    const nos = hashes.flatMap((h) => {
      const n = porHash.get(h);
      return n === undefined ? [] : [n];
    });
    const html = hashes.map((h) => entrada.htmlPorHash.get(h) ?? '').join('\n');
    if (html.trim().length === 0) continue;

    const midiasDoFundo = entrada.mediaDetections.filter((m) =>
      hashes.includes(m.fingerprint.hash),
    );
    // A camada de fundo É o fundo: `temFundoAtras` é verdadeiro por definição.
    const runtimesDoFundo =
      grupo === 'comRuntime'
        ? runtimesDonosDe({
            hashes,
            runtimes: entrada.runtimeDetections,
            midias: midiasDoFundo,
            iconesPendentes: contarIcones(html).pendentes,
            temFundoAtras: true,
          })
        : [];
    const fundosDoFundo = entrada.backgroundDetections.filter((b) =>
      hashes.includes(b.fingerprint.hash),
    );
    const temporaisDoFundo = entrada.temporalObservations.filter((t) => hashes.includes(t.target));
    const scrollDoFundo = entrada.scrollObservations.filter((s) => {
      const alvoId = s.target.id ?? '';
      return nos.some((n) => alvoId.length > 0 && n.fingerprint.id === alvoId);
    });
    const temMovimento = temporaisDoFundo.some((t) => t.moving);
    // Um canvas sem o script é um retângulo vazio. Se a observação temporal
    // gravou o movimento desta camada, é ESSE quadro que a Galeria mostra —
    // sem ele, a referência visual não teria o que exibir.
    const frameDoFundo = hashes
      .map((h) => entrada.framePorHash.get(h))
      .find((f) => f !== undefined);

    // MESMO caminho das dobras: nada aqui declara fidelidade por conta própria.
    const representacao = classificarRepresentacao({
      runtimes: runtimesDoFundo.map((r) => r.kind),
      midias: midiasDoFundo.map((m) => m.kind),
      assetsLocais: true,
      assetsExternos: 0,
      scriptsNaoLocalizados: entrada.scriptsNaoLocalizados,
      iframeCrossOrigin: false,
      shadowFechado: false,
      estadosCapturados: 0,
      movimentoMedido: temMovimento,
      // Camada de canvas se move por script; camada de CSS, por CSS.
      movimentoPorCss: grupo === 'soCss',
      reageAoPonteiro: false,
      regiaoReativaSemDom: grupo === 'comRuntime' && temMovimento,
      dependeDeJs: grupo === 'comRuntime',
      // A MESMA derivação das dobras. Estava fixo em `false`, e um valor fixo
      // aqui tornava impossível um fundo animado virar cápsula de runtime: sem
      // bootstrap identificado, o classificador não tem o que executar isolado
      // e só lhe resta a referência visual.
      bootstrapIdentificado: runtimesDoFundo.some(
        (r) => r.scripts.length > 0 && r.confidence !== 'baixa',
      ),
      // A mesma evidência que as dobras recebem.
      //
      // Sem estas duas linhas, a camada de fundo era classificada por um
      // conjunto de fatos MENOR do que o que a captura tinha: na mesma rodada,
      // uma dobra saía `componente-portatil` (o CSS do Tailwind foi capturado)
      // e o fundo saía `capsula-runtime` com a limitação "o CSS resultante não
      // foi capturado: as classes ficam sem estilo". A captura era a mesma; o
      // que mudava era o que a chamada informava.
      cssCompiladoCapturado: !entrada.cssExternoFaltando,
      runtimesLocais: entrada.runtimesQueViajam ?? [],
    });

    const fidelity = montarFidelidade({
      representacao,
      cssExternoFaltando: entrada.cssExternoFaltando,
      temTexto: false,
      temMovimento,
      movimentoPorCss: grupo === 'soCss',
      backgrounds: fundosDoFundo,
      midias: midiasDoFundo,
      externos: 0,
      totalAssets: 0,
      assetsLocais: entrada.assetsLocais,
      estados: 0,
      acoes: [],
      ponteiro: [],
      scroll: scrollDoFundo,
      runtimes: runtimesDoFundo,
      temFrame: frameDoFundo !== undefined,
    });

    const nome =
      grupo === 'comRuntime'
        ? 'Fundo animado da página'
        : temMovimento
          ? 'Fundo em camadas da página'
          : 'Fundo da página';

    segmentos.push({
      position: posicao,
      category: 'background',
      kind: 'effect',
      name: nome,
      htmlSnippet: html,
      hash: `fundo-${grupo}-${hashes[0] ?? ''}`,
      evidence: {
        segmentId: `fundo-${grupo}`,
        members: hashes,
        signals: [
          { kind: 'layout', weight: PESO.layout, detail: 'camada fixa do tamanho da tela' },
          ...(fundosDoFundo.length > 0
            ? [
                {
                  kind: 'fundo-compartilhado' as const,
                  weight: PESO['fundo-compartilhado'],
                  detail: `${fundosDoFundo.length} camada(s) de fundo`,
                },
              ]
            : []),
          ...(temMovimento
            ? [
                {
                  kind: 'pixel-diff' as const,
                  weight: PESO['pixel-diff'],
                  detail: `movimento medido (Δ até ${maiorDelta(temporaisDoFundo)})`,
                },
              ]
            : []),
        ],
        backgroundIds: fundosDoFundo.map((b) => b.id),
        mediaIds: midiasDoFundo.map((m) => m.id),
        runtimeIds: runtimesDoFundo.map((r) => r.id),
        stateIds: [],
        pointerResponseIds: [],
        scrollIds: scrollDoFundo.map((s) => s.id),
        assetKeys: [],
        tokenIds: tokensDe(hashes),
        nameEvidence: ['camada fixa que cobre a viewport em toda a página'],
        // 'media', não 'alta': uma camada não passa pela escada de evidência
        // das dobras (peso somado por sinal), e cravar 'alta' aqui era um dos
        // dois pontos que deixavam 23 de 92 segmentos do acervo com confiança
        // máxima sem nenhuma verificação. Confiança se ganha, não se declara.
        confidence: 'media',
      },
      representation: representacao,
      fidelity,
      support: seloDe(fidelity, representacao),
      interactions: [],
      limitations: limitacoesDe([
        'Esta camada atravessa a página inteira: no site de origem ela fica por trás de todas as seções.',
        ...representacao.limitations,
        // Sem quadro gravado, uma camada de runtime não tem o que mostrar: o
        // canvas chega como retângulo vazio. Dizer isso é melhor que exibir a
        // área em branco como se fosse o componente.
        ...(grupo === 'comRuntime' && frameDoFundo === undefined
          ? [
              'O movimento desta camada não foi gravado em quadro: sem o script da origem ela aparece vazia na prévia.',
            ]
          : []),
        ...fundosDoFundo.flatMap((b) => b.limitations),
        ...midiasDoFundo.flatMap((m) => m.limitations),
      ]),
      framePath: frameDoFundo,
      filhos: [],
    });
    posicao++;
  }

  // ── Comportamentos ─────────────────────────────────────────────────────────
  // "Quero que meus cards apareçam assim quando eu rolo" é um pedido de
  // componente, não de etiqueta. Aqui o que a captura mediu vira item da
  // Galeria, com os alvos reais lado a lado e o `scrollIds` preenchido — é ele
  // que liga o item ao modo "Ver ao rolar" do preview, que já existia.
  for (const comp of entrada.comportamentos ?? []) {
    const comHtml = comp.hashes.filter((h) => entrada.htmlPorHash.has(h));
    if (comHtml.length === 0) continue;
    const html = comHtml.map((h) => entrada.htmlPorHash.get(h) ?? '').join('\n');
    if (html.trim().length === 0) continue;

    const scrollDoComp = entrada.scrollObservations.filter((s) => comp.scrollIds.includes(s.id));
    const representacao = classificarRepresentacao({
      runtimes: [],
      midias: [],
      assetsLocais: true,
      assetsExternos: 0,
      scriptsNaoLocalizados: entrada.scriptsNaoLocalizados,
      iframeCrossOrigin: false,
      shadowFechado: false,
      estadosCapturados: 0,
      movimentoMedido: true,
      // Reveal/parallax/sticky são reproduzidos por CSS e observador de
      // viewport no preview, sem o JS da origem.
      movimentoPorCss: true,
      reageAoPonteiro: false,
      regiaoReativaSemDom: false,
      dependeDeJs: false,
      bootstrapIdentificado: false,
    });

    const fidelity = montarFidelidade({
      representacao,
      cssExternoFaltando: entrada.cssExternoFaltando,
      temTexto: false,
      temMovimento: true,
      movimentoPorCss: true,
      backgrounds: [],
      midias: [],
      externos: 0,
      totalAssets: 0,
      assetsLocais: entrada.assetsLocais,
      estados: 0,
      acoes: [],
      ponteiro: [],
      scroll: scrollDoComp,
      runtimes: [],
      temFrame: false,
    });

    segmentos.push({
      position: posicao,
      category: 'interaction',
      kind: 'animation',
      name: comp.nome,
      htmlSnippet: html,
      hash: `comportamento-${comp.familia}-${comHtml[0] ?? ''}`,
      evidence: {
        segmentId: `comportamento-${comp.familia}`,
        members: comHtml,
        signals: [
          {
            kind: 'scroll',
            weight: PESO.scroll,
            detail: `${comp.quantidade} elemento(s) com este comportamento`,
          },
          { kind: 'comportamento', weight: PESO.comportamento, detail: comp.explicacao },
        ],
        backgroundIds: [],
        mediaIds: [],
        runtimeIds: [],
        stateIds: [],
        pointerResponseIds: [],
        scrollIds: comp.scrollIds,
        assetKeys: [],
        tokenIds: tokensDe(comHtml),
        nameEvidence: [comp.explicacao],
        // Mesmo motivo da camada de fundo: comportamento de scroll não passa
        // pela escada de evidência, e 'alta' cravada era declaração, não medida.
        confidence: 'media',
      },
      representation: representacao,
      fidelity,
      support: seloDe(fidelity, representacao),
      interactions: ['scroll'],
      limitations: limitacoesDe([
        comp.explicacao,
        'Aqui o comportamento é o componente: os elementos servem de amostra para você ver o movimento. Use o botão de rolar para reproduzir.',
        ...scrollDoComp.flatMap((s) => s.limitations),
      ]),
      filhos: [],
    });
    posicao++;
  }

  return { segmentos, rejeitados };
};

/**
 * Fração da tela que a dobra precisa ocupar, NAQUELA parada, para o movimento
 * medido ali ser atribuído a ela.
 *
 * A observação temporal é POR PARADA de scroll, não por elemento — medir cada
 * elemento custaria mais que todo o resto do pipeline. Ela responde "algo se
 * mexeu nesta tela", não "este elemento se mexeu". Atribuir a toda dobra visível
 * marcaria como animado um bloco de texto parado só porque o fundo da página se
 * move atrás dele.
 *
 * O corte resolve isso pelo único critério defensável: quando a dobra ERA
 * praticamente a tela inteira, "algo se mexeu na tela" e "algo se mexeu nesta
 * dobra" são a mesma frase.
 */
const DOMINIO_DA_TELA = 0.6;

/**
 * As observações temporais que pertencem a esta dobra.
 *
 * Aceita as duas formas de alvo: hash de elemento (observação dirigida) e
 * `viewport:<n>` (observação da parada). No segundo caso a ligação é
 * GEOMÉTRICA: a parada guarda o `scrollY`, então a tela daquele momento é
 * `[scrollY, scrollY + altura]`, e a pergunta vira "quanto desta tela era esta
 * dobra?".
 *
 * A geometria foi escolhida em vez da lista `visible` da parada porque essa
 * lista não traz os nós de seção — medido nesta captura: zero dobras entre os
 * visíveis, nas nove paradas. `pageBox` e `scrollY` são medidos e confiáveis.
 *
 * Antes disto o filtro comparava id de viewport com hash de elemento e nunca
 * casava: `temMovimento` era falso em todo segmento de toda extração.
 */
export const temporaisDaSecao = (opts: {
  observacoes: readonly TemporalObservation[];
  passes: readonly ScrollViewportPass[];
  hashesMembros: ReadonlySet<string>;
  pageBox: BoxPx;
  alturaDaViewport: number;
}): TemporalObservation[] => {
  const { observacoes, passes, hashesMembros, pageBox, alturaDaViewport } = opts;

  const passePorObservacao = new Map<string, ScrollViewportPass>();
  for (const p of passes) {
    for (const id of p.temporalIds) passePorObservacao.set(id, p);
  }

  /** Quanto da tela daquela parada era ocupado por esta dobra (0..1). */
  const fracaoDaTela = (passe: ScrollViewportPass): number => {
    if (alturaDaViewport <= 0) return 0;
    const topoDaTela = passe.scrollY;
    const baseDaTela = passe.scrollY + alturaDaViewport;
    const sobreposicao =
      Math.min(baseDaTela, pageBox.y + pageBox.h) - Math.max(topoDaTela, pageBox.y);
    return sobreposicao <= 0 ? 0 : sobreposicao / alturaDaViewport;
  };

  return observacoes.filter((t) => {
    // Observação dirigida a um elemento desta dobra: ligação direta.
    if (hashesMembros.has(t.target)) return true;
    if (!t.target.startsWith('viewport:')) return false;
    const passe = passePorObservacao.get(t.id);
    if (passe === undefined) return false;
    return fracaoDaTela(passe) >= DOMINIO_DA_TELA;
  });
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
  /** Folha externa do documento sem cópia local — o CSS embutido está incompleto. */
  cssExternoFaltando: boolean;
  temTexto: boolean;
  temMovimento: boolean;
  movimentoPorCss: boolean;
  backgrounds: readonly BackgroundDetection[];
  midias: readonly MediaDetection[];
  externos: number;
  totalAssets: number;
  /** URLs de asset COM cópia local — decide se um fundo por imagem viaja mesmo. */
  assetsLocais: ReadonlySet<string>;
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
    // Folha externa sem cópia local = o CSS que viaja está incompleto. `parcial`
    // em vez de `portatil` — o selo honesto começa aqui.
    css:
      portatil || capsula
        ? opts.cssExternoFaltando
          ? 'parcial'
          : 'portatil'
        : 'referencia-visual',
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
        : // `capturado` exige que cada imagem de fundo tenha CÓPIA LOCAL. A
          // condição anterior comparava a lista com ela mesma (sempre verdadeira)
          // e todo fundo saía `capturado`, inclusive o que seguia dependendo da
          // origem. Fundo sem asset (gradiente, cor) não precisa de cópia.
          opts.backgrounds.every(
              (b) => b.assetUrls.length === 0 || b.assetUrls.every((u) => opts.assetsLocais.has(u)),
            )
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
  // Componente portátil com CSS incompleto (folha externa sem cópia local) não
  // pode se dizer completo: parte dos estilos ficou na origem.
  if (f.css !== 'portatil') return 'parcial';
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
