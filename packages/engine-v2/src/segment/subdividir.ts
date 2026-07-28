import { PARECE_BOTAO, PARECE_CARD, assinatura, embrulhar, porAssinatura } from '@ds/segmenter';
import type { ComponentCategory, ComponentKind } from '@ds/shared';
import { HTMLElement, parse } from 'node-html-parser';

/**
 * Subdivisão fina de uma seção APROVADA: os filhos vinculados.
 *
 * A segmentação por evidência corta a página em seções — hero, pricing, rodapé.
 * Só que a pergunta mais comum da triagem é menor que isso: *quero só este
 * botão*, *só o card de preço*, *só o selo de "mais popular"*. Este passe
 * responde a ela: parseia o `htmlSnippet` de uma seção que JÁ passou no
 * veredito e extrai as peças reutilizáveis de dentro — botão, card, badge,
 * campo, item de acordeão, item de navegação — uma por estilo, com contagem.
 *
 * Os filhos não têm bundle de compilador na v1: viram `SegmentRecord` com
 * `parentId` (ver `persist.ts`) e o preview deles usa o caminho clássico. As
 * primitivas de agrupamento (`assinatura`, `porAssinatura`, `embrulhar`) vêm de
 * `@ds/segmenter`, para este passe e o passe global de `padroes.ts` concordarem
 * sobre o que é "o mesmo estilo".
 */

export type FilhoDeSecao = {
  category: ComponentCategory;
  kind: ComponentKind;
  name: string;
  htmlSnippet: string;
};

/** O que a subdivisão precisa saber da seção. */
export type SecaoParaSubdividir = {
  category: ComponentCategory;
  htmlSnippet: string;
};

/**
 * Teto de filhos por seção. Acima disso a Galeria vira poluição — e como as
 * famílias saem do estilo mais usado para o menos usado, o corte descarta
 * exatamente as variações raras.
 */
const MAX_FILHOS = 8;

/**
 * Filho que carrega esta fração do HTML da seção não é uma peça DE DENTRO dela
 * — é a seção de novo, com outro nome. Mesmo espírito da `FATIA_DE_EMBRULHO`
 * do segmenter V1.
 */
const FATIA_MAXIMA = 0.6;

/** Faixa útil de um card: com menos que isso é um chip, com mais é a seção. */
const CARD_TEXTO_MIN = 40;
const CARD_TEXTO_MAX = 1200;
const CARD_HTML_MAX = 4000;

/** Vocabulário de selo/badge, mais o formato de pílula do Tailwind. */
const PARECE_BADGE = /\b(badge|pill|chip|tag|label)\b|rounded-full/;

/** Selo é curto por definição: passou disso, é um parágrafo com fundo. */
const BADGE_TEXTO_MAX = 32;

/** Seções cujos `li > a` são itens de navegação de verdade. */
const SECOES_DE_NAV: ReadonlySet<ComponentCategory> = new Set(['nav', 'header', 'footer']);

/** Um candidato a filho antes dos filtros finais de substância e tamanho. */
type FilhoBruto = {
  category: ComponentCategory;
  name: string;
  /** Legenda do embrulho `[data-ds-amostra]`, que o preview já estiliza. */
  legenda: string;
  exemplar: HTMLElement;
};

const textoDe = (el: HTMLElement): string => el.textContent.replace(/\s+/g, ' ').trim();

/** "Botão primário (×4)": o nome diz quantas vezes o estilo aparece na seção. */
const nomeComContagem = (base: string, quantos: number): string =>
  quantos >= 2 ? `${base} (×${quantos})` : base;

/** Famílias por assinatura, do estilo mais usado para o menos usado. */
const familias = (els: HTMLElement[]): HTMLElement[][] =>
  [...porAssinatura(els).values()].sort((a, b) => b.length - a.length);

/**
 * Agrupamento com chave de reserva: campo e item de acordeão muitas vezes vêm
 * num wrapper SEM classe, e a assinatura vazia os faria sumir do `porAssinatura`.
 * A reserva agrupa pelo formato — seis `<details>` pelados viram um exemplar
 * com contagem, em vez de nada.
 */
const familiasComReserva = (
  els: HTMLElement[],
  reservaDe: (el: HTMLElement) => string,
): HTMLElement[][] => {
  const mapa = new Map<string, HTMLElement[]>();
  for (const el of els) {
    const chave = assinatura(el) || reservaDe(el);
    const atual = mapa.get(chave);
    if (atual) atual.push(el);
    else mapa.set(chave, [el]);
  }
  return [...mapa.values()].sort((a, b) => b.length - a.length);
};

// ── Botões ──────────────────────────────────────────────────────────────────

const extrairBotoes = (root: HTMLElement): FilhoBruto[] =>
  familias(
    [
      ...root.querySelectorAll('button'),
      ...root.querySelectorAll('a').filter((a) => PARECE_BOTAO.test(a.getAttribute('class') ?? '')),
    ].filter((el) => textoDe(el).length > 0),
  ).flatMap((grupo, i) => {
    const exemplar = grupo[0];
    if (exemplar === undefined) return [];
    // O estilo mais usado é o botão principal do site — o nome assume isso.
    const base = i === 0 ? 'Botão primário' : i === 1 ? 'Botão secundário' : `Botão ${i + 1}`;
    return [
      {
        category: 'button' as const,
        name: nomeComContagem(base, grupo.length),
        legenda: 'botao',
        exemplar,
      },
    ];
  });

