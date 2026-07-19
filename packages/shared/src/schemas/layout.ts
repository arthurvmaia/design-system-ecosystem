import { z } from 'zod';

/**
 * Arquitetura de layout.
 *
 * O problema que isto resolve está documentado pelo próprio autor do gerador:
 * "Fase 7 é onde entra o maior risco de qualidade. Sites gerados podem ficar
 * incoerentes (Frankenstein)."
 *
 * A causa é estrutural: sem uma estrutura declarada, o modelo inventa a
 * sequência de seções a cada geração. Dois projetos parecidos saem diferentes,
 * e nada garante que o resultado faça sentido como página.
 *
 * A solução é inverter o controle. O usuário escolhe um BLUEPRINT — uma
 * estrutura nomeada, com slots ordenados e papéis semânticos. O modelo deixa de
 * decidir "que site é esse" e passa a responder uma pergunta muito mais estreita:
 * "qual componente da biblioteca preenche melhor este slot?".
 *
 * Isso troca criatividade estrutural (que produz Frankenstein) por curadoria
 * dentro de uma estrutura conhecida (que produz páginas coerentes).
 */

/** Papel semântico de uma seção. É o vocabulário compartilhado entre blueprint, biblioteca e gerador. */
export const SectionRole = z.enum([
  'nav',
  'hero',
  'logos',
  'features',
  'showcase',
  'stats',
  'pricing',
  'testimonials',
  'faq',
  'about',
  'team',
  'gallery',
  'catalog',
  'contact',
  'cta',
  'footer',
]);
export type SectionRole = z.infer<typeof SectionRole>;

/** Uma posição na página que precisa ser preenchida por um componente da biblioteca. */
export const LayoutSlot = z.object({
  role: SectionRole,
  /** Rótulo para a interface. */
  label: z.string(),
  /** Orientação passada ao modelo na hora de escolher o componente deste slot. */
  hint: z.string(),
  /** Slots obrigatórios não podem ser desligados pelo usuário. */
  required: z.boolean(),
});
export type LayoutSlot = z.infer<typeof LayoutSlot>;

/** Estrutura de página nomeada. São dados, não geração — reprodutível entre projetos. */
export const LayoutBlueprint = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  bestFor: z.string(),
  slots: z.array(LayoutSlot).min(2),
});
export type LayoutBlueprint = z.infer<typeof LayoutBlueprint>;

/** Intensidade de movimento do site gerado. */
export const MotionLevel = z.enum(['nenhuma', 'sutil', 'expressiva']);
export type MotionLevel = z.infer<typeof MotionLevel>;

/** Respiro vertical entre seções. */
export const LayoutDensity = z.enum(['compacto', 'equilibrado', 'espacoso']);
export type LayoutDensity = z.infer<typeof LayoutDensity>;

/**
 * Como o site é composto.
 *
 * `blueprint` — você manda na estrutura. Escolhe um esqueleto, o gerador só
 *   decide qual componente ocupa cada posição. Previsível e repetível: gerar
 *   duas vezes produz resultados equivalentes.
 *
 * `criativo` — o gerador manda na estrutura, você manda no material. Ele compõe
 *   livremente, mas só pode usar os componentes que você curou. Cada geração
 *   sai diferente, de propósito.
 *
 * A restrição "só usa o que você curou" vale nos dois modos. O que muda é quem
 * decide a arquitetura da página.
 */
export const GenerationMode = z.enum(['blueprint', 'criativo']);
export type GenerationMode = z.infer<typeof GenerationMode>;

/**
 * Direções criativas.
 *
 * Os modelos atuais não aceitam mais `temperature`, então variedade entre
 * gerações não pode vir de amostragem — tem que vir do prompt. Cada geração no
 * modo criativo sorteia uma direção a partir do seed, o que dá variação real e
 * reproduzível (mesmo seed, mesma direção) em vez de ruído aleatório.
 */
