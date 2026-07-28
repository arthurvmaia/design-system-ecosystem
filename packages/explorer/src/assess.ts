import type {
  ComponentCapabilities,
  FidelityAssessment,
  InteractionInfo,
  InteractionKind,
  RenderMode,
  SupportLevel,
} from '@ds/shared';

/**
 * Avaliação de fidelidade — função pura sobre HTML (+ CSS).
 *
 * Cumpre a regra mais dura do pedido: **não esconder a falha**. Um componente
 * que só pôde ser reproduzido visualmente (um canvas, uma animação de JS
 * externo) diz isso aqui, e a Galeria mostra o selo. Nada finge estar completo.
 *
 * É deliberadamente conservadora e estática: funciona sobre o snippet de um
 * segmento sem abrir navegador. Quando existe captura por navegador, o chamador
 * passa `hasCapturedStates` e a nota sobe de `parcial` para `completo`.
 */

export type AssessOptions = {
  /** A exploração capturou estados reais deste componente (accordion aberto, etc.). */
  hasCapturedStates?: boolean;
  /** Os assets referenciados foram baixados e embutidos localmente. */
  bundledAssets?: boolean;
  /**
   * O CSS que define os estados (`:hover`/`:focus`) acompanha o componente.
   * `hover:` numa classe do HTML é declaração, não efeito — sem o CSS embutido,
   * hover/focus não passam de `parcial`. Ausente, `assessFidelity` deduz do
   * próprio `css` recebido.
   */
  cssEmbutido?: boolean;
  /** Interações já conhecidas (do mapa de interação), para enriquecer a lista. */
  knownInteractions?: InteractionKind[];
};

/**
 * Aviso de asset não-embutido. Exportado como constante para o segmenter poder
 * RECONCILIAR: quando a localização real prova que nenhum asset ficou externo, o
 * aviso herdado da avaliação estática (que roda antes do download) é removido —
 * a dimensão real de assets é a autoridade, não a heurística.
 */
export const AVISO_ASSETS_NA_ORIGEM =
  'Assets ainda apontam para a origem; salve localmente para o componente sobreviver sozinho.';

const has = (re: RegExp, ...inputs: string[]): boolean => inputs.some((s) => re.test(s));

/** Detecta os sinais técnicos do componente a partir do HTML e do CSS. */
export const detectCapabilities = (html: string, css: string): Required<ComponentCapabilities> => {
  const hasCanvas = /<canvas[\s>]/i.test(html);
  const mencionaWebgl = has(/\b(webgl|three\.?js|THREE|shader|gl_frag|regl|pixi)\b/i, html);
  const hasWebGL = hasCanvas && mencionaWebgl;
  const hasVideo = /<video[\s>]/i.test(html);
  const hasIframe = /<iframe[\s>]/i.test(html);
  const hasLottie = /<lottie-player|\blottie\b|dotlottie/i.test(html) || /\blottie\b/i.test(css);
  const hasAnimatedSvg = /<svg[\s\S]*?<(animate|animateTransform|animateMotion|set)\b/i.test(html);
  const hasCssAnimation =
    /@keyframes\b/i.test(css) || has(/\banimate-[\w-]+|\banimation\b|\btransition\b/i, html, css);
  const dependsOnExternalScript = /<script[^>]+src\s*=/i.test(html);
  const dependsOnInlineScript = /<script(?![^>]+src)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html);
  const temHandlerInline = /\son[a-z]+\s*=/i.test(html);
  const temToggle = /aria-expanded|data-(toggle|tab|accordion|modal|dropdown|carousel|state)/i.test(
    html,
  );
  const dependsOnJs =
    dependsOnExternalScript ||
    dependsOnInlineScript ||
    temHandlerInline ||
    (temToggle && !/<details[\s>]/i.test(html)) ||
    hasWebGL ||
    hasLottie;
  const hasPortal = /role\s*=\s*["']?dialog|aria-modal|data-(modal|portal|tooltip|popover)/i.test(
    html,
  );

  return {
    hasCanvas,
    hasWebGL,
    hasVideo,
    hasIframe,
    hasLottie,
    hasAnimatedSvg,
    hasCssAnimation,
    dependsOnExternalScript,
    dependsOnJs,
    hasPortal,
  };
};

/** Escolhe o modo de renderização primário a partir dos sinais. */
export const pickRenderMode = (caps: Required<ComponentCapabilities>): RenderMode => {
  const fortes = [
    caps.hasWebGL && 'webgl',
    // WebGL já é um canvas; não contar as duas coisas (senão viraria "misto").
    caps.hasCanvas && !caps.hasWebGL && 'canvas',
    caps.hasVideo && 'video',
    caps.hasIframe && 'iframe',
    caps.hasLottie && 'lottie',
    caps.hasAnimatedSvg && 'svg-animado',
  ].filter((x): x is RenderMode => x !== false);

  if (fortes.length > 1) return 'misto';
  if (fortes.length === 1) return fortes[0] as RenderMode;
  return caps.dependsOnJs ? 'html-js' : 'html';
};

