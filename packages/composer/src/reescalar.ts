import type { ReguaAlinhada } from '@ds/shared';
import postcss from 'postcss';

/**
 * Reescala: troca os comprimentos de origem por degraus que a marca controla.
 *
 * ## O defeito, medido
 *
 * A FAMÍLIA da fonte já vale dentro das peças: `retipografar.ts` reescreve
 * `font-family` no ponto de uso, e o `marca.css` manda. O TAMANHO não valia:
 * cada peça continuava com os degraus do site de onde foi capturada. Um kit que
 * junta o hero de um site com os preços de outro sai com título de 64px em cima
 * e de 40px embaixo, e o mesmo acontece com o respiro: 96px de padding numa
 * seção, 48px na seguinte. Ninguém escolheu isso. Dois designers escolheram, em
 * dois sites diferentes, e não havia onde conciliar.
 *
 * ## A saída é a que a cor e a fonte já provaram
 *
 * Não disputar a cascata: reescrever a origem para CONSUMIR o token, com o
 * literal original como fallback.
 *
 *   `font-size:3rem`      → `font-size:var(--marca-passo-5, 3rem)`
 *   `padding:12px 24px`   → `padding:var(--marca-espaco-2, 12px) var(--marca-espaco-4, 24px)`
 *
 * Quem diz qual degrau entra no lugar de qual valor é a `ReguaAlinhada` que
 * `escala-do-site.ts` monta (`reguasParaOrigem`). Aqui só se aplica o mapa.
 *
 * Os três invariantes de `recolorir.ts` e `retipografar.ts` valem iguais, e há
 * teste para os três:
 *
 * - **O fallback é SEMPRE o literal original, com a unidade como estava
 *   escrita.** `3rem` continua `3rem` no fallback, e não `48px`. Marca sem
 *   escala, régua vazia, kit antigo: a peça degrada para o tamanho de origem,
 *   nunca para quebrado.
 * - **Esta função NUNCA declara `--marca-*`, só consome.** É o que garante que
 *   o `:root` do `marca.css` alcança as peças por herança limpa — a origem não
 *   declara nada nesse namespace, então não há proxy no caminho para
 *   interceptar.
 * - **Idempotência.** Rodar duas vezes não aninha fallback. Isso sai de graça da
 *   regra de pular `var()`: depois da primeira passagem o valor É um `var()`, e
 *   a segunda passagem o deixa em paz.
 *
 * ## O que NÃO converte, e por quê
 *
 * Aqui a honestidade importa mais que a cobertura. Um valor convertido errado
 * não aparece como erro: aparece como layout torto, e a pessoa culpa o app.
 *
 * - `em` e `%` dependem de contexto que o CSS estático não dá (o `font-size` do
 *   pai, a largura do container). Converter exigiria resolver a cadeia inteira
 *   de ancestrais na hora de gerar, e um chute ali desloca a peça.
 * - `calc()`, `clamp()`, `min()`, `max()`: são expressões fluidas, e trocar um
 *   argumento quebraria a proporção que o autor construiu. Um `clamp()` já é uma
 *   decisão de escala — substituí-lo por um degrau fixo tiraria a
 *   responsividade que o site tinha.
 * - Qualquer `var()`: o valor vem de outro token e só existe em tempo de
 *   execução. É também o que dá a idempotência.
 * - `0` e `0px`: zero é ausência de respiro, não degrau. Tokenizá-lo injetaria
 *   espaço onde o desenho não tinha nenhum.
 * - Valor negativo: `margin:-24px` é técnica de puxar (sobreposição, encaixe),
 *   não respiro de escala. Escalar isso moveria a peça de lugar.
 *
 * Tudo o que fica de fora conta em `mantidas`. O número não é decoração: é o que
 * diz quanto da folha continuou com a régua da origem, e é por ele que se vê se
 * a escala da marca de fato alcançou a peça.
 *
 * ## A suposição do rem, declarada
 *
 * `1rem = 16px`. É a raiz padrão do navegador e a do site que o app gera (ele
 * não mexe nisso), e os degraus foram MEDIDOS em px pelo navegador, então a
 * comparação precisa de um px de cada lado.
 *
 * Se alguma origem declarasse `html{font-size:62.5%}`, a conversão erraria por
 * 1,6x. E o erro degrada sozinho: o valor simplesmente não casaria com degrau
 * nenhum dentro da tolerância e o literal ficaria. Erra para "não reescreveu",
 * nunca para "reescreveu errado".
 *
 * ## A tolerância: 0,5px
 *
 * Os degraus saem de medição de navegador (`mapper/rampas.ts`), e o que o
 * designer escreveu como um tamanho só chega como 15.98 e 16. Comparação exata
 * perderia metade dos casamentos por ruído de arredondamento.
 *
 * Meio pixel é a METADE da menor distância que dois degraus reais guardam entre
 * si (o passo mais apertado numa escala tipográfica é de 1px, 12→13). Com essa
 * folga, um valor só alcança dois degraus ao mesmo tempo se cair exatamente no
 * meio deles, e aí ganha o mais próximo: na prática, arredondamento. Uma
 * tolerância maior, sim, começaria a puxar valor para o degrau do vizinho.
 */

