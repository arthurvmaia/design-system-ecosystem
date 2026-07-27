import { z } from 'zod';

/**
 * Contrato de esqueleto, slots e tokens de um componente — o de-para que
 * separa o que É do componente (estrutura, layout, animação, comportamento)
 * do que é SUBSTITUÍVEL pela identidade do usuário (texto, mídia, logo, link,
 * cor, fonte).
 *
 * É METADADO DERIVADO E ADITIVO: nasce da leitura do bundle (HTML fiel + CSS
 * dividido + manifest) e NUNCA reescreve o bundle. A Galeria continua mostrando
 * o original; o contrato existe para a geração aplicar a IDV do usuário por
 * cima do esqueleto sem replace cego de string.
 *
 * Toda medida aqui vem do ORIGINAL (comprimento do texto, contagem de itens,
 * propriedades de exibição da mídia) — são a régua para o conteúdo novo caber
 * no layout sem quebrá-lo. `textoOriginal`/URLs originais ficam no contrato
 * SÓ como referência de derivação e preview; a regra de nunca vazar identidade
 * da origem para o site final é do GERADOR, e é testada lá.
 */

/**
 * Versão do contrato. Sobe quando a forma de derivar muda de um jeito que
 * invalida contratos gravados — o leitor re-deriva o que estiver aquém.
 */
export const CONTRACT_VERSION = 1;

/** Papel de um slot de texto — decide as regras editoriais aplicáveis. */
export const PapelDeTexto = z.enum([
  'titulo',
  'subtitulo',
  'paragrafo',
  'item',
  'citacao',
  'rotulo-cta',
  'rotulo',
  'eyebrow',
]);
export type PapelDeTexto = z.infer<typeof PapelDeTexto>;

/**
 * Um slot de texto substituível. O `seletor` é ESTRUTURAL (nth-child a partir
 * da raiz do componente) e determinístico: a mesma marcação produz sempre o
 * mesmo seletor — é como a geração aplica conteúdo por DOM, nunca por replace.
 */
export const SlotDeTexto = z.object({
  id: z.string(),
  seletor: z.string(),
  papel: PapelDeTexto,
  /** Texto do original (na língua do site; referência de derivação/preview). */
  textoOriginal: z.string(),
  /** Comprimento medido do original, em caracteres. */
  comprimento: z.number().int().nonnegative(),
  /**
   * Máximo sugerido para o conteúdo novo (derivado do original + folga) — o
   * layout foi desenhado para essa ordem de grandeza.
   */
  maxSugerido: z.number().int().positive(),
});
export type SlotDeTexto = z.infer<typeof SlotDeTexto>;

export const TipoDeMidia = z.enum(['imagem', 'video', 'background-image', 'icone']);
export type TipoDeMidia = z.infer<typeof TipoDeMidia>;

/** Propriedades de EXIBIÇÃO do original — o conteúdo novo herda o jeito. */
export const ExibicaoDeMidia = z.object({
  objectFit: z.string().optional(),
  /** Proporção aproximada (largura/altura) quando mensurável. */
  proporcao: z.number().positive().optional(),
  autoplay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
  controls: z.boolean().optional(),
  /** URL do poster original, quando vídeo com poster. */
  posterUrl: z.string().optional(),
  /** O original tem overlay por cima (gradiente/cor no mesmo background). */
  overlay: z.boolean().optional(),
});
export type ExibicaoDeMidia = z.infer<typeof ExibicaoDeMidia>;

export const SlotDeMidia = z.object({
  id: z.string(),
  /**
   * Seletor do ELEMENTO dono: a própria tag (img/video) ou, no caso de
   * background-image, o elemento cujo CSS pinta o fundo (seletor do CSS).
   */
  seletor: z.string(),
  tipo: TipoDeMidia,
  /** URL original (absoluta) — ponte para `dependencies.assets` do manifest. */
  urlOriginal: z.string().optional(),
  /** Caminho local no vault quando o asset foi baixado (via manifest). */
  localPath: z.string().optional(),
  exibicao: ExibicaoDeMidia.default({}),
  /** Sem esta mídia o componente perde o sentido visual (ex.: fundo do hero). */
  obrigatorio: z.boolean().default(false),
  /** Heurística declarada: parece ser o logo da origem (candidato a logo). */
  pareceLogo: z.boolean().default(false),
});
export type SlotDeMidia = z.infer<typeof SlotDeMidia>;

export const SlotDeLink = z.object({
  id: z.string(),
  seletor: z.string(),
  /** Rótulo visível do original. */
  label: z.string(),
  /** Href original (nunca vai para o site final; o CTA do usuário substitui). */
  hrefOriginal: z.string(),
  /** Parece um CTA (botão de ação), não navegação comum. */
  ehCta: z.boolean().default(false),
});
export type SlotDeLink = z.infer<typeof SlotDeLink>;

