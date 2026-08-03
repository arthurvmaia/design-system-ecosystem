/**
 * O endereço da fórmula, num lugar só.
 *
 * `PADRAO` é o que o roteador registra; `rotaDaFormula` é o que os links montam.
 * As duas formas do mesmo caminho, digitadas em arquivos diferentes, divergem na
 * primeira renomeação — e o sintoma disso não é um erro: é um link que cai no
 * redirecionamento silencioso de rota desconhecida e leva a pessoa para o
 * início, como se ela tivesse clicado errado.
 *
 * Fica em módulo próprio (e não dentro da tela) porque a relação entre os dois
 * é testável sem renderizar React, e é justamente ela que precisa de teste.
 */

/** O padrão registrado em `App.tsx`. */
export const PADRAO_DA_ROTA_DA_FORMULA = '/design-systems/:kitId/formula';

/** O caminho de um kit específico, para links. */
export const rotaDaFormula = (kitId: string): string => `/design-systems/${kitId}/formula`;

/**
 * O caminho que o padrão produz para um kit — a ponte entre as duas formas.
 * Existe para o teste poder comparar as duas sem copiar o texto do caminho.
 */
export const aplicarPadrao = (kitId: string): string =>
  PADRAO_DA_ROTA_DA_FORMULA.replace(':kitId', kitId);