// ── Cards ───────────────────────────────────────────────────────────────────

/**
 * Quantos irmãos (o elemento incluso) compartilham a assinatura do elemento.
 * É o sinal do `contarRepetidos` de `segment-v2.ts` — irmãos com a mesma lista
 * de classes são a assinatura de um grid — agora apontando o exemplar de fato.
 */
const irmaosDoMesmoEstilo = (el: HTMLElement): number => {
  const chave = assinatura(el);
  if (chave === '') return 0;
  const pai = el.parentNode;
  if (!(pai instanceof HTMLElement)) return 0;
  return pai.childNodes.filter((n) => n instanceof HTMLElement && assinatura(n) === chave).length;
};

const extrairCards = (root: HTMLElement): FilhoBruto[] =>
  familias(
    root.querySelectorAll('div, article, li').filter((el) => {
      if (!PARECE_CARD.test(el.getAttribute('class') ?? '')) return false;
      const t = textoDe(el).length;
      if (t < CARD_TEXTO_MIN || t > CARD_TEXTO_MAX) return false;
      if (el.outerHTML.length >= CARD_HTML_MAX) return false;
      // Card é, por definição, o molde de uma grade: sem repetição entre os
      // irmãos, a superfície é decoração daquela seção, não uma peça.
      return irmaosDoMesmoEstilo(el) >= 2;
    }),
  ).flatMap((grupo, i) => {
    const exemplar = grupo[0];
    if (exemplar === undefined) return [];
    return [
      {
        category: 'card' as const,
        name: nomeComContagem(i === 0 ? 'Card' : `Card ${i + 1}`, grupo.length),
        legenda: 'card',
        exemplar,
      },
    ];
  });

// ── Badges ──────────────────────────────────────────────────────────────────

const extrairBadges = (root: HTMLElement): FilhoBruto[] =>
  familias(
    root.querySelectorAll('span, small, div').filter((el) => {
      if (!PARECE_BADGE.test(el.getAttribute('class') ?? '')) return false;
      const t = textoDe(el);
      return t.length > 0 && t.length <= BADGE_TEXTO_MAX;
    }),
  ).flatMap((grupo, i) => {
    const exemplar = grupo[0];
    if (exemplar === undefined) return [];
    return [
      {
        category: 'badge' as const,
        name: nomeComContagem(i === 0 ? 'Selo' : `Selo ${i + 1}`, grupo.length),
        legenda: 'selo',
        exemplar,
      },
    ];
  });

// ── Campos ──────────────────────────────────────────────────────────────────

/**
 * O controle sozinho é meia peça: o rótulo mora no wrapper. Sobe até o menor
 * ancestral que contém um `<label>` e SÓ este controle — o item de formulário —
 * e fica no próprio controle quando não há.
 *
 * O ancestral vale tanto com o `<label>` dentro dele (`<div><label></label>
 * <input></div>`) quanto quando ele PRÓPRIO é o label (`<label>Nome <input>
 * </label>`, igualmente comum): o `querySelector` só enxerga descendentes, e
 * sem a segunda checagem o segundo padrão subia até o form, batia no corte de
 * "mais de um controle" e devolvia o input pelado — sem rótulo nenhum.
 */
const ehLabel = (el: HTMLElement): boolean => el.tagName.toLowerCase() === 'label';

const subirAoWrapperComLabel = (controle: HTMLElement): HTMLElement => {
  let atual: HTMLElement = controle;
  for (let nivel = 0; nivel < 3; nivel++) {
    const pai = atual.parentNode;
    if (!(pai instanceof HTMLElement)) break;
    // Mais de um controle dentro: já é o formulário, não o campo.
    if (pai.querySelectorAll('input, textarea, select').length > 1) break;
    if (ehLabel(pai) || pai.querySelector('label') !== null) return pai;
    atual = pai;
  }
  return controle;
};

const extrairCampos = (root: HTMLElement): FilhoBruto[] => {
  const controles = [
    ...root.querySelectorAll('input').filter((el) => (el.getAttribute('type') ?? '') !== 'hidden'),
    ...root.querySelectorAll('textarea'),
    ...root.querySelectorAll('select'),
  ];
  return familiasComReserva(controles.map(subirAoWrapperComLabel), (el) =>
    el.tagName.toLowerCase(),
  ).flatMap((grupo, i) => {
    const exemplar = grupo[0];
    if (exemplar === undefined) return [];
    return [
      {
        category: 'input' as const,
        name: nomeComContagem(i === 0 ? 'Campo' : `Campo ${i + 1}`, grupo.length),
        legenda: 'campo',
        exemplar,
      },
    ];
  });
};

// ── Acordeão / FAQ ──────────────────────────────────────────────────────────

