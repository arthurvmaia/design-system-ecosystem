import type { InteractionKind } from '@ds/shared';
import type { ElementDescriptor } from './descriptor.js';
import { ehSeguroClicar } from './safety.js';

/**
 * Mapa de interações — funções puras que decidem, a partir do descritor de um
 * elemento, se ele merece exploração e quais sondagens são seguras.
 *
 * Separado da orquestração no navegador de propósito: aqui está o julgamento
 * (testável), lá está a mecânica de mover o mouse e ler o DOM.
 */

/** Papéis ARIA que anunciam interatividade. */
const ROLES_INTERATIVOS = new Set([
  'button',
  'link',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'switch',
  'checkbox',
  'radio',
  'combobox',
  'slider',
  'option',
  'treeitem',
  'disclosure',
]);

/** Tags naturalmente interativas. */
const TAGS_INTERATIVAS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
  'label',
  'video',
  'audio',
]);

/** Tipos de listener que indicam comportamento além do CSS. */
const LISTENERS_RELEVANTES = new Set([
  'click',
  'mousedown',
  'mouseup',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'pointerdown',
  'pointerup',
  'pointerenter',
  'pointerleave',
  'touchstart',
  'keydown',
  'keyup',
  'focus',
  'blur',
]);

/**
 * Este elemento vale uma sondagem? Junta os sinais: tag, papel, foco, cursor,
 * atributos ARIA de estado e listeners de verdade. Um `<div>` com
 * `cursor:pointer` e um listener de click é tão interativo quanto um `<button>`.
 */
export const ehCandidatoInterativo = (d: ElementDescriptor): boolean => {
  if (TAGS_INTERATIVAS.has(d.tag)) return true;
  if (d.role !== null && ROLES_INTERATIVOS.has(d.role)) return true;
  if (d.tabindex !== null && d.tabindex >= 0) return true;
  if (d.ariaExpanded !== null || d.ariaHaspopup !== null) return true;
  if (d.cursor === 'pointer' && (d.text.length > 0 || d.classes.length > 0)) return true;
  if (d.hasListeners && d.listenerTypes.some((t) => LISTENERS_RELEVANTES.has(t))) return true;
  // Convenções comuns de bibliotecas (Alpine, data-toggle, tabs).
  const chaves = Object.keys(d.dataAttrs);
  if (
    chaves.some((k) =>
      /toggle|tab|accordion|modal|dropdown|menu|carousel|slide|state|open/i.test(k),
    )
  ) {
    return true;
  }
  return false;
};

export type Probe = { kind: InteractionKind; motivo: string };

/**
 * As sondagens seguras para este elemento, na ordem em que devem rodar
 * (hover → focus → click). Hover e focus nunca têm efeito colateral; o click só
 * entra se as guardas de segurança aprovarem.
 */
export const probesPara = (d: ElementDescriptor, baseUrl: string): Probe[] => {
  const probes: Probe[] = [];

  // Hover: sempre seguro. Revela tooltip, submenu, estado :hover que o CSS não
  // alcança via classe (ex: background-position, filhos que aparecem).
  probes.push({ kind: 'hover', motivo: 'hover é sempre reversível' });

  // Focus: seguro, e é o único jeito de ver focus-visible e dropdowns de teclado.
  const focavel =
    d.tag === 'a' ||
    d.tag === 'button' ||
    d.tag === 'input' ||
    d.tag === 'select' ||
    d.tag === 'textarea' ||
    (d.tabindex !== null && d.tabindex >= 0);
  if (focavel) probes.push({ kind: 'focus', motivo: 'foco revela focus-visible' });

  // Click: só quando é seguro. Aqui mora a maior parte do valor (accordion, tabs,
  // dropdown, modal) e todo o risco (submit, compra, logout).
  const veredito = ehSeguroClicar(d, baseUrl);
  if (veredito.safe) {
    probes.push({ kind: 'click', motivo: 'clique seguro' });
  }

  return probes;
};

/**
 * Rótulos de interação inferidos do descritor, para descrever o componente sem
 * precisar clicar. É o que alimenta a lista de "interações conhecidas" mesmo
 * quando a captura por navegador não roda.
 */
export const inferirInteracoes = (d: ElementDescriptor): InteractionKind[] => {
  const kinds = new Set<InteractionKind>();

  if (d.ariaExpanded !== null) kinds.add('toggle');
  if (d.role === 'tab' || /(^|-)tab(-|$)/i.test(d.classes.join(' '))) kinds.add('tab');
  if (d.ariaHaspopup === 'dialog' || d.role === 'dialog') kinds.add('modal');
  if (d.ariaHaspopup === 'menu' || d.role === 'menu' || d.role === 'menuitem') kinds.add('toggle');
  if (/tooltip/i.test([d.role ?? '', ...d.classes, ...Object.keys(d.dataAttrs)].join(' '))) {
    kinds.add('tooltip');
  }
  if (/carousel|slider|swiper|slide/i.test(d.classes.join(' '))) kinds.add('carousel');

  for (const t of d.listenerTypes) {
    if (t === 'click') kinds.add('click');
    else if (t.startsWith('mouseenter') || t.startsWith('mouseover')) kinds.add('hover');
    else if (t.startsWith('pointer')) kinds.add('pointer');
    else if (t === 'scroll') kinds.add('scroll');
    else if (t.startsWith('key')) kinds.add('keyboard');
    else if (t.startsWith('drag') || t === 'mousedown') kinds.add('drag');
    else if (t === 'focus' || t === 'blur') kinds.add('focus');
  }

  return [...kinds];
};
