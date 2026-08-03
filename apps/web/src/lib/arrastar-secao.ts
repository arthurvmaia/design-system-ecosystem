import type { SecaoDoSite } from '@ds/shared/schemas';
import { type PecaDoKit, separarFundos } from './estrutura-checagens.js';

/**
 * Soltar uma seção sobre outra, na árvore da etapa Estrutura.
 *
 * ## Por que existe
 *
 * A ordem das seções só se mudava por seta, um passo por clique. Mandar a última
 * seção de uma página de oito para o topo custava sete cliques, e a cada clique
 * a lista rolava sozinha — que é o gesto que faz a pessoa desistir de reordenar
 * e aceitar a sugestão do app. As setas CONTINUAM: elas são o caminho de teclado
 * e o único que funciona sem mouse. O arrasto é o atalho por cima delas.
 *
 * ## A regra do movimento
 *
 * A seção arrastada ASSUME A POSIÇÃO da seção sobre a qual foi solta, e a de
 * baixo empurra. É a leitura direta do gesto ("põe esta aqui"), e vale nos dois
 * sentidos: arrastar a última para cima da segunda deixa a última em segundo, e
 * arrastar a primeira para cima da terceira deixa a primeira em terceiro.
 *
 * ## O detalhe das seções escondidas
 *
 * A lista da tela é a das seções VISÍVEIS: seção que existe só para hospedar uma
 * peça de fundo não aparece nela (o fundo tem bloco próprio). Os índices do
 * arrasto são os da tela, então o cálculo acontece sobre as visíveis e as
 * hospedeiras vão para o fim — a posição delas não significa nada, o gerador
 * tira o fundo do fluxo de qualquer jeito. É o mesmo contrato de
 * `moverSecaoVisivel`, e ele mora aqui de novo em vez de ser reaproveitado
 * porque aquele anda um passo e este vai a uma posição.
 */
export const soltarSecaoSobre = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly PecaDoKit[],
  arrastadaId: string,
  alvoId: string,
): SecaoDoSite[] => {
  const { visiveis } = separarFundos(secoes, componentes);
  const de = visiveis.findIndex((s) => s.id === arrastadaId);
  const para = visiveis.findIndex((s) => s.id === alvoId);
  // Movimento nulo (soltar sobre si mesma, ou sobre algo que não está na lista)
  // devolve a ordem como está: reordenar as escondidas aqui só dispararia
  // autosave à toa, e um salvamento sem mudança confunde quem está olhando.
  if (de < 0 || para < 0 || de === para) return [...secoes];

  const lista = [...visiveis];
  const [movida] = lista.splice(de, 1);
  if (movida === undefined) return [...secoes];
  lista.splice(para, 0, movida);

  const idsVisiveis = new Set(visiveis.map((s) => s.id));
  return [...lista, ...secoes.filter((s) => !idsVisiveis.has(s.id))];
};
