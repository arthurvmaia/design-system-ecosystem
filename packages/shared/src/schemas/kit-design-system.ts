import { z } from 'zod';
import { TOKENS_SEMANTICOS } from './brand.js';

/**
 * O design system FINAL de um kit — a camada que faltava.
 *
 * O comentário da tabela `kits` sempre prometeu que "um kit é um Design System
 * FINAL", mas o kit era só uma lista de peças: nome, descrição e ponteiros.
 * Este schema é o conteúdo da promessa. Ele nasce da CONSOLIDAÇÃO: o CSS real
 * de cada peça é inventariado (cor a cor, com contexto), as cores próximas são
 * agrupadas em clusters, e cada cluster recebe um papel do MESMO vocabulário
 * que a identidade do usuário já usa (`TOKENS_SEMANTICOS`).
 *
 * É o espírito do script do professor aplicado ao kit: um artefato único,
 * derivado do que foi compreendido — não um recorte. E com a mesma regra de
 * desempate honesta: cluster ambíguo fica SEM papel (`papel: null`) e a razão
 * vai por extenso em `limitacoes`, porque recolorir na dúvida é pior que
 * manter a aparência original.
 *
 * ## Por que a tabela é POR ORIGEM, e não global
 *
 * O mesmo `#111111` é `heading` num site claro e `background` num escuro. Um
 * mapa global de cores destruiria qualquer kit que misture origens de temas
 * diferentes. Cada origem carrega o próprio tema e os próprios clusters; um
 * kit misto declara `tema: 'misto'` em vez de fingir coerência.
 *
 * ## Quem consome
 *
 * - A recoloração (`@ds/composer`): cluster com papel e confiança vira o mapa
 *   literal→`var(--marca-<papel>, literal)`.
 * - O Orbis, ao criar qualquer coisa "no estilo do kit": este documento + a
 *   identidade do usuário são as duas fontes, nessa ordem de cascata.
 * - O painel "Design System" do editor de kit, que mostra o consolidado com
 *   as limitações por extenso.
 */

/** O papel de um cluster — o vocabulário é o MESMO da paleta do usuário. */
export const PapelDeCor = z.enum(TOKENS_SEMANTICOS);
export type PapelDeCor = z.infer<typeof PapelDeCor>;

/** Onde uma cor aparece no CSS. Decide o papel tanto quanto a própria cor. */
export const ContextoDeCor = z.enum([
  'bg',
  'text',
  'border',
  'gradient',
  'shadow',
  'icone',
  'outro',
]);
export type ContextoDeCor = z.infer<typeof ContextoDeCor>;

