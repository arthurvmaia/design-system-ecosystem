import { z } from 'zod';

/**
 * Marca do projeto — identidade verbal, logos, paleta com tokens semânticos,
 * tipografia e redes sociais.
 *
 * TUDO aqui é ADITIVO sobre o `ProjectBranding` legado: os campos antigos
 * (`tone` texto livre, `logoPath` único, `palette` de 4 cores) continuam
 * válidos e são migrados NA LEITURA pelos normalizadores — nenhum projeto
 * antigo quebra, nenhum dado some.
 *
 * As derivações (diretrizes editoriais, distribuição de logos, distribuição
 * de tokens) são funções PURAS e determinísticas: a mesma entrada produz a
 * mesma saída, e é isso que os testes provam — inclusive que combinações
 * DIFERENTES de tom/arquétipo produzem diretrizes DIFERENTES.
 */

// ── Identidade verbal ────────────────────────────────────────────────────────

/** Catálogo de tons de voz. O primeiro selecionado é o principal. */
export const TONS_DE_VOZ = [
  { id: 'direto', nome: 'Direto', descricao: 'Vai ao ponto, sem rodeio nem enfeite.' },
  { id: 'confiavel', nome: 'Confiável', descricao: 'Preciso, consistente, sem exagero.' },
  { id: 'acolhedor', nome: 'Acolhedor', descricao: 'Recebe bem, explica com paciência.' },
  {
    id: 'sofisticado',
    nome: 'Sofisticado',
    descricao: 'Refinado, vocabulário rico sem pedantismo.',
  },
  { id: 'descontraido', nome: 'Descontraído', descricao: 'Leve, conversa de igual para igual.' },
  { id: 'inspirador', nome: 'Inspirador', descricao: 'Aponta o horizonte, fala de possibilidade.' },
  { id: 'tecnico', nome: 'Técnico', descricao: 'Nomes certos, números, sem simplificar demais.' },
  { id: 'didatico', nome: 'Didático', descricao: 'Ensina passo a passo, exemplos concretos.' },
  { id: 'minimalista', nome: 'Minimalista', descricao: 'Poucas palavras, muito espaço.' },
  { id: 'energico', nome: 'Enérgico', descricao: 'Ritmo rápido, verbos de ação.' },
  { id: 'proximo', nome: 'Próximo', descricao: 'Fala com você, não para uma audiência.' },
  { id: 'institucional', nome: 'Institucional', descricao: 'Formal, terceira pessoa, protocolo.' },
  { id: 'ousado', nome: 'Ousado', descricao: 'Afirma posição, provoca sem agredir.' },
  { id: 'elegante', nome: 'Elegante', descricao: 'Contido, cadência calma, sem pressa.' },
  { id: 'divertido', nome: 'Divertido', descricao: 'Humor leve onde cabe, nunca no preço.' },
  { id: 'exclusivo', nome: 'Exclusivo', descricao: 'Fala para poucos, detalhe e acabamento.' },
  { id: 'comercial', nome: 'Comercial', descricao: 'Oferta clara, benefício na frente.' },
  { id: 'humano', nome: 'Humano', descricao: 'Gente falando com gente, imperfeição admitida.' },
] as const;

/**
 * Arquétipos clássicos de marca. Arquétipo ≠ tom: o arquétipo muda POSTURA,
 * argumento e relação com o público; o tom muda vocabulário, ritmo e CTAs.
 */