/** As duas réguas que regem a reescrita, uma por eixo. */
export type ReguasDeEscala = {
  tipografia: ReguaAlinhada;
  espaco: ReguaAlinhada;
};

export type ResultadoDeReescala = {
  css: string;
  /** Quantos comprimentos passaram a consumir um degrau da marca. */
  reescritas: number;
  /** Quantos ficaram com o literal de origem (fora da régua, ou de contexto). */
  mantidas: number;
};

/** A raiz suposta na conversão de `rem` para px. Ver o comentário de topo. */
export const PX_POR_REM = 16;

/** Distância máxima, em px, entre o valor da folha e um degrau da régua. */
export const TOLERANCIA_EM_PX = 0.5;

/** Onde mora o tamanho de letra. */
const PROPRIEDADES_DE_TIPOGRAFIA = new Set(['font-size']);

/**
 * Onde mora o respiro. `width`, `height` e `top` ficam de fora de propósito: são
 * medidas de LAYOUT, e a escala da marca não tem opinião sobre a largura de uma
 * caixa. `border-radius` também não entra: o raio tem régua própria
 * (`EscalaDaOrigem.raios`), que este eixo não rege.
 *
 * As propriedades lógicas (`padding-inline`, `margin-block`) ainda não entram.
 * Não é decisão de desenho, é escopo: entram acrescentando o nome a este
 * conjunto, quando houver medição que mostre que aparecem no acervo.
 */
const PROPRIEDADES_DE_ESPACO = new Set([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
]);

/** Número com unidade opcional e nada mais: `12px`, `-4px`, `1.5rem`, `0`. */
const NUMERO_COM_UNIDADE = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i;

type Pedaco = { texto: string; ehEspaco: boolean };

/**
 * Quebra o valor em pedaços de token e de espaço em branco, sem entrar em
 * parênteses. É o que faz `min(24px, 5%)` chegar inteiro em um pedaço só (em vez
 * de virar dois comprimentos soltos) e o que permite remontar o valor com o
 * espaçamento EXATO que a origem tinha, sem reformatar nada de passagem.
 */
const empedacar = (valor: string): Pedaco[] => {
  const pedacos: Pedaco[] = [];
  let atual = '';
  let ehEspaco = false;
  let profundidade = 0;

  const fechar = () => {
    if (atual.length > 0) pedacos.push({ texto: atual, ehEspaco });
    atual = '';
  };

  for (const ch of valor) {
    const espaco = profundidade === 0 && /\s/.test(ch);
    if (espaco !== ehEspaco) {
      fechar();
      ehEspaco = espaco;
    }
    atual += ch;
    if (ch === '(') profundidade += 1;
    else if (ch === ')') profundidade = Math.max(0, profundidade - 1);
  }
  fechar();

  return pedacos;
};

/** O valor em px, ou null quando a unidade não se resolve sem contexto. */
const emPx = (numero: number, unidade: string): number | null => {
  if (unidade === 'px') return numero;
  if (unidade === 'rem') return numero * PX_POR_REM;
  return null;
};

