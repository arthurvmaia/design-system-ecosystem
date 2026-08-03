import { z } from 'zod';
import type { EscalaDaOrigem, OrigemConsolidada } from './kit-design-system.js';

/**
 * A ESCALA do site gerado: de quem é a régua de tamanho.
 *
 * ## O buraco que isto fecha
 *
 * A fonte da marca já vale dentro das peças (`retipografar.ts` reescreve
 * `font-family` no ponto de uso). O TAMANHO não valia: cada peça continuava com
 * os degraus do site de onde foi capturada. Um kit que junta o hero de um site
 * com os preços de outro saía com título de 64px em cima e de 40px embaixo —
 * não porque alguém escolheu, mas porque dois designers escolheram, em dois
 * sites diferentes, e ninguém conciliou.
 *
 * ## Por que `da-marca` é o padrão
 *
 * Três razões, e a primeira é a que decide: a FAMÍLIA da fonte já se comporta
 * assim. Tamanho seguir outra regra que família seria surpresa sem motivo.
 * Depois: misturar origens é a promessa central do produto, e régua que não
 * conversa mina justamente isso. Por fim, o desalinhamento já estava declarado
 * como DEFEITO a corrigir, não como fidelidade a preservar.
 *
 * ## Por que ligar o padrão não quebra projeto que já existe
 *
 * O regime só produz efeito onde há régua MEDIDA. Origem capturada antes de o
 * motor medir escala vem com `escala` ausente ou vazia, e aí não há de onde
 * tirar degrau nenhum: a reescrita não acontece e o literal original continua
 * valendo. É a mesma degradação da recoloração e da retipografia — sem dado,
 * a peça sai como estava.
 *
 * ## O terceiro eixo: o raio de canto
 *
 * O raio entra pelo MESMO argumento que valeu para o tamanho, e ele é
 * verificável a olho nu: duas origens com raios diferentes — uma de canto vivo,
 * outra de canto arredondado — lidas na mesma página são duas caras, e o kit
 * inteiro passa a parecer recortado de dois lugares. Misturar origens é a
 * promessa do produto; o raio é um dos três eixos que decidem se ela se cumpre.
 *
 * Quem quiser a fidelidade de cada origem desliga os três de uma vez pelo
 * `escalaDoSite: 'de-cada-origem'`. Um interruptor por eixo seria escolha de
 * quem não sabe o que está escolhendo: os três descrevem a mesma coisa, que é
 * de quem é a régua do site.
 */

export const RegimeDeEscala = z.enum(['da-marca', 'de-cada-origem']);
export type RegimeDeEscala = z.infer<typeof RegimeDeEscala>;

export const REGIME_DE_ESCALA_PADRAO: RegimeDeEscala = 'da-marca';

/** O prefixo dos tokens que o `marca.css` declara e as peças consomem. */
export const TOKEN_DE_PASSO = '--marca-passo';
export const TOKEN_DE_ESPACO = '--marca-espaco';
export const TOKEN_DE_RAIO = '--marca-raio';

export const nomeDoPasso = (i: number): string => `${TOKEN_DE_PASSO}-${i + 1}`;
export const nomeDoEspaco = (i: number): string => `${TOKEN_DE_ESPACO}-${i + 1}`;
export const nomeDoRaio = (i: number): string => `${TOKEN_DE_RAIO}-${i + 1}`;

/**
 * A régua de referência: a origem cuja escala rege o site inteiro.
 *
 * Preferência declarada ganha, porque é escolha explícita do usuário. Sem ela,
 * ganha a régua com MAIS degraus medidos — não é arbitrário: mais degraus é
 * mais evidência, e uma régua curta usada como referência achataria as peças
 * das origens mais ricas. Empate resolve pelo id, para a saída ser determinística
 * (duas gerações do mesmo kit têm de produzir o mesmo site).
 */
export const escalaDeReferencia = (
  origens: readonly OrigemConsolidada[],
  preferido?: string | null,
): OrigemConsolidada | null => {
  const comEscala = origens.filter((o) => (o.escala?.degraus.length ?? 0) > 0);
  if (comEscala.length === 0) return null;

  const preferida = comEscala.find((o) => o.designSystemId === preferido);
  if (preferida !== undefined) return preferida;

  return [...comEscala].sort((a, b) => {
    const d = (b.escala?.degraus.length ?? 0) - (a.escala?.degraus.length ?? 0);
    return d !== 0 ? d : a.designSystemId.localeCompare(b.designSystemId);
  })[0] as OrigemConsolidada;
};

/** Índice do degrau mais próximo de um valor, ou -1 se a régua está vazia. */
const maisProximo = (regua: readonly number[], valor: number): number => {
  let melhor = -1;
  let menorDistancia = Number.POSITIVE_INFINITY;
  regua.forEach((d, i) => {
    const distancia = Math.abs(d - valor);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = i;
    }
  });
  return melhor;
};