export const ARQUETIPOS = [
  {
    id: 'inocente',
    nome: 'Inocente',
    descricao: 'Otimismo e simplicidade; promete paz de espírito.',
    exemplo: '“Tudo no lugar, sem complicação.”',
  },
  {
    id: 'explorador',
    nome: 'Explorador',
    descricao: 'Liberdade e descoberta; convida a sair do mapa.',
    exemplo: '“Vá aonde ainda não tem trilha.”',
  },
  {
    id: 'sabio',
    nome: 'Sábio',
    descricao: 'Conhecimento e clareza; prova com dados e método.',
    exemplo: '“Entenda antes de decidir.”',
  },
  {
    id: 'heroi',
    nome: 'Herói',
    descricao: 'Coragem e superação; desafia a fazer melhor.',
    exemplo: '“O difícil é exatamente por onde começamos.”',
  },
  {
    id: 'fora-da-lei',
    nome: 'Fora da lei',
    descricao: 'Ruptura; quebra a regra que não serve mais.',
    exemplo: '“O padrão está errado. A gente prova.”',
  },
  {
    id: 'mago',
    nome: 'Mago',
    descricao: 'Transformação; faz o complexo parecer mágica.',
    exemplo: '“Do caos ao pronto em minutos.”',
  },
  {
    id: 'pessoa-comum',
    nome: 'Pessoa comum',
    descricao: 'Pertencimento; sem pedestal, do jeito que é.',
    exemplo: '“Feito por quem também passa por isso.”',
  },
  {
    id: 'amante',
    nome: 'Amante',
    descricao: 'Desejo e estética; seduz pelo detalhe.',
    exemplo: '“Você vai querer olhar de novo.”',
  },
  {
    id: 'bobo-da-corte',
    nome: 'Bobo da corte',
    descricao: 'Alegria; desarma com humor inteligente.',
    exemplo: '“Sério é o boleto. O resto a gente resolve rindo.”',
  },
  {
    id: 'cuidador',
    nome: 'Cuidador',
    descricao: 'Proteção e serviço; ninguém fica para trás.',
    exemplo: '“Deixa com a gente. Você descansa.”',
  },
  {
    id: 'criador',
    nome: 'Criador',
    descricao: 'Expressão e originalidade; ferramenta de quem faz.',
    exemplo: '“Construa algo que ainda não existe.”',
  },
  {
    id: 'governante',
    nome: 'Governante',
    descricao: 'Ordem e liderança; referência da categoria.',
    exemplo: '“O padrão pelo qual os outros se medem.”',
  },
] as const;
export type ArquetipoId = (typeof ARQUETIPOS)[number]['id'];

/** Pares de arquétipos que puxam em direções opostas — aviso, nunca bloqueio. */
const ARQUETIPOS_EM_TENSAO: ReadonlyArray<readonly [ArquetipoId, ArquetipoId]> = [
  ['inocente', 'fora-da-lei'],
  ['governante', 'fora-da-lei'],
  ['sabio', 'bobo-da-corte'],
  ['cuidador', 'heroi'],
];

/** Eixos derivados do modelo editorial, 0 (mínimo) a 4 (máximo). */
export const EixosEditoriais = z.object({
  formalidade: z.number().int().min(0).max(4),
  energia: z.number().int().min(0).max(4),
  proximidade: z.number().int().min(0).max(4),
  objetividade: z.number().int().min(0).max(4),
  sofisticacao: z.number().int().min(0).max(4),
  nivelTecnico: z.number().int().min(0).max(4),
});
export type EixosEditoriais = z.infer<typeof EixosEditoriais>;

export const IdentidadeVerbal = z.object({
  /** Ids de TONS_DE_VOZ; o PRIMEIRO é o principal. Máx. 1 principal + 3. */
  tons: z.array(z.string()).max(4).default([]),
  /** Ids de ARQUETIPOS; o PRIMEIRO é o principal. Máx. 1 principal + 2. */
  arquetipos: z.array(z.string()).max(3).default([]),
  /** Ajustes MANUAIS sobre os eixos derivados (transparente e editável). */
  eixos: EixosEditoriais.optional(),
  vocabularioPreferido: z.array(z.string()).default([]),
  vocabularioEvitar: z.array(z.string()).default([]),
  /** Observação livre (o `tone` legado migra para cá). */
  observacao: z.string().optional(),
});
export type IdentidadeVerbal = z.infer<typeof IdentidadeVerbal>;

