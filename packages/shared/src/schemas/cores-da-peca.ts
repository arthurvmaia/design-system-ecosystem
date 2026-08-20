import { contrasteRatio } from './brand.js';

/**
 * As cores de uma peça criativa, derivadas da paleta da marca.
 *
 * ## Por que isto mora no contrato, e não no motor
 *
 * Duas telas e um compositor precisam da MESMA resposta. A tela do pedido
 * mostra qual cor vai virar o botão antes de a pessoa confirmar; o compositor
 * pinta; a régua confere o contraste do que foi pintado. Uma segunda
 * implementação em qualquer um dos três divergiria na primeira mudança, e a
 * divergência apareceria como "a prévia prometia outra cor" — depois de pago.
 *
 * Aqui não há nada de navegador nem de disco: é aritmética de cor, e é por isso
 * que ela pode viver no mesmo lugar que o resto do contrato.
 */
export type CoresDaPeca = {
  /** A tinta sobre a faixa. */
  readonly texto: string;
  /** A faixa de leitura sob o texto. É contra ela que o contraste é medido. */
  readonly faixa: string;
  /** O fundo do botão. */
  readonly acento: string;
  /** A tinta sobre o botão. Calculada contra o acento, não herdada da faixa. */
  readonly tintaDoAcento: string;
  /**
   * O acento saiu da PALETA DA MARCA, ou foi derivado?
   *
   * Viaja porque é a diferença entre o botão ser da marca e ser um cálculo, e
   * quem pede a peça tem o direito de saber qual dos dois vai acontecer — antes
   * de confirmar, não depois de receber.
   */
  readonly acentoVeioDaMarca: boolean;
};

const OFF_WHITE = '#F4F1EA';
const QUASE_PRETO = '#111827';

/**
 * A tinta que MAIS se lê sobre um fundo, entre o off-white e o quase-preto.
 *
 * Preto e branco puros ficam de fora de propósito: numa peça de campanha eles
 * vibram contra a foto, e o off-white é o que a referência de acabamento que o
 * dono aprovou usa.
 */
export const tintaQueLe = (fundo: string): string =>
  contrasteRatio(OFF_WHITE, fundo) >= contrasteRatio(QUASE_PRETO, fundo) ? OFF_WHITE : QUASE_PRETO;

/**
 * O piso que o BOTÃO tem de vencer contra a faixa.
 *
 * É o mesmo 3:1 do texto, e não por economia de constante: a norma cobra 3:1
 * para o contorno de componente de interface exatamente como cobra para texto
 * grande. Um botão que não se separa do fundo não é um botão, é um retângulo.
 */
export const PISO_DO_BOTAO = 3;

/**
 * As cores da peça: a faixa é a principal da marca, e o resto é DERIVADO ou
 * escolhido da paleta.
 *
 * Enquanto o pedido trazia uma cor só, o botão era a dupla invertida do
 * preto-e-branco: mesma conta, contraste garantido, e nenhuma relação com a
 * marca. Num criativo de tráfego o botão é o elemento de conversão, e é ele que
 * primeiro denuncia uma peça saída de gerador.
 *
 * Com a paleta chegando, a primeira cor de apoio que passa nas DUAS provas vira
 * o acento: ela precisa se separar da faixa (senão o botão some no fundo) e
 * precisa aceitar uma tinta legível (senão o rótulo some dentro dele). Nenhuma
 * passa? Volta a derivada, e a peça DIZ que voltou.
 */
export const coresDerivadas = (
  corPrincipal: string,
  coresDeApoio: readonly string[] = [],
): CoresDaPeca => {
  const faixa = corPrincipal;
  const texto = tintaQueLe(faixa);
  const daMarca = coresDeApoio.find((c) => {
    const separaDaFaixa = contrasteRatio(c, faixa);
    const aceitaTinta = contrasteRatio(tintaQueLe(c), c);
    return (
      Number.isFinite(separaDaFaixa) &&
      separaDaFaixa >= PISO_DO_BOTAO &&
      aceitaTinta >= PISO_DO_BOTAO
    );
  });
  const acento = daMarca ?? texto;
  return {
    texto,
    faixa,
    acento,
    tintaDoAcento: tintaQueLe(acento),
    acentoVeioDaMarca: daMarca !== undefined,
  };
};

/**
 * O menor contraste da peça: texto sobre a faixa, e CTA sobre o acento.
 *
 * Exato porque nós escolhemos as duas cores de cada par. Não há amostragem de
 * pixel aqui, e não deveria haver: texto que precisasse dela seria texto solto
 * sobre a foto, que é o que a composição evita.
 *
 * O par do botão é a tinta DELE contra o fundo DELE. Enquanto o acento era
 * sempre a tinta invertida, usar a cor da faixa dava o mesmo número; com o
 * acento vindo da paleta da marca, são duas contas diferentes e só uma descreve
 * o que se lê no botão.
 */
export const contrasteDaPeca = (cores: CoresDaPeca, temCta: boolean): number | null => {
  const doTexto = contrasteRatio(cores.texto, cores.faixa);
  const doCta = temCta ? contrasteRatio(cores.tintaDoAcento, cores.acento) : null;
  const pares = [doTexto, doCta].filter((n): n is number => n !== null);
  return pares.length === 0 ? null : Math.min(...pares);
};
