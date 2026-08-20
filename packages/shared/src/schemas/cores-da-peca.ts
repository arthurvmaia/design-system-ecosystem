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

const hexParaRgb = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const rgbParaHex = (r: number, g: number, b: number): string => {
  const h = (c: number): string =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

/**
 * A cor que sai de pousar `cor` com opacidade `alfa` sobre `fundo`.
 *
 * A conta é em sRGB e não em luz linear de propósito: é assim que o navegador
 * compõe `rgba()` sobre o que está atrás, e quem confere tem de prever o pixel
 * que o navegador vai desenhar — não o que a física diria.
 */
export const corComposta = (cor: string, alfa: number, fundo: string): string => {
  const [rc, gc, bc] = hexParaRgb(cor);
  const [rf, gf, bf] = hexParaRgb(fundo);
  const m = (c: number, f: number): number => f * (1 - alfa) + c * alfa;
  return rgbParaHex(m(rc, rf), m(gc, gf), m(bc, bf));
};

/** O degrau da busca do alfa. Menor que isto é precisão que o olho não tem. */
const DEGRAU_DO_ALFA = 0.01;

/**
 * O alfa do véu, DERIVADO — e é por isso que ele não é um número escolhido.
 *
 * Um véu existe para uma coisa só: fazer o texto se ler sobre uma foto que
 * ninguém viu ainda. Então o alfa certo é o MENOR que ainda cumpre isso no pior
 * caso possível, e o pior caso tem endereço exato.
 *
 * A luminância é monótona em cada canal, e a composição também é. Então o pior
 * pixel de foto que pode existir sob o texto é um dos dois extremos do cubo:
 * **branco puro** quando a tinta é clara (é ele que aproxima os dois lados do
 * par) e **preto puro** quando a tinta é escura. Basta conferir um dos dois — o
 * outro só afasta o par, e afastar melhora o contraste.
 *
 * Conferir o extremo cobre TODA foto, porque nenhum pixel de nenhuma imagem
 * pode ser pior que o extremo do cubo. É o oposto de escolher 0,5 porque parece
 * razoável: aqui o número sai da conta e muda com a cor da marca.
 *
 * Devolve 1 quando nem o véu cheio resolve, o que só acontece se a própria
 * faixa não separa da tinta. Aí o véu não é o problema, e a medição reprova.
 */
export const alfaDoVeu = (cores: CoresDaPeca, piso: number = PISO_DO_BOTAO): number =>
  alfaDoVeuSobre(cores, piorFotoPara(cores.texto), cores.texto, piso);

/** O extremo do cubo que mais aproxima o par: contra ele, todo pixel é melhor. */
const piorFotoPara = (tinta: string): string =>
  contrasteRatio(tinta, '#ffffff') < contrasteRatio(tinta, '#000000') ? '#ffffff' : '#000000';

/**
 * O menor alfa de véu que faz `tinta` vencer o piso sobre um fundo CONHECIDO.
 *
 * Existe porque o pior caso teórico é caro em pixel. Medido no banner de um
 * corredor com janelas estouradas: o alfa do pior caso deu **0,66**, porque ele
 * precisa domar um branco puro que está na janela — e o texto não pousa na
 * janela, pousa no piso do corredor, que é meio-tom. Para o pixel que o texto
 * REALMENTE pega, 0,45 basta. Vinte pontos de véu a menos é a diferença entre
 * a foto aparecer e a foto virar uma mancha azul.
 *
 * A garantia não afrouxa: quem informa o fundo é a amostragem do pixel sob a
 * caixa do texto, e a medição confere de novo depois de o véu ser aplicado.
 */
export const alfaDoVeuSobre = (
  cores: CoresDaPeca,
  fundo: string,
  tinta: string = cores.texto,
  piso: number = PISO_DO_BOTAO,
): number => {
  for (let passo = 0; passo <= 100; passo += 1) {
    const alfa = Number((passo * DEGRAU_DO_ALFA).toFixed(2));
    if (contrasteRatio(tinta, corComposta(cores.faixa, alfa, fundo)) >= piso) return alfa;
  }
  return 1;
};
