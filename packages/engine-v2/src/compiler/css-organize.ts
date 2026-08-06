/**
 * Organização do CSS por responsabilidade — **sem alterar a cascata**.
 *
 * A regra do pedido é dura e correta: "Não una CSS de forma que altere a
 * prioridade". Isso torna a divisão em arquivos um problema real, não cosmético:
 * se duas regras de MESMA especificidade que tocam o mesmo elemento forem para
 * arquivos diferentes e a ordem de carregamento invertê-las, o resultado visual
 * muda — silenciosamente, e só em alguns elementos.
 *
 * A solução aqui é conservadora e verificável:
 *
 * 1. O CSS é fatiado em blocos de topo, **na ordem original**.
 * 2. Cada bloco é classificado numa responsabilidade.
 * 3. Antes de dividir, procura-se **inversão**: um par de blocos que trocaria de
 *    ordem relativa por causa da divisão E que pode disputar o mesmo elemento
 *    (mesmo seletor, com propriedade em comum).
 * 4. Havendo qualquer inversão, **não divide**: emite um `styles.css` único, com a
 *    ordem intacta, e registra por quê. Um arquivo a mais é barato; um estilo
 *    errado não é.
 *
 * Nada é minificado, nada é removido, nada é reordenado dentro de um arquivo.
 */

export type ResponsabilidadeCss =
  | 'tokens'
  | 'layout'
  | 'components'
  | 'animations'
  | 'interactions'
  | 'runtime';

/** Ordem de carregamento dos arquivos. É o que define a cascata resultante. */
export const ORDEM_CSS: readonly ResponsabilidadeCss[] = [
  'tokens',
  'layout',
  'components',
  'animations',
  'interactions',
  'runtime',
];

export const ARQUIVO_CSS: Record<ResponsabilidadeCss, string> = {
  tokens: 'assets/css/tokens.css',
  layout: 'assets/css/layout.css',
  components: 'assets/css/components.css',
  animations: 'assets/css/animations.css',
  interactions: 'assets/css/interactions.css',
  runtime: 'assets/css/runtime.css',
};

/** Um bloco de topo do CSS, na ordem em que aparece. */
export type BlocoCss = {
  /** Índice na ordem original. */
  ordem: number;
  /** Texto completo do bloco, inclusive chaves. */
  texto: string;
  /** Prelúdio: seletor, ou `@media (...)`, ou `@keyframes nome`. */
  prelude: string;
  /** At-rule sem chaves (`@import`, `@charset`) não tem corpo. */
  atRule: string | null;
  responsabilidade: ResponsabilidadeCss;
  /** Seletores individuais (vazio para at-rules). */
  seletores: string[];
  /** Propriedades declaradas no primeiro nível do corpo. */
  propriedades: string[];
};

/**
 * Fatia o CSS em blocos de topo.
 *
 * Escrito à mão em vez de com regex porque regex não conta chaves: `@media {
 * .a { } }` tem dois níveis, e um `}` dentro de string (`content: "}"`) ou de
 * comentário quebraria qualquer tentativa. O laço respeita string, comentário e
 * profundidade.
 */