/** Uma cor concreta dentro de um cluster, como ela aparece no CSS de origem. */
export const MembroDoCluster = z.object({
  /** O texto exato encontrado (com alfa, função, o que for). */
  literal: z.string().min(1),
  /** Canônico `#rrggbb` minúsculo da parte opaca — a chave de agrupamento. */
  hexOpaco: z.string().regex(/^#[0-9a-f]{6}$/),
  ocorrencias: z.number().int().positive(),
  contexto: ContextoDeCor,
});
export type MembroDoCluster = z.infer<typeof MembroDoCluster>;

/**
 * O que separa um cluster DERIVADO do parente de quem ele herdou o papel.
 *
 * Existe por causa de um defeito medido no kit real: das 111 cores sem papel,
 * **49 eram variações de uma cor que JÁ TINHA papel** — o verde `#4a6b5a` e o
 * `#8abf9e` são o mesmo verde do `primary`, um mais escuro e outro mais claro
 * (estados de hover, tintas de fundo). Sem herança, o `primary` virava a cor
 * da marca e essas ficavam verdes: o site saía metade convertido, que é
 * exatamente a pior das saídas possíveis.
 *
 * Herdar o papel não basta: pintar as três com a MESMA cor da marca apagaria a
 * hierarquia que o site de origem tinha (o hover deixaria de ser mais escuro).
 * Por isso a relação viaja junto e é reaplicada sobre a cor da marca:
 * "12% mais claro e com metade do croma" continua sendo 12% mais claro e com
 * metade do croma, agora no amarelo do usuário em vez de no verde da origem.
 */
export const AjusteDeCor = z.object({
  /** L do cluster menos L do parente, em OKLCH (-1..1). */
  deltaL: z.number().min(-1).max(1),
  /** Croma do cluster dividido pelo do parente. 1 = mesma saturação. */
  ratioC: z.number().min(0).max(4),
});
export type AjusteDeCor = z.infer<typeof AjusteDeCor>;

/**
 * Um grupo de cores próximas com (talvez) um papel.
 *
 * `papel: null` é um estado LEGÍTIMO: significa "não deu para afirmar com
 * confiança". A recoloração pula o cluster e a aparência original fica — que é
 * o contrato de degradação de todo este pipeline. Sombra, overlay e cor
 * semântica (o verde de "deu certo", o vermelho de erro) caem aqui de
 * propósito: forçá-las na paleta da marca destruiria o significado delas.
 */
export const ClusterDeCor = z.object({
  papel: PapelDeCor.nullable(),
  /** O hex do membro mais pesado — a cara do cluster no painel. */
  corCanonica: z.string().regex(/^#[0-9a-f]{6}$/),
  membros: z.array(MembroDoCluster).min(1),
  /** 0..1. Abaixo do limiar de recoloração, o papel é informativo apenas. */
  confianca: z.number().min(0).max(1),
  /**
   * Preenchido quando o papel foi HERDADO de um vizinho de matiz. Null = o
   * papel é próprio, e a cor da marca entra sem ajuste. Aditivo: um design
   * system gravado antes deste campo continua válido e lê como `null`.
   */
  ajuste: AjusteDeCor.nullable().default(null),
});
export type ClusterDeCor = z.infer<typeof ClusterDeCor>;

/** Uma família tipográfica encontrada nas peças de uma origem. */
export const FonteDoKit = z.object({
  familia: z.string().min(1),
  papelSugerido: z.enum(['display', 'body', 'mono']).nullable(),
  ocorrencias: z.number().int().positive(),
});
export type FonteDoKit = z.infer<typeof FonteDoKit>;

/**
 * A ESCALA de uma origem: os degraus de tamanho de letra que ela usa, do menor
 * ao maior, em px.
 *
 * Vem da captura (`designTokens` do manifesto), não do CSS dos bundles. O CSS
 * declara `1.5rem`, `clamp()` e variável; o que interessa é o que o navegador
 * pintou, e só a captura viu isso.
 *
 * Origem capturada antes desta medição vem com a lista vazia — e é o certo:
 * "este site tem 8 degraus" e "ninguém mediu os degraus deste site" são
 * respostas diferentes, e a segunda não deve se disfarçar da primeira.
 */
export const EscalaDaOrigem = z.object({
  /** Os degraus em px, crescendo. */
  degraus: z.array(z.number().positive()).default([]),
  /** O degrau em que está a maior parte do texto. */
  corpo: z.number().positive().nullable().default(null),
  /** O degrau de destaque, quando a medição separou um. */
  display: z.number().positive().nullable().default(null),
  /** Os respiros que a origem usa, em px. */
  espacos: z.array(z.number().nonnegative()).default([]),
  /** Os raios de canto, em px. */
  raios: z.array(z.number().nonnegative()).default([]),
});
export type EscalaDaOrigem = z.infer<typeof EscalaDaOrigem>;

export const OrigemConsolidada = z.object({
  /** `ds_...`, ou o id da peça quando a origem é desconhecida. */
  designSystemId: z.string().min(1),
  tema: z.enum(['claro', 'escuro']),
  clusters: z.array(ClusterDeCor),
  fontes: z.array(FonteDoKit).default([]),
  /** A escala medida na captura. Ausente = origem capturada antes da medição. */
  escala: EscalaDaOrigem.optional(),
});
export type OrigemConsolidada = z.infer<typeof OrigemConsolidada>;

export const KIT_DESIGN_SYSTEM_VERSION = 1;

export const KitDesignSystem = z.object({
  versao: z.literal(KIT_DESIGN_SYSTEM_VERSION),
  geradoEm: z.number().int().positive(),
  /** `misto` = as origens divergem de tema. Declarado, nunca escondido. */
  tema: z.enum(['claro', 'escuro', 'misto']),
  origens: z.array(OrigemConsolidada),
  /** Tudo que a consolidação NÃO conseguiu afirmar, por extenso. */
  limitacoes: z.array(z.string()).default([]),
});
export type KitDesignSystem = z.infer<typeof KitDesignSystem>;

/**
 * Limiar único de recoloração. Vive AQUI, ao lado do schema, porque dois
 * consumidores precisam concordar com ele: quem monta o mapa (composer) e quem
 * mostra "este cluster será recolorido" no painel do kit (web). Duas cópias
 * desse número divergiriam na primeira afinação.
 */
export const CONFIANCA_MINIMA_PARA_RECOLORIR = 0.5;

/**
 * Os cortes de ALCANCE da marca numa peça, pelo mesmo motivo do limiar acima e
 * com a mesma história: eles nasceram no `@ds/composer` (`nivelDeMarca`) e
 * ganharam uma segunda cópia no `apps/web` quando a tela precisou dos mesmos
 * números. Duas cópias divergem na primeira afinação, e o estrago aqui é
 * específico: a Galeria e o motor passariam a chamar a MESMA peça de coisas
 * diferentes, uma dizendo "parcial" e a outra "cores fixas".
 *
 * Acima de `veste` a peça veste a marca e o que sobra é detalhe (uma borda, o
 * `white` de uma barra de rolagem). Abaixo de `origem` ela é, na prática, a peça
 * de origem pintada por fora — chamar isso de "parcial" seria otimismo. No meio,
 * parcial com o número à vista, que é a única resposta honesta.
 */
export const ALCANCE_DA_MARCA = {
  veste: 0.8,
  origem: 0.35,
} as const;
