import { z } from 'zod';
import {
  IdentidadeVerbal,
  LocalDeLogo,
  LogoVariante,
  PaletaDoProjeto,
  RedeSocial,
  TipografiaDoProjeto,
} from './brand.js';
import { REGIME_DE_ESCALA_PADRAO, RegimeDeEscala } from './escala-do-site.js';

export const ProjectStatus = z.enum([
  'draft',
  'ready-to-generate',
  'generating',
  'generated',
  'failed',
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * Versão dos JSONs persistidos do projeto (content/branding/layout). Sobe
 * quando a FORMA muda de um jeito que a leitura precisa distinguir; dados
 * antigos (sem o campo) são normalizados com defaults — nunca rejeitados.
 */
export const PROJECT_DATA_VERSION = 1;

/** Conteúdo textual fornecido pelo usuário. Estrutura semiaberta para caber vários formatos. */
/**
 * O que o usuário quer que UMA seção diga — estruturado, não um textão.
 * Todos os campos são opcionais: brief vazio = o gerador segue o hint do slot.
 */
export const BriefDaSecao = z.object({
  /** A mensagem central da seção, em uma ou duas frases. */
  mensagem: z.string().optional(),
  /** Pontos de apoio (um recurso, um plano, uma pergunta… por item). */
  pontos: z.array(z.string()).default([]),
  /** Provas: números, nomes, depoimentos — fatos que sustentam a mensagem. */
  provas: z.array(z.string()).default([]),
  /** Chamada específica desta seção (quando difere do CTA principal). */
  cta: z.string().optional(),
  /**
   * "Deixar a IA decidir" (A9/R9): a pessoa delegou o texto DESTA seção.
   * O gerador escreve no tom da marca, SEM inventar fatos — sem informação,
   * sai texto seguro e fácil de editar. Reversível: o que já foi escrito
   * continua guardado nos campos acima.
   */
  iaDecide: z.boolean().default(false),
});
export type BriefDaSecao = z.infer<typeof BriefDaSecao>;

/**
 * Espelho textual de um brief — alimenta o `sections` legado para quem ainda
 * lê texto plano. Determinístico.
 */
export const espelhoDoBrief = (b: BriefDaSecao): string => {
  const linhas: (string | undefined)[] = [
    b.mensagem?.trim() || undefined,
    ...b.pontos.map((p) => p.trim()).filter((p) => p !== ''),
    ...b.provas.map((p) => p.trim()).filter((p) => p !== ''),
    b.cta?.trim() ? `Chamada: ${b.cta.trim()}` : undefined,
  ];
  return linhas.filter((l): l is string => l !== undefined).join('\n');
};

/** Um brief sem nada preenchido não conta como conteúdo — a menos que a
 * pessoa tenha DELEGADO a seção à IA (delegar é uma decisão, não um vazio). */
export const briefVazio = (b: BriefDaSecao): boolean => !b.iaDecide && espelhoDoBrief(b) === '';

/**
 * Traduz o texto livre das seções para o formato de brief.
 *
 * A fonte passou a ser `layout.secoes[].instrucao`; `content.briefs` continua
 * existindo porque o pipeline editorial e o contrato do gerador leem de lá. A
 * chave é o ID da seção, nunca o papel: duas seções podem ter o mesmo papel
 * agora, e um registro por papel perderia uma delas em silêncio.
 *
 * Instrução vazia vira `iaDecide: true` porque é exatamente o que ela significa
 * — a pessoa delegou o texto daquela seção, e delegar é uma decisão, não uma
 * lacuna.
 */
export const espelharBriefsDasSecoes = (
  secoes: readonly { id: string; instrucao?: string }[],
): Record<string, BriefDaSecao> => {
  const out: Record<string, BriefDaSecao> = {};
  for (const s of secoes) {
    const texto = s.instrucao?.trim() ?? '';
    out[s.id] =
      texto === ''
        ? { pontos: [], provas: [], iaDecide: true }
        : { mensagem: texto, pontos: [], provas: [], iaDecide: false };
  }
  return out;
};

/**
 * Um produto do usuário.
 *
 * Existe separado de `services` porque produto é outra coisa: tem preço, tem
 * foto e costuma virar card numa vitrine. Só o nome é obrigatório — quem quer
 * listar seis produtos sem preço consegue, e quem quer catálogo completo
 * também. A foto aponta para uma mídia já enviada (`MediaItem.path`), então não
 * há caminho solto nem arquivo órfão.
 */
export const Produto = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  /** Texto livre de propósito: "R$ 89", "a partir de 200", "sob consulta". */
  preco: z.string().optional(),
  /** Caminho de uma mídia do projeto (relativo a `projects/<id>/media/`). */
  imagemPath: z.string().optional(),
  /** Para onde o card leva: página do produto, WhatsApp, checkout. */
  link: z.string().optional(),
  /** Selo curto no card: "novo", "mais vendido", "últimas unidades". */
  destaque: z.string().optional(),
});
export type Produto = z.infer<typeof Produto>;