export const fatiarCss = (
  css: string,
): Array<{ texto: string; prelude: string; corpo: string | null }> => {
  const out: Array<{ texto: string; prelude: string; corpo: string | null }> = [];
  let i = 0;
  let inicio = 0;
  let profundidade = 0;
  let preludeFim = -1;
  let emString: '"' | "'" | null = null;
  let emComentario = false;

  const empurrar = (fim: number, corpoDe: number, corpoAte: number): void => {
    const texto = css.slice(inicio, fim).trim();
    if (texto.length === 0) return;
    const prelude = (corpoDe >= 0 ? css.slice(inicio, corpoDe) : texto).trim();
    const corpo = corpoDe >= 0 ? css.slice(corpoDe + 1, corpoAte) : null;
    out.push({ texto, prelude, corpo });
  };

  while (i < css.length) {
    const c = css[i];
    const prox = css[i + 1];

    if (emComentario) {
      if (c === '*' && prox === '/') {
        emComentario = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (emString !== null) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === emString) emString = null;
      i++;
      continue;
    }
    if (c === '/' && prox === '*') {
      emComentario = true;
      i += 2;
      continue;
    }
    // Escape FORA de string: seletor arbitrário do Tailwind escapa aspas e
    // pontuação no nome da classe (`.bg-\[url\(\'data\:image…\'\)\]`). Sem
    // pular o par, o `\'` abria um estado de string fantasma, o `{` real era
    // engolido dentro dela e o `;` do `url()` verdadeiro virava "fim de
    // at-rule": o bloco era fatiado NO MEIO da string e recolado com `\n\n`,
    // produzindo um CSS que mata o parse do navegador dali em diante — medido
    // na prévia do kit: 129 KB de folha mortos depois da primeira ocorrência.
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      emString = c;
      i++;
      continue;
    }
    if (c === '{') {
      if (profundidade === 0) preludeFim = i;
      profundidade++;
      i++;
      continue;
    }
    if (c === '}') {
      profundidade--;
      if (profundidade === 0) {
        empurrar(i + 1, preludeFim, i);
        inicio = i + 1;
        preludeFim = -1;
      }
      i++;
      continue;
    }
    if (c === ';' && profundidade === 0) {
      // At-rule sem corpo: `@import`, `@charset`, `@namespace`.
      empurrar(i + 1, -1, -1);
      inicio = i + 1;
      i++;
      continue;
    }
    i++;
  }
  // Sobra sem `}` (CSS truncado): preserva como está, em vez de descartar.
  if (inicio < css.length && css.slice(inicio).trim().length > 0) {
    empurrar(css.length, preludeFim, css.length);
  }
  return out;
};

/** Propriedades do primeiro nível de um corpo de regra. */
const propriedadesDe = (corpo: string): string[] => {
  const out: string[] = [];
  let profundidade = 0;
  for (const parte of corpo.split(';')) {
    const abre = (parte.match(/\{/g) ?? []).length;
    const fecha = (parte.match(/\}/g) ?? []).length;
    if (profundidade === 0) {
      const m = /^\s*([-\w]+)\s*:/.exec(parte);
      if (m?.[1] !== undefined) out.push(m[1].toLowerCase());
    }
    profundidade += abre - fecha;
  }
  return out;
};

const PROP_LAYOUT = new Set([
  'display',
  'grid',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-column',
  'grid-row',
  'gap',
  'row-gap',
  'column-gap',
  'flex',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'place-items',
  'width',
  'height',
  'max-width',
  'min-height',
  'margin',
  'padding',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'container-type',
  'aspect-ratio',
]);

const PROP_ANIMACAO = new Set([
  'animation',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'transition',
  'transition-property',
  'transition-duration',
  'will-change',
]);

/**
 * Classifica um bloco. A ordem dos testes é a ordem da certeza: at-rule declara o
 * que é; pseudo-classe de estado declara interação; `@keyframes` declara animação.
 * Propriedade só decide quando nada mais decidiu.
 */