export const CREATIVE_DIRECTIONS = [
  {
    id: 'editorial',
    name: 'Editorial',
    guidance:
      'Trate a página como uma revista: uma abertura tipográfica dominante, respiro generoso, e o conteúdo conduzido por hierarquia de texto em vez de caixas. Poucas seções, cada uma com peso.',
  },
  {
    id: 'assimetrico',
    name: 'Assimétrico',
    guidance:
      'Quebre o ritmo previsível de blocos centralizados. Alterne alinhamentos, deixe seções desiguais em altura e crie tensão visual entre um lado e outro da página.',
  },
  {
    id: 'denso',
    name: 'Denso e técnico',
    guidance:
      'Muita informação por tela, com ritmo rápido entre seções. Prioriza densidade e prova: números, listas, especificações. Pouco espaço decorativo.',
  },
  {
    id: 'cinematografico',
    name: 'Cinematográfico',
    guidance:
      'Abertura em tela cheia com forte presença visual, seguida de seções que revelam conteúdo progressivamente. Grandes áreas de imagem e transições marcadas entre blocos.',
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    guidance:
      'O mínimo de seções necessárias para cumprir o objetivo. Muito espaço negativo, um único ponto focal por tela, nenhuma seção de sustentação supérflua.',
  },
  {
    id: 'narrativo',
    name: 'Narrativo',
    guidance:
      'Ordene as seções como uma história: tensão, desenvolvimento, resolução. O conteúdo do usuário dita a sequência, não uma fórmula de landing page.',
  },
] as const;

export type CreativeDirection = (typeof CREATIVE_DIRECTIONS)[number];

/** Seleção determinística: mesmo seed devolve sempre a mesma direção. */
export const pickCreativeDirection = (seed: number): CreativeDirection =>
  CREATIVE_DIRECTIONS[Math.abs(Math.trunc(seed)) % CREATIVE_DIRECTIONS.length] as CreativeDirection;

/** A escolha de layout gravada no projeto. */
export const ProjectLayout = z.object({
  mode: GenerationMode.default('blueprint'),
  /** Usado apenas no modo `blueprint`. */
  blueprintId: z.string(),
  /** Slots opcionais que o usuário desligou. Os obrigatórios são sempre mantidos. */
  disabledRoles: z.array(SectionRole).default([]),
  density: LayoutDensity.default('equilibrado'),
  motion: MotionLevel.default('sutil'),
  /**
   * Coerência visual: quando definido, o gerador prioriza componentes deste
   * design system. É a defesa direta contra misturar peças de origens que não
   * conversam entre si.
   */
  preferDesignSystemId: z.string().nullable().default(null),
  /**
   * Usado apenas no modo `criativo`. Trocado a cada geração para que regerar o
   * mesmo projeto produza uma composição diferente; preservado se você quiser
   * reproduzir um resultado que gostou.
   */
  creativeSeed: z.number().int().nonnegative().default(0),
});
export type ProjectLayout = z.infer<typeof ProjectLayout>;

const slot = (role: SectionRole, label: string, hint: string, required = false): LayoutSlot => ({
  role,
  label,
  hint,
  required,
});

/**
 * Blueprints embutidos.
 *
 * São deliberadamente poucos e opinativos. Uma lista longa de estruturas
 * genéricas devolveria ao usuário exatamente a indecisão que o blueprint
 * existe para remover.
 */
