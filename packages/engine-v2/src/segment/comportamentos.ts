import type { ScrollBehavior, StructuralNode } from '@ds/shared';

/**
 * Comportamentos como COMPONENTE.
 *
 * O jeito de um site se comportar é parte do design system dele, e muitas vezes
 * é a parte que a pessoa quer levar: "quero que meus cards apareçam assim
 * quando eu rolo", "quero esse hover". Até aqui isso existia só como *dimensão
 * de fidelidade* de uma dobra, ou seja, uma etiqueta. Dava para ver que o
 * comportamento foi medido, não dava para escolher e reaproveitar.
 *
 * Este passe transforma o que a captura já mede em itens próprios da Galeria,
 * agrupados por FAMÍLIA: o que interessa não é "o card 3 revela ao rolar", e sim
 * "neste site as coisas revelam ao rolar, assim". Por isso um comportamento que
 * se repete vira um exemplar com contagem, do mesmo jeito que uma peça repetida.
 */

/** Famílias que valem como componente, com o nome que a pessoa lê. */
const FAMILIA: Record<string, { nome: string; explicacao: string }> = {
  reveal: {
    nome: 'Revelar ao rolar',
    explicacao: 'Os elementos aparecem conforme a página desce, em vez de já estarem lá.',
  },
  'class-toggle': {
    nome: 'Revelar ao rolar',
    explicacao: 'Os elementos aparecem conforme a página desce, em vez de já estarem lá.',
  },
  'progress-opacity': {
    nome: 'Aparecer conforme rola',
    explicacao: 'A opacidade acompanha o quanto a página já desceu.',
  },
  parallax: {
    nome: 'Parallax ao rolar',
    explicacao: 'As camadas andam em velocidades diferentes e criam profundidade.',
  },
  sticky: {
    nome: 'Fixar ao rolar',
    explicacao: 'O elemento gruda na tela enquanto a seção passa por baixo.',
  },
  'progress-transform': {
    nome: 'Transformar conforme rola',
    explicacao: 'A posição ou a escala acompanham o quanto a página já desceu.',
  },
};

/**
 * `sticky` de camada fixa não é comportamento reaproveitável: é o fundo da
 * página, que já vira componente próprio em `camadas-de-pagina.ts`. Sem este
 * corte, todo site entregaria um "Fixar ao rolar" que é o mesmo canvas de fundo.
 */
const ehCamadaDeFundo = (b: ScrollBehavior): boolean =>
  b.kind === 'sticky' && b.target.classes.some((c) => c === 'fixed' || c.startsWith('-z-'));

export type ComportamentoCandidato = {
  /** Família (a chave de `FAMILIA`), para nomear e agrupar. */
  familia: string;
  nome: string;
  explicacao: string;
  /** Ids dos comportamentos medidos que compõem este item. */
  scrollIds: string[];
  /** Hashes dos elementos alvo, quando deu para resolver. */
  hashes: string[];
  /** Quantos alvos distintos têm este comportamento. */
  quantidade: number;
};

/** Resolve o alvo de um comportamento (id/classes) para um nó medido. */
const alvoDe = (b: ScrollBehavior, nos: readonly StructuralNode[]): StructuralNode | undefined => {
  const id = b.target.id;
  if (id !== null && id.length > 0) {
    const porId = nos.find((n) => n.fingerprint.id === id);
    if (porId !== undefined) return porId;
  }
  const classes = b.target.classes;
  if (classes.length === 0) return undefined;
  // Sem id, casa pelo conjunto de classes estáveis. Exige que TODAS as classes
  // do alvo estejam no nó: casar por interseção parcial pegaria o elemento
  // errado em site que usa utilitário (metade dos nós tem `relative`).
  return nos.find(
    (n) => n.pageBox !== undefined && classes.every((c) => n.fingerprint.stableClasses.includes(c)),
  );
};

/**
 * Agrupa os comportamentos medidos nas famílias que viram componente.
 *
 * Puro: recebe a medição, devolve a decisão. Um comportamento sem alvo
 * resolvível ainda conta para a contagem da família (ele foi medido), mas não
 * contribui com HTML — quem monta o segmento decide o que fazer com isso.
 */
export const escolherComportamentos = (opts: {
  scroll: readonly ScrollBehavior[];
  nos: readonly StructuralNode[];
  /** Teto de alvos por família, para o item não virar um despejo. */
  maxAlvosPorFamilia?: number;
}): ComportamentoCandidato[] => {
  const { scroll, nos } = opts;
  const teto = opts.maxAlvosPorFamilia ?? 4;

  const porFamilia = new Map<string, { ids: string[]; hashes: string[] }>();
  for (const b of scroll) {
    const familia = FAMILIA[b.kind];
    if (familia === undefined) continue;
    if (ehCamadaDeFundo(b)) continue;
    const chave = familia.nome;
    const atual = porFamilia.get(chave) ?? { ids: [], hashes: [] };
    atual.ids.push(b.id);
    const no = alvoDe(b, nos);
    const hash = no?.fingerprint.hash;
    if (hash !== undefined && !atual.hashes.includes(hash) && atual.hashes.length < teto) {
      atual.hashes.push(hash);
    }
    porFamilia.set(chave, atual);
  }

  const saida: ComportamentoCandidato[] = [];
  for (const [nome, dados] of porFamilia) {
    // O item só existe se houver ao menos um alvo com elemento: sem elemento
    // não há o que mostrar, e um card que não mostra nada não é componente.
    if (dados.hashes.length === 0) continue;
    const entrada = Object.entries(FAMILIA).find(([, v]) => v.nome === nome);
    saida.push({
      familia: entrada?.[0] ?? 'reveal',
      nome: dados.ids.length >= 2 ? `${nome} (×${dados.ids.length})` : nome,
      explicacao: entrada?.[1].explicacao ?? '',
      scrollIds: dados.ids,
      hashes: dados.hashes,
      quantidade: dados.ids.length,
    });
  }
  return saida;
};
