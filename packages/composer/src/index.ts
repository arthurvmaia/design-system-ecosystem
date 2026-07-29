export {
  type OpcoesEscopo,
  type ResultadoEscopo,
  escoparCss,
  escoparSeletor,
  nomesGlobaisDe,
} from './escopo.js';
export {
  type PecaComposta,
  type ResultadoComposicao,
  atributosDeProxy,
  compor,
  envolverEmProxies,
} from './compor.js';

/**
 * `@ds/composer` — juntar peças de origens diferentes sem que elas se estraguem.
 *
 * Este pacote existe por causa de uma troca de estratégia. Até aqui, a peça que
 * ia para a Biblioteca passava por uma PODA: o `@ds/isolator` tentava adivinhar
 * quais regras de CSS aquele HTML usava e jogava o resto fora. A intenção era
 * boa (bundle pequeno, sem colisão), e o resultado, medido, foi que os bundles
 * ficavam com uma fração do CSS da origem. O que se via na Galeria — que
 * carrega o CSS da página por fora — não era o que ia no `.zip`.
 *
 * A poda não tem conserto por afinação. Um seletor como `.grid > * + *`, um
 * `:has()`, uma classe que só aparece quando o menu abre: qualquer análise
 * estática erra, e erra para menos. O CSS da origem passa a viajar inteiro.
 *
 * Aí o problema muda de lugar: CSS inteiro de duas origens no mesmo documento
 * colide. É isso que este pacote resolve — com escopo de especificidade zero,
 * que isola sem inverter a cascata. Ver `escopo.ts` para o porquê do `:where()`.
 */
