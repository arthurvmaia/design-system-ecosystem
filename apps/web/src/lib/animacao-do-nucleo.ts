/**
 * Qual animação o núcleo do Orbis recebe.
 *
 * Mora fora do componente de propósito. A regra que ela guarda ("o Orbis nunca
 * fica parado") já foi quebrada uma vez, e uma regra que não tem teste é uma
 * regra que volta a quebrar. Aqui ela é uma função pura, sem React, sem DOM e
 * sem alias de caminho, então a suíte da raiz a alcança.
 *
 * Nunca devolve "sem animação" por engano: o único `null` é o da marca, que traz
 * a própria animação e diz isso explicitamente.
 */
export const classeDaAnimacao = (opts: {
  /** Trabalhando: gira em 1,4 s. Sem isto, respira em 3,2 s. */
  girando?: boolean;
  /**
   * O chamador traz a própria animação no `className`. Um caso só: a marca,
   * onde `.ds-marca-orbe` já gira em 26 s dentro do seu anel. Sem esta saída,
   * duas declarações de `animation` cairiam no mesmo elemento e quem venceria
   * seria a ordem da folha de estilo, que é o tipo de acerto que quebra sozinho
   * no dia em que alguém reorganizar o CSS.
   */
  animacaoPropria?: boolean;
}): string | null => {
  if (opts.animacaoPropria === true) return null;
  return opts.girando === true ? 'ds-nucleo-gira' : 'ds-nucleo-pulsa';
};