export const classificarBlocoCss = (
  prelude: string,
  corpo: string | null,
  propriedades: readonly string[],
): ResponsabilidadeCss => {
  const p = prelude.trim();

  // At-rules estruturais ficam em `tokens`, que carrega primeiro — `@import` e
  // `@charset` só valem no início do arquivo, e `@layer` define a ordem de tudo.
  if (/^@(charset|import|namespace|layer\b[^{]*$)/i.test(p)) return 'tokens';
  if (/^@font-face/i.test(p)) return 'tokens';
  if (/^@property/i.test(p)) return 'tokens';
  if (/^@keyframes|^@-webkit-keyframes/i.test(p)) return 'animations';
  if (/^@supports/i.test(p)) return 'components';
  if (/^@media|^@container/i.test(p)) {
    // Media query herda a natureza do que tem dentro. Sem inspecionar o corpo,
    // `layout` seria um palpite; então inspeciona.
    if (corpo !== null && /:hover|:focus|:active|\[aria-|\[data-state/i.test(corpo)) {
      return 'interactions';
    }
    if (corpo !== null && /animation|transition|@keyframes/i.test(corpo)) return 'animations';
    return 'layout';
  }
  if (/^@layer/i.test(p)) return 'tokens';

  // `:root` e seletor só com custom properties: tokens.
  if (/^:root\b|^html\b\s*$/.test(p) && propriedades.every((x) => x.startsWith('--'))) {
    return 'tokens';
  }
  if (propriedades.length > 0 && propriedades.every((x) => x.startsWith('--'))) return 'tokens';

  // Estado explícito: interação.
  if (
    /:hover|:focus|:focus-visible|:active|:checked|:target|\[aria-expanded|\[aria-selected|\[data-state|\.is-open|\.active\b/i.test(
      p,
    )
  ) {
    return 'interactions';
  }

  // Canvas/WebGL/Lottie: estilo de superfície de runtime.
  if (/\bcanvas\b|\[data-engine|lottie|\bwebgl\b/i.test(p)) return 'runtime';

  if (propriedades.some((x) => PROP_ANIMACAO.has(x))) return 'animations';

  // Seletor de elemento/estrutura com propriedade de layout: layout.
  const soEstrutural =
    /^(html|body|main|header|footer|nav|section|article|aside|\*|:where|:is)\b/i.test(p);
  if (soEstrutural) return 'layout';
  if (propriedades.some((x) => PROP_LAYOUT.has(x)) && propriedades.length <= 4) return 'layout';

  return 'components';
};

/** Seletores individuais de um prelúdio de regra. */
const seletoresDe = (prelude: string): string[] => {
  if (prelude.startsWith('@')) return [];
  return prelude
    .split(',')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
};

export type ResultadoCss = {
  /** Arquivos a escrever, na ordem de carregamento. */
  arquivos: Array<{ caminho: string; conteudo: string; responsabilidade: ResponsabilidadeCss }>;
  /** A divisão foi aplicada? Quando `false`, saiu um arquivo único. */
  dividido: boolean;
  /** Por que não dividiu, quando não dividiu. */
  motivo?: string;
  /** Inversões encontradas (auditoria). */
  inversoes: Array<{ a: string; b: string; propriedade: string }>;
  /** Contagem de blocos por responsabilidade. */
  contagem: Record<ResponsabilidadeCss, number>;
};

/**
 * Dois seletores podem disputar o mesmo elemento?
 *
 * Conservador de propósito: `true` na dúvida. Compara o **sujeito** do seletor —
 * a última parte composta, sem pseudo-classe nem pseudo-elemento.
 *
 * Tirar o pseudo é o ponto: `.x:hover` e `.x` casam no MESMO elemento e disputam
 * `color`, então a ordem entre eles decide o resultado. Comparando o texto cru,
 * eles pareceriam seletores diferentes e o conflito passaria batido — que é
 * justamente o conflito mais comum quando se separa "interações" de "componentes".
 */
const sujeitoDoSeletor = (seletor: string): string =>
  (
    seletor
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(/[\s>+~]/)
      .pop() ?? ''
  )
    // Pseudo-classe funcional primeiro (`:not(.a)`), senão o parêntese sobra.
    .replace(/::?[a-z-]+\([^)]*\)/g, '')
    .replace(/::?[a-z-]+/g, '');

export const podemColidir = (a: string, b: string): boolean => {
  const na = a.replace(/\s+/g, ' ').trim().toLowerCase();
  const nb = b.replace(/\s+/g, ' ').trim().toLowerCase();
  if (na === nb) return true;
  const chaveA = sujeitoDoSeletor(na);
  const chaveB = sujeitoDoSeletor(nb);
  return chaveA.length > 0 && chaveA === chaveB;
};

/**
 * Organiza o CSS. Divide quando é seguro; devolve um arquivo único quando não é,
 * dizendo o motivo.
 */
export const organizarCss = (css: string): ResultadoCss => {
  const brutos = fatiarCss(css);
  const blocos: BlocoCss[] = brutos.map((b, i) => {
    const propriedades = b.corpo === null ? [] : propriedadesDe(b.corpo);
    return {
      ordem: i,
      texto: b.texto,
      prelude: b.prelude,
      atRule: b.prelude.startsWith('@') ? (b.prelude.split(/[\s({]/)[0] ?? null) : null,
      responsabilidade: classificarBlocoCss(b.prelude, b.corpo, propriedades),
      seletores: seletoresDe(b.prelude),
      propriedades,
    };
  });

  const contagem: Record<ResponsabilidadeCss, number> = {
    tokens: 0,
    layout: 0,
    components: 0,
    animations: 0,
    interactions: 0,
    runtime: 0,
  };
  for (const b of blocos) contagem[b.responsabilidade]++;

  const posicaoNoArquivo = new Map<ResponsabilidadeCss, number>(ORDEM_CSS.map((r, i) => [r, i]));

  // ── Procura inversão ─────────────────────────────────────────────────────
  // Uma inversão existe quando A vem ANTES de B no fonte, mas o arquivo de A
  // carrega DEPOIS do de B — e os dois podem disputar o mesmo elemento com a
  // mesma propriedade. Nesse caso dividir mudaria o resultado visual.
  const inversoes: ResultadoCss['inversoes'] = [];
  const MAX_PARES = 20_000;
  let pares = 0;
  for (let i = 0; i < blocos.length && pares < MAX_PARES; i++) {
    const a = blocos[i];
    if (a === undefined || a.seletores.length === 0) continue;
    for (let j = i + 1; j < blocos.length && pares < MAX_PARES; j++) {
      const b = blocos[j];
      if (b === undefined || b.seletores.length === 0) continue;
      if (a.responsabilidade === b.responsabilidade) continue;
      pares++;
      const posA = posicaoNoArquivo.get(a.responsabilidade) ?? 0;
      const posB = posicaoNoArquivo.get(b.responsabilidade) ?? 0;
      // A ordem só inverte quando o bloco POSTERIOR no fonte vai para um arquivo
      // ANTERIOR no carregamento.
      if (posB >= posA) continue;
      const comum = a.propriedades.filter((p) => b.propriedades.includes(p));
      if (comum.length === 0) continue;
      const colide = a.seletores.some((sa) => b.seletores.some((sb) => podemColidir(sa, sb)));
      if (!colide) continue;
      inversoes.push({
        a: a.prelude.slice(0, 60),
        b: b.prelude.slice(0, 60),
        propriedade: comum[0] ?? '',
      });
      if (inversoes.length >= 20) break;
    }
    if (inversoes.length >= 20) break;
  }

  if (inversoes.length > 0) {
    return {
      arquivos: [
        {
          caminho: 'assets/css/styles.css',
          conteudo: blocos.map((b) => b.texto).join('\n\n'),
          responsabilidade: 'components',
        },
      ],
      dividido: false,
      motivo: `Dividir alteraria a cascata: ${inversoes.length} par(es) de regras de responsabilidades diferentes disputam o mesmo elemento na mesma propriedade (ex.: "${inversoes[0]?.a}" x "${inversoes[0]?.b}" em ${inversoes[0]?.propriedade}). O CSS foi preservado num arquivo único, na ordem original.`,
      inversoes,
      contagem,
    };
  }

  const arquivos: ResultadoCss['arquivos'] = [];
  for (const r of ORDEM_CSS) {
    const doGrupo = blocos.filter((b) => b.responsabilidade === r);
    if (doGrupo.length === 0) continue;
    arquivos.push({
      caminho: ARQUIVO_CSS[r],
      // Ordem original PRESERVADA dentro do arquivo — `blocos` já está ordenado.
      conteudo: doGrupo.map((b) => b.texto).join('\n\n'),
      responsabilidade: r,
    });
  }

  return { arquivos, dividido: true, inversoes: [], contagem };
};

/**
 * `@keyframes` que o CSS mantido usa, e `@font-face` cujas famílias aparecem.
 * Reexportado do V1 (`@ds/explorer/css`) pelo motor — aqui só o que falta: quais
 * nomes de animação um trecho de HTML/CSS de fato referencia.
 */
export const animacoesReferenciadas = (css: string): string[] => {
  const usadas = new Set<string>();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/gi)) {
    const valor = m[1] ?? '';
    for (const parte of valor.split(',')) {
      for (const token of parte.trim().split(/\s+/)) {
        if (
          /^[a-zA-Z_][\w-]*$/.test(token) &&
          !/^(normal|none|infinite|alternate|reverse|forwards|backwards|both|paused|running|linear|ease|ease-in|ease-out|ease-in-out|initial|inherit|unset)$/i.test(
            token,
          )
        ) {
          usadas.add(token);
        }
      }
    }
  }
  return [...usadas];
};