export const BUILTIN_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'saas-landing',
    name: 'SaaS / Produto',
    description: 'Prova de valor no topo, funcionalidades no meio, conversão no fim.',
    bestFor: 'Software, apps, ferramentas, assinaturas',
    slots: [
      slot('nav', 'Navegação', 'Barra superior enxuta, com um CTA à direita.', true),
      slot('hero', 'Abertura', 'Promessa central com chamada primária bem visível.', true),
      slot('logos', 'Prova social', 'Faixa de logos ou selos de credibilidade.'),
      slot('features', 'Funcionalidades', 'Blocos de recursos, idealmente em grade.', true),
      slot('showcase', 'Demonstração', 'Área visual grande: print, vídeo ou mockup.'),
      slot('stats', 'Números', 'Métricas de impacto em destaque.'),
      slot('pricing', 'Planos', 'Tabela ou cards de preço comparáveis.'),
      slot('testimonials', 'Depoimentos', 'Citações de clientes com autoria.'),
      slot('faq', 'Dúvidas', 'Perguntas frequentes, formato acordeão.'),
      slot('cta', 'Conversão final', 'Bloco de fechamento com ação única.', true),
      slot('footer', 'Rodapé', 'Links, contato e legal.', true),
    ],
  },
  {
    id: 'portfolio',
    name: 'Portfólio',
    description: 'O trabalho ocupa o centro; texto só onde é necessário.',
    bestFor: 'Estúdios, freelancers, designers, fotógrafos',
    slots: [
      slot('nav', 'Navegação', 'Minimalista, quase invisível.', true),
      slot('hero', 'Apresentação', 'Nome e posicionamento em tipografia grande.', true),
      slot('gallery', 'Trabalhos', 'Grade ou carrossel de projetos. É o coração da página.', true),
      slot('about', 'Sobre', 'Texto curto de contexto e trajetória.'),
      slot('showcase', 'Destaque', 'Um projeto em profundidade.'),
      slot('team', 'Equipe', 'Pessoas por trás do trabalho.'),
      slot('testimonials', 'Depoimentos', 'O que clientes dizem.'),
      slot('contact', 'Contato', 'Formulário ou canais diretos.', true),
      slot('footer', 'Rodapé', 'Redes e assinatura.', true),
    ],
  },
  {
    id: 'ecommerce',
    name: 'Loja',
    description: 'Produto visível cedo, confiança reforçada antes da compra.',
    bestFor: 'Lojas, catálogos, marcas de produto',
    slots: [
      slot('nav', 'Navegação', 'Com busca e carrinho visíveis.', true),
      slot('hero', 'Vitrine', 'Campanha ou produto principal em destaque.', true),
      slot('catalog', 'Produtos', 'Grade de produtos com preço e imagem.', true),
      slot('features', 'Diferenciais', 'Frete, garantia, troca, parcelamento.'),
      slot('showcase', 'Produto em uso', 'Contexto de uso, lifestyle.'),
      slot('testimonials', 'Avaliações', 'Prova social de compradores.'),
      slot('faq', 'Dúvidas', 'Entrega, pagamento, devolução.'),
      slot('cta', 'Chamada final', 'Última oferta antes do rodapé.'),
      slot('footer', 'Rodapé', 'Institucional, pagamento e políticas.', true),
    ],
  },
  {
    id: 'lead-capture',
    name: 'Captura',
    description: 'Uma página, uma decisão. Tudo empurra para o mesmo formulário.',
    bestFor: 'Lançamentos, iscas digitais, inscrições, eventos',
    slots: [
      slot('hero', 'Promessa', 'Headline forte e formulário logo abaixo.', true),
      slot('features', 'O que você recebe', 'Benefícios em lista escaneável.', true),
      slot('stats', 'Prova', 'Números que sustentam a promessa.'),
      slot('testimonials', 'Depoimentos', 'Resultados de quem já participou.'),
      slot('faq', 'Objeções', 'Perguntas que travam a inscrição.'),
      slot('cta', 'Inscrição', 'Repetição do formulário no fim.', true),
      slot('footer', 'Rodapé', 'Mínimo: legal e contato.', true),
    ],
  },
  {
    id: 'one-page',
    name: 'Página única',
    description: 'Estrutura curta e direta, sem seções de sustentação.',
    bestFor: 'Institucional simples, cartão de visita, MVP',
    slots: [
      slot('nav', 'Navegação', 'Âncoras para as seções da própria página.', true),
      slot('hero', 'Abertura', 'Quem é e o que faz, em uma tela.', true),
      slot('about', 'Sobre', 'Parágrafo de contexto.'),
      slot('features', 'Serviços', 'Três a seis blocos curtos.', true),
      slot('contact', 'Contato', 'Como falar com você.', true),
      slot('footer', 'Rodapé', 'Assinatura e redes.', true),
    ],
  },
];

export const getBlueprint = (id: string): LayoutBlueprint | undefined =>
  BUILTIN_BLUEPRINTS.find((b) => b.id === id);

/**
 * Slots efetivos de um projeto: na ordem do blueprint, sem os que o usuário
 * desligou. Slots obrigatórios sobrevivem mesmo se aparecerem em disabledRoles,
 * para que uma escolha inválida degrade em vez de gerar uma página quebrada.
 */
export const resolveSlots = (blueprint: LayoutBlueprint, layout: ProjectLayout): LayoutSlot[] =>
  blueprint.slots.filter((s) => s.required || !layout.disabledRoles.includes(s.role));

export const DEFAULT_LAYOUT: ProjectLayout = {
  mode: 'blueprint',
  blueprintId: 'saas-landing',
  disabledRoles: [],
  density: 'equilibrado',
  motion: 'sutil',
  preferDesignSystemId: null,
  creativeSeed: 0,
};
