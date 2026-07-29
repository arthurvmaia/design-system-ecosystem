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
 * A primeira resposta foram os BLUEPRINTS: cinco estruturas prontas, com slots
 * fixos, e o modelo escolhendo uma peça para cada posição. Resolvia o
 * Frankenstein trocando o problema de dono — quem mandava na arquitetura da
 * página passava a ser o molde, não a pessoa.
 *
 * Hoje a estrutura é declarada pelo usuário, seção a seção: ele diz quantas
 * existem, em que ordem, quais peças compõem cada uma e o que cada uma deve
 * comunicar. O modelo continua sem inventar a estrutura (o Frankenstein segue
 * resolvido), e a página passa a ser dele.
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

/** Intensidade de movimento do site gerado. */
export const MotionLevel = z.enum(['nenhuma', 'sutil', 'expressiva']);
export type MotionLevel = z.infer<typeof MotionLevel>;

/** Respiro vertical entre seções. */
export const LayoutDensity = z.enum(['compacto', 'equilibrado', 'espacoso']);
export type LayoutDensity = z.infer<typeof LayoutDensity>;

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

/** A escolha de layout gravada no projeto. */
export const ProjectLayout = z.object({
  /**
   * A estrutura do site, na ordem da página. É a fonte da verdade.
   *
   * O modelo anterior (`mode`, `blueprintId`, `disabledRoles`, `placements`)
   * saiu daqui. Como o schema não é `strict`, o `layoutJson` de um projeto
   * antigo continua entrando: as chaves que não existem mais são descartadas e
   * ele sai com `secoes: []`, que é o mesmo caminho de um projeto novo — a tela
   * propõe a estrutura a partir do kit.
   */
  secoes: z.array(SecaoDoSite).default([]),
  density: LayoutDensity.default('equilibrado'),
  motion: MotionLevel.default('sutil'),
  /**
   * Coerência visual: quando definido, o gerador prioriza componentes deste
   * design system. É a defesa direta contra misturar peças de origens que não
   * conversam entre si.
   */
  preferDesignSystemId: z.string().nullable().default(null),
});
export type ProjectLayout = z.infer<typeof ProjectLayout>;

export const DEFAULT_LAYOUT: ProjectLayout = {
  // Vazia de propósito: quem cria o projeto chama `sugerirSecoes` com o kit na
  // mão. Uma lista fixa aqui não saberia nada sobre as peças que a pessoa curou.
  secoes: [],
  density: 'equilibrado',
  motion: 'sutil',
  preferDesignSystemId: null,
};

/** O mínimo que a resolução precisa saber de um componente do kit. */
export type ComponenteDoKitResumo = { id: string; name: string; category: string };
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