/** Interações inferidas do HTML estático, cada uma com seu nível de suporte. */
export const inferInteractions = (
  html: string,
  caps: Required<ComponentCapabilities>,
  opts: AssessOptions = {},
): InteractionInfo[] => {
  const nivelJs: SupportLevel = opts.hasCapturedStates === true ? 'completo' : 'parcial';
  // Hover/focus vistos no HTML são só a DECLARAÇÃO — o efeito mora no CSS. Sem
  // o CSS embutido, dizer `completo` seria o falso-positivo clássico do selo.
  const nivelCss: SupportLevel = opts.cssEmbutido === true ? 'completo' : 'parcial';
  const out: InteractionInfo[] = [];
  const push = (kind: InteractionKind, support: SupportLevel, description: string): void => {
    out.push({ kind, support, description });
  };

  if (/hover:|group-hover:|:hover/i.test(html))
    push(
      'hover',
      nivelCss,
      nivelCss === 'completo' ? 'Hover via CSS.' : 'Hover declarado no HTML; CSS não embutido.',
    );
  if (/focus:|focus-visible:|:focus/i.test(html))
    push(
      'focus',
      nivelCss,
      nivelCss === 'completo' ? 'Foco via CSS.' : 'Foco declarado no HTML; CSS não embutido.',
    );
  if (/aria-expanded|data-(toggle|accordion|dropdown)/i.test(html))
    push('toggle', nivelJs, 'Abre/fecha — depende de JS.');
  if (/role\s*=\s*["']?tab|data-tab/i.test(html))
    push('tab', nivelJs, 'Troca de aba — depende de JS.');
  if (caps.hasPortal) push('modal', nivelJs, 'Abre overlay/portal — depende de JS.');
  if (/tooltip/i.test(html)) push('tooltip', nivelJs, 'Tooltip — pode depender de JS.');
  if (/carousel|slider|swiper/i.test(html)) push('carousel', nivelJs, 'Carrossel — depende de JS.');
  if (/data-(scroll|reveal|aos)|animate-on-scroll/i.test(html))
    push('viewport', nivelJs, 'Dispara ao entrar na viewport.');

  return out;
};

/** Junta os avisos em PT-BR a partir dos sinais e do que foi (ou não) capturado. */
const buildWarnings = (caps: Required<ComponentCapabilities>, opts: AssessOptions): string[] => {
  const w: string[] = [];
  if (caps.hasWebGL)
    w.push(
      'Usa WebGL/shaders: o preview mostra o visual, mas o runtime 3D não é reproduzido isoladamente.',
    );
  else if (caps.hasCanvas)
    w.push('Desenha em <canvas> por JavaScript: reproduzido como visual, sem o runtime.');
  if (caps.hasLottie) w.push('Animação Lottie: precisa do player Lottie e do JSON da animação.');
  if (caps.hasIframe)
    w.push('Embute um <iframe>: o conteúdo vem de outra origem e pode não carregar isolado.');
  if (caps.dependsOnExternalScript)
    w.push(
      'Depende de <script> externo não embutido — o comportamento pode não rodar fora da origem.',
    );
  if (caps.dependsOnJs && !opts.hasCapturedStates && !caps.hasWebGL && !caps.hasCanvas)
    w.push(
      'O comportamento depende de JavaScript; sem captura de estados, só o estado inicial é garantido.',
    );
  if (!opts.bundledAssets) w.push(AVISO_ASSETS_NA_ORIGEM);
  return w;
};

/**
 * Nota de fidelidade estimada (0–100), coerente com o nível de suporte. Serve só
 * para ordenar e comunicar confiança — não é medida exata.
 */
const scoreFor = (support: SupportLevel): number => {
  switch (support) {
    case 'completo':
      return 95;
    case 'parcial':
      return 70;
    case 'visual':
      return 50;
    case 'externo':
      return 35;
    case 'nao-suportado':
      return 10;
  }
};

/** A função principal: HTML (+CSS) → avaliação de fidelidade. */
export const assessFidelity = (
  html: string,
  css = '',
  opts: AssessOptions = {},
): FidelityAssessment => {
  const caps = detectCapabilities(html, css);
  const renderMode = pickRenderMode(caps);

  let support: SupportLevel;
  if (caps.hasWebGL || caps.hasCanvas)
    support = caps.dependsOnExternalScript ? 'externo' : 'visual';
  else if (caps.hasLottie) support = opts.bundledAssets ? 'visual' : 'externo';
  else if (caps.hasIframe) support = 'externo';
  else if (caps.dependsOnExternalScript) support = 'externo';
  else if (caps.dependsOnJs) support = opts.hasCapturedStates ? 'completo' : 'parcial';
  else support = 'completo';

  // O chamador que sabe o que embutiu manda; sem o sinal, a prova é o próprio
  // `css` recebido definir os estados que o HTML declara.
  const cssEmbutido = opts.cssEmbutido ?? /:hover|:focus/i.test(css);
  const interactions = inferInteractions(html, caps, { ...opts, cssEmbutido });

  // Honestidade: se o componente tem uma interação que NÃO está garantida — um
  // toggle sem estados capturados, um hover cujo CSS não veio junto —, ele não
  // é "completo" mesmo que o HTML estático não tenha disparado `dependsOnJs`.
  // Rebaixa para parcial.
  if (support === 'completo' && interactions.some((i) => i.support === 'parcial')) {
    support = 'parcial';
  }

  const warnings = buildWarnings(caps, opts);

  return {
    support,
    renderMode,
    fidelity: scoreFor(support),
    warnings,
    capabilities: caps,
    interactions,
  };
};
