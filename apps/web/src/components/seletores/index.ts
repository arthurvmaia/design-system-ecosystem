/**
 * Sistema de seletores próprio do app.
 *
 * Regra daqui em diante: NADA de `<select>` nativo visível em área
 * customizada — estes componentes cobrem os casos (simples, com busca,
 * múltiplo com chips/limite/principal, menu de ações) com tokens do editor,
 * teclado completo, ARIA correta e portal que funciona dentro do Modal.
 *
 * Nos SITES GERADOS vale outra regra (ver A3/A10): tokens do PROJETO com
 * progressive enhancement — nunca as cores do editor no site do cliente.
 */
export { Combobox } from './Combobox';
export { Flutuante } from './Flutuante';
export { type ItemDeMenu, MenuAcoes } from './MenuAcoes';
export { MultiSelect } from './MultiSelect';
export { Select } from './Select';
