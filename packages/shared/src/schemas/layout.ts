import { z } from 'zod';
import { newSectionId } from '../ids.js';

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

/**
 * Que categorias de componente atendem cada papel de seção. É o vocabulário
 * ÚNICO entre wizard, sugestão automática e gerador (antes vivia duplicado na
 * web). Papel sem categoria = nenhum componente encaixa direto; a seção é
 * criada no estilo do kit.
 */
export const ROLE_CATEGORIES: Record<SectionRole, string[]> = {
  nav: ['nav', 'header'],
  hero: ['hero'],
  logos: [],
  features: ['feature', 'card'],
  showcase: ['card'],
  stats: [],
  pricing: ['pricing'],
  testimonials: ['testimonial'],
  faq: ['faq'],
  about: [],
  team: [],
  gallery: ['card'],
  catalog: ['card'],
  contact: ['form'],
  cta: ['cta', 'button'],
  footer: ['footer'],
};

/**
 * Como cada papel se chama em português, num lugar só.
 *
 * Antes o rótulo vivia dentro de cada blueprint, então o MESMO papel mudava de
 * nome conforme a estrutura escolhida: `hero` era "Abertura" num, "Apresentação"
 * noutro, "Vitrine" no terceiro. Com o usuário montando a própria estrutura não
 * existe mais blueprint para carregar o nome, e a sugestão inicial precisa
 * chamar cada seção de alguma coisa.
 *
 * É só o ponto de partida: o nome da seção é livre e o usuário troca à vontade.
 */
export const ROTULO_DE_PAPEL: Record<SectionRole, string> = {
  nav: 'Navegação',
  hero: 'Abertura',
  logos: 'Prova social',
  features: 'Funcionalidades',
  showcase: 'Demonstração',
  stats: 'Números',
  pricing: 'Planos',
  testimonials: 'Depoimentos',
  faq: 'Perguntas frequentes',
  about: 'Sobre',
  team: 'Equipe',
  gallery: 'Galeria',
  catalog: 'Catálogo',
  contact: 'Contato',
  cta: 'Chamada para ação',
  footer: 'Rodapé',
};

// ── A estrutura que o usuário monta ─────────────────────────────────────────

/**
 * Uma seção do site, do jeito que o usuário desenhou.
 *
 * Substitui o par slot-do-blueprint + placement. A diferença que importa não é
 * de formato, é de dono: antes a lista de seções vinha de uma estrutura pronta e
 * cada seção aceitava UMA peça; aqui a lista é do usuário e cada seção aceita
 * quantas peças ele quiser, na ordem em que ele pôs.
 */
export const SecaoDoSite = z.object({
  id: z.string().min(1),
  /**
   * Livre. É o que o usuário lê e edita.
   *
   * Aceita vazio DE PROPÓSITO. O `PATCH` valida o layout com
   * `ProjectLayout.parse`, e o autosave dispara 1,2s depois de cada tecla: com
   * `.min(1)` aqui, apagar o nome para redigitar devolveria 400 e a pessoa veria
   * "falha ao salvar" no meio de uma edição normal. Nome obrigatório é regra de
   * navegação, e vive no gate das etapas.
   */
  nome: z.string().default(''),
  /**
   * Papel semântico, opcional — dica, nunca obrigação.
   *
   * Sobrevive ao nome livre porque três coisas dependem dele e quebrariam
   * caladas sem ele: `ROLE_CATEGORIES` (que sabe qual categoria de peça encaixa
   * onde), o atributo `data-secao` do site gerado, e o CSS responsivo, que tem
   * regra presa ao literal `[data-secao="nav"]`. A sugestão inicial preenche;
   * seção criada do zero pode ficar sem.
   */
  papel: SectionRole.optional(),
  /**
   * As peças do kit que compõem a seção, NA ORDEM. Lista vazia é uma decisão
   * legítima e comum: significa "crie esta seção no estilo do kit".
   */
  componentIds: z.array(z.string()).default([]),
  /**
   * O que a seção deve ou não comunicar, em texto livre. Vazio não é falta de
   * preenchimento: é a pessoa delegando o conteúdo daquela seção.
   */
  instrucao: z.string().optional(),
});
export type SecaoDoSite = z.infer<typeof SecaoDoSite>;

/** Como um slot é preenchido: sugestão automática, componente fixado ou criação forçada. */
export const EscolhaDePlacement = z.enum(['automatica', 'componente', 'criar']);
export type EscolhaDePlacement = z.infer<typeof EscolhaDePlacement>;

