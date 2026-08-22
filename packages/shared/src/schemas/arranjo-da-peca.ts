import { z } from 'zod';

/**
 * O ARRANJO da peça: onde o texto pousa dentro do quadro.
 *
 * ## Por que ele existe
 *
 * O compositor tinha UM arranjo — foto em cima, faixa sólida embaixo com logo,
 * headline e botão. Dois "conceitos" de banner saíam com a mesma composição e
 * fotos diferentes, e o dono viu: *"você fez 1 estilo de banner só para os
 * dois"*. Numa página de conceito de brandbook isso esvazia a página, porque
 * ela existe justamente para mostrar abordagens DIFERENTES.
 *
 * Arranjo é geometria, então nenhum deles custa crédito: os banners já pagos se
 * recompõem de graça em qualquer um.
 *
 * ## Por que o substrato viaja junto
 *
 * `contrasteDaPeca` é exato porque nós escolhemos as DUAS cores do par — a
 * tinta e a faixa sólida embaixo dela. Esse número só é verdade enquanto o
 * texto pousar em cor sólida. Assim que ele pousa sobre a foto, o mesmo cálculo
 * continua saindo bonito e deixa de descrever a peça, que é a pior forma de um
 * número errar (é o mesmo defeito que a marca com `opacity:.85` produziu: 11,82
 * declarados sobre um pixel que media 2,51).
 *
 * Então cada arranjo declara em que o texto pousa, e é esse campo que decide se
 * o contraste é DECLARADO (exato por construção) ou AMOSTRADO no pixel.
 */
export const ArranjoDaPeca = z.enum([
  /** Foto cheia, faixa sólida ancorada embaixo. O arranjo original. */
  'faixa-inferior',
  /** Metade cor sólida com o texto, metade foto, partido no eixo LONGO. */
  'tela-dividida',
  /** Foto cheia sob um véu de alfa uniforme, texto centralizado. */
  'veu-cheio',
  /** Foto cheia e nua, texto alinhado ao terço que MEDIU melhor. */
  'texto-sobre-imagem',
]);
export type ArranjoDaPeca = z.infer<typeof ArranjoDaPeca>;

/**
 * Em que o texto pousa.
 *
 * - `cor-solida` — nós escolhemos a cor. O contraste é declarado e exato.
 * - `foto-com-veu` — a foto composta com um véu de alfa uniforme. O alfa é
 *   DERIVADO (ver `alfaDoVeu`) para o pior pixel possível ainda vencer o piso,
 *   e a amostragem confere se a construção se cumpriu.
 * - `foto-nua` — a foto crua. Não há garantia nenhuma por construção: só a
 *   medição diz se aquela foto carrega texto, e é ela que decide.
 */
export type SubstratoDoTexto = 'cor-solida' | 'foto-com-veu' | 'foto-nua';

export type DescricaoDoArranjo = {
  /** Como ele se chama para gente, na apresentação e no aviso do comando. */
  readonly rotulo: string;
  /** O que ele é, numa linha. Vira legenda de conceito no brandbook. */
  readonly comoE: string;
  readonly substrato: SubstratoDoTexto;
};

export const ARRANJO: Record<ArranjoDaPeca, DescricaoDoArranjo> = {
  'faixa-inferior': {
    rotulo: 'Faixa embaixo',
    comoE: 'A foto ocupa o quadro e o texto pousa numa faixa sólida ancorada embaixo.',
    substrato: 'cor-solida',
  },
  'tela-dividida': {
    rotulo: 'Tela dividida',
    comoE:
      'O quadro parte ao meio no eixo longo: de um lado a cor da marca com o texto, do outro a foto.',
    substrato: 'cor-solida',
  },
  'veu-cheio': {
    rotulo: 'Imagem cheia com véu',
    comoE: 'A foto ocupa o quadro inteiro sob um véu da cor da marca, e o texto vem centralizado.',
    substrato: 'foto-com-veu',
  },
  'texto-sobre-imagem': {
    rotulo: 'Texto sobre a imagem',
    comoE: 'A foto fica limpa e o texto se alinha ao terço que melhor o carrega.',
    substrato: 'foto-nua',
  },
};

/** O arranjo de quem não escolheu: o que já existia, para nada mudar sozinho. */
export const ARRANJO_PADRAO: ArranjoDaPeca = 'faixa-inferior';

/**
 * A ordem de PREFERÊNCIA, e ela não é alfabética nem de gosto.
 *
 * Duas forças a decidem, e a ordem abaixo é o encontro das duas.
 *
 * **Alternar o SUBSTRATO.** Quem tira dois conceitos desta lista tira os dois
 * primeiros, e uma página de brandbook com dois blocos de texto sobre cor
 * chapada mostra duas variações de uma abordagem — que é justamente a queixa
 * que os arranjos vieram resolver, com outra roupa. Alternando, o segundo
 * conceito é fotográfico e não desenhado, e aí são duas abordagens de verdade.
 *
 * **Do mais garantido ao mais arriscado, DENTRO de cada substrato.** Cor sólida
 * tem contraste exato por construção; o véu tem alfa derivado para vencer o
 * pior pixel possível; a foto nua não promete nada — depende da foto. Por isso
 * `texto-sobre-imagem` é o último: ele é o único que pode reprovar por causa do
 * material, e não da conta.
 *
 * É nessa ordem que quem compõe deve tentar quando um arranjo REPROVA, porque
 * recompor não gasta crédito nenhum: o pixel já está em disco.
 */
export const ARRANJOS_EM_ORDEM: readonly ArranjoDaPeca[] = [
  'faixa-inferior',
  'veu-cheio',
  'tela-dividida',
  'texto-sobre-imagem',
];
