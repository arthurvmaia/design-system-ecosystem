import type { SupportLevel } from './capture.js';
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

  // O corte por tempo explica UM canal, e não todos.
  //
  // O portão da comparação de pixel é literalmente a captura ter saído parcial
  // (`engine.ts`: `else if (tel.parcial)` pula a fase inteira), então ali a
  // frase é a causa. Nos outros três a causa é outra — não há resultado gravado
  // para este segmento —, e usar o corte como explicação para tudo seria
  // inventar um motivo plausível no lugar do verdadeiro. Um canal que mente com
  // confiança é pior que um canal calado.
  const semResultado = 'não há registro de conferência para esta peça';
  const naoRodouPixel = !temBundle
    ? semBundle
    : capturaParcial === true
      ? 'a captura foi cortada por tempo, e a comparação de pixel só roda em captura completa'
      : 'a comparação de pixel não rodou nesta captura';
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