/** Ajuste que cada tom aplica aos eixos (delta sobre o neutro 2). */
const DELTA_POR_TOM: Partial<Record<string, Partial<EixosEditoriais>>> = {
  direto: { objetividade: 2, formalidade: -1 },
  confiavel: { objetividade: 1, formalidade: 1 },
  acolhedor: { proximidade: 2, energia: -1 },
  sofisticado: { sofisticacao: 2, formalidade: 1 },
  descontraido: { formalidade: -2, proximidade: 1 },
  inspirador: { energia: 2, objetividade: -1 },
  tecnico: { nivelTecnico: 2, proximidade: -1 },
  didatico: { nivelTecnico: 1, proximidade: 1, objetividade: 1 },
  minimalista: { objetividade: 2, energia: -1, sofisticacao: 1 },
  energico: { energia: 2 },
  proximo: { proximidade: 2, formalidade: -1 },
  institucional: { formalidade: 2, proximidade: -2 },
  ousado: { energia: 1, formalidade: -1 },
  elegante: { sofisticacao: 2, energia: -1 },
  divertido: { formalidade: -2, energia: 1, proximidade: 1 },
  exclusivo: { sofisticacao: 2, proximidade: -1 },
  comercial: { objetividade: 1, energia: 1 },
  humano: { proximidade: 2, formalidade: -1 },
};

/** Postura editorial que cada arquétipo imprime (frases para o guia). */
const POSTURA_POR_ARQUETIPO: Partial<Record<string, string>> = {
  inocente: 'Prometa alívio e simplicidade; evite medo e pressão.',
  explorador: 'Convide à descoberta; argumento de autonomia, não de segurança.',
  sabio: 'Sustente afirmações com evidência; o leitor decide informado.',
  heroi: 'Desafie o leitor a agir; obstáculos existem para serem vencidos.',
  'fora-da-lei': 'Questione o padrão do mercado; posicione contra o status quo.',
  mago: 'Mostre a transformação antes/depois; o como pode ficar nos bastidores.',
  'pessoa-comum': 'Fale de igual para igual; nada de pedestal nem jargão de elite.',
  amante: 'Detalhe sensorial e estética; o desejo vem do acabamento.',
  'bobo-da-corte': 'Humor que desarma; nunca em preço, prazo ou promessa.',
  cuidador: 'Assuma a carga pelo leitor; linguagem de serviço e garantia.',
  criador: 'Celebre o fazer; o leitor é autor, a marca é ferramenta.',
  governante: 'Autoridade serena; referência, não grito.',
};

const clamp04 = (n: number): number => Math.max(0, Math.min(4, Math.round(n)));

export type DiretrizesEditoriais = {
  eixos: EixosEditoriais;
  /** Frases de orientação, na ordem: arquétipo principal → secundários → tons. */
  orientacoes: string[];
  vocabularioPreferido: string[];
  vocabularioEvitar: string[];
  observacao?: string;
};

/**
 * Deriva as diretrizes editoriais da identidade verbal — DETERMINÍSTICO.
 * O peso do item PRINCIPAL (primeiro) é o dobro dos complementares, então
 * trocar o principal muda as diretrizes mesmo com o mesmo conjunto.
 */
