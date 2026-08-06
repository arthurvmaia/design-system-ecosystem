import type { SupportLevel } from './capture.js';
import type { Confidence } from './interaction-support.js';
import type { ResultadoValidacaoSegmento } from './segment.js';

/**
 * O canal ÚNICO de veredito: o que foi conferido nesta peça, por quem, e com
 * que resultado.
 *
 * ## O problema que isto resolve
 *
 * A medição existia, rodava e era descartada na leitura. O `validation.json` do
 * acervo guarda o resultado de cada conferência em navegador — inclusive as
 * reprovações —, mas quem lê os resultados só sabia tratar dois tipos:
 * `interacao` e `scroll`. Um resultado de `capsula` não casava com nada: não
 * virava limitação, não rebaixava selo, não pintava nada. A peça reprovada
 * chegava à tela indistinguível de uma aprovada.
 *
 * O canal aqui é chaveado por SEGMENTO, e não por tipo de interação, que era a
 * chave errada — é por isso que veredito de peça inteira não tinha onde pousar.
 *
 * ## Por que `motivo` é obrigatório, até em `passou`
 *
 * Porque um canal sem frase é indistinguível de um canal que ninguém rodou, e
 * essa confusão é exatamente o defeito que a Galeria inteira foi consertada
 * para parar de cometer. "Passou" sem motivo não diz se passou com folga, se
 * passou raspando, ou se o teste era fraco.
 *
 * ## `nao-rodou` é resultado, não ausência
 *
 * O estado mais importante dos três. Sem ele, quem não foi medido some, e sumir
 * lê como aprovado.
 */

export type CanalDeVeredito = 'pixel' | 'navegador' | 'scroll' | 'interacao';

export type EstadoDeVeredito = 'passou' | 'falhou' | 'nao-rodou';

export type Veredito = {
  canal: CanalDeVeredito;
  estado: EstadoDeVeredito;
  /** Por que este é o estado. Obrigatório, inclusive em `passou`. */
  motivo: string;
  /** A diferença medida, quando o canal mede número (fração 0..1). */
  delta?: number;
  limiar?: number;
};

export const ROTULO_DO_CANAL: Record<CanalDeVeredito, string> = {
  pixel: 'Comparação com o print',
  navegador: 'Abri num navegador',
  scroll: 'Rolei a página',
  interacao: 'Passei o mouse e cliquei',
};

/** Os tipos de resultado que são conferência da PEÇA INTEIRA em navegador. */
const DE_NAVEGADOR = new Set(['capsula', 'referencia-visual']);

/**
 * Os vereditos de um segmento, um por canal, sempre com os quatro presentes.
 *
 * Canal que não rodou entra como `nao-rodou` com o motivo do que impediu — é a
 * diferença entre "conferi e está bom" e "ninguém conferiu", que era justamente
 * a distinção que a tela não fazia.
 */
export const vereditosDoSegmento = (opts: {
  resultados: readonly ResultadoValidacaoSegmento[];
  /** A conferência de pixel do manifesto, quando a captura conseguiu atribuir. */
  pixel?: { delta: number; limiar: number; passou: boolean };
  /** O segmento tem bundle? Sem bundle, os canais de navegador não se aplicam. */
  temBundle: boolean;
  /** A captura foi cortada por tempo? É o motivo mais comum de não ter rodado. */
  capturaParcial?: boolean;
}): Veredito[] => {
  const { resultados, pixel, temBundle, capturaParcial } = opts;
  const semBundle = 'esta peça não tem pacote próprio, então não havia o que abrir';

  // A comparação de pixel RODA mesmo em captura parcial (decidir-comparacao.ts
  // mudou isso), então "só roda em captura completa" virou mentira e foi
  // removida daqui. O que este estado significa hoje é: nenhum resultado foi
  // ATRIBUÍDO a esta peça — ou ela ficou sem print da dobra, ou o item foi
  // pulado pelo corte de tempo, ou a captura é antiga e gravou as comparações
  // sem dono. O corte por tempo entra como contexto quando existe, porque é a
  // causa mais comum de item pulado; afirmar mais que isso seria inventar.
  const semResultado = 'não há registro de conferência para esta peça';
  const naoRodouPixel = !temBundle
    ? semBundle
    : capturaParcial === true
      ? 'não há resultado de comparação atribuído a esta peça: a captura foi cortada por tempo, e item pulado pelo corte não deixa registro'
      : 'não há resultado de comparação de pixel atribuído a esta peça';
  const naoRodou = temBundle ? semResultado : semBundle;

  const doTipo = (aceita: (kind: string) => boolean): ResultadoValidacaoSegmento[] =>
    resultados.filter((r) => aceita(r.kind));

  const daLista = (
    canal: CanalDeVeredito,
    lista: readonly ResultadoValidacaoSegmento[],
    comoPassou: string,
    comoFalhou: string,
  ): Veredito => {
    if (lista.length === 0) return { canal, estado: 'nao-rodou', motivo: naoRodou };
    const falhou = lista.find((r) => !r.ok);
    if (falhou !== undefined) {
      // O `detail` do validador quando ele existe; a frase geral quando não. O
      // validador nem sempre escreve motivo, e um veredito sem frase seria o
      // mesmo silêncio que este canal existe para acabar.
      const detalhe = (falhou.detail ?? '').trim();
      return { canal, estado: 'falhou', motivo: detalhe === '' ? comoFalhou : detalhe };
    }
    return { canal, estado: 'passou', motivo: comoPassou };
  };

  return [
    pixel === undefined
      ? { canal: 'pixel', estado: 'nao-rodou', motivo: naoRodouPixel }
      : {
          canal: 'pixel',
          estado: pixel.passou ? 'passou' : 'falhou',
          motivo: pixel.passou
            ? 'o pacote desenhou o mesmo que o print da captura, dentro do limiar'
            : 'o pacote desenhou diferente do print da captura',
          delta: pixel.delta,
          limiar: pixel.limiar,
        },
    daLista(
      'navegador',
      doTipo((k) => DE_NAVEGADOR.has(k)),
      'abri o pacote sozinho e ele apareceu como devia',
      'abri o pacote sozinho e o resultado não bateu com a captura',
    ),
    daLista(
      'scroll',
      doTipo((k) => k === 'scroll'),
      'rolei a página e o efeito aconteceu',
      'rolei a página e o efeito não aconteceu',
    ),
    daLista(
      'interacao',
      doTipo((k) => !DE_NAVEGADOR.has(k) && k !== 'scroll'),
      'reproduzi as interações e elas responderam',
      'reproduzi as interações e alguma não respondeu',
    ),
  ];
};

