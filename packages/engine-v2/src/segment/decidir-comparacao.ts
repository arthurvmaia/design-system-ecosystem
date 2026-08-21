/**
 * A conferência de pixel deve rodar nesta captura?
 *
 * ## O defeito que esta decisão corrige
 *
 * A regra anterior era uma linha: captura parcial, comparação pulada. O
 * argumento parecia sólido, "conferir um resultado incompleto produz um número
 * que não significa nada", mas o acervo mostrou o que ele fazia na prática. Sete
 * capturas de sete saíram parciais, e por isso a comparação de pixel NUNCA
 * rodou: os 188 segmentos do acervo inteiro mostram o canal `pixel` como
 * `nao-rodou`. Uma verificação que nunca roda não é uma verificação cautelosa, é
 * ausência de verificação, e ela desaparece justamente quando a captura está
 * mais frágil, que é quando ela mais faria falta.
 *
 * Pior: na medição que motivou isto, a captura foi cortada com 196 dos 420
 * segundos ainda livres. O corte tinha sido da FASE de percurso, não do
 * processo. Havia tempo de sobra para conferir, e ninguém conferiu.
 *
 * ## A regra nova
 *
 * O corte só invalida a comparação quando atinge o que seria comparado. Explorar
 * menos estados interativos muda a cobertura de INTERAÇÃO; não muda se o bundle
 * compilado se parece com o print da dobra, que é a única pergunta que a
 * comparação de pixel responde. Então:
 *
 * - desligada: pular, e DIZER que estava desligada — a ausência tem de ser
 *   distinguível de "conferiu e não achou nada";
 * - cortou em `compilar` ou na própria `comparar`: pular, porque o que seria
 *   conferido não existe inteiro;
 * - qualquer outra fase: conferir, e declarar o alcance junto do resultado;
 * - sem tempo ou sem teto para um bundle sequer: pular, e dizer isso.
 *
 * A honestidade continua inteira, só muda de lugar: em vez de sumir com a
 * medição, o motor mede e diz sobre o que a medição fala.
 */

export type DecisaoDeComparacao =
  | { rodar: true; ressalva?: string }
  | { rodar: false; motivo: string };

export const PISO_PARA_COMPARAR_MS = 3_000;

export const decidirComparacao = (opts: {
  /** O usuário pediu verificação visual? */
  querVerificar: boolean;
  /** A captura foi cortada por orçamento? */
  parcial: boolean;
  /** Em que fase o corte aconteceu, quando houve corte. */
  faseCortada?: string;
  /** Teto reservado para a fase de comparação. */
  tetoMs: number;
  /** Quanto sobrou do orçamento total. */
  restanteMs: number;
  /** Nomes das fases cujo corte invalida o que seria conferido. */
  fasesQueInvalidam: readonly string[];
}): DecisaoDeComparacao => {
  const { querVerificar, parcial, faseCortada, tetoMs, restanteMs, fasesQueInvalidam } = opts;

  /**
   * Desligada TAMBÉM deixa rastro.
   *
   * Aqui havia silêncio, com o argumento "quem desligou sabe que desligou".
   * Ele confunde quem RODA o comando com quem LÊ o manifesto depois, e o
   * acervo mostrou o preço: 57 capturas de 57 com `visualComparisons: []` e
   * nenhuma linha explicando, porque `pnpm reextrair --todos` desliga a
   * verificação por PADRÃO em lote. Ninguém desligou nada — o padrão desligou
   * — e a ausência ficou indistinguível de "conferiu e não achou nada".
   *
   * A consequência não era estética: em `curadoria-escolha.ts`,
   * `comparacaoVisualOk === false` é condição de REPROVA, e sem comparação
   * nenhuma ela nunca disparou em peça alguma do acervo.
   */
  if (!querVerificar)
    return {
      rodar: false,
      motivo:
        'A comparação de pixel não rodou porque a verificação visual estava desligada nesta captura. Ela é o que confere se cada bundle se parece com o print da dobra; sem ela, "sem divergência" significa "ninguém olhou".',
    };

  if (parcial && faseCortada !== undefined && fasesQueInvalidam.includes(faseCortada)) {
    return {
      rodar: false,
      motivo: `A comparação de pixel não rodou: o corte por tempo aconteceu em "${faseCortada}", que é a fase que produz o que seria conferido. Conferir metade de um bundle diria mais sobre o corte do que sobre a peça.`,
    };
  }

  if (tetoMs < PISO_PARA_COMPARAR_MS) {
    return {
      rodar: false,
      motivo: `A comparação de pixel não rodou: o orçamento reservado para ela (${tetoMs} ms) não daria nem para conferir um bundle.`,
    };
  }

  if (restanteMs < PISO_PARA_COMPARAR_MS) {
    return {
      rodar: false,
      motivo: `A comparação de pixel não rodou: sobraram ${restanteMs} ms do orçamento total, e abrir um bundle custa mais que isso.`,
    };
  }

  if (parcial) {
    return {
      rodar: true,
      ressalva: `A captura foi cortada por tempo na fase "${faseCortada ?? 'desconhecida'}", e a comparação de pixel rodou mesmo assim, sobre os bundles que chegaram a ser compilados. Ela diz se cada peça ficou parecida com o print da dobra; ela não fala sobre o que a fase interrompida deixou de explorar.`,
    };
  }

  return { rodar: true };
};