export const ProjectContent = z.object({
  schemaVersion: z.number().int().positive().optional(),
  about: z.string().optional(),
  slogan: z.string().optional(),
  services: z.array(z.object({ title: z.string(), description: z.string() })).optional(),
  /**
   * Produtos a exibir no site. O gerador monta a vitrine com as peças do kit;
   * lista vazia significa que o site não tem seção de produto, e não que ela
   * deve ser inventada.
   */
  produtos: z.array(Produto).optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  cta: z.string().optional(),
  testimonials: z
    .array(z.object({ author: z.string(), role: z.string().optional(), quote: z.string() }))
    .optional(),
  /**
   * Copy por seção, chaveada pelo `SectionRole` do blueprint ("hero",
   * "features", ...). LEGADO: hoje é o espelho textual derivado dos `briefs`
   * (mantido para quem ainda lê texto plano); a fonte estruturada são os briefs.
   */
  sections: z.record(z.string(), z.string()).optional(),
  /**
   * Brief ESTRUTURADO por seção (A7): em vez de um textão, cada seção pede o
   * que precisa — mensagem, pontos de apoio, provas e chamada. É o que o
   * pipeline editorial consome; `sections` legado migra na leitura.
   */
  briefs: z.record(z.string(), BriefDaSecao).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});
export type ProjectContent = z.infer<typeof ProjectContent>;

