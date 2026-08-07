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

/**
 * O que este site precisa fazer.
 *
 * Mora aqui, e não em `estrutura-marketing.ts`, por uma razão de dependência:
 * ele é campo de `ProjectLayout`, e a estrutura de marketing precisa dele para
 * montar as sequências. Se ele morasse lá, os dois módulos se importariam
 * mutuamente e o carregamento quebraria — foi o que aconteceu na primeira
 * versão. Aqui a seta aponta num sentido só: marketing conhece layout, layout
 * não conhece marketing.
 */
export const ObjetivoDoSite = z.enum([
  'captar-contato',
  'vender-produto',
  'apresentar-servico',
  'mostrar-trabalho',
]);
export type ObjetivoDoSite = z.infer<typeof ObjetivoDoSite>;

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
  // As listas vazias eram fiação solta entre dois vocabulários escritos
  // separados: a segmentação produzia `team`, `logo-cloud`, `stats` e
  // `gallery` e nenhum papel os aceitava — 24% dos segmentos do acervo (45 de
  // 190) não tinham destino nenhum na geração. Classificar melhor não adianta
  // enquanto a classe não tiver para onde ir.
  logos: ['logo-cloud'],
  features: ['feature', 'card'],
  showcase: ['card'],
  stats: ['stats'],
  pricing: ['pricing'],
  testimonials: ['testimonial'],
  faq: ['faq', 'accordion'],
  about: ['timeline'],
  team: ['team'],
  gallery: ['gallery', 'card'],
  catalog: ['card'],
  contact: ['form'],
  cta: ['cta', 'button'],
  footer: ['footer'],
};

/**
 * Categorias que NÃO ocupam seção: elas valem para a página inteira.
 *
 * `ROLE_CATEGORIES` responde "que peça cabe nesta seção?", e comportamento não
 * cabe em seção nenhuma — a pergunta certa para ele é outra. Sem esta lista, o
 * montador de kit automático ignorava `interaction` e `cursor` por completo:
 * elas não constavam de papel nenhum, então nunca eram escolhidas, e o dono não
 * tinha como pôr uma animação no kit por mais que curtisse a peça na Galeria.
 */
export const CATEGORIAS_DE_PAGINA: readonly string[] = ['interaction', 'cursor'];

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
  /**
   * O que este site precisa fazer. Decide a estrutura SUGERIDA e nada mais.
   *
   * Opcional de propósito, e nulo por padrão: quem não escolher cai na sequência
   * de captar contato, que é a mais geral. Ele não restringe nada depois de
   * escolhido — a estrutura continua totalmente editável, e trocar o objetivo
   * não reescreve o que a pessoa já montou. É um ponto de partida com intenção,
   * não um molde.
   */
  objetivo: ObjetivoDoSite.nullable().default(null),
  density: LayoutDensity.default('equilibrado'),
  motion: MotionLevel.default('sutil'),
  /**
   * Coerência visual: quando definido, o gerador prioriza componentes deste
   * design system. É a defesa direta contra misturar peças de origens que não
   * conversam entre si.
   */
  preferDesignSystemId: z.string().nullable().default(null),
  /**
   * O que o usuário AUTORIZOU o Orbis a criar. Nada aqui é inferido: cada
   * permissão nasce desligada e só liga por gesto explícito na tela.
   *
   * - `criarSecoesFaltantes`: quando a estrutura não tem uma seção que o site
   *   precisa (navegação, abertura, rodapé), o Orbis pode criá-la no estilo do
   *   kit — consultando o design system consolidado + a identidade do usuário.
   * - `criarArteDeApoio`: em seção sem mídia, o Orbis pode compor arte de
   *   apoio (SVG/CSS na paleta da marca, ou reuso das mídias gerais). Nunca é
   *   geração de imagem por IA: não existe esse canal no modo queue, e a caixa
   *   da tela diz exatamente o que ele faz.
   */
  permissoes: z
    .object({
      criarSecoesFaltantes: z.boolean().default(false),
      criarArteDeApoio: z.boolean().default(false),
    })
    .default({ criarSecoesFaltantes: false, criarArteDeApoio: false }),
});
export type ProjectLayout = z.infer<typeof ProjectLayout>;

export const DEFAULT_LAYOUT: ProjectLayout = {
  // Vazia de propósito: quem cria o projeto chama `sugerirSecoes` com o kit na
  // mão. Uma lista fixa aqui não saberia nada sobre as peças que a pessoa curou.
  secoes: [],
  objetivo: null,
  density: 'equilibrado',
  motion: 'sutil',
  preferDesignSystemId: null,
  permissoes: { criarSecoesFaltantes: false, criarArteDeApoio: false },
};

/** O mínimo que a resolução precisa saber de um componente do kit. */
export type ComponenteDoKitResumo = { id: string; name: string; category: string };
// ── Sugestão inicial de estrutura ───────────────────────────────────────────