/**
 * A decisão do usuário para UM slot do blueprint: seção × componente × config.
 * `automatica` deixa a sugestão decidir; `componente` fixa uma peça do kit;
 * `criar` força a criação no estilo do kit mesmo havendo peça compatível.
 */
export const PlacementDoSlot = z.object({
  role: SectionRole,
  escolha: EscolhaDePlacement.default('automatica'),
  /** Id do componente fixado (só faz sentido com escolha `componente`). */
  componentId: z.string().nullable().default(null),
  /** Instrução livre por seção (ex.: "3 colunas", "fundo escuro"). */
  observacao: z.string().optional(),
});
export type PlacementDoSlot = z.infer<typeof PlacementDoSlot>;

/** A escolha de layout gravada no projeto. */
export const ProjectLayout = z.object({
  /**
   * A estrutura do site, na ordem da página. É a fonte da verdade.
   *
   * `mode`, `blueprintId`, `disabledRoles` e `placements` abaixo são o modelo
   * anterior, mantidos só para projeto antigo entrar sem explodir. Nada novo lê
   * esses campos.
   */
  secoes: z.array(SecaoDoSite).default([]),
  mode: GenerationMode.default('blueprint'),
  /** Usado apenas no modo `blueprint`. */
  blueprintId: z.string(),
  /** Slots opcionais que o usuário desligou. Os obrigatórios são sempre mantidos. */
  disabledRoles: z.array(SectionRole).default([]),
  /** Decisões por slot (aditivo — projetos antigos entram com lista vazia). */
  placements: z.array(PlacementDoSlot).default([]),
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
  // Vazia de propósito: quem cria o projeto chama `sugerirSecoes` com o kit na
  // mão. Uma lista fixa aqui não saberia nada sobre as peças que a pessoa curou.
  secoes: [],
  mode: 'blueprint',
  blueprintId: 'saas-landing',
  disabledRoles: [],
  placements: [],
  density: 'equilibrado',
  motion: 'sutil',
  preferDesignSystemId: null,
  creativeSeed: 0,
};

// ── Resolução de placements ──────────────────────────────────────────────────

/** O mínimo que a resolução precisa saber de um componente do kit. */
export type ComponenteDoKitResumo = { id: string; name: string; category: string };

export type PlacementResolvido = {
  role: SectionRole;
  /** De onde veio a decisão — o wizard e o gerador mostram isso, nunca escondem. */
  origem: 'escolhido' | 'sugerido' | 'criado';
  componente: ComponenteDoKitResumo | null;
  observacao?: string;
};

/**
 * Sugestão automática DETERMINÍSTICA: para cada slot, na ordem, o primeiro
 * componente compatível ainda não usado — espalha o kit pela página em vez de
 * repetir a mesma peça. Quando todos os compatíveis já foram usados, reusa o
 * primeiro compatível (repetir é melhor que deixar vazio).
 */
export const sugerirDistribuicao = (
  slots: readonly LayoutSlot[],
  componentes: readonly ComponenteDoKitResumo[],
): Map<SectionRole, ComponenteDoKitResumo> => {
  const usados = new Set<string>();
  const mapa = new Map<SectionRole, ComponenteDoKitResumo>();
  for (const s of slots) {
    const cats = ROLE_CATEGORIES[s.role] ?? [];
    const compativeis = componentes.filter((c) => cats.includes(c.category));
    const escolhido = compativeis.find((c) => !usados.has(c.id)) ?? compativeis[0];
    if (escolhido !== undefined) {
      mapa.set(s.role, escolhido);
      usados.add(escolhido.id);
    }
  }
  return mapa;
};

/**
 * Resolve as decisões por slot: escolha manual VENCE (se o componente ainda
 * existe no kit — id órfão degrada para o automático em vez de quebrar),
 * `criar` força criação, e o resto cai na sugestão. Determinístico.
 */
export const resolverPlacements = (
  slots: readonly LayoutSlot[],
  placements: readonly PlacementDoSlot[],
  componentes: readonly ComponenteDoKitResumo[],
): PlacementResolvido[] => {
  const porId = new Map(componentes.map((c) => [c.id, c]));
  const porRole = new Map(placements.map((p) => [p.role, p]));
  const sugestoes = sugerirDistribuicao(slots, componentes);
  return slots.map((s) => {
    const p = porRole.get(s.role);
    const observacao = p?.observacao?.trim();
    const extra = observacao ? { observacao } : {};
    if (p?.escolha === 'componente' && p.componentId !== null) {
      const c = porId.get(p.componentId);
      if (c !== undefined) return { role: s.role, origem: 'escolhido', componente: c, ...extra };
    }
    if (p?.escolha === 'criar')
      return { role: s.role, origem: 'criado', componente: null, ...extra };
    const sugerido = sugestoes.get(s.role);
    return sugerido !== undefined
      ? { role: s.role, origem: 'sugerido', componente: sugerido, ...extra }
      : { role: s.role, origem: 'criado', componente: null, ...extra };
  });
};

// ── Sugestão inicial de estrutura ───────────────────────────────────────────

/**
 * As seções que quase todo site tem, na ordem em que costumam aparecer.
 *
 * Existe para a tela não abrir vazia. Página em branco devolve ao usuário
 * exatamente o trabalho que ele queria evitar — e ele apaga o que não serve em
 * um clique, que é mais barato que montar seis seções do zero.
 */
const ESPINHA_ABERTURA: SectionRole[] = ['nav', 'hero', 'logos', 'features'];
const ESPINHA_FECHAMENTO: SectionRole[] = ['contact', 'footer'];

/** O primeiro papel cujo vocabulário aceita esta categoria de componente. */
const papelParaCategoria = (categoria: string): SectionRole | undefined =>
  (Object.keys(ROLE_CATEGORIES) as SectionRole[]).find((papel) =>
    ROLE_CATEGORIES[papel].includes(categoria),
  );

/**
 * Propõe a estrutura inicial a partir do kit.
 *
 * Duas passadas. Primeiro a espinha: cada papel comum vira uma seção e recebe a
 * primeira peça compatível ainda não usada — espalhar o kit pela página rende
 * mais que empilhar tudo numa seção só. Depois o resto do kit: peça que sobrou
 * puxa a seção do papel dela; se essa seção já existe, a peça entra NELA, o que
 * é justamente o caso que o modelo novo passou a permitir.
 *
 * Determinística: mesmo kit, mesma proposta. O `novoId` é injetável para o teste
 * não depender de ulid.
 */
export const sugerirSecoes = (
  componentes: readonly ComponenteDoKitResumo[],
  novoId: () => string = newSectionId,
): SecaoDoSite[] => {
  const usados = new Set<string>();
  const secaoDe = (papel: SectionRole): SecaoDoSite => {
    const cats = ROLE_CATEGORIES[papel];
    const peca = componentes.find((c) => cats.includes(c.category) && !usados.has(c.id));
    if (peca !== undefined) usados.add(peca.id);
    return {
      id: novoId(),
      nome: ROTULO_DE_PAPEL[papel],
      papel,
      componentIds: peca !== undefined ? [peca.id] : [],
    };
  };

  // As duas pontas da espinha são materializadas ANTES das sobras. Se o
  // fechamento viesse depois, um componente de formulário criaria uma seção
  // "Contato" no laço de sobras e o fechamento criaria outra, vazia, logo
  // abaixo — duas seções com o mesmo papel, uma delas sem motivo.
  const abertura = ESPINHA_ABERTURA.map(secaoDe);
  const fechamento = ESPINHA_FECHAMENTO.map(secaoDe);
  const extras: SecaoDoSite[] = [];

  for (const c of componentes) {
    if (usados.has(c.id)) continue;
    usados.add(c.id);
    const papel = papelParaCategoria(c.category);
    if (papel === undefined) {
      // Categoria que nenhum papel reconhece. A peça não some por isso: vira uma
      // seção com o nome dela, sem papel, para o usuário renomear.
      extras.push({ id: novoId(), nome: c.name, componentIds: [c.id] });
      continue;
    }
    const jaExiste = [...abertura, ...fechamento, ...extras].find((s) => s.papel === papel);
    if (jaExiste !== undefined) jaExiste.componentIds.push(c.id);
    else extras.push({ id: novoId(), nome: ROTULO_DE_PAPEL[papel], papel, componentIds: [c.id] });
  }

  return [...abertura, ...extras, ...fechamento];
};

// ── Resolução de uma seção ──────────────────────────────────────────────────

/**
 * O valor de `data-secao` no site gerado.
 *
 * Não é enfeite: `cssResponsivoBase()` tem regra presa a `[data-secao="nav"]`,
 * que é o que faz a barra de navegação se comportar no celular. Por isso a
 * inferência pela categoria da primeira peça existe — uma seção montada com uma
 * peça de navegação continua sendo reconhecida como navegação mesmo se a pessoa
 * nunca abriu o campo de papel.
 */
export const slugDaSecao = (
  secao: SecaoDoSite,
  componentes: readonly ComponenteDoKitResumo[],
): string => {
  if (secao.papel !== undefined) return secao.papel;
  const primeira = secao.componentIds
    .map((id) => componentes.find((c) => c.id === id))
    .find((c) => c !== undefined);
  if (primeira === undefined) return 'secao';
  return papelParaCategoria(primeira.category) ?? 'secao';
};

export type SecaoResolvida = {
  id: string;
  nome: string;
  slug: string;
  instrucao?: string;
  pecas: ComponenteDoKitResumo[];
  /** `criada` = nenhuma peça do kit; `mista` = parte do kit, parte a criar. */
  origem: 'kit' | 'criada' | 'mista';
};

/**
 * Resolve as seções contra o kit atual.
 *
 * A peça que saiu do kit não derruba a seção nem some calada: ela é retirada da
 * lista e vira um aviso nominal, do mesmo jeito que o modelo anterior degradava
 * um `componentId` órfão. Quem trocou o kit no meio do caminho precisa ver o que
 * aconteceu.
 */
export const resolverSecoes = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly ComponenteDoKitResumo[],
): { secoes: SecaoResolvida[]; avisos: string[] } => {
  const porId = new Map(componentes.map((c) => [c.id, c]));
  const avisos: string[] = [];
  const resolvidas = secoes.map((s) => {
    const pecas: ComponenteDoKitResumo[] = [];
    let perdeu = false;
    for (const id of s.componentIds) {
      const c = porId.get(id);
      if (c === undefined) perdeu = true;
      else pecas.push(c);
    }
    if (perdeu) {
      const rotulo = s.nome.trim() === '' ? 'Uma seção' : `A seção "${s.nome.trim()}"`;
      avisos.push(`${rotulo} usava uma peça que saiu do kit. Ela sai criada no estilo do kit.`);
    }
    const instrucao = s.instrucao?.trim();
    return {
      id: s.id,
      nome: s.nome,
      slug: slugDaSecao(s, componentes),
      pecas,
      origem:
        pecas.length === 0 ? 'criada' : pecas.length === s.componentIds.length ? 'kit' : 'mista',
      ...(instrucao !== undefined && instrucao !== '' ? { instrucao } : {}),
    } satisfies SecaoResolvida;
  });
  return { secoes: resolvidas, avisos };
};

