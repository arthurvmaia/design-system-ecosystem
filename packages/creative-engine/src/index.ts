/**
 * O Motor Criativo.
 *
 * Nesta fase ele ainda não produz nada: entrega o CATÁLOGO (que preset vira que
 * identificador, em cada transporte) e a TABELA DE PREÇO medida. São as duas
 * peças que precisam existir antes de qualquer chamada paga, porque são elas
 * que impedem os dois erros silenciosos — pedir o modelo errado e gastar sem
 * saber quanto.
 */
export * from './catalogo/presets.js';
export * from './precos/tabela.js';
export * from './razao.js';
export * from './compor.js';
export * from './fonte.js';
export * from './marca/derivar.js';
export * from './marca/derivar-navegador.js';
export * from './marca/medir.js';
export * from './marca/conferir.js';
export * from './marca/prompt.js';
export * from './marca/ico.js';
export * from './marca/pacote-navegador.js';
export * from './marca/pacote.js';
export * from './marca/apresentacao-html.js';
export * from './marca/apresentacao.js';
