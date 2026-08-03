import type { SlotDeMidia } from '@ds/shared/schemas';
import type { KitContratoResumo } from './api';

/**
 * O que uma seção aceita, o que ela só prefere, e o que ela recusa.
 *
 * ## Por que existe
 *
 * O dono disse, com estas palavras, que "nem todo vídeo e nem toda imagem vai
 * poder colocar na seção, dependendo dos componentes" — e a tela oferecia o
 * mesmo botão "enviar" em toda seção, sem dizer o que cabe. Uma barra de
 * navegação e uma abertura com vídeo de fundo tinham exatamente a mesma cara.
 *
 * ## A regra: recusa só o descasamento de TIPO
 *
 * Duas respostas, e a fronteira entre elas é o que o app SABE:
 *
 * - **Recusa** (`aceita: false`): vídeo numa seção cujos espaços são todos de
 *   imagem, e imagem numa seção cujos espaços são todos de vídeo. Aqui não há
 *   preferência em jogo: o espaço é um `<img>` (ou um `background-image` do CSS,
 *   que não toca vídeo nenhum) ou é um `<video>`, e o arquivo do outro tipo não
 *   ocupa aquele lugar. Deixar passar entrega uma seção quebrada que a pessoa
 *   só descobre depois de gerar o site inteiro.
 * - **Aviso** (`aceita: true` com `texto`): proporção diferente da do espaço
 *   original. O arquivo entra, e a frase diz o que o corte vai comer.
 *
 * ## Por que a recusa para nesse limite
 *
 * A versão anterior deste arquivo dizia "AVISA, NÃO BLOQUEIA" para tudo, e ela
 * continua certa sobre o que segue sendo aviso. Proporção é PREFERÊNCIA medida
 * no original, e o contrato descreve a peça de origem, que não é o limite do
 * que a pessoa quer fazer: uma foto quadrada num espaço panorâmico sai cortada,
 * e sair cortada pode ser exatamente o que se quer. Bloquear preferência é o
 * que faz ferramenta brigar com quem usa. Peso e dimensão o app nem mede, e
 * inventar régua sobre eles seria opinião disfarçada de medida.
 *
 * O descasamento de tipo não é gosto. É o único caso em que o app tem CERTEZA,
 * e por isso é o único que fecha a porta.
 *
 * Recusar sem explicar seria trocar um defeito por outro. Toda recusa daqui sai
 * com o motivo e a saída na mesma frase: mandar o outro tipo de arquivo, ou
 * soltar este nas mídias gerais, onde quem escolhe o lugar é a geração.
 */

export type TipoDeArquivo = 'image' | 'video';

/** O veredicto sobre um arquivo escolhido, antes de ele subir. */
export type AvaliacaoDeMidia = {
  /** `false` = o envio não acontece. Só o descasamento de tipo chega aqui. */
  aceita: boolean;
  /** Uma frase para a pessoa. Vazia quando não há nada a dizer. */
  texto: string;
  /** `true` quando o descompasso é grande o bastante para o site sair torto. */
  forte: boolean;
};

const NADA_A_DIZER: AvaliacaoDeMidia = { aceita: true, texto: '', forte: false };

/**
 * Um espaço é de vídeo, ou é de imagem parada. Tipo que este código não conhece
 * (valor novo do schema) conta como espaço de imagem, a mesma conta de
 * `contarEspacos` — e é a degradação segura: um tipo desconhecido nunca vira
 * recusa de imagem, e a recusa de vídeo continua exigindo que NENHUM espaço da
 * seção seja de vídeo.
 */
const ehEspacoDeVideo = (m: { tipo: string }): boolean => m.tipo === 'video';

const combina = (m: { tipo: string }, tipo: TipoDeArquivo): boolean =>
  tipo === 'video' ? ehEspacoDeVideo(m) : !ehEspacoDeVideo(m);

/**
 * O que a seção aceita, em uma frase curta. Vazia quando não há contrato.
 *
 * Tudo que não é vídeo conta como imagem, fundo de CSS e ícone inclusive. Não é
 * detalhe de redação: a recusa usa essa mesma fronteira, e uma seção cujo único
 * espaço fosse um `background-image` ficava calada nesta linha e recusava o
 * vídeo depois. Recusa sem aviso prévio é a ferramenta brigando com quem usa.
 */
export const oQueCabe = (contratos: readonly KitContratoResumo[]): string => {
  const midias = contratos.flatMap((c) => c.midias);
  if (midias.length === 0) return '';
  const videos = midias.filter(ehEspacoDeVideo).length;
  const imagens = midias.length - videos;
  const partes: string[] = [];
  if (imagens > 0) partes.push(`${imagens} ${imagens === 1 ? 'imagem' : 'imagens'}`);
  if (videos > 0) partes.push(`${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}`);
  if (partes.length === 0) return '';
  return `espera ${partes.join(' e ')}`;
};