export const derivarDiretrizes = (iv: IdentidadeVerbal): DiretrizesEditoriais => {
  const eixos: EixosEditoriais = {
    formalidade: 2,
    energia: 2,
    proximidade: 2,
    objetividade: 2,
    sofisticacao: 2,
    nivelTecnico: 2,
  };
  iv.tons.forEach((tom, i) => {
    const delta = DELTA_POR_TOM[tom];
    if (delta === undefined) return;
    const peso = i === 0 ? 1 : 0.5;
    for (const [eixo, valor] of Object.entries(delta) as [keyof EixosEditoriais, number][]) {
      eixos[eixo] = eixos[eixo] + valor * peso;
    }
  });
  for (const eixo of Object.keys(eixos) as (keyof EixosEditoriais)[]) {
    eixos[eixo] = clamp04(eixos[eixo]);
  }
  const finais = iv.eixos !== undefined ? { ...eixos, ...iv.eixos } : eixos;

  const orientacoes: string[] = [];
  iv.arquetipos.forEach((arq, i) => {
    const postura = POSTURA_POR_ARQUETIPO[arq];
    if (postura !== undefined) {
      orientacoes.push(i === 0 ? `Postura principal: ${postura}` : `Nuance: ${postura}`);
    }
  });
  iv.tons.forEach((tom, i) => {
    const t = TONS_DE_VOZ.find((x) => x.id === tom);
    if (t !== undefined) {
      orientacoes.push(i === 0 ? `Tom principal: ${t.descricao}` : `Tom de apoio: ${t.descricao}`);
    }
  });

  return {
    eixos: finais,
    orientacoes,
    vocabularioPreferido: [...iv.vocabularioPreferido],
    vocabularioEvitar: [...iv.vocabularioEvitar],
    ...(iv.observacao !== undefined ? { observacao: iv.observacao } : {}),
  };
};

/** Combinação de arquétipos em tensão? Devolve o aviso, ou null. */
export const conflitoDeArquetipos = (arquetipos: readonly string[]): string | null => {
  for (const [a, b] of ARQUETIPOS_EM_TENSAO) {
    if (arquetipos.includes(a) && arquetipos.includes(b)) {
      const na = ARQUETIPOS.find((x) => x.id === a)?.nome ?? a;
      const nb = ARQUETIPOS.find((x) => x.id === b)?.nome ?? b;
      return `${na} e ${nb} puxam em direções opostas — funciona, mas exige que um deles domine. O principal decide.`;
    }
  }
  return null;
};

// ── Logos ────────────────────────────────────────────────────────────────────

export const TipoDeLogo = z.enum([
  'principal',
  'horizontal',
  'vertical',
  'simbolo',
  'reduzida',
  'clara',
  'escura',
  'monocromatica',
  'favicon',
  'social',
]);
export type TipoDeLogo = z.infer<typeof TipoDeLogo>;

export const LogoVariante = z.object({
  tipo: TipoDeLogo,
  /** Path relativo em media/ do projeto (mesmo espaço do MediaItem.path). */
  path: z.string(),
  /** Detecções automáticas (aviso, nunca bloqueio) — ausente = não medido. */
  transparente: z.boolean().optional(),
  largura: z.number().int().positive().optional(),
  altura: z.number().int().positive().optional(),
});
export type LogoVariante = z.infer<typeof LogoVariante>;

export const LocalDeLogo = z.enum([
  'cabecalho-claro',
  'cabecalho-escuro',
  'menu-mobile',
  'hero',
  'rodape',
  'favicon',
  'social',
]);
export type LocalDeLogo = z.infer<typeof LocalDeLogo>;

/** Preferência de variante por local, em ordem — o primeiro que existir vence. */
export const PREFERENCIA_POR_LOCAL: Record<LocalDeLogo, TipoDeLogo[]> = {
  'cabecalho-claro': ['escura', 'principal', 'horizontal', 'monocromatica'],
  'cabecalho-escuro': ['clara', 'principal', 'horizontal', 'monocromatica'],
  'menu-mobile': ['simbolo', 'reduzida', 'principal'],
  hero: ['principal', 'horizontal', 'vertical'],
  rodape: ['reduzida', 'horizontal', 'monocromatica', 'principal'],
  favicon: ['favicon', 'simbolo', 'reduzida', 'principal'],
  social: ['social', 'simbolo', 'principal'],
};