/**
 * O primeiro papel cujo vocabulário aceita esta categoria de componente.
 *
 * Exportado porque duas coisas dependem dele:  (que resolve o
 *  de uma seção sem papel declarado) e a sugestão de estrutura, que
 * usa isto para dar destino a uma peça que sobrou do kit.
 */
export const papelParaCategoria = (categoria: string): SectionRole | undefined =>
  (Object.keys(ROLE_CATEGORIES) as SectionRole[]).find((papel) =>
    ROLE_CATEGORIES[papel].includes(categoria),
  );

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

// ── Camadas de página (fundo que atravessa o site inteiro) ──────────────────

/**
 * Uma peça de fundo não é uma seção. Na origem ela era uma camada fixa atrás
 * de tudo (partículas, gradiente animado, textura de página); posta no fluxo
 * como `<section>`, ela colapsa numa faixa e perde o sentido. A categoria
 * `background` e o kind `effect` são as duas marcas com que a classificação
 * identifica esse tipo de peça, e qualquer uma delas basta: um fundo pode
 * chegar rotulado só por uma das vias.
 */
export const ehPecaDeFundo = (c: { category: string; kind: string }): boolean =>
  c.category === 'background' || c.kind === 'effect';

/**
 * Uma peça de COMPORTAMENTO também não é uma seção — pela razão oposta à do
 * fundo: ela não tem aparência própria nenhuma.
 *
 * "Aparecer conforme rola" tem 191 bytes de HTML. Posta no fluxo como
 * `<section>`, vira uma faixa vazia no meio do site enquanto o efeito que ela
 * traz — o que o dono de fato escolheu — não alcança elemento nenhum. O que ela
 * carrega de útil é o SCRIPT e o CSS, e os dois valem para a página inteira.
 *
 * A linha é a CATEGORIA, e não o `kind`. `kind: 'animation'` também aparece em
 * `hero` e `footer`, e ali é seção de verdade: as mesmas peças têm de 5 a 9 KB
 * de HTML e são o topo e o rodapé do site. Separar por `kind` levaria o hero
 * inteiro para fora do fluxo.
 *
 * `cursor` entra aqui pelo mesmo motivo: ponteiro personalizado é um elemento
 * que segue o mouse na página toda, não um bloco dentro de uma seção.
 */
export const ehPecaDeComportamento = (c: { category: string; kind: string }): boolean =>
  c.category === 'interaction' || c.category === 'cursor';

/**
 * `ComponenteDoKitResumo` é o mínimo que a resolução precisa e NÃO carrega
 * `kind` — mas os componentes do kit no payload carregam, e o objeto chega
 * inteiro em runtime. Ler o campo por fora, com defesa, atende os dois
 * formatos: sem `kind` sobra a detecção por categoria, e a peça que escapar
 * continua no fluxo como hoje. A degradação é para o comportamento atual,
 * nunca para quebrado.
 */
const temCaraDeFundo = (p: ComponenteDoKitResumo): boolean => {
  const kind = (p as { kind?: unknown }).kind;
  return ehPecaDeFundo({ category: p.category, kind: typeof kind === 'string' ? kind : '' });
};

/**
 * Retira as peças de fundo das seções e as devolve como camadas da página.
 *
 * É um passo OPT-IN de quem monta o site, DEPOIS de `resolverSecoes` — a
 * assinatura dela não muda, e quem não chamar isto continua com o
 * comportamento de sempre. O destino das camadas é o embrulho fixo do gerador
 * (`envolverCamadaDePagina`, em `@ds/generator`), que as põe atrás de todo o
 * conteúdo, como eram na origem.
 *
 * Seção que só existia para carregar o fundo (sem outra peça, sem instrução e
 * de origem `kit`) sai da lista: sem o fundo ela não tem conteúdo nenhum, e
 * mantê-la produziria uma `<section>` vazia — que o próprio contrato do site
 * gerado proíbe. A saída é avisada nominalmente, porque seção que some calada
 * faz a pessoa achar que a estrutura dela foi ignorada.
 *
 * Seção com outras peças, com instrução ou com parte a criar (`mista`) fica:
 * ainda há o que gerar nela. Ela só perde a peça de fundo, com aviso.
 */
