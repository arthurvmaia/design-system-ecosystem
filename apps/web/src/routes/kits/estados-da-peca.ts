import type { SegmentFidelity } from '@/lib/api';
import { CATEGORIAS_DE_PECA } from '@ds/shared/schemas';

/**
 * A tira de estados de uma peça: o que dá para mostrar lado a lado e o que fica
 * DECLARADO como não medido.
 *
 * A fórmula mostrava a peça em repouso e parava aí, e é justamente o repouso que
 * ninguém precisa ver: quem pergunta "como vai ficar" está perguntando o que
 * acontece ao passar o mouse, ao clicar, ao focar com o teclado. O insumo já
 * existia — a exploração grava cada estado e a lente da Galeria os reproduz um
 * de cada vez — e o que faltava era pôr os quadros juntos, que é a única
 * disposição em que a diferença entre dois estados se enxerga.
 *
 * A regra que este módulo existe para segurar: quadro só entra na tira quando a
 * captura MEDIU aquele estado. Um hover desenhado a partir de nada seria uma
 * invenção com cara de medida, e é ela que a pessoa levaria para o site achando
 * que viu. Peça sem medida nenhuma sai daqui com uma frase dizendo isso.
 *
 * O critério de "medido" é o mesmo da lente da Galeria, de propósito: hover vale
 * quando aparece nas interações ou no pipeline do segmento; os demais estados
 * são os que a exploração gravou em `fidelity.states`. Duas leituras diferentes
 * da mesma medição fariam a fórmula e a Galeria discordarem sobre a mesma peça.
 */

/** De onde sai o que o quadro mostra. */
export type FonteDoQuadro = 'repouso' | 'hover' | 'estado';

export type QuadroDeEstado = {
  chave: string;
  /** O nome do estado, como a captura o rotulou. */
  rotulo: string;
  /** O gatilho por extenso. Vazio no repouso, que não tem gatilho. */
  gatilho: string;
  fonte: FonteDoQuadro;
  /** O id do estado gravado — é por ele que a reprodução fixa o quadro. */
  estadoId: string | null;
  /** De onde vem o que está no quadro. Sempre presente: o quadro se explica. */
  nota: string;
};

/**
 * O rótulo de cada gatilho, em português.
 *
 * As palavras são as MESMAS de `ROTULO_TRIGGER` (`apps/server/src/routes/preview.ts`),
 * que é privado daquela rota. Enquanto o vocabulário não morar no `@ds/shared`,
 * repetir as palavras idênticas é o menor dos males: duas listas com palavras
 * diferentes fariam a mesma captura ser chamada de duas coisas em duas telas.
 */
export const ROTULO_DO_GATILHO: Record<string, string> = {
  initial: 'Inicial',
  hover: 'Passe o mouse',
  focus: 'Foco',
  click: 'Clique',
  scroll: 'Ao rolar',
  timer: 'Automático',
};

/**
 * Em que pé está a peça diante da medição.
 *
 * São três ausências diferentes e elas não podem virar uma frase só: peça sem
 * vínculo com o bloco de origem, captura que saiu do acervo e captura antiga
 * pedem coisas diferentes de quem lê.
 */
export type SituacaoDaPeca =
  | { tipo: 'sem-vinculo' }
  | { tipo: 'origem-ausente' }
  | { tipo: 'medida'; fidelity: SegmentFidelity | null | undefined };

export type TiraDeEstados = {
  quadros: QuadroDeEstado[];
  /** O que não deu para mostrar, por extenso. `null` quando não falta nada. */
  declaracao: string | null;
};

/**
 * O repouso está sempre na tira, e vem do arquivo que vai para o site — não do
 * bloco de origem. É a única forma de a comparação ser honesta: o que muda no
 * hover tem de mudar em cima do que vai ser entregue.
 */
const QUADRO_REPOUSO: QuadroDeEstado = {
  chave: 'repouso',
  rotulo: 'Em repouso',
  gatilho: '',
  fonte: 'repouso',
  estadoId: null,
  nota: 'o arquivo que vai para o site',
};

/** Hover medido: o mesmo critério que acende o botão "Ver hover" na Galeria. */
export const temHoverMedido = (f: SegmentFidelity | null | undefined): boolean =>
  f?.interactions?.some((i) => i.kind === 'hover') === true ||
  f?.pipeline?.some((p) => p.kind === 'hover') === true;

export const tiraDeEstados = (situacao: SituacaoDaPeca): TiraDeEstados => {
  if (situacao.tipo === 'sem-vinculo') {
    return {
      quadros: [QUADRO_REPOUSO],
      declaracao:
        'Sem estado medido: esta peça não guarda de qual bloco da captura ela saiu, e sem isso não tenho o que reproduzir.',
    };
  }
  if (situacao.tipo === 'origem-ausente') {
    return {
      quadros: [QUADRO_REPOUSO],
      declaracao:
        'Sem estado medido aqui: a captura de origem saiu do acervo. A peça continua inteira, o que se perdeu foi a gravação dos estados.',
    };
  }

  const f = situacao.fidelity;
  if (f === null || f === undefined) {
    return {
      quadros: [QUADRO_REPOUSO],
      declaracao:
        'Sem estado medido: esta peça veio de uma captura anterior à medição de estados. Extraia o site de novo e eu meço.',
    };
  }

  const quadros: QuadroDeEstado[] = [QUADRO_REPOUSO];
  if (temHoverMedido(f)) {
    quadros.push({
      chave: 'hover',
      rotulo: 'Ao passar o mouse',
      gatilho: ROTULO_DO_GATILHO.hover ?? 'hover',
      fonte: 'hover',
      estadoId: null,
      nota: 'o hover do próprio site, ligado num elemento de cada vez',
    });
  }
  for (const s of f.states ?? []) {
    const gatilho = ROTULO_DO_GATILHO[s.trigger] ?? s.trigger;
    quadros.push({
      chave: `estado-${s.id}`,
      // Estado sem rótulo é comum em captura antiga; o gatilho descreve melhor
      // do que um espaço em branco, e não inventa nome nenhum.
      rotulo: s.label.trim() === '' ? gatilho : s.label,
      gatilho,
      fonte: 'estado',
      estadoId: s.id,
      nota: 'como a página ficou no instante da interação',
    });
  }

  return {
    quadros,
    declaracao:
      quadros.length === 1
        ? 'Sem estado medido: nesta peça a captura não achou hover, foco nem clique que mudassem alguma coisa.'
        : null,
  };
};

/**
 * Qual peça abre a tira.
 *
 * As peças de interface (botão, campo, selo) são onde o estado é a informação —
 * uma dobra inteira não muda de cara ao passar o mouse, e abrir nela faria a
 * seção parecer quebrada. Sem nenhuma peça de interface no kit, abre a primeira:
 * mostrar a primeira é melhor do que abrir vazio.
 */
export const pecaDeAbertura = <T extends { category: string }>(pecas: readonly T[]): T | null =>
  pecas.find((p) => CATEGORIAS_DE_PECA.has(p.category)) ?? pecas[0] ?? null;
