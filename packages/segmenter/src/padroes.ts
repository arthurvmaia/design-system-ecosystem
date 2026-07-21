import type { ComponentCategory, ComponentKind } from '@ds/shared';
import type { HTMLElement } from 'node-html-parser';

/**
 * Segundo passe da segmentação: os sistemas reaproveitáveis.
 *
 * O primeiro passe fatia a página em seções — hero, pricing, rodapé. Serve para
 * quem quer a seção inteira, mas não responde à pergunta que mais aparece na
 * prática: *gostei da tipografia deste site*, *gostei do jeito que os botões
 * dele são*, *gostei do card com borda de vidro*.
 *
 * Essas coisas não moram num nó do DOM. A família de botões está espalhada por
 * dez seções diferentes; o conjunto tipográfico também. Este módulo varre o
 * documento inteiro, junta o que se repete e devolve UM item por sistema — que
 * é a unidade que faz sentido curtir e levar para a Biblioteca.
 *
 * A ideia veio do Banco de Referências: lá as pastas são `glass-effect`,
 * `animation-clean`, `sidebar` — recortes por intenção visual, não por posição
 * na página.
 */

export type Padrao = {
  name: string;
  category: ComponentCategory;
  kind: ComponentKind;
  htmlSnippet: string;
};

/**
 * Duas ocorrências não fazem um sistema — fazem coincidência. A partir de três
 * o padrão é intencional, e é isso que vale a pena guardar.
 */
const MINIMO_PARA_SER_FAMILIA = 3;

/** Quantas variações mostrar. Passando disso a amostra vira a página de novo. */
const MAX_VARIACOES = 6;

/**
 * Assinatura visual de um elemento: as classes que descrevem aparência, sem as
 * que descrevem posição.
 *
 * Dois botões iguais em estilo mas em cantos opostos da página têm classes de
 * margem diferentes. Sem descartar essas, cada botão vira uma "variação" e a
 * família cresce até virar lixo.
 */
const CLASSE_DE_POSICAO =
  /^(m[trblxy]?-|p[trblxy]?-|w-|h-|min-|max-|top-|left-|right-|bottom-|inset-|z-|order-|col-|row-|absolute|relative|fixed|sticky|float-|clear-|translate|gap-|space-)/;

const assinatura = (node: HTMLElement): string => {
  const classe = node.getAttribute('class') ?? '';
  return classe
    .split(/\s+/)
    .filter((c) => c.length > 0 && !CLASSE_DE_POSICAO.test(c))
    .sort()
    .join(' ');
};

/** Agrupa por assinatura, preservando a ordem de aparição. */
const porAssinatura = (nodes: HTMLElement[]): Map<string, HTMLElement[]> => {
  const mapa = new Map<string, HTMLElement[]>();
  for (const n of nodes) {
    const chave = assinatura(n);
    if (chave === '') continue;
    const atual = mapa.get(chave);
    if (atual) atual.push(n);
    else mapa.set(chave, [n]);
  }
  return mapa;
};

const embrulhar = (partes: string[], legenda: string): string =>
  `<div data-ds-amostra="${legenda}" class="flex flex-col gap-6 p-8">\n${partes.join('\n')}\n</div>`;

// ── Tipografia ──────────────────────────────────────────────────────────────

/**
 * A escala tipográfica: um exemplar de cada nível de título, mais o corpo.
 *
 * Pega o primeiro de cada `h1..h6` e o parágrafo mais comprido — o mais
 * comprido porque parágrafo curto costuma ser legenda ou rótulo, e não mostra
 * a entrelinha, que é metade do que se quer ver num conjunto tipográfico.
 */
export const extrairTipografia = (body: HTMLElement): Padrao | null => {
  const partes: string[] = [];

  for (const tag of ['h1', 'h2', 'h3', 'h4']) {
    const el = body.querySelector(tag);
    if (el && el.textContent.trim().length > 0) partes.push(el.outerHTML);
  }

  const paragrafos = body
    .querySelectorAll('p')
    .filter((p) => p.textContent.trim().length > 40)
    .sort((a, b) => b.textContent.length - a.textContent.length);
  const corpo = paragrafos[0];
  if (corpo) partes.push(corpo.outerHTML);

  // Um título sozinho não é uma escala.
  if (partes.length < 3) return null;

  return {
    name: 'Conjunto tipográfico',
    category: 'typography',
    kind: 'component',
    htmlSnippet: embrulhar(partes, 'tipografia'),
  };
};

// ── Botões ──────────────────────────────────────────────────────────────────

