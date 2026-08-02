/**
 * A conta que decide o Confronto: quais origens disputam uma categoria.
 *
 * Separada do hook de propósito, e o motivo é prático: os módulos com teste
 * neste app não importam do alias `@/`, porque o runner do Node não resolve
 * alias de Vite. Toda lógica pura mora num `-core`, e o React fica do lado de
 * fora — é o padrão que `autosave-core`, `etapas-core` e `revisao-core` já
 * seguem aqui.
 */

/** Uma origem presente numa lista de peças, com quantas peças ela contribui. */
export type OrigemPresente = { id: string; quantas: number };

/** A chave de quem não tem origem registrada (componente de extração antiga). */
export const SEM_ORIGEM = 'sem-origem';

/**
 * As origens de uma lista de peças, da que mais contribui para a que menos.
 *
 * A ordem tem intenção: quem tem o vocabulário mais completo daquela categoria
 * aparece primeiro, porque é o candidato mais provável a governá-la. Empate
 * desempata por id, para a ordem não dançar entre renders.
 *
 * Peça sem origem NÃO é descartada. Descartá-la faria a soma das origens não
 * bater com o total de peças da categoria, e a tela mentiria sobre o tamanho do
 * que está sendo comparado.
 */
export const origensDe = <T extends { designSystemId: string | null }>(
  itens: readonly T[],
): OrigemPresente[] => {
  const contagem = new Map<string, number>();
  for (const i of itens) {
    const id = i.designSystemId ?? SEM_ORIGEM;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([id, quantas]) => ({ id, quantas }))
    .sort((a, b) => b.quantas - a.quantas || a.id.localeCompare(b.id));
};
