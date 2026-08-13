/**
 * As categorias de nicho que MAIS VENDEM no Brasil — e a ordem é o produto.
 *
 * ## Por que isto existe
 *
 * O dono pediu na tela de Kits: *"eu queria que vc segmentasse os kits por
 * categorias de nichos mais vendidos info ou produtos no brasil"*. Um kit é
 * escolhido para atender um CLIENTE, e quem escolhe pensa no mercado do
 * cliente — não na ordem alfabética. A grade agrupada por categoria quente
 * responde "tenho kit para o nicho que me paga?" de uma olhada.
 *
 * ## De onde vem a ordem
 *
 * Do consenso dos rankings públicos de venda no Brasil, somando infoproduto
 * (Hotmart/Kiwify: finanças, saúde, educação, marketing) e produto físico
 * (e-commerce: moda, beleza, casa, comida). É retrato de mercado, não medida
 * do app — quando o mercado girar, muda-se AQUI e todas as telas acompanham.
 *
 * ## Fonte única, como a taxonomia
 *
 * A mesma regra de `taxonomia.ts`: nenhuma tela redigita esta lista. Quem
 * precisa dela importa daqui — é o que impede a Galeria de dizer uma coisa e a
 * tela de Kits outra.
 */

export type CategoriaDeNicho = {
  /** Identificador estável — vai em querystring e em teste. */
  slug: string;
  /** O que a pessoa lê como título da faixa. */
  rotulo: string;
  /** Por que esta categoria vende — a frase que ajuda a escolher. */
  porQueVende: string;
  /**
   * Palavras que reconhecem um kit desta categoria pelo NOME.
   *
   * Por palavra, e não por lista fechada de nomes, porque kit é criável pela
   * pessoa: um "Kit Nutrição Esportiva" que ela montar amanhã precisa cair em
   * Saúde sem ninguém editar tabela. Minúsculas, sem acento — o casamento
   * normaliza os dois lados.
   */
  reconhecePor: readonly string[];
};

/** A ordem DESTA lista é a ordem das faixas na tela. */
export const CATEGORIAS_DE_NICHO: readonly CategoriaDeNicho[] = [
  {
    slug: 'saude-e-bem-estar',
    rotulo: 'Saúde e bem-estar',
    porQueVende:
      'O nicho que mais fatura em infoproduto no Brasil: emagrecimento, treino e hábito.',
    reconhecePor: [
      'academia',
      'bem-estar',
      'fitness',
      'saude',
      'nutricao',
      'emagre',
      'treino',
      'yoga',
      'clinica',
      'consultorio',
      'odonto',
      'psico',
      'fisio',
    ],
  },
  {
    slug: 'financas-e-negocios',
    rotulo: 'Finanças e negócios',
    porQueVende:
      'Dinheiro ensina dinheiro: investimento, crédito e gestão pagam os maiores tíquetes.',
    reconhecePor: [
      'fintech',
      'financa',
      'invest',
      'contab',
      'credito',
      'banco',
      'seguro',
      'advocacia',
      'consultoria',
      'juridic',
    ],
  },
  {
    slug: 'educacao-e-carreira',
    rotulo: 'Educação e carreira',
    porQueVende: 'Curso, concurso e idioma: o infoproduto clássico, com recorrência de matrícula.',
    reconhecePor: ['educacao', 'curso', 'escola', 'concurso', 'idioma', 'mentoria', 'aula'],
  },
  {
    slug: 'beleza-e-moda',
    rotulo: 'Beleza e moda',
    porQueVende: 'O topo do e-commerce físico brasileiro: estética, cosmético e vestuário.',
    reconhecePor: [
      'beleza',
      'estetica',
      'moda',
      'vestuario',
      'cosmetic',
      'salao',
      'barbearia',
      'maquiagem',
    ],
  },
  {
    slug: 'marketing-e-software',
    rotulo: 'Marketing e software',
    porQueVende: 'Quem vende para quem vende: agência, SaaS e assinatura, o B2B que escala.',
    reconhecePor: [
      'agencia',
      'marketing',
      'software',
      'assinatura',
      'saas',
      'startup',
      'tecnologia',
      'app',
    ],
  },
  {
    slug: 'casa-e-imovel',
    rotulo: 'Casa e imóvel',
    porQueVende: 'Tíquete alto e decisão visual: imóvel, arquitetura, reforma e decoração.',
    reconhecePor: [
      'imovel',
      'imobili',
      'arquitetura',
      'construtora',
      'reforma',
      'decoracao',
      'casa',
      'engenharia',
    ],
  },
  {
    slug: 'comida-e-experiencia',
    rotulo: 'Comida e experiência',
    porQueVende: 'Restaurante, evento e viagem: a foto vende antes do texto.',
    reconhecePor: [
      'restaurante',
      'cafeteria',
      'gastrono',
      'comida',
      'turismo',
      'hospedagem',
      'hotel',
      'evento',
      'clube',
      'viagem',
    ],
  },
  {
    slug: 'criativos-e-portfolio',
    rotulo: 'Criativos e portfólio',
    porQueVende: 'Fotografia, estúdio e marca pessoal: o site É a vitrine do trabalho.',
    reconhecePor: [
      'fotografia',
      'audiovisual',
      'portfolio',
      'estudio',
      'design',
      'marca pessoal',
      'criativo',
      'produtora',
    ],
  },
  {
    slug: 'loja-e-produto',
    rotulo: 'Loja e produto',
    porQueVende: 'A vitrine generalista: produto físico com preço à vista de quem decide.',
    reconhecePor: ['loja', 'produto fisico', 'ecommerce', 'e-commerce', 'vitrine', 'pet'],
  },
  {
    slug: 'causa-e-comunidade',
    rotulo: 'Causa e comunidade',
    porQueVende:
      'ONG, projeto social e comunidade: impacto e doação pedem confiança antes do pedido.',
    reconhecePor: ['causa', 'organizacao social', 'ong', 'igreja', 'comunidade', 'doacao'],
  },
] as const;

