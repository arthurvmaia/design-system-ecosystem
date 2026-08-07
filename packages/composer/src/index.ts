export {
  type OpcoesEscopo,
  type ResultadoEscopo,
  escoparCss,
  escoparSeletor,
  nomesGlobaisDe,
} from './escopo.js';
export {
  type OpcoesComposicao,
  type PecaComposta,
  type ResultadoComposicao,
  atributosDeProxy,
  compor,
  envolverEmProxies,
} from './compor.js';
export { type CorAnalisada, type Oklch, analisarCor, distanciaOk, paraOklch } from './cor.js';
export {
  type MotivoInalcancavel,
  type NivelDeMarca,
  type Recolorabilidade,
  medirRecolorabilidade,
  nivelDeMarca,
} from './recolorabilidade.js';
export {
  type TokensDeMovimento,
  MOVIMENTO_PADRAO,
  cssDosTokensDeMovimento,
  tokensDeMovimento,
} from './movimento.js';
export {
  type ContextoDeCor,
  type FonteInventariada,
  type OcorrenciaDeCor,
  coresDoValor,
  inventariarCores,
  inventariarFontes,
} from './inventario.js';
export { type ConsolidacaoDaOrigem, consolidarCores } from './clusters.js';
export {
  type MapaDeRecoloracao,
  type ResultadoRecoloracao,
  type Retema,
  mapaDeRecoloracao,
  recolorirCss,
  retemarHtmlInline,
} from './recolorir.js';

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

export { fontesDaOrigem, placarDasFontes } from './papel-da-fonte.js';
export type { FontesDaOrigem, PapelDeFonte } from './papel-da-fonte.js';
export { mapaDeFontes, retipografarCss, TOKEN_DE_FONTE } from './retipografar.js';
export type { MapaDeFontes, ResultadoRetipografia } from './retipografar.js';
export { PX_POR_REM, TOLERANCIA_EM_PX, reescalarCss } from './reescalar.js';
export type { ReguasDeEscala, ResultadoDeReescala } from './reescalar.js';