/**
 * Distribuição automática de logos por local, com FALLBACK seguro: qualquer
 * variante existente serve quando a preferida falta — com UM logo só, todos os
 * locais o recebem e nada quebra. Determinístico. O ajuste manual do usuário
 * (record local→tipo) sobrepõe a automática na leitura.
 */
export const distribuirLogos = (
  variantes: readonly LogoVariante[],
): Partial<Record<LocalDeLogo, LogoVariante>> => {
  const porTipo = new Map<TipoDeLogo, LogoVariante>();
  for (const v of variantes) {
    if (!porTipo.has(v.tipo)) porTipo.set(v.tipo, v);
  }
  const qualquer = variantes[0];
  const saida: Partial<Record<LocalDeLogo, LogoVariante>> = {};
  if (qualquer === undefined) return saida;
  for (const local of LocalDeLogo.options) {
    const preferencia = PREFERENCIA_POR_LOCAL[local];
    const achada = preferencia.map((t) => porTipo.get(t)).find((v) => v !== undefined);
    saida[local] = achada ?? qualquer;
  }
  return saida;
};

// ── Paleta com tokens semânticos ─────────────────────────────────────────────

/**
 * O conjunto REAL de tokens semânticos do gerador — UM vocabulário para o
 * wizard, o preview e o CSS final. Um controle que não muda um destes tokens
 * não existe.
 */
export const TOKENS_SEMANTICOS = [
  'background',
  'surface',
  'surface-elevated',
  'heading',
  'body',
  'muted',
  'primary',
  'primary-hover',
  'primary-foreground',
  'secondary',
  'accent',
  'border',
  'link',
  'focus',
  'success',
  'warning',
  'error',
] as const;
export type TokenSemantico = (typeof TOKENS_SEMANTICOS)[number];