/** Identidade visual e institucional do projeto. */
export const ProjectBranding = z.object({
  schemaVersion: z.number().int().positive().optional(),
  /** Nome da marca como aparece no site (pode diferir do nome do projeto). */
  brandName: z.string().optional(),
  /** Tom de voz: orienta o gerador a escrever/ajustar copy neste registro. */
  tone: z.string().optional(),
  logoPath: z.string().nullable().optional(),
  faviconPath: z.string().nullable().optional(),
  palette: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    background: z.string(),
    foreground: z.string(),
    accent: z.string().optional(),
  }),
  typography: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string().optional(),
  }),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  /** rede → URL. Ex.: { instagram: "https://..." }. */
  social: z.record(z.string(), z.string()).optional(),
  /** Chamada principal do site: rótulo do botão e para onde ele leva. */
  mainCta: z.object({ label: z.string().optional(), href: z.string().optional() }).optional(),

  // ── Campos NOVOS (A5) — todos aditivos; os legados acima seguem válidos ──
  /** Identidade verbal (tons + arquétipos + modelo derivado editável). */
  identidadeVerbal: IdentidadeVerbal.optional(),
  /** Variações de logo por tipo; `logoPath` legado migra como `principal`. */
  logos: z.array(LogoVariante).optional(),
  /** Ajuste MANUAL da distribuição de logos (local → tipo); resto é automático. */
  logosLocais: z.record(LocalDeLogo, z.string()).optional(),
  /** Paleta variável (3–12 cores) sobre os tokens semânticos do gerador. */
  paleta: PaletaDoProjeto.optional(),
  /** Tipografia estendida (presets + escala + papéis); `typography` legado segue. */
  tipografia: TipografiaDoProjeto.optional(),
  /** Redes sociais com ordem, visibilidade e posições. */
  sociais: z.array(RedeSocial).optional(),

  /**
   * De quem é a RÉGUA DE TAMANHO do site: uma escala só, da marca, ou a de cada
   * origem, peça por peça.
   *
   * ## Por que o padrão é `da-marca`
   *
   * Porque a FAMÍLIA da fonte já se comporta assim. O `retipografar` reescreve
   * `font-family` no ponto de uso dentro das peças de origem desde sempre; fazer
   * o tamanho seguir outra regra que a família seria surpresa sem motivo. Some a
   * isso que misturar origens é a promessa central do produto, e uma régua que
   * não conversa mina exatamente essa promessa: hero de 64px em cima e preços de
   * 40px embaixo não porque alguém escolheu, mas porque dois designers
   * escolheram em dois sites e ninguém conciliou. `de-cada-origem` continua
   * disponível para quem quiser justamente a fidelidade de cada captura.
   *
   * ## Por que ligar o padrão não muda projeto que já existe
   *
   * O regime só produz efeito onde há régua MEDIDA. Origem capturada antes de o
   * motor medir escala vem com `escala` ausente, `reguasParaOrigem` devolve
   * mapas vazios e a reescrita não acontece: o literal de tamanho da origem
   * continua valendo, igualzinho a antes. É a mesma degradação da recoloração e
   * da retipografia — sem dado, a peça sai como estava.
   *
   * E branding gravado ANTES deste campo valida sem ajuste nenhum: o `default`
   * do Zod preenche na leitura, então o campo é opcional na entrada e garantido
   * na saída (é por isso que `DEFAULT_PROJECT_BRANDING` também o declara).
   */
  escalaDoSite: RegimeDeEscala.default(REGIME_DE_ESCALA_PADRAO),
});
export type ProjectBranding = z.infer<typeof ProjectBranding>;

