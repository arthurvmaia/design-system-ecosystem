import { ALCANCE_DA_MARCA } from '@ds/shared';
import { analisarCss } from './analisar-css.js';
import { coresDoValor } from './inventario.js';

/**
 * Quanto de uma peça a marca do usuário consegue alcançar.
 *
 * A recoloração deixa coisas de fora DE PROPÓSITO, e cada exclusão está certa:
 * recolorir todo `white` de um site atinge scrollbar e sombra de foco, que não
 * são decisão de marca; `color-mix()` e `var()` como cor inteira não têm
 * canônico honesto sem resolver o contexto; e um `#0d3c1f` dentro de um SVG em
 * data-uri não é cor da página, é conteúdo do arquivo.
 *
 * O defeito nunca foi a regra — é que **o produto não contava**. A peça entrava
 * no kit parecendo que ia receber a marca, saía com as cores da origem, e não
 * havia um lugar na interface que avisasse. Num site Tailwind moderno isso é a
 * regra e não a exceção: quase toda cor é `bg-white`, `text-black` ou
 * `var(--tw-*)`, ou seja, exatamente as três exclusões, e a recoloração acerta
 * quase nada em silêncio.
 *
 * Esta medida é aritmética sobre o que o inventário já faz: os literais que
 * viram cor comparável são os alcançáveis; o resto é contado por MOTIVO, para a
 * tela poder dizer não só quanto ficou de fora, mas por quê.
 *
 * Ela não muda o alcance da recoloração. Ampliar para keywords foi considerado e
 * recusado: o problema é de honestidade, não de alcance.
 */

export type MotivoInalcancavel = 'palavra' | 'funcao-dinamica' | 'dentro-de-imagem';

export type Recolorabilidade = {
  /** Literais de cor encontrados, alcançáveis ou não. */
  total: number;
  /** Quantos a recoloração consegue trocar. */
  alcancavel: number;
  /** `alcancavel / total`, com 1 quando não há cor nenhuma (nada a perder). */
  taxa: number;
  /** Quantos ficaram de fora, por motivo. Só os motivos com contagem > 0. */
  fora: Partial<Record<MotivoInalcancavel, number>>;
};

/**
 * As palavras de cor do CSS que aparecem em código real. A lista não precisa ser
 * exaustiva (são 148 nomes): o que interessa é contar o que de fato ocorre em
 * folha de site, e `white`/`black`/`transparent` sozinhas respondem pela quase
 * totalidade. Um nome exótico não contado vira "sem cor detectada" naquele
 * literal, que erra para menos — e errar para menos aqui é declarar MENOS
 * cobertura do que a real, nunca prometer mais.
 */
const PALAVRAS = new Set([
  'white',
  'black',
  'transparent',
  'currentcolor',
  'red',
  'green',
  'blue',
  'gray',
  'grey',
  'silver',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'navy',
  'teal',
  'olive',
  'lime',
  'aqua',
  'cyan',
  'magenta',
  'maroon',
  'gold',
  'beige',
  'ivory',
  'khaki',
  'coral',
  'salmon',
  'tan',
  'violet',
  'indigo',
  'turquoise',
  'crimson',
  'lavender',
  'plum',
  'orchid',
  'wheat',
  'linen',
  'snow',
  'azure',
  'chocolate',
  'tomato',
  'inherit',
]);

/** As propriedades cujo valor É cor. Fora delas, uma palavra solta não é cor. */
const PROPS_DE_COR =
  /^(color|background|background-color|background-image|border|border-.*-color|border-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule-color|--.*)$/;

/** `url(...)` com parênteses balanceados, para medir o que mora dentro. */
const trechosDeUrl = (valor: string): string[] => {
  const achados: string[] = [];
  let i = 0;
  while (i < valor.length) {
    const inicio = valor.indexOf('url(', i);
    if (inicio === -1) break;
    let nivel = 0;
    let j = inicio + 3;
    for (; j < valor.length; j++) {
      if (valor[j] === '(') nivel++;
      else if (valor[j] === ')') {
        nivel--;
        if (nivel === 0) break;
      }
    }
    achados.push(valor.slice(inicio, j + 1));
    i = j + 1;
  }
  return achados;
};

const HEX_SOLTO = /#[0-9a-f]{3,8}\b/gi;
const FUNCAO_DINAMICA = /\b(color-mix|light-dark|color-contrast)\s*\(/gi;
const VAR_COMO_COR = /\bvar\s*\(\s*--[\w-]+/gi;

/**
 * Mede uma folha de estilo.
 *
 * CSS ilegível devolve zero de tudo com taxa 1: o mesmo contrato de degradação
 * do resto do pipeline — quem não conseguiu medir não acusa a peça.
 */
export const medirRecolorabilidade = (css: string): Recolorabilidade => {
  const analise = analisarCss(css);
  if ('erro' in analise) {
    return { total: 0, alcancavel: 0, taxa: 1, fora: {} };
  }
  const raiz = analise.raiz;

  let alcancavel = 0;
  const fora: Record<MotivoInalcancavel, number> = {
    palavra: 0,
    'funcao-dinamica': 0,
    'dentro-de-imagem': 0,
  };

  raiz.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!PROPS_DE_COR.test(prop)) return;
    const valor = decl.value;

    // Alcançáveis: exatamente o que o inventário sabe canonizar.
    alcancavel += coresDoValor(valor).length;

    // Dentro de imagem: o `coresDoValor` pula `url(...)` de propósito, então os
    // hexes de lá nunca entram na conta de cima. Aqui eles são contados como o
    // que são: cor que existe no arquivo e que ninguém vai trocar.
    for (const url of trechosDeUrl(valor)) {
      fora['dentro-de-imagem'] += (url.match(HEX_SOLTO) ?? []).length;
    }

    const semUrl = trechosDeUrl(valor).reduce((v, u) => v.replace(u, ' '), valor);

    fora['funcao-dinamica'] += (semUrl.match(FUNCAO_DINAMICA) ?? []).length;
    fora['funcao-dinamica'] += (semUrl.match(VAR_COMO_COR) ?? []).length;

    // Palavras: separadas por qualquer coisa que não seja letra ou hífen.
    for (const palavra of semUrl.toLowerCase().split(/[^a-z-]+/)) {
      if (PALAVRAS.has(palavra)) fora.palavra++;
    }
  });

  const inalcancavel = fora.palavra + fora['funcao-dinamica'] + fora['dentro-de-imagem'];
  const total = alcancavel + inalcancavel;
  return {
    total,
    alcancavel,
    taxa: total === 0 ? 1 : alcancavel / total,
    fora: Object.fromEntries(Object.entries(fora).filter(([, n]) => n > 0)),
  };
};

/**
 * O selo da peça. Três níveis, porque três é o que muda a decisão de quem monta
 * um kit: dá para usar com a minha marca, dá em parte, ou não dá.
 */
export type NivelDeMarca = 'aplicavel' | 'parcial' | 'cores-fixas';

/**
 * Onde ficam os cortes.
 *
 * Acima de 80% a peça veste a marca e o que sobra é detalhe (uma borda, um
 * `white` de scrollbar). Abaixo de 35% ela é, na prática, a peça de origem
 * pintada por fora — chamar isso de "parcial" seria otimismo. No meio, parcial
 * com o número à vista, que é a única resposta honesta.
 */
export const nivelDeMarca = (r: Recolorabilidade): NivelDeMarca => {
  if (r.total === 0 || r.taxa >= ALCANCE_DA_MARCA.veste) return 'aplicavel';
  if (r.taxa < ALCANCE_DA_MARCA.origem) return 'cores-fixas';
  return 'parcial';
};