/** A faixa de quem não casou com nenhuma: dizer "outros" é mais honesto que forçar. */
export const CATEGORIA_OUTROS: CategoriaDeNicho = {
  slug: 'outros',
  rotulo: 'Outros kits',
  porQueVende:
    'Kits que ainda não pertencem a uma categoria de mercado — nomeie-os pelo nicho e eles sobem.',
  reconhecePor: [],
};

const semAcento = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * A categoria de um kit, pelo NOME dele.
 *
 * Primeira categoria (na ordem de mercado) cuja palavra aparece no nome vence.
 * Kit sem casamento cai em "Outros" — aparecer numa faixa errada é pior que
 * aparecer na última, porque ensina a pessoa a desconfiar das faixas.
 */
export const categoriaDoKit = (nomeDoKit: string): CategoriaDeNicho => {
  const nome = semAcento(nomeDoKit);
  for (const c of CATEGORIAS_DE_NICHO) {
    if (c.reconhecePor.some((p) => nome.includes(semAcento(p)))) return c;
  }
  return CATEGORIA_OUTROS;
};

/**
 * Os kits agrupados nas faixas, na ordem de mercado, sem faixa vazia.
 *
 * Genérico em T para a tela passar o kit inteiro dela e receber os grupos
 * prontos — a lógica mora aqui e o componente só desenha.
 */
export const agruparKitsPorNicho = <T extends { name: string }>(
  kits: readonly T[],
): { categoria: CategoriaDeNicho; kits: T[] }[] => {
  const porSlug = new Map<string, { categoria: CategoriaDeNicho; kits: T[] }>();
  for (const kit of kits) {
    const c = categoriaDoKit(kit.name);
    const grupo = porSlug.get(c.slug) ?? { categoria: c, kits: [] };
    grupo.kits.push(kit);
    porSlug.set(c.slug, grupo);
  }
  const ordem = [...CATEGORIAS_DE_NICHO, CATEGORIA_OUTROS];
  return ordem.map((c) => porSlug.get(c.slug)).filter((g) => g !== undefined);
};
