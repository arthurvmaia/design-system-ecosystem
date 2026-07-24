import { z } from 'zod';
import { ElementMatch } from './capture.js';
import { Confidence } from './interaction-support.js';

/**
 * Representação PORTÁTIL de comportamento controlado por scroll.
 *
 * O que a captura descobre rolando a página vira uma estrutura MEDIDA e
 * reproduzível — não um monte de screenshots soltos. Cada comportamento diz o
 * alvo, o intervalo de scroll em que age, os keyframes (valores computados
 * amostrados ao longo do progresso), se é contínuo (scrub) ou discreto (reveal),
 * e — o que a regra do projeto exige — a confiança e as limitações. Runtimes que
 * não dá para medir com segurança (GSAP ScrollTrigger, Three/WebGL) são
 * REGISTRADOS como externos, nunca reproduzidos como se estivessem prontos.
 */

/** Sobe quando a forma muda (invalida cache/hashes que dependem dela). */
export const SCROLL_MODEL_VERSION = 1;

/**
 * As famílias de comportamento de scroll que a captura classifica. `unsupported`
 * e `external-scroll-runtime` são becos honestos: detectados, não reproduzidos.
 */
export const ScrollBehaviorKind = z.enum([
  'viewport-reveal', // aparece ao entrar na viewport (opacity/translate discreto)
  'viewport-hide', // some ao sair
  'class-toggle', // ganha/perde classe num limiar de scroll (IntersectionObserver)
  'sticky', // fica preso (position: sticky/fixed) num intervalo
  'parallax', // desloca em ritmo diferente do scroll
  'progress-transform', // transform vinculado ao progresso (scrub)
  'progress-opacity', // opacity vinculada ao progresso
  'progress-scale', // escala vinculada ao progresso
  'progress-blur', // blur (filter) vinculado ao progresso
  'section-theme', // muda tema/cor conforme a seção ativa
  'horizontal-scroll', // rolagem horizontal dentro de uma seção
  'media-progress', // vídeo/imagem controlado pelo progresso
  'external-scroll-runtime', // depende de runtime externo (GSAP/Three/Lenis) — não reproduzido
  'unsupported', // identificado, sem reprodução portátil segura
]);
export type ScrollBehaviorKind = z.infer<typeof ScrollBehaviorKind>;

/** O que dispara o comportamento. */
export const ScrollTrigger = z.enum([
  'viewport', // entrar/sair da viewport (discreto)
  'progress', // progresso contínuo (scrub)
  'sticky', // enquanto preso
]);
export type ScrollTrigger = z.infer<typeof ScrollTrigger>;

/** O container cujo scroll controla o efeito. */
export const ScrollContainer = z.enum(['window', 'section']);
export type ScrollContainer = z.infer<typeof ScrollContainer>;

/**
 * Um quadro amostrado: os valores computados relevantes num dado progresso de
 * scroll (0 = início do intervalo do efeito, 1 = fim).
 */
export const ScrollKeyframe = z.object({
  progress: z.number().min(0).max(1),
  /** Valores computados naquele ponto: opacity, transform, filter, top, etc. */
  properties: z.record(z.string(), z.string()),
});
export type ScrollKeyframe = z.infer<typeof ScrollKeyframe>;

/**
 * Um comportamento de scroll portátil, ligado a um alvo por assinatura estável
 * (id/classes — como `ElementMatch`), com o intervalo, os keyframes e a
 * confiança. Reproduzível no preview quando `scrub`/`viewport` e a família é
 * suportada; caso contrário, honestamente marcado.
 */
export const ScrollBehavior = z.object({
  id: z.string(),
  kind: ScrollBehaviorKind,
  trigger: ScrollTrigger,
  /** Religação ao segmento/elemento (id + classes distintivas). */
  target: ElementMatch,
  scrollContainer: ScrollContainer.default('window'),
  /** Progresso de scroll (0-1 da página ou da seção) onde o efeito começa. */
  start: z.number().min(0).max(1),
  /** Progresso onde termina. */
  end: z.number().min(0).max(1),
  /** Amostras dos valores ao longo do intervalo (>= 2 para um scrub). */
  keyframes: z.array(ScrollKeyframe).default([]),
  /** Easing aproximado a partir da curva amostrada. */
  easing: z.string().optional(),
  /** Vinculado ao progresso (parallax/scrub) x discreto (reveal por limiar). */
  scrub: z.boolean().default(false),
  /** Fica preso (sticky/pin) durante o intervalo. */
  pin: z.boolean().default(false),
  /** Para `class-toggle`: classes que entram/saem no limiar. */
  classesAdicionadas: z.array(z.string()).optional(),
  classesRemovidas: z.array(z.string()).optional(),
  confidence: Confidence,
  /** Runtime externo de que depende, quando `external-scroll-runtime`. */
  sourceRuntime: z.string().optional(),
  limitations: z.array(z.string()).default([]),
});
export type ScrollBehavior = z.infer<typeof ScrollBehavior>;