const limitar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * Para cada degrau da régua de ORIGEM, o índice do degrau correspondente na
 * régua de REFERÊNCIA.
 *
 * ## A âncora é o corpo, e isso não é detalhe
 *
 * O alinhamento poderia ser por posição relativa (o terceiro de cinco vira o
 * quinto de nove), e seria pior por um motivo concreto: réguas de comprimentos
 * diferentes deslocariam o TEXTO DE LEITURA. O corpo é o degrau onde está a
 * maior parte do texto da página — é o que a pessoa passa mais tempo lendo, e é
 * onde um erro de meio degrau aparece como "esta seção tem letra menor que a
 * outra". Ancorar corpo no corpo garante que o texto corrido de duas origens
 * saia do mesmo tamanho, que é a coisa mais visível que este alinhamento faz.
 *
 * A hierarquia em volta vem por DESLOCAMENTO: um degrau acima do corpo na
 * origem vira um degrau acima do corpo na referência. Assim o que era destaque
 * continua destaque, e o que era miúdo continua miúdo.
 *
 * Sem `corpo` medido nas duas (eixo de espaço, ou tipografia de origem antiga),
 * cai para posição relativa — que é pior âncora, mas melhor que nenhuma.
 */
export const alinharDegraus = (
  origem: readonly number[],
  referencia: readonly number[],
  ancoras?: { origem: number | null; referencia: number | null },
): number[] => {
  if (origem.length === 0 || referencia.length === 0) return [];
  const ultimo = referencia.length - 1;

  const ci = ancoras?.origem != null ? maisProximo(origem, ancoras.origem) : -1;
  const cr = ancoras?.referencia != null ? maisProximo(referencia, ancoras.referencia) : -1;

  if (ci >= 0 && cr >= 0) {
    return origem.map((_, i) => limitar(cr + (i - ci), 0, ultimo));
  }

  // Posição relativa. Régua de um degrau só aponta para o primeiro: não há
  // proporção a preservar quando não há segundo ponto.
  if (origem.length === 1) return [0];
  return origem.map((_, i) => Math.round((i / (origem.length - 1)) * ultimo));
};

export type ReguaAlinhada = {
  /** Valor medido na origem → nome do token que a substitui. */
  porValor: ReadonlyMap<number, string>;
};

/**
 * O mapa `valor da origem → token da marca`, para um eixo.
 *
 * É o que `reescalar.ts` consome: encontrou `font-size: 40px` no CSS de uma
 * origem, pergunta a este mapa qual token põe no lugar. Fora do mapa, o valor
 * fica como está — a mesma regra de "na dúvida, não mexe" que a recoloração
 * segue com cluster sem papel.
 */
export const reguaDaOrigem = (
  origem: readonly number[],
  referencia: readonly number[],
  nome: (i: number) => string,
  ancoras?: { origem: number | null; referencia: number | null },
): ReguaAlinhada => {
  const destinos = alinharDegraus(origem, referencia, ancoras);
  const porValor = new Map<number, string>();
  origem.forEach((valor, i) => {
    const j = destinos[i];
    if (j !== undefined) porValor.set(valor, nome(j));
  });
  return { porValor };
};

/** As três réguas de uma origem, prontas para a reescrita. */
export const reguasParaOrigem = (
  daOrigem: EscalaDaOrigem | undefined,
  daReferencia: EscalaDaOrigem | undefined,
): { tipografia: ReguaAlinhada; espaco: ReguaAlinhada; raio: ReguaAlinhada } => {
  const vazia: ReguaAlinhada = { porValor: new Map() };
  if (daOrigem === undefined || daReferencia === undefined) {
    return { tipografia: vazia, espaco: vazia, raio: vazia };
  }
  return {
    tipografia: reguaDaOrigem(daOrigem.degraus, daReferencia.degraus, nomeDoPasso, {
      origem: daOrigem.corpo,
      referencia: daReferencia.corpo,
    }),
    // Respiro não tem "corpo": nomear um degrau de espaço como o principal
    // exigiria saber a intenção de quem desenhou, e a medição não separa isso.
    espaco: reguaDaOrigem(daOrigem.espacos, daReferencia.espacos, nomeDoEspaco),
    // Raio também não tem âncora, e pela mesma razão do espaço: não existe um
    // "raio de corpo". O que a medição entrega é a lista de arredondamentos que
    // a origem usa, do mais fechado ao mais aberto, e é a POSIÇÃO nessa lista
    // que carrega a intenção — o menor continua sendo o discreto do selo, o
    // maior continua sendo o da pílula.
    raio: reguaDaOrigem(daOrigem.raios, daReferencia.raios, nomeDoRaio),
  };
};