/**
 * Folga aceita entre a proporção do arquivo e a do espaço, medida como a maior
 * sobre a menor.
 *
 * 20% deixa passar um 3:2 num espaço 16:9 (18% de diferença, uma faixa fina de
 * corte que ninguém nota) e pega um 4:3 no mesmo espaço (33%, um quarto da
 * altura some). O número é escolha, não medida — e é justamente por ser escolha
 * que ele só avisa.
 */
const TOLERANCIA_DE_PROPORCAO = 0.2;

/** Distância entre duas proporções, em fração: 0 = idênticas, 0.33 = um terço. */
const distancia = (a: number, b: number): number => Math.max(a, b) / Math.min(a, b) - 1;

const proporcaoValida = (p: number | undefined): p is number =>
  typeof p === 'number' && Number.isFinite(p) && p > 0;

/**
 * O arquivo cabe na proporção do espaço? Sempre AVISO, nunca recusa.
 *
 * Compara com o espaço MAIS PARECIDO da seção: onde há vários, basta um servir
 * para o arquivo ter onde entrar inteiro, e avisar por causa dos outros seria
 * cobrar da pessoa um problema que ela não tem.
 *
 * Silêncio quando não há o que comparar: arquivo que o navegador não mediu, ou
 * espaço cujo original não declarou proporção. Aviso baseado em chute é pior
 * que aviso nenhum.
 */
const avaliarProporcao = (
  proporcao: number | undefined,
  compativeis: readonly SlotDeMidia[],
): AvaliacaoDeMidia => {
  if (!proporcaoValida(proporcao)) return NADA_A_DIZER;
  const alvos = compativeis.map((m) => m.exibicao?.proporcao).filter(proporcaoValida);
  if (alvos.length === 0) return NADA_A_DIZER;

  const alvo = alvos.reduce((melhor, p) =>
    distancia(p, proporcao) < distancia(melhor, proporcao) ? p : melhor,
  );
  if (distancia(alvo, proporcao) <= TOLERANCIA_DE_PROPORCAO) return NADA_A_DIZER;

  // Com `object-fit: cover`, que é o que a origem usa, o arquivo é esticado até
  // cobrir a caixa: o que sobra é cortado no eixo em que ele é mais generoso.
  const maisLargo = proporcao > alvo;
  const corte = maisLargo ? 'as laterais' : 'o topo e o pé';

  // Orientações opostas (um em pé, o outro deitado): é o caso em que o corte
  // não tira uma borda, tira quase tudo e sobra a faixa do meio.
  if ((proporcao - 1) * (alvo - 1) < 0) {
    const arquivoEmPe = proporcao < 1;
    return {
      aceita: true,
      texto: `Seu arquivo está ${arquivoEmPe ? 'em pé' : 'deitado'} e o espaço desta seção está ${arquivoEmPe ? 'deitado' : 'em pé'}. Ele entra assim mesmo, e o corte tira ${corte} até sobrar só o meio.`,
      forte: true,
    };
  }

  return {
    aceita: true,
    texto: `Seu arquivo é ${maisLargo ? 'mais largo' : 'mais alto'} que o espaço desta seção. Ele entra assim mesmo, e o corte tira ${corte}.`,
    forte: false,
  };
};

const recusar = (tipo: TipoDeArquivo): AvaliacaoDeMidia =>
  tipo === 'video'
    ? {
        aceita: false,
        texto:
          'Os espaços desta seção são todos de imagem parada, então o vídeo não teria onde tocar. Mande uma imagem para cá, ou solte o vídeo nas mídias gerais que eu escolho onde ele entra.',
        forte: true,
      }
    : {
        aceita: false,
        texto:
          'Os espaços desta seção são todos de vídeo, e uma imagem parada não ocupa esse lugar. Mande um vídeo para cá, ou solte a imagem nas mídias gerais que eu escolho onde ela entra.',
        forte: true,
      };

/**
 * O arquivo escolhido pode entrar nesta seção?
 *
 * A ordem é a das certezas: primeiro o que o app sabe (o tipo do espaço, que
 * recusa), depois o que ele prefere (a proporção, que avisa). Seção sem
 * contrato legível não afirma nada — é o caso que a regra antiga usava para
 * zerar a etapa inteira, e silêncio aqui continua sendo o certo.
 */
export const avaliarMidia = (opts: {
  tipo: TipoDeArquivo;
  /** largura/altura do arquivo, quando o navegador conseguiu ler. */
  proporcao?: number;
  contratos: readonly KitContratoResumo[];
}): AvaliacaoDeMidia => {
  const midias = opts.contratos.flatMap((c) => c.midias);
  if (midias.length === 0) return NADA_A_DIZER;

  const compativeis = midias.filter((m) => combina(m, opts.tipo));
  if (compativeis.length === 0) return recusar(opts.tipo);

  return avaliarProporcao(opts.proporcao, compativeis);
};