/**
 * O selo depois dos vereditos.
 *
 * Reprovar na conferência em navegador rebaixa para `visual`: a peça continua
 * servindo como referência do que a origem parecia, e deixa de prometer que
 * roda igual. É o mesmo clamp que o scroll já fazia — o que faltava era o canal
 * de navegador ter onde pousar.
 *
 * Rebaixa só para BAIXO. Um veredito bom não promove nada: promover por
 * conferência parcial é como a ausência de medição virou aprovação.
 */
export const suporteAposVereditos = (
  atual: SupportLevel,
  vereditos: readonly Veredito[],
): SupportLevel => {
  const reprovouNoNavegador = vereditos.some(
    (v) => v.canal === 'navegador' && v.estado === 'falhou',
  );
  if (!reprovouNoNavegador) return atual;
  return atual === 'nao-suportado' ? atual : 'visual';
};

/**
 * A confiança depois dos vereditos — o mesmo padrão do selo, aplicado ao campo
 * que faltava.
 *
 * O defeito medido: `confidence` era uma soma de tipos de sinal COLETADO, e
 * coleta é monotônica — quanto mais o motor mede, maior a nota, mesmo quando o
 * que ele mediu foi uma falha. Resultado no acervo: "alta" em 90 de 92
 * segmentos, inclusive numa peça cujo bundle divergiu 100% do print. Um campo
 * que quase nunca varia não carrega informação.
 *
 * Aqui a verificação REBAIXA, e só rebaixa:
 * - captura parcial segura em `media` (o que não foi explorado não sustenta
 *   "alta");
 * - qualquer canal reprovado segura em `media`;
 * - dois ou mais canais reprovados, ou o pixel reprovado com metade dos pixels
 *   diferentes, seguram em `baixa`.
 *
 * Nunca promove. Promover por conferência é como a ausência de medição virou
 * aprovação — o defeito que este arquivo inteiro existe para não repetir.
 */
export const confiancaAposVereditos = (
  atual: Confidence,
  vereditos: readonly Veredito[],
  opts: { capturaParcial?: boolean } = {},
): Confidence => {
  const ORDEM: Confidence[] = ['nenhuma', 'baixa', 'media', 'alta'];
  const menor = (a: Confidence, b: Confidence): Confidence =>
    ORDEM.indexOf(a) <= ORDEM.indexOf(b) ? a : b;

  let teto: Confidence = 'alta';
  if (opts.capturaParcial === true) teto = menor(teto, 'media');

  const falhas = vereditos.filter((v) => v.estado === 'falhou');
  if (falhas.length >= 1) teto = menor(teto, 'media');

  const pixelMuitoLonge = falhas.some(
    (v) => v.canal === 'pixel' && v.delta !== undefined && v.delta >= 0.5,
  );
  if (falhas.length >= 2 || pixelMuitoLonge) teto = menor(teto, 'baixa');

  return menor(atual, teto);
};