/**
 * Grupo repetido (cards, itens de lista, colunas): a geração pode variar a
 * QUANTIDADE dentro dos limites medidos, clonando o item-modelo.
 */
export const GrupoRepetido = z.object({
  id: z.string(),
  /** Seletor do CONTÊINER dos itens. */
  seletorContainer: z.string(),
  /** Seletor do item-modelo (primeiro item), relativo ao contêiner. */
  seletorItem: z.string(),
  /** Quantos itens o original tem. */
  contagemOriginal: z.number().int().positive(),
  /** Limites sugeridos para o conteúdo novo. */
  minItens: z.number().int().positive(),
  maxItens: z.number().int().positive(),
  /** Ids dos slots (texto/mídia/link) que vivem DENTRO do item-modelo. */
  slotsDoItem: z.array(z.string()).default([]),
});
export type GrupoRepetido = z.infer<typeof GrupoRepetido>;

/** Uma cor tematizável da origem, com o papel semântico sugerido. */
export const CorTematizavel = z.object({
  /** Nome da custom property (`--x`) quando houver; ausente = literal. */
  varName: z.string().optional(),
  valor: z.string(),
  /** Ocorrências medidas no CSS do componente. */
  ocorrencias: z.number().int().positive(),
  /**
   * Papel semântico SUGERIDO no vocabulário de tokens do projeto (background,
   * primary, heading…). Sugestão derivada, nunca imposição.
   */
  papelSugerido: z.string().optional(),
});
export type CorTematizavel = z.infer<typeof CorTematizavel>;

export const FonteTematizavel = z.object({
  familia: z.string(),
  papelSugerido: z.enum(['display', 'body', 'mono']).optional(),
  /** Veio de custom property (tematizar é trivial) ou de declaração direta. */
  origem: z.enum(['custom-property', 'declaracao']),
});
export type FonteTematizavel = z.infer<typeof FonteTematizavel>;

export const TokensTematizaveis = z.object({
  cores: z.array(CorTematizavel).default([]),
  fontes: z.array(FonteTematizavel).default([]),
});
export type TokensTematizaveis = z.infer<typeof TokensTematizaveis>;

/**
 * O que do bundle é ESQUELETO — permanece no site gerado como está (com os
 * tokens do projeto aplicados por cima, nunca reescrito).
 */
export const EsqueletoDoComponente = z.object({
  /** Arquivos CSS presentes no bundle, na ordem de carregamento. */
  cssFiles: z.array(z.string()).default([]),
  /** Arquivos JS presentes (vazio em referência visual, por decisão). */
  jsFiles: z.array(z.string()).default([]),
  /** Há animação declarada que RODA (keyframes/animations no CSS). */
  temAnimacoes: z.boolean().default(false),
  /** Há comportamento JS (interações/scroll) que viaja com o componente. */
  temInteracoes: z.boolean().default(false),
});
export type EsqueletoDoComponente = z.infer<typeof EsqueletoDoComponente>;

/**
 * Contrato de CONTEÚDO — o que a copy pode/deve preencher, derivado dos slots.
 * É a interface entre o pipeline editorial e o componente.
 */
export const ContratoDeConteudo = z.object({
  aceitaTitulo: z.boolean().default(false),
  aceitaSubtitulo: z.boolean().default(false),
  aceitaParagrafo: z.boolean().default(false),
  aceitaEyebrow: z.boolean().default(false),
  aceitaCta: z.boolean().default(false),
  aceitaMidia: z.boolean().default(false),
  /** Limites por papel (chars), derivados dos slots medidos. */
  limites: z.record(z.string(), z.number().int().positive()).default({}),
  /** Grupos: id → {min, max} de itens. */
  grupos: z
    .record(z.string(), z.object({ min: z.number().int(), max: z.number().int() }))
    .default({}),
});
export type ContratoDeConteudo = z.infer<typeof ContratoDeConteudo>;

export const ComponentContract = z.object({
  contractVersion: z.number().int().positive(),
  /** De onde o contrato foi derivado — proveniência honesta. */
  derivadoDe: z.enum(['bundle-v2', 'bundle-legado']),
  esqueleto: EsqueletoDoComponente,
  slots: z.object({
    textos: z.array(SlotDeTexto).default([]),
    midias: z.array(SlotDeMidia).default([]),
    links: z.array(SlotDeLink).default([]),
    grupos: z.array(GrupoRepetido).default([]),
  }),
  tokens: TokensTematizaveis,
  conteudo: ContratoDeConteudo,
  /** Limitações da derivação, em PT-BR — o que o contrato NÃO conseguiu medir. */
  avisos: z.array(z.string()).default([]),
});
export type ComponentContract = z.infer<typeof ComponentContract>;