export const CorDaPaleta = z.object({
  id: z.string(),
  nome: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type CorDaPaleta = z.infer<typeof CorDaPaleta>;

export const PaletaDoProjeto = z.object({
  /** 3 a 12 cores nomeadas, na ordem do usuário. */
  cores: z.array(CorDaPaleta).min(1).max(12),
  /**
   * Atribuição token → id de cor. Ausência = derivar automaticamente na
   * leitura (`distribuirTokens`). Uma cor pode ocupar vários papéis.
   */
  atribuicoes: z.record(z.string(), z.string()).default({}),
});
export type PaletaDoProjeto = z.infer<typeof PaletaDoProjeto>;

const hexParaRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Luminância relativa WCAG (0 escuro … 1 claro). */
export const luminancia = (hex: string): number => {
  const [r, g, b] = hexParaRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Razão de contraste WCAG entre duas cores (1 … 21). */
export const contrasteRatio = (a: string, b: string): number => {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
};

/** Escurece/clareia um hex por um fator (-1..1) — para hover/derivadas. */
export const ajustarHex = (hex: string, fator: number): string => {
  const [r, g, b] = hexParaRgb(hex);
  const aj = (c: number): number =>
    Math.max(0, Math.min(255, Math.round(fator < 0 ? c * (1 + fator) : c + (255 - c) * fator)));
  const h = (c: number): string => aj(c).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

/**
 * O piso de contraste de TEXTO, o mesmo da conferência do site (WCAG, texto
 * grande). Repetido aqui como número e não importado de `regras-de-aceite`
 * porque este arquivo é schema e não pode depender das regras — o teste amarra
 * os dois para não desencostarem.
 */
export const PISO_DE_TEXTO = 3;

/**
 * A cor ajustada até se LER sobre os fundos onde ela vai pousar.
 *
 * Existe por um token só, e por um defeito medido: `link` nascia igual à
 * primária, sem nenhuma conferência. No site do clube a primária é o azul do
 * escudo (`#0050c4`) e o fundo é o marinho do app (`#0b1530`) — 2,5:1. Todo
 * link do site saiu ilegível: **19 dos 27 trechos reprovados eram `<a>`**, no
 * menu, no rodapé e nos contatos.
 *
 * `link` é texto POR DEFINIÇÃO — não existe link que não se lê. Então ele não
 * pode ser a cor da marca crua: ele é a cor da marca ANDADA até o piso, no
 * mesmo matiz, longe dos fundos. `primary` continua exatamente a cor do dono,
 * porque ali ela é tinta de preencher, não de escrever.
 *
 * O passo é pequeno (0,06) e o teto é 12 voltas: paleta impossível devolve o
 * melhor que deu, nunca um laço infinito nem um branco chapado.
 */
export const legivelComoTexto = (cor: string, fundos: readonly string[]): string => {
  if (fundos.length === 0) return cor;
  const pior = (c: string): number =>
    fundos.reduce((m, f) => Math.min(m, contrasteRatio(c, f)), Number.POSITIVE_INFINITY);
  if (pior(cor) >= PISO_DE_TEXTO) return cor;
  // Anda para o lado OPOSTO ao dos fundos: fundo escuro pede tinta mais clara.
  const mediaDosFundos = fundos.reduce((s, f) => s + luminancia(f), 0) / fundos.length;
  const passo = mediaDosFundos < 0.5 ? 0.06 : -0.06;
  let atual = cor;
  for (let i = 0; i < 12; i++) {
    atual = ajustarHex(atual, passo);
    if (pior(atual) >= PISO_DE_TEXTO) return atual;
  }
  return atual;
};

/**
 * Distribuição automática dos tokens sobre a paleta — DETERMINÍSTICA, por
 * luminância e contraste: fundo = a mais extrema em luminância; texto = a de
 * maior contraste com o fundo; primária = a primeira cor NÃO usada como
 * fundo/texto (a ordem do usuário é intenção); derivadas (hover, muted,
 * border, focus) saem por ajuste. Estados (success/warning/error) só entram
 * se houver cor atribuída manualmente — inventar verde/vermelho que não está
 * na paleta seria decidir identidade pelo usuário.
 */
export const distribuirTokens = (
  paleta: PaletaDoProjeto,
): Partial<Record<TokenSemantico, string>> => {
  const cores = paleta.cores;
  if (cores.length === 0) return {};
  const porId = new Map(cores.map((c) => [c.id, c.hex]));

  const ordenadas = [...cores].sort((a, b) => luminancia(a.hex) - luminancia(b.hex));
  const maisEscura = (ordenadas[0] as CorDaPaleta).hex;
  const maisClara = (ordenadas[ordenadas.length - 1] as CorDaPaleta).hex;
  // Tema por VOTO de maioria (média engana: duas cores escuras puxam uma
  // paleta clara para baixo). Empate desempata pela PRIMEIRA cor — a ordem do
  // usuário é intenção.
  const claras = cores.filter((c) => luminancia(c.hex) > 0.5).length;
  const escuras = cores.length - claras;
  const temaClaro =
    claras !== escuras ? claras > escuras : luminancia((cores[0] as CorDaPaleta).hex) > 0.5;
  const fundo = temaClaro ? maisClara : maisEscura;
  const texto =
    contrasteRatio(fundo, maisEscura) >= contrasteRatio(fundo, maisClara) ? maisEscura : maisClara;

  const primaria = cores.find((c) => c.hex !== fundo && c.hex !== texto)?.hex ?? texto;

  const superficie = ajustarHex(fundo, luminancia(fundo) >= 0.5 ? -0.04 : 0.06);
  const superficieAlta = ajustarHex(fundo, luminancia(fundo) >= 0.5 ? -0.08 : 0.12);

  const auto: Partial<Record<TokenSemantico, string>> = {
    background: fundo,
    surface: superficie,
    'surface-elevated': superficieAlta,
    heading: texto,
    body: texto,
    muted: ajustarHex(texto, luminancia(fundo) >= 0.5 ? 0.35 : -0.35),
    primary: primaria,
    'primary-hover': ajustarHex(primaria, luminancia(primaria) >= 0.5 ? -0.15 : 0.15),
    'primary-foreground': contrasteRatio(primaria, '#ffffff') >= 4.5 ? '#ffffff' : '#111111',
    secondary:
      cores.find((c) => c.hex !== fundo && c.hex !== texto && c.hex !== primaria)?.hex ?? primaria,
    accent: [...cores].reverse().find((c) => c.hex !== fundo && c.hex !== texto)?.hex ?? primaria,
    border: ajustarHex(fundo, luminancia(fundo) >= 0.5 ? -0.15 : 0.2),
    link: primaria,
    focus: primaria,
  };

  // Atribuições manuais vencem a automática (inclusive success/warning/error).
  for (const [token, corId] of Object.entries(paleta.atribuicoes)) {
    const hex = porId.get(corId);
    if (hex !== undefined && (TOKENS_SEMANTICOS as readonly string[]).includes(token)) {
      auto[token as TokenSemantico] = hex;
    }
  }

  /**
   * E o link se lê — venha ele da automática ou da mão de quem montou a marca.
   *
   * Esta é a ÚNICA correção que passa por cima de uma atribuição manual, e a
   * razão é o que `link` é: o único token da lista cuja função inteira é ser
   * TEXTO. Escolher a cor dele é escolher a identidade do link, não escolher
   * que ele desapareça — honrar a letra da escolha quebrando a função dela
   * seria a leitura errada.
   *
   * O que se preserva é o MATIZ: a cor continua o azul da marca, andada em
   * luminância até o piso. O que muda é só o suficiente para ler.
   *
   * Medido: o clube atribuiu `link → principal` (`#0050c4`, o azul do escudo)
   * sobre o marinho `#0b1530`. Deu 2,5:1 e **19 dos 27 trechos reprovados na
   * conferência do site eram `<a>`** — o menu inteiro, o rodapé inteiro e os
   * três contatos. A própria nota da marca já dizia que aquele azul não se lê
   * sobre aquele fundo; o que faltava era o motor conferir.
   *
   * `primary` NÃO passa por aqui: ali a cor é tinta de preencher (botão,
   * selo), e preencher com a cor crua do dono é o certo.
   */
  const chao = auto.background;
  if (auto.link !== undefined && chao !== undefined) {
    auto.link = legivelComoTexto(
      auto.link,
      [chao, auto.surface, auto['surface-elevated']].filter((c): c is string => c !== undefined),
    );
  }
  return auto;
};

// ── Tipografia estendida ─────────────────────────────────────────────────────

export const PresetDeTitulos = z.enum([
  'compacta',
  'equilibrada',
  'editorial',
  'impactante',
  'delicada',
]);
export type PresetDeTitulos = z.infer<typeof PresetDeTitulos>;

export const PresetDeCorpo = z.enum(['compacto', 'confortavel', 'amplo', 'editorial']);
export type PresetDeCorpo = z.infer<typeof PresetDeCorpo>;

export const AjusteTipografico = z.object({
  peso: z.number().int().min(100).max(900).optional(),
  /** Razão da escala modular (H6→H1). */
  escala: z.number().min(1.05).max(1.5).optional(),
  lineHeight: z.number().min(0.9).max(2.2).optional(),
  letterSpacing: z.string().optional(),
  transformacao: z.enum(['nenhuma', 'uppercase', 'capitalize']).optional(),
});
export type AjusteTipografico = z.infer<typeof AjusteTipografico>;

export const TipografiaDoProjeto = z.object({
  display: z.string(),
  body: z.string(),
  /** Fonte de destaque opcional (números, citações). */
  destaque: z.string().optional(),
  mono: z.string().optional(),
  presetTitulos: PresetDeTitulos.default('equilibrada'),
  presetCorpo: PresetDeCorpo.default('confortavel'),
  /** Avançado, recolhível na UI — sobrepõe o preset. */
  ajusteTitulos: AjusteTipografico.optional(),
  ajusteCorpo: AjusteTipografico.optional(),
});
export type TipografiaDoProjeto = z.infer<typeof TipografiaDoProjeto>;

const PRESETS_TITULOS: Record<
  PresetDeTitulos,
  Required<Omit<AjusteTipografico, 'transformacao'>> & {
    transformacao: 'nenhuma' | 'uppercase' | 'capitalize';
  }
> = {
  compacta: {
    peso: 700,
    escala: 1.18,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    transformacao: 'nenhuma',
  },
  equilibrada: {
    peso: 600,
    escala: 1.25,
    lineHeight: 1.15,
    letterSpacing: '-0.015em',
    transformacao: 'nenhuma',
  },
  editorial: {
    peso: 500,
    escala: 1.33,
    lineHeight: 1.2,
    letterSpacing: '0',
    transformacao: 'nenhuma',
  },
  impactante: {
    peso: 800,
    escala: 1.4,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    transformacao: 'nenhuma',
  },
  delicada: {
    peso: 400,
    escala: 1.2,
    lineHeight: 1.3,
    letterSpacing: '0.01em',
    transformacao: 'nenhuma',
  },
};

const PRESETS_CORPO: Record<PresetDeCorpo, { tamanho: string; lineHeight: number }> = {
  compacto: { tamanho: '14px', lineHeight: 1.5 },
  confortavel: { tamanho: '16px', lineHeight: 1.65 },
  amplo: { tamanho: '17px', lineHeight: 1.8 },
  editorial: { tamanho: '18px', lineHeight: 1.75 },
};

export type EscalaTipografica = {
  /** Tamanhos derivados H1..H6 (rem), do preset + ajustes. */
  headings: [string, string, string, string, string, string];
  pesoTitulos: number;
  lineHeightTitulos: number;
  letterSpacingTitulos: string;
  transformacaoTitulos: 'nenhuma' | 'uppercase' | 'capitalize';
  corpoTamanho: string;
  corpoLineHeight: number;
};

/** Deriva a escala H1–H6 de um preset + ajustes — determinístico e completo. */
export const derivarEscala = (t: TipografiaDoProjeto): EscalaTipografica => {
  const base = PRESETS_TITULOS[t.presetTitulos];
  const corpo = PRESETS_CORPO[t.presetCorpo];
  const escala = t.ajusteTitulos?.escala ?? base.escala;
  const headings = [5, 4, 3, 2, 1, 0].map(
    (grau) => `${(escala ** grau).toFixed(3)}rem`,
  ) as EscalaTipografica['headings'];
  return {
    headings,
    pesoTitulos: t.ajusteTitulos?.peso ?? base.peso,
    lineHeightTitulos: t.ajusteTitulos?.lineHeight ?? base.lineHeight,
    letterSpacingTitulos: t.ajusteTitulos?.letterSpacing ?? base.letterSpacing,
    transformacaoTitulos: t.ajusteTitulos?.transformacao ?? base.transformacao,
    corpoTamanho: corpo.tamanho,
    corpoLineHeight: t.ajusteCorpo?.lineHeight ?? corpo.lineHeight,
  };
};

// ── Redes sociais ────────────────────────────────────────────────────────────

export const PosicaoSocial = z.enum(['cabecalho', 'menu-mobile', 'rodape', 'contato']);
export type PosicaoSocial = z.infer<typeof PosicaoSocial>;

export const RedeSocial = z.object({
  plataforma: z.string(),
  url: z.string(),
  usuario: z.string().optional(),
  ordem: z.number().int().nonnegative().default(0),
  visivel: z.boolean().default(true),
  /** Ausente = distribuição automática (rodapé + contato). */
  posicoes: z.array(PosicaoSocial).optional(),
});
export type RedeSocial = z.infer<typeof RedeSocial>;
