import type { FamiliaDoSimbolo, PedidoDeMarca } from '@ds/shared';

/**
 * O PROMPT do símbolo, montado do briefing por regra e não por inspiração.
 *
 * ## Por que ele é determinístico
 *
 * Duas razões, e as duas custam dinheiro. A primeira: o prompt fica gravado no
 * resultado (M6), e uma marca que não se reproduz morre na primeira variação
 * pedida — "faz igual, só que sem o traço embaixo" vira outro desenho. A
 * segunda: cada tentativa custa 75 créditos, e um prompt que muda a cada
 * execução transforma "tentar de novo" em "começar de novo".
 *
 * ## O que ele exige do gerador, e por que não é gosto
 *
 * **Fundo liso de cor única, bem separado do símbolo.** Não é preferência
 * estética: é a condição que torna o recorte EXATO em vez de estimativa. O
 * `derivar-navegador.ts` lê a cor do fundo nas bordas e separa por distância de
 * cor — com fundo texturizado ou em degradê, ele não separa nada e a logo sai
 * com o retângulo em volta, defeito que M2 pega e que é invisível justamente
 * sobre branco, onde quase todo mundo abre um PNG.
 *
 * **Sem texto nenhum.** Modelo de imagem erra letra, e o nome da marca é a
 * única coisa aqui que não admite interpretação. Ele é desenhado depois, em
 * tipografia, onde a grafia é garantida.
 *
 * **Sem sombra, sem degradê, sem reflexo.** Todos criam meio-tom, e meio-tom é
 * o que impede a versão monocromática de ser silhueta (M3) — a versão que
 * sobrevive a bordado, a carimbo e a uma tinta só.
 */

const PEDIDO_DA_FAMILIA: Record<FamiliaDoSimbolo, string> = {
  abstrato: 'uma forma geométrica abstrata, que não representa nenhum objeto reconhecível',
  pictorico: 'um objeto do mundo real reduzido ao essencial, reconhecível de longe',
  monograma: 'as iniciais da marca transformadas em uma forma geométrica única',
  'decida-por-mim': 'uma forma simples e memorável, do tipo que couber melhor ao negócio',
};

/**
 * A família escolhida, quando o pedido delegou.
 *
 * Delegar é legítimo — é o que o cliente está pedindo —, mas a escolha vira
 * registro: ela entra no prompt gravado, então a próxima tentativa parte da
 * mesma decisão em vez de sortear outra.
 */
export const familiaEscolhida = (p: {
  readonly familia: FamiliaDoSimbolo;
  readonly nome: string;
}): { readonly familia: Exclude<FamiliaDoSimbolo, 'decida-por-mim'>; readonly motivo: string } => {
  if (p.familia !== 'decida-por-mim') return { familia: p.familia, motivo: 'o cliente escolheu' };
  // Nome curto vira monograma bem: uma ou duas letras têm forma. Acima disso a
  // inicial isolada não diz nada, e a forma abstrata carrega melhor.
  const palavras = p.nome.trim().split(/\s+/).length;
  return palavras <= 2
    ? {
        familia: 'monograma',
        motivo: `o nome tem ${palavras} palavra(s): as iniciais têm forma suficiente para virar símbolo`,
      }
    : {
        familia: 'abstrato',
        motivo: `o nome tem ${palavras} palavras: iniciais viram uma sopa de letras, e a forma abstrata carrega melhor`,
      };
};

export type PromptDoSimbolo = {
  readonly texto: string;
  readonly familia: Exclude<FamiliaDoSimbolo, 'decida-por-mim'>;
  readonly motivoDaFamilia: string;
};

export const promptDoSimbolo = (
  pedido: Pick<PedidoDeMarca, 'nome' | 'oQueFaz' | 'familia' | 'tom' | 'evitar'>,
  cor: string,
): PromptDoSimbolo => {
  const escolha = familiaEscolhida(pedido);
  const partes = [
    `Um símbolo de marca: ${PEDIDO_DA_FAMILIA[escolha.familia]}.`,
    `A marca se chama "${pedido.nome}" e ${pedido.oQueFaz.trim()}.`,
    pedido.tom.trim() === '' ? null : `O tom da marca: ${pedido.tom.trim()}.`,
    `O símbolo é desenhado em ${cor} sobre um fundo liso de cor única, clara e neutra, bem separado do símbolo — sem textura, sem degradê no fundo.`,
    'Formas sólidas e chapadas. Sem sombra, sem degradê, sem reflexo, sem brilho, sem efeito 3D.',
    'Sem nenhum texto, letra ou palavra na imagem, exceto se a forma pedida FOR as iniciais.',
    'O símbolo ocupa a parte central da imagem, inteiro, com folga em volta.',
    pedido.evitar.trim() === '' ? null : `Evitar: ${pedido.evitar.trim()}.`,
  ].filter((p): p is string => p !== null);

  return {
    texto: partes.join(' '),
    familia: escolha.familia,
    motivoDaFamilia: escolha.motivo,
  };
};

/**
 * A cor da marca, decidida.
 *
 * Diferente da peça criativa, escolher cor aqui é legítimo: é o que se está
 * pedindo. O que não pode é escolher em SILÊNCIO — M6 reprova a escolha do
 * Orbis sem motivo escrito ao lado.
 *
 * A escolha não é sorteio nem gosto: é a cor que o setor usa com mais
 * frequência, filtrada pela única exigência que se mede (ler sobre branco). Um
 * azul profundo é a resposta certa para a maioria dos negócios de serviço
 * exatamente por ser a mais previsível — e previsível é o que uma marca sem
 * direção declarada precisa.
 */
export const corDaMarca = (
  preferida: string | null,
): { readonly hex: string; readonly decidida: 'cliente' | 'orbis'; readonly motivo: string } =>
  preferida !== null
    ? { hex: preferida, decidida: 'cliente', motivo: '' }
    : {
        hex: '#0F4C81',
        decidida: 'orbis',
        motivo:
          'o pedido não trouxe cor. Escolhi um azul profundo: ele se lê sobre branco com folga (8,3:1), funciona em impressão de uma tinta e é a escolha mais previsível para quem ainda não tem direção declarada. Trocar depois é barato — as versões saem do mesmo símbolo.',
      };