// ── Operações de lista (puras, para os botões terem teste) ──────────────────

export const adicionarSecao = (
  secoes: readonly SecaoDoSite[],
  novoId: () => string = newSectionId,
): SecaoDoSite[] => [...secoes, { id: novoId(), nome: '', componentIds: [] }];

export const removerSecao = (secoes: readonly SecaoDoSite[], id: string): SecaoDoSite[] =>
  secoes.filter((s) => s.id !== id);

/** Mover a primeira para cima (ou a última para baixo) não faz nada, e não é erro. */
export const moverSecao = (
  secoes: readonly SecaoDoSite[],
  id: string,
  direcao: 'cima' | 'baixo',
): SecaoDoSite[] => {
  const i = secoes.findIndex((s) => s.id === id);
  if (i === -1) return [...secoes];
  const destino = direcao === 'cima' ? i - 1 : i + 1;
  if (destino < 0 || destino >= secoes.length) return [...secoes];
  const copia = [...secoes];
  const [movida] = copia.splice(i, 1);
  if (movida !== undefined) copia.splice(destino, 0, movida);
  return copia;
};

/**
 * Normaliza o layout persistido: legado sem campos novos e JSON corrompido
 * entram; sai SEMPRE um `ProjectLayout` válido sobre o default.
 */
export const normalizarProjectLayout = (raw: string | null): ProjectLayout => {
  let bruto: unknown = null;
  if (raw !== null && raw.trim().length > 0) {
    try {
      bruto = JSON.parse(raw);
    } catch {
      bruto = null;
    }
  }
  const mesclado =
    bruto !== null && typeof bruto === 'object'
      ? { ...DEFAULT_LAYOUT, ...(bruto as Record<string, unknown>) }
      : DEFAULT_LAYOUT;
  const tentado = ProjectLayout.safeParse(mesclado);
  return tentado.success ? tentado.data : ProjectLayout.parse(DEFAULT_LAYOUT);
};
