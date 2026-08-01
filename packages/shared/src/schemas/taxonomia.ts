import { ComponentCategory } from './segment.js';

/**
 * A taxonomia da Galeria: as 25 categorias organizadas em FAMÍLIAS.
 *
 * ## Por que famílias
 *
 * As categorias não são todas do mesmo tipo, e listá-las lado a lado como se
 * fossem irmãs é o que fazia a triagem perder o fio: `typography` é um
 * fundamento, `button` é uma peça que se combina, `interaction` é um efeito e
 * `hero` é uma dobra inteira de página. Quatro coisas diferentes no mesmo
 * seletor de 21 opções.
 *
 * A estrutura vem da forma canônica de um design system (fundamentos, peças,
 * layout, movimento) e as categorias caem nela sem sobra. **Nenhuma categoria é
 * criada ou removida aqui**: elas ganham um pai. Quem grava no banco continua
 * gravando `category`; a família é derivada na leitura.
 *
 * ## Por que isto mora no `@ds/shared`
 *
 * Porque a lista estava copiada à mão em quatro telas, cada uma com um
 * subconjunto diferente, e o efeito era medido: a Biblioteca conhecia 15 das 25
 * categorias, então um selo (`badge`) ou uma faixa de números (`stats`) reais do
 * acervo apareciam como "Outros" e sumiam do filtro. Uma lista que precisa
 * concordar em quatro lugares acaba discordando.
 */

export const FAMILIAS = ['fundamentos', 'pecas', 'dobras', 'efeitos', 'sem-familia'] as const;
export type Familia = (typeof FAMILIAS)[number];

export const FAMILIA_LABEL: Record<Familia, string> = {
  fundamentos: 'Fundamentos',
  pecas: 'Peças',
  dobras: 'Dobras',
  efeitos: 'Efeitos',
  'sem-familia': 'Sem classificar',
};

/** Uma linha do que cada família é, para a tela explicar sem manual. */
export const FAMILIA_EXPLICA: Record<Familia, string> = {
  fundamentos: 'A escala e o ritmo que valem no site inteiro',
  pecas: 'O que se combina para montar uma seção',
  dobras: 'Uma faixa inteira de página, do jeito que ela estava lá',
  efeitos: 'Movimento, fundo e camada',
  'sem-familia': 'O que não coube em nenhuma das outras',
};

/**
 * A família de cada categoria. O mapa é total sobre `ComponentCategory`: o
 * TypeScript recusa a compilação se uma categoria nova nascer sem família, que
 * é exatamente como as cinco últimas (`gallery`, `stats`, `logo-cloud`, `team`,
 * `timeline`) passaram despercebidas pelas telas.
 */
export const FAMILIA_DA_CATEGORIA: Record<ComponentCategory, Familia> = {
  typography: 'fundamentos',

  button: 'pecas',
  card: 'pecas',
  badge: 'pecas',
  input: 'pecas',
  accordion: 'pecas',
  nav: 'pecas',

  hero: 'dobras',
  header: 'dobras',
  footer: 'dobras',
  feature: 'dobras',
  pricing: 'dobras',
  testimonial: 'dobras',
  faq: 'dobras',
  cta: 'dobras',
  form: 'dobras',
  gallery: 'dobras',
  stats: 'dobras',
  'logo-cloud': 'dobras',
  team: 'dobras',
  timeline: 'dobras',

  interaction: 'efeitos',
  background: 'efeitos',
  overlay: 'efeitos',

  other: 'sem-familia',
};

/**
 * O nome de cada categoria em português de gente.
 *
 * Sem anglicismo onde existe palavra nossa: `feature` é "Recursos", `pricing` é
 * "Preços", `form` é "Formulários". `FAQ` e `CTA` ficam porque viraram palavra
 * em português e traduzir confundiria mais do que explica. `gallery` vira
 * "Galeria de imagens" para não colidir com o nome da tela.
 */
export const CATEGORIA_LABEL: Record<ComponentCategory, string> = {
  typography: 'Tipografia',

  button: 'Botões',
  card: 'Cards',
  badge: 'Selos',
  input: 'Campos',
  accordion: 'Acordeões',
  nav: 'Navegação',

  hero: 'Abertura',
  header: 'Cabeçalho',
  footer: 'Rodapé',
  feature: 'Recursos',
  pricing: 'Preços',
  testimonial: 'Depoimentos',
  faq: 'FAQ',
  cta: 'CTA',
  form: 'Formulários',
  gallery: 'Galeria de imagens',
  stats: 'Números',
  'logo-cloud': 'Logos de clientes',
  team: 'Equipe',
  timeline: 'Linha do tempo',

  interaction: 'Animações',
  background: 'Fundos',
  overlay: 'Camadas',

  other: 'Sem classificar',
};

/** Todas as categorias, agrupadas na ordem em que as famílias são exibidas. */
export const CATEGORIAS_POR_FAMILIA: Record<Familia, readonly ComponentCategory[]> = (() => {
  const mapa = Object.fromEntries(FAMILIAS.map((f) => [f, [] as ComponentCategory[]])) as Record<
    Familia,
    ComponentCategory[]
  >;
  for (const categoria of ComponentCategory.options) {
    mapa[FAMILIA_DA_CATEGORIA[categoria]].push(categoria);
  }
  return mapa;
})();

/**
 * A família de uma categoria vinda do banco.
 *
 * Aceita `string` de propósito: a coluna `category` é texto livre no SQLite, e
 * um acervo antigo (ou uma classificação que escapou do vocabulário) pode
 * trazer valor fora do enum. Nesse caso a peça cai em "Sem classificar", que é
 * a verdade, em vez de sumir da tela.
 */
export const familiaDe = (categoria: string): Familia =>
  FAMILIA_DA_CATEGORIA[categoria as ComponentCategory] ?? 'sem-familia';

/** O rótulo de uma categoria vinda do banco, com o mesmo cuidado. */
export const rotuloDaCategoria = (categoria: string): string =>
  CATEGORIA_LABEL[categoria as ComponentCategory] ?? categoria;