export const separarCamadasDePagina = (
  secoes: readonly SecaoResolvida[],
): { secoes: SecaoResolvida[]; camadas: ComponenteDoKitResumo[]; avisos: string[] } => {
  // Dedupe por id: o mesmo fundo posto em duas seções vira UMA camada. A
  // camada cobre a página inteira; duplicá-la só empilharia o efeito duas
  // vezes, sem nenhum ganho visual.
  const camadas = new Map<string, ComponenteDoKitResumo>();
  const avisos: string[] = [];
  const restantes: SecaoResolvida[] = [];
  for (const s of secoes) {
    const fundos = s.pecas.filter(temCaraDeFundo);
    if (fundos.length === 0) {
      // Sem fundo, a seção atravessa intacta (mesmo objeto): entrada sem peça
      // de fundo sai idêntica, e sem aviso nenhum.
      restantes.push(s);
      continue;
    }
    for (const f of fundos) if (!camadas.has(f.id)) camadas.set(f.id, f);
    const pecas = s.pecas.filter((p) => !temCaraDeFundo(p));
    const rotulo = s.nome.trim() === '' ? 'Uma seção' : `A seção "${s.nome.trim()}"`;
    const nomes = fundos.map((f) => `"${f.name}"`).join(' e ');
    const instrucao = s.instrucao?.trim() ?? '';
    if (pecas.length === 0 && instrucao === '' && s.origem === 'kit') {
      avisos.push(
        fundos.length === 1
          ? `${rotulo} só tinha o fundo ${nomes}; o fundo virou camada da página e a seção saiu.`
          : `${rotulo} só tinha os fundos ${nomes}; os fundos viraram camada da página e a seção saiu.`,
      );
      continue;
    }
    avisos.push(
      fundos.length === 1
        ? `${rotulo} perdeu a peça de fundo ${nomes}: o fundo virou camada fixa da página inteira.`
        : `${rotulo} perdeu as peças de fundo ${nomes}: os fundos viraram camada fixa da página inteira.`,
    );
    // Sem sobrar peça nenhuma, a seção passa a ser criada no estilo do kit —
    // manter `kit` aqui mentiria a procedência no `data-origem` do site.
    restantes.push({ ...s, pecas, origem: pecas.length === 0 ? 'criada' : s.origem });
  }
  return { secoes: restantes, camadas: [...camadas.values()], avisos };
};

/** Mesma defesa de `temCaraDeFundo`, para o resumo que não carrega `kind`. */
const temCaraDeComportamento = (p: ComponenteDoKitResumo): boolean => {
  const kind = (p as { kind?: unknown }).kind;
  return ehPecaDeComportamento({
    category: p.category,
    kind: typeof kind === 'string' ? kind : '',
  });
};

/**
 * Retira as peças de comportamento das seções e as devolve como comportamento
 * da PÁGINA.
 *
 * Gêmea de `separarCamadasDePagina`, e existe pela mesma razão prática: o dono
 * pediu para escolher animações na Galeria e na Biblioteca e usá-las no kit.
 * Antes disto, escolher uma produzia uma faixa vazia no meio do site — o efeito
 * não chegava a lugar nenhum, porque o que ele faz depende de alcançar os
 * elementos das OUTRAS seções, e uma `<section>` não alcança as irmãs.
 *
 * A diferença para o fundo está no destino: fundo vira camada fixa ATRÁS de
 * tudo; comportamento não tem lugar no espaço — o CSS e o script dele passam a
 * valer para a página inteira, e o pouco de HTML que ele tenha (o ponteiro que
 * segue o mouse, por exemplo) fica por cima, fora do fluxo.
 */
export const separarComportamentosDaPagina = (
  secoes: readonly SecaoResolvida[],
): { secoes: SecaoResolvida[]; comportamentos: ComponenteDoKitResumo[]; avisos: string[] } => {
  // Dedupe por id: o mesmo comportamento escolhido em duas seções vale UMA vez.
  // Aplicá-lo duas vezes registraria dois observadores sobre os mesmos
  // elementos — o efeito não dobra, só o custo.
  const comportamentos = new Map<string, ComponenteDoKitResumo>();
  const avisos: string[] = [];
  const restantes: SecaoResolvida[] = [];
  for (const s of secoes) {
    const achados = s.pecas.filter(temCaraDeComportamento);
    if (achados.length === 0) {
      restantes.push(s);
      continue;
    }
    for (const c of achados) if (!comportamentos.has(c.id)) comportamentos.set(c.id, c);
    const pecas = s.pecas.filter((p) => !temCaraDeComportamento(p));
    const rotulo = s.nome.trim() === '' ? 'Uma seção' : `A seção "${s.nome.trim()}"`;
    const nomes = achados.map((c) => `"${c.name}"`).join(' e ');
    const instrucao = s.instrucao?.trim() ?? '';
    if (pecas.length === 0 && instrucao === '' && s.origem === 'kit') {
      avisos.push(
        `${rotulo} só tinha ${nomes}, que é comportamento e não conteúdo: passou a valer para a página inteira e a seção saiu.`,
      );
      continue;
    }
    avisos.push(
      `${rotulo} perdeu ${nomes}: comportamento não ocupa lugar na página — ele passou a valer para todas as seções.`,
    );
    restantes.push({ ...s, pecas, origem: pecas.length === 0 ? 'criada' : s.origem });
  }
  return { secoes: restantes, comportamentos: [...comportamentos.values()], avisos };
};