/** Item na manifest de mídias do projeto. */
export const MediaItem = z.object({
  path: z.string(),
  mimeType: z.string(),
  kind: z.enum(['image', 'video', 'logo', 'icon', '3d', 'lottie', 'mockup']),
  originalName: z.string(),
  alt: z.string().optional(),
  /**
   * Onde esta mídia entra: o id da seção que o usuário montou. É a FONTE.
   *
   * Aponta para o id, e não para o nome nem para a posição, porque os dois são
   * dele: ele renomeia a seção e a arrasta para outro lugar da página, e a
   * imagem tem de continuar onde ele a pôs. Ausente = ele deixou a critério do
   * gerador, de propósito.
   */
  secaoId: z.string().optional(),
  /**
   * Espelho legado: o papel daquela seção ("hero", "showcase", ...). Derivado de
   * `secaoId` na hora de montar o payload — não é escrito à mão.
   */
  slotRole: z.string().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const MediaManifest = z.array(MediaItem);
export type MediaManifest = z.infer<typeof MediaManifest>;

/** Entrada da tabela projects. */
export const ProjectRecord = z.object({
  id: z.string().startsWith('prj_'),
  name: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  contentJson: z.string().nullable(),
  brandingJson: z.string().nullable(),
  mediaManifestJson: z.string().nullable(),
  layoutJson: z.string().nullable(),
  status: ProjectStatus,
});
export type ProjectRecord = z.infer<typeof ProjectRecord>;

// ── Defaults e normalização de leitura ───────────────────────────────────────
// A FONTE ÚNICA dos defaults de projeto: o server e o gerador leem daqui — não
// existe mais um default local em cada consumidor podendo divergir.

export const DEFAULT_PROJECT_CONTENT: ProjectContent = {
  about: 'Uma empresa moderna que resolve seu problema.',
  slogan: 'A solução que faltava',
  cta: 'Comece agora',
};

export const DEFAULT_PROJECT_BRANDING: ProjectBranding = {
  palette: { primary: '#7f1d1d', background: '#ffffff', foreground: '#0a0a0a' },
  typography: { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
  // Explícito porque o tipo é o de SAÍDA do schema, onde o default já se
  // aplicou. Sem ele, o caminho parcial de `normalizarProjectBranding` montaria
  // um branding sem regime — e o consumidor leria `undefined` no lugar de uma
  // escolha.
  escalaDoSite: REGIME_DE_ESCALA_PADRAO,
};

const jsonSeguro = (raw: string | null): unknown => {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Normaliza o JSON persistido de conteúdo: dado legado (sem versão) e dado
 * corrompido entram; sai SEMPRE um `ProjectContent` válido e carimbado.
 * (O comportamento antigo tinha um buraco real: JSON corrompido virava objeto
 * vazio em vez do default — a página saía sem texto nenhum, em silêncio.)
 */
/**
 * Migra o `sections` legado (texto plano por seção) para `briefs` NA LEITURA:
 * o texto vira a mensagem do brief. Brief já preenchido nunca é sobrescrito.
 */
const migrarContentLegado = (c: ProjectContent): ProjectContent => {
  if (c.briefs !== undefined || c.sections === undefined) return c;
  const briefs: Record<string, BriefDaSecao> = {};
  for (const [role, texto] of Object.entries(c.sections)) {
    if (texto.trim() !== '') {
      briefs[role] = { mensagem: texto.trim(), pontos: [], provas: [], iaDecide: false };
    }
  }
  return Object.keys(briefs).length > 0 ? { ...c, briefs } : c;
};

/**
 * Lê o conteúdo perdendo só o que está quebrado.
 *
 * Antes era um `safeParse` do objeto inteiro com fallback no default, e isso
 * custava caro: `Produto.nome` exige texto, mas o botão de adicionar produto
 * cria um item em branco e o autosave grava. Na leitura seguinte, aquele único
 * produto sem nome derrubava a validação do objeto todo, e o `about`, o
 * `slogan`, os briefs e os OUTROS produtos iam junto — apagados em silêncio,
 * por causa de um campo que a pessoa ainda ia digitar.
 *
 * Agora a degradação é campo a campo, e dentro das listas é item a item: o que
 * está válido fica. Perder um produto pela metade é aceitável; perder o projeto
 * inteiro não é.
 */
const parseTolerante = (bruto: Record<string, unknown>): ProjectContent => {
  const inteiro = ProjectContent.safeParse(bruto);
  if (inteiro.success) return inteiro.data;

  const limpo: Record<string, unknown> = {};
  for (const [chave, schema] of Object.entries(ProjectContent.shape)) {
    const valor = bruto[chave];
    if (valor === undefined) continue;
    if (schema.safeParse(valor).success) {
      limpo[chave] = valor;
      continue;
    }
    // Lista com item ruim não some inteira: sai só o item que não passa.
    if (Array.isArray(valor)) {
      const sobreviventes = valor.filter(
        (item) => schema.safeParse([item]).success || schema.safeParse(item).success,
      );
      if (sobreviventes.length > 0 && schema.safeParse(sobreviventes).success) {
        limpo[chave] = sobreviventes;
      }
    }
  }

  const segundo = ProjectContent.safeParse(limpo);
  return segundo.success ? segundo.data : DEFAULT_PROJECT_CONTENT;
};

export const normalizarProjectContent = (raw: string | null): ProjectContent => {
  const bruto = jsonSeguro(raw);
  if (bruto === null || typeof bruto !== 'object') {
    return { ...DEFAULT_PROJECT_CONTENT, schemaVersion: PROJECT_DATA_VERSION };
  }
  const base = parseTolerante(bruto as Record<string, unknown>);
  return migrarContentLegado({ ...base, schemaVersion: PROJECT_DATA_VERSION });
};

/**
 * Migra os campos LEGADOS do branding para o modelo novo, NA LEITURA:
 * `tone` → observação da identidade verbal; `logoPath` → variação principal;
 * `palette` de 4 cores → paleta nomeada com atribuições; `typography` →
 * tipografia estendida; `social` → lista de redes. Campo novo já preenchido
 * NUNCA é sobrescrito pelo legado.
 */
const migrarBrandingLegado = (b: ProjectBranding): ProjectBranding => {
  const saida = { ...b };
  if (saida.identidadeVerbal === undefined && typeof saida.tone === 'string' && saida.tone.trim()) {
    saida.identidadeVerbal = {
      tons: [],
      arquetipos: [],
      vocabularioPreferido: [],
      vocabularioEvitar: [],
      observacao: saida.tone.trim(),
    };
  }
  if (saida.logos === undefined && typeof saida.logoPath === 'string' && saida.logoPath) {
    saida.logos = [{ tipo: 'principal', path: saida.logoPath }];
  }
  if (saida.paleta === undefined) {
    const p = saida.palette;
    const cores = [
      { id: 'primaria', nome: 'Primária', hex: p.primary },
      { id: 'fundo', nome: 'Fundo', hex: p.background },
      { id: 'texto', nome: 'Texto', hex: p.foreground },
      ...(p.secondary ? [{ id: 'secundaria', nome: 'Secundária', hex: p.secondary }] : []),
      ...(p.accent ? [{ id: 'destaque', nome: 'Destaque', hex: p.accent }] : []),
    ].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex));
    if (cores.length >= 3) {
      saida.paleta = {
        cores,
        atribuicoes: {
          primary: 'primaria',
          background: 'fundo',
          body: 'texto',
          heading: 'texto',
          ...(p.secondary ? { secondary: 'secundaria' } : {}),
          ...(p.accent ? { accent: 'destaque' } : {}),
        },
      };
    }
  }
  if (saida.tipografia === undefined) {
    saida.tipografia = {
      display: saida.typography.display,
      body: saida.typography.body,
      ...(saida.typography.mono ? { mono: saida.typography.mono } : {}),
      presetTitulos: 'equilibrada',
      presetCorpo: 'confortavel',
    };
  }
  if (saida.sociais === undefined && saida.social !== undefined) {
    saida.sociais = Object.entries(saida.social).map(([plataforma, url], i) => ({
      plataforma,
      url,
      ordem: i,
      visivel: true,
    }));
  }
  return saida;
};

/** Normaliza o branding persistido; paleta/tipografia ausentes caem no default. */
export const normalizarProjectBranding = (raw: string | null): ProjectBranding => {
  const bruto = jsonSeguro(raw);
  if (bruto === null || typeof bruto !== 'object') {
    return migrarBrandingLegado({
      ...DEFAULT_PROJECT_BRANDING,
      schemaVersion: PROJECT_DATA_VERSION,
    });
  }
  const tentado = ProjectBranding.safeParse(bruto);
  if (tentado.success) {
    return migrarBrandingLegado({ ...tentado.data, schemaVersion: PROJECT_DATA_VERSION });
  }
  // Parcial (legado incompleto): preserva o que der, completa com o default.
  const parcial = bruto as Partial<ProjectBranding>;
  return migrarBrandingLegado({
    ...DEFAULT_PROJECT_BRANDING,
    ...parcial,
    palette: { ...DEFAULT_PROJECT_BRANDING.palette, ...(parcial.palette ?? {}) },
    typography: { ...DEFAULT_PROJECT_BRANDING.typography, ...(parcial.typography ?? {}) },
    // O espalhamento acima é um CAST, não uma validação: sem isto, um
    // `escalaDoSite` torto no JSON atravessaria intacto e chegaria como regime
    // desconhecido a quem decide a régua. Enum que liga um caminho de código
    // precisa ser um dos dois valores, sempre.
    escalaDoSite: RegimeDeEscala.catch(REGIME_DE_ESCALA_PADRAO).parse(parcial.escalaDoSite),
    schemaVersion: PROJECT_DATA_VERSION,
  });
};