/** O degrau MAIS PRÓXIMO dentro da tolerância, ou null. */
const degrauDe = (regua: ReguaAlinhada, px: number): string | null => {
  let melhor: string | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;
  for (const [valor, token] of regua.porValor) {
    const distancia = Math.abs(valor - px);
    // Estritamente menor: com dois degraus à mesma distância ganha o primeiro da
    // régua, que vem em ordem crescente. A saída precisa ser determinística
    // (duas gerações do mesmo kit têm de produzir o mesmo site).
    if (distancia <= TOLERANCIA_EM_PX && distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = token;
    }
  }
  return melhor;
};

/**
 * O que fazer com UM pedaço de valor.
 *
 * `null` = não é candidato a comprimento (`auto`, `inherit`, `normal`), e por
 * isso não entra em placar nenhum. Candidato é número ou função: ou vira degrau,
 * ou conta em `mantidas`.
 */
type Conversao = { texto: string; reescrita: boolean } | null;

const converter = (token: string, regua: ReguaAlinhada): Conversao => {
  // Qualquer função: `calc()`, `clamp()`, `min()`, `max()`, `var()`, `env()`.
  // Todas dependem de contexto que o CSS estático não dá, e é aqui que a
  // idempotência acontece: depois da primeira passagem o valor é um `var()`.
  if (token.includes('(')) return { texto: token, reescrita: false };

  const casou = NUMERO_COM_UNIDADE.exec(token);
  if (casou === null) return null;

  const numero = Number(casou[1]);
  const unidade = (casou[2] ?? '').toLowerCase();
  const px = emPx(numero, unidade);
  // `px === null` é `em`, `%`, `vw`, `pt` ou número sem unidade. `px <= 0` é
  // zero e negativo. Os motivos de cada um estão no comentário de topo.
  if (px === null || px <= 0) return { texto: token, reescrita: false };

  const degrau = degrauDe(regua, px);
  if (degrau === null) return { texto: token, reescrita: false };

  // O fallback é o literal ORIGINAL, com a unidade como estava escrita.
  return { texto: `var(${degrau}, ${token})`, reescrita: true };
};

export const reescalarCss = (css: string, reguas: ReguasDeEscala): ResultadoDeReescala => {
  if (reguas.tipografia.porValor.size === 0 && reguas.espaco.porValor.size === 0) {
    return { css, reescritas: 0, mantidas: 0 };
  }

  let raiz: postcss.Root;
  try {
    raiz = postcss.parse(css);
  } catch {
    // Folha ilegível segue como está. O escopo já declara esse risco em aviso;
    // duplicar o aviso aqui só encheria a lista.
    return { css, reescritas: 0, mantidas: 0 };
  }

  let reescritas = 0;
  let mantidas = 0;

  raiz.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const regua = PROPRIEDADES_DE_TIPOGRAFIA.has(prop)
      ? reguas.tipografia
      : PROPRIEDADES_DE_ESPACO.has(prop)
        ? reguas.espaco
        : null;
    if (regua === null) return;

    // Dentro de `@font-face` nada descreve o tamanho de um texto na página: é a
    // definição da fonte. `font-size` ali é descritor, e trocá-lo pelo degrau da
    // marca mexeria na SELEÇÃO do arquivo, não no tamanho de algo que se lê. É o
    // mesmo guarda que `retipografar.ts` tem para `font-family`, pela mesma
    // razão: at-rule de definição não é ponto de uso.
    const pai = decl.parent;
    if (pai?.type === 'atrule' && pai.name.toLowerCase() === 'font-face') return;

    let valor = '';
    let mudou = false;
    for (const pedaco of empedacar(decl.value)) {
      if (pedaco.ehEspaco) {
        valor += pedaco.texto;
        continue;
      }
      const conversao = converter(pedaco.texto, regua);
      if (conversao === null) {
        valor += pedaco.texto;
        continue;
      }
      if (conversao.reescrita) {
        reescritas += 1;
        mudou = true;
      } else {
        mantidas += 1;
      }
      valor += conversao.texto;
    }

    // Só escreve quando algo mudou: declaração intocada mantém os `raws` da
    // origem, e a folha não é reformatada de passagem.
    if (mudou) decl.value = valor;
  });

  return { css: raiz.toString(), reescritas, mantidas };
};