/** Âncora que se veste de botão: tem fundo ou borda e cantos tratados. */
const PARECE_BOTAO = /\b(bg-|border|rounded|btn|button)/;

export const extrairBotoes = (body: HTMLElement): Padrao | null => {
  const candidatos = [
    ...body.querySelectorAll('button'),
    ...body.querySelectorAll('a').filter((a) => PARECE_BOTAO.test(a.getAttribute('class') ?? '')),
  ].filter((el) => el.textContent.trim().length > 0);

  if (candidatos.length < MINIMO_PARA_SER_FAMILIA) return null;

  // Um exemplar de cada estilo distinto, do mais usado para o menos usado: a
  // variação que aparece dez vezes é o botão principal do site.
  const variacoes = [...porAssinatura(candidatos).values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_VARIACOES)
    .map((grupo) => grupo[0]?.outerHTML ?? '');

  if (variacoes.length < 2) return null;

  return {
    name: `Família de botões (${variacoes.length} estilos)`,
    category: 'button',
    kind: 'component',
    htmlSnippet: embrulhar(variacoes, 'botoes'),
  };
};

// ── Cards ───────────────────────────────────────────────────────────────────

/** Superfície: algo com canto, borda ou sombra que carrega conteúdo dentro. */
const PARECE_CARD = /\b(rounded|border|shadow|backdrop-blur|glass|card)/;

export const extrairCards = (body: HTMLElement): Padrao | null => {
  const candidatos = body
    .querySelectorAll('div, article, li')
    .filter((el) => PARECE_CARD.test(el.getAttribute('class') ?? ''))
    .filter((el) => {
      const t = el.textContent.trim().length;
      // Faixa útil: com menos que isso é um chip, com mais é a seção inteira.
      return t > 40 && t < 1200 && el.outerHTML.length < 4000;
    });

  if (candidatos.length < MINIMO_PARA_SER_FAMILIA) return null;

  // Só interessa o que se repete: card é, por definição, o molde de uma grade.
  // Uma superfície única é decoração daquela seção, não um sistema.
  const familias = [...porAssinatura(candidatos).values()]
    .filter((grupo) => grupo.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  if (familias.length === 0) return null;

  const amostras = familias.map((grupo) => grupo[0]?.outerHTML ?? '');

  return {
    name: `Estilo de card (${familias.length} ${familias.length === 1 ? 'variação' : 'variações'})`,
    category: 'card',
    kind: 'component',
    htmlSnippet: embrulhar(amostras, 'cards'),
  };
};

// ── Interações ──────────────────────────────────────────────────────────────

/**
 * Hover, transição, animação, cursor — o que a página faz quando alguém mexe
 * nela. É a categoria que mais interessa e a que menos aparece numa fatia
 * estática do DOM, porque o comportamento mora nas classes e no CSS.
 */
const CLASSE_DE_INTERACAO =
  /(^|\s)(hover:|group-hover:|focus:|active:|peer-|transition|duration-|delay-|ease-|animate-|cursor-|will-change|motion-safe:|scroll-)/;

export const extrairInteracoes = (body: HTMLElement, css: string): Padrao | null => {
  const comInteracao = body
    .querySelectorAll('*')
    .filter((el) => CLASSE_DE_INTERACAO.test(el.getAttribute('class') ?? ''))
    .filter((el) => el.textContent.trim().length > 0 && el.outerHTML.length < 2500);

  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] ?? '');

  if (comInteracao.length < MINIMO_PARA_SER_FAMILIA && keyframes.length === 0) return null;

  const amostras = [...porAssinatura(comInteracao).values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_VARIACOES)
    .map((grupo) => grupo[0]?.outerHTML ?? '');

  // As animações declaradas em CSS não têm um elemento para mostrar, mas saber
  // que existem — e com que nome — é metade do valor de uma referência.
  const lista =
    keyframes.length > 0
      ? `<p data-ds-keyframes>@keyframes: ${[...new Set(keyframes)].slice(0, 12).join(', ')}</p>`
      : '';

  if (amostras.length === 0 && lista === '') return null;

  return {
    name: 'Animações e microinterações',
    category: 'interaction',
    kind: 'animation',
    htmlSnippet: embrulhar(
      [...amostras, lista].filter((s) => s !== ''),
      'interacoes',
    ),
  };
};

// ── Orquestração ────────────────────────────────────────────────────────────

export const extrairPadroes = (body: HTMLElement, css: string): Padrao[] =>
  [
    extrairTipografia(body),
    extrairBotoes(body),
    extrairCards(body),
    extrairInteracoes(body, css),
  ].filter((p): p is Padrao => p !== null);