/**
 * O gatilho `[aria-expanded]` sozinho é só o cabeçalho: o item completo inclui
 * o painel que ele controla. Sobe até o menor ancestral que contém o alvo do
 * `aria-controls`; sem alvo por perto, fica no gatilho.
 */
const subirAoItemDoGatilho = (gatilho: HTMLElement): HTMLElement => {
  const alvo = gatilho.getAttribute('aria-controls') ?? '';
  let atual = gatilho.parentNode;
  for (let nivel = 0; nivel < 3 && atual instanceof HTMLElement; nivel++) {
    if (atual.outerHTML.includes(`id="${alvo}"`)) return atual;
    atual = atual.parentNode;
  }
  return gatilho;
};

const dentroDeDetails = (el: HTMLElement): boolean => {
  let p = el.parentNode;
  while (p instanceof HTMLElement) {
    if (p.tagName.toLowerCase() === 'details') return true;
    p = p.parentNode;
  }
  return false;
};

const extrairAccordions = (root: HTMLElement): FilhoBruto[] => {
  const todos = root.querySelectorAll('*');
  const candidatos = [
    ...root.querySelectorAll('details'),
    ...todos.filter((el) => el.getAttribute('data-accordion') !== undefined),
    ...todos
      .filter(
        (el) =>
          el.getAttribute('aria-expanded') !== undefined &&
          (el.getAttribute('aria-controls') ?? '').length > 0,
      )
      .map(subirAoItemDoGatilho),
    // `<summary>` órfão (fora de um `<details>`): sinal fraco, mas é sinal.
    ...root.querySelectorAll('summary').filter((el) => !dentroDeDetails(el)),
  ];
  return familiasComReserva([...new Set(candidatos)], (el) => el.tagName.toLowerCase()).flatMap(
    (grupo, i) => {
      const exemplar = grupo[0];
      if (exemplar === undefined) return [];
      return [
        {
          category: 'accordion' as const,
          name: nomeComContagem(
            i === 0 ? 'Item de acordeão' : `Item de acordeão ${i + 1}`,
            grupo.length,
          ),
          legenda: 'acordeao',
          exemplar,
        },
      ];
    },
  );
};

// ── Itens de navegação ──────────────────────────────────────────────────────

const extrairItensDeNav = (root: HTMLElement): FilhoBruto[] =>
  familiasComReserva(
    root
      .querySelectorAll('li')
      .filter((li) =>
        li.childNodes.some((n) => n instanceof HTMLElement && n.tagName.toLowerCase() === 'a'),
      ),
    () => 'li>a',
  ).flatMap((grupo, i) => {
    const exemplar = grupo[0];
    if (exemplar === undefined) return [];
    return [
      {
        category: 'nav' as const,
        name: nomeComContagem(
          i === 0 ? 'Item de navegação' : `Item de navegação ${i + 1}`,
          grupo.length,
        ),
        legenda: 'navegacao',
        exemplar,
      },
    ];
  });

// ── Orquestração ────────────────────────────────────────────────────────────

const TAGS_DE_FUNCAO = ['a', 'button', 'input', 'textarea', 'select', 'details'];

/** Filho sem texto E sem função (controle, link ou gatilho) é decoração. */
const temFuncao = (el: HTMLElement): boolean => {
  if (TAGS_DE_FUNCAO.includes(el.tagName.toLowerCase())) return true;
  if (el.getAttribute('aria-expanded') !== undefined) return true;
  return el.querySelector(TAGS_DE_FUNCAO.join(',')) !== null;
};

/**
 * Extrai os filhos de uma seção aprovada. Um exemplar por estilo (dedup por
 * `assinatura`, com a contagem no nome), teto de {@link MAX_FILHOS}, e dois
 * descartes de substância: filho que é quase a seção inteira e filho sem texto
 * nem função. O exemplar sai embrulhado em `[data-ds-amostra]` — o mesmo
 * embrulho dos sistemas globais, que o preview já estiliza.
 */
export const subdividirSecao = (secao: SecaoParaSubdividir): FilhoDeSecao[] => {
  const root = parse(secao.htmlSnippet);
  const tamanhoDaSecao = secao.htmlSnippet.length;

  const brutos: FilhoBruto[] = [
    ...extrairBotoes(root),
    ...extrairCards(root),
    ...extrairBadges(root),
    ...extrairCampos(root),
    ...extrairAccordions(root),
    ...(SECOES_DE_NAV.has(secao.category) ? extrairItensDeNav(root) : []),
  ];

  const filhos: FilhoDeSecao[] = [];
  for (const bruto of brutos) {
    if (filhos.length >= MAX_FILHOS) break;
    const html = bruto.exemplar.outerHTML.trim();
    // Quase a seção inteira: é a seção de novo, não uma peça de dentro dela.
    if (html.length >= tamanhoDaSecao * FATIA_MAXIMA) continue;
    if (textoDe(bruto.exemplar).length === 0 && !temFuncao(bruto.exemplar)) continue;
    filhos.push({
      category: bruto.category,
      kind: 'component',
      name: bruto.name,
      htmlSnippet: embrulhar([html], bruto.legenda),
    });
  }
  return filhos;
};
