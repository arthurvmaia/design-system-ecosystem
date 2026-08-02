import { z } from 'zod';
import { ComponentCategory } from './segment.js';
import { FAMILIA_DA_CATEGORIA, type Familia, rotuloDaCategoria } from './taxonomia.js';

/**
 * As regras de mistura de um kit — a camada que faltava entre "lista de peças" e
 * "design system final".
 *
 * ## O problema
 *
 * O kit era uma lista ordenada: `kit_id`, `component_id`, `position`. Nada dizia
 * de onde cada coisa podia vir. Junte o botão de um site com o botão de outro e
 * o resultado é o que o Arthur descreveu: bagunça. E o `KitDesignSystem` sabia
 * DECLARAR a mistura (`tema: 'misto'`) sem saber resolvê-la, porque ninguém
 * havia escolhido quem manda.
 *
 * ## A regra, por família
 *
 * A taxonomia já dividia certo. Cada família ganha uma regra diferente, e o
 * motivo de cada uma é geométrico, não estético:
 *
 * | família      | regra                  | por quê |
 * |--------------|------------------------|---------|
 * | `fundamentos`| UMA origem (a base)    | duas escalas tipográficas não alinham |
 * | `pecas`      | uma origem POR CATEGORIA | todos os botões de um lugar |
 * | `dobras`     | livre                  | é o produto: hero de um, preços de outro |
 * | `efeitos`    | livre                  | o parallax de um sobre a seção de outro |
 *
 * A regra de `pecas` é a que o próprio Arthur formulou: *"o botão só poderia ter
 * 1 design system para os botões, não pode misturar vários, senão fica
 * bagunça"*.
 */

/** Como cada família se comporta na mistura. */
export const REGRA_DA_FAMILIA: Record<Familia, 'origem-unica' | 'origem-por-categoria' | 'livre'> =
  {
    fundamentos: 'origem-unica',
    pecas: 'origem-por-categoria',
    dobras: 'livre',
    efeitos: 'livre',
    // Sem família não há regra a impor: forçar uma seria inventar coerência
    // sobre algo que o app admite não ter classificado.
    'sem-familia': 'livre',
  };

/** Uma frase por regra, para a tela explicar sem manual. */
export const REGRA_EXPLICA: Record<(typeof REGRA_DA_FAMILIA)[Familia], string> = {
  'origem-unica': 'Vem de uma captura só. É a língua do site.',
  'origem-por-categoria': 'Cada tipo vem de uma captura só. Todos os botões do mesmo lugar.',
  livre: 'Pode vir de qualquer captura. É aqui que a mistura acontece.',
};

/** A regra que vale para uma categoria. */
export const regraDaCategoria = (categoria: string): (typeof REGRA_DA_FAMILIA)[Familia] => {
  const parsed = ComponentCategory.safeParse(categoria);
  if (!parsed.success) return 'livre';
  return REGRA_DA_FAMILIA[FAMILIA_DA_CATEGORIA[parsed.data]];
};

/**
 * Uma peça do kit, do ponto de vista da governança. O mínimo que a regra
 * precisa saber — não é o registro inteiro do componente.
 */
export type PecaParaRegra = {
  id: string;
  name: string;
  category: string;
  designSystemId: string | null;
};

/** O kit governado: quem é a base e qual origem manda em cada categoria. */
export const GovernancaDoKit = z.object({
  /**
   * A origem que dá o ritmo: espaçamento, layout, raio, sombra e movimento.
   * Nula = kit sem base escolhida, que é o estado de todo kit criado antes
   * desta camada. O app segue funcionando e diz que a base está em aberto.
   */
  origemBase: z.string().nullable().default(null),
  /**
   * `categoria → designSystemId`. Só faz sentido para categorias da família
   * `pecas`; o resto é livre por construção.
   */
  origemPorCategoria: z.record(z.string(), z.string()).default({}),
});
export type GovernancaDoKit = z.infer<typeof GovernancaDoKit>;

/** Uma violação: a peça que entrou contra a regra, e por quê. */
export type Violacao = {
  componentId: string;
  categoria: string;
  /** A origem que a regra manda usar nesta categoria. */
  origemEsperada: string;
  /** A origem que a peça tem. */
  origemDaPeca: string | null;
  /** A frase que a pessoa lê. */
  motivo: string;
};

/**
 * O que o kit tem de errado segundo as próprias regras.
 *
 * Devolve lista vazia quando está tudo certo. **Não corrige** e não escolhe por
 * ninguém: a função mede, e quem decide o que fazer com a medida é a rota (que
 * recusa) ou a tela (que mostra).
 *
 * A origem esperada de uma categoria vem de `governanca.origemPorCategoria`
 * quando o usuário escolheu, e senão da MAIORIA — a origem que mais contribui
 * naquela categoria. Assim um kit antigo, sem governança nenhuma, é medido
 * contra a regra que ele já quase cumpre, e o aviso aponta as poucas peças fora
 * em vez de reprovar o kit inteiro.
 */
export const violacoesDoKit = (
  pecas: readonly PecaParaRegra[],
  governanca: GovernancaDoKit,
): Violacao[] => {
  const violacoes: Violacao[] = [];
  const porCategoria = new Map<string, PecaParaRegra[]>();
  for (const p of pecas) {
    if (regraDaCategoria(p.category) !== 'origem-por-categoria') continue;
    const atual = porCategoria.get(p.category);
    if (atual) atual.push(p);
    else porCategoria.set(p.category, [p]);
  }

  for (const [categoria, lista] of porCategoria) {
    const escolhida = governanca.origemPorCategoria[categoria] ?? maioria(lista);
    if (escolhida === null) continue;
    for (const p of lista) {
      if (p.designSystemId === escolhida) continue;
      violacoes.push({
        componentId: p.id,
        categoria,
        origemEsperada: escolhida,
        origemDaPeca: p.designSystemId,
        motivo: `Neste kit, ${rotuloDaCategoria(categoria).toLowerCase()} vem de uma captura só, e "${p.name}" vem de outra.`,
      });
    }
  }
  return violacoes;
};

/** A origem que mais contribui numa lista. `null` quando há empate ou nada. */
const maioria = (lista: readonly PecaParaRegra[]): string | null => {
  const contagem = new Map<string, number>();
  for (const p of lista) {
    if (p.designSystemId === null) continue;
    contagem.set(p.designSystemId, (contagem.get(p.designSystemId) ?? 0) + 1);
  }
  const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const primeiro = ordenado[0];
  const segundo = ordenado[1];
  if (primeiro === undefined) return null;
  // Empate não elege ninguém: escolher por desempate arbitrário faria o app
  // reprovar metade das peças por uma decisão que ele mesmo inventou.
  if (segundo !== undefined && segundo[1] === primeiro[1]) return null;
  return primeiro[0];
};

/**
 * A origem-base sugerida: a que mais aparece entre as peças do kit.
 *
 * É sugestão, nunca imposição — o `origemBase` só muda quando o usuário escolhe.
 * Serve para a tela poder oferecer um padrão razoável em vez de um campo vazio.
 */
export const baseSugerida = (pecas: readonly PecaParaRegra[]): string | null => maioria(pecas);
