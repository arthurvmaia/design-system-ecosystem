import type { ComponentCategory, StructuralNode, StructuralRole } from '@ds/shared';

/**
 * Escolha das PEÇAS de dentro das dobras, por evidência medida.
 *
 * A subdivisão nasceu lendo o HTML da seção como texto e adivinhando por nome de
 * classe (`rounded|border|shadow`). Isso funciona num site com CSS previsível e
 * falha em todo o resto: o mockup de celular do Cogni é um bloco só, sem irmãos
 * iguais, e nunca casava com "família de cards"; a seção inteira de cards rendia
 * zero cards. Enquanto isso a captura já tinha medido 241 nós no navegador e
 * rotulado 40 deles como `card`, 7 como `image`, 5 como `button`.
 *
 * Aqui a decisão passa a sair dessa medição: papel observado, caixa em pixels,
 * mídia na subárvore, texto. Nome de classe não entra — o que vale é o que o
 * elemento é na tela.
 */

/** Papéis que são a DOBRA, não uma peça dentro dela. */
const PAPEIS_DE_SECAO: ReadonlySet<StructuralRole> = new Set([
  'document',
  'header',
  'nav',
  'hero',
  'main',
  'section',
  'article',
  'aside',
  'footer',
  'form',
]);

/** Papel medido → categoria da Galeria. Fora deste mapa, o nó não vira peça. */
const CATEGORIA_POR_PAPEL: Partial<Record<StructuralRole, ComponentCategory>> = {
  card: 'card',
  group: 'card',
  listitem: 'card',
  list: 'card',
  'media-group': 'gallery',
  button: 'button',
  link: 'button',
  image: 'other',
  video: 'other',
  canvas: 'other',
  svg: 'other',
  iframe: 'other',
};

/** Nome de exibição por categoria, antes da contagem. */
const NOME_BASE: Record<string, string> = {
  card: 'Card',
  button: 'Botão',
  gallery: 'Galeria',
  other: 'Bloco visual',
};

/**
 * Menor que isto é ícone ou espaçador, não peça. Medida em pixels reais da
 * página — a mesma grandeza que a pessoa vê.
 */
const LARGURA_MINIMA = 80;
const ALTURA_MINIMA = 40;

/**
 * Peça que ocupa mais que isto da página não é peça: é a dobra outra vez. O
 * corte é sobre a ÁREA DA PÁGINA, não sobre bytes.
 */
const FRACAO_MAXIMA_DA_PAGINA = 0.35;

/** Sem texto e sem mídia é enfeite: uma caixa com gradiente não é componente. */
const TEXTO_MINIMO = 8;

/** Teto global por captura — a Galeria precisa continuar navegável. */
const MAX_PECAS = 48;

export type PecaCandidata = {
  /** Hash do nó medido — a chave para pegar o HTML depois. */
  hash: string;
  categoria: ComponentCategory;
  /** Nome já com a contagem quando o estilo se repete ("Card (×3)"). */
  nome: string;
  /** Quantos nós compartilham a mesma assinatura estrutural. */
  quantidade: number;
  /** Hash da seção que a contém, quando há uma. */
  secaoHash: string | null;
  /** Ordem de leitura na página (topo → base). */
  ordem: number;
};

/** Assinatura de estilo: o que faz dois nós serem "a mesma peça repetida". */
const assinaturaDe = (no: StructuralNode): string => {
  const f = no.fingerprint;
  const est = f.structuralSignature ?? '';
  if (est.length > 0) return `${no.role}|${est}`;
  return `${no.role}|${f.tag}|${[...(f.stableClasses ?? [])].sort().join(' ')}`;
};

const area = (no: StructuralNode): number => (no.pageBox?.w ?? 0) * (no.pageBox?.h ?? 0);

/** O nó tem substância própria: texto legível ou mídia de verdade. */
const temSubstancia = (no: StructuralNode): boolean =>
  no.subtreeTextLength >= TEXTO_MINIMO || (no.mediaTags?.length ?? 0) > 0;

/**
 * O candidato mais próximo acima deste na árvore, entre os elegíveis.
 */
const candidatoAcima = (
  no: StructuralNode,
  elegiveis: ReadonlyMap<string, StructuralNode>,
  porHash: ReadonlyMap<string, StructuralNode>,
): StructuralNode | null => {
  let paiHash = no.parent;
  let saltos = 0;
  while (paiHash !== null && saltos < 40) {
    const candidato = elegiveis.get(paiHash);
    if (candidato !== undefined) return candidato;
    paiHash = porHash.get(paiHash)?.parent ?? null;
    saltos++;
  }
  return null;
};

/**
 * Um candidato que encaixa outros é EMBRULHO ou CONTÊINER, e a diferença decide
 * quem fica.
 *
 * **Embrulho** é a mesma peça vista de novo: o mockup de celular aparece como
 * moldura → corpo → tela, caixas praticamente idênticas. Ali fica o de FORA,
 * senão a peça chega picada.
 *
 * **Contêiner** é a grade: uma faixa cujos filhos são várias peças bem menores.
 * Ali fica quem está DENTRO — foi por não separar os dois casos que um site
 * grande rendeu quatro peças, com um contêiner engolindo dezenas de cards.
 *
 * O corte é geométrico, não por nome de classe: filho que ocupa quase toda a
 * área do pai é o próprio pai; vários filhos pequenos são a grade dele.
 */
const FRACAO_DE_EMBRULHO = 0.7;

const ehContainer = (no: StructuralNode, filhosDiretos: readonly StructuralNode[]): boolean => {
  if (filhosDiretos.length < 2) return false;
  const areaPai = area(no);
  if (areaPai <= 0) return false;
  return filhosDiretos.every((f) => area(f) / areaPai < FRACAO_DE_EMBRULHO);
};

/** A dobra que contém o nó, subindo pelo DOM até um papel de seção. */
const secaoDe = (
  no: StructuralNode,
  porHash: ReadonlyMap<string, StructuralNode>,
): string | null => {
  let atualHash = no.parent;
  let saltos = 0;
  while (atualHash !== null && saltos < 40) {
    const pai = porHash.get(atualHash);
    if (pai === undefined) return null;
    if (PAPEIS_DE_SECAO.has(pai.role) && pai.role !== 'document' && pai.role !== 'main') {
      return atualHash;
    }
    atualHash = pai.parent;
    saltos++;
  }
  return null;
};

/**
 * As peças de uma captura, do topo da página para baixo.
 *
 * Um exemplar por assinatura (com a contagem no nome), sem peça dentro de peça,
 * e com teto para a Galeria não virar despejo. Puro: recebe a medição e devolve
 * a decisão, sem tocar em navegador nem em disco.
 */
export const escolherPecas = (opts: {
  nos: readonly StructuralNode[];
  pageHeight: number;
  viewportWidth: number;
  max?: number;
}): PecaCandidata[] => {
  const { nos, pageHeight, viewportWidth } = opts;
  const areaDaPagina = Math.max(1, viewportWidth * pageHeight);
  const porHash = new Map(nos.map((n) => [n.fingerprint.hash, n]));

  const elegiveis = nos.filter((no) => {
    if (PAPEIS_DE_SECAO.has(no.role)) return false;
    if (CATEGORIA_POR_PAPEL[no.role] === undefined) return false;
    if (!no.visible) return false;
    const caixa = no.pageBox;
    if (caixa === undefined) return false;
    if (caixa.w < LARGURA_MINIMA || caixa.h < ALTURA_MINIMA) return false;
    if (area(no) / areaDaPagina > FRACAO_MAXIMA_DA_PAGINA) return false;
    return temSubstancia(no);
  });

  // Contêiner é desmontado, embrulho é mantido: o que resta são as peças reais.
  const porHashElegivel = new Map(elegiveis.map((n) => [n.fingerprint.hash, n]));
  const filhosCandidatos = new Map<string, StructuralNode[]>();
  for (const no of elegiveis) {
    const acima = candidatoAcima(no, porHashElegivel, porHash);
    if (acima === null) continue;
    const chave = acima.fingerprint.hash;
    const atual = filhosCandidatos.get(chave);
    if (atual) atual.push(no);
    else filhosCandidatos.set(chave, [no]);
  }
  const pecasReais = elegiveis.filter((no) => {
    // Grade: quem vale são os itens dela, não a faixa.
    if (ehContainer(no, filhosCandidatos.get(no.fingerprint.hash) ?? [])) return false;
    // Dentro de um embrulho: a peça inteira é a de fora, esta é parte dela.
    const acima = candidatoAcima(no, porHashElegivel, porHash);
    if (acima === null) return true;
    return ehContainer(acima, filhosCandidatos.get(acima.fingerprint.hash) ?? []);
  });

  // Famílias por assinatura: o primeiro em ordem de leitura é o exemplar.
  const familias = new Map<string, StructuralNode[]>();
  for (const no of pecasReais) {
    const chave = assinaturaDe(no);
    const atual = familias.get(chave);
    if (atual) atual.push(no);
    else familias.set(chave, [no]);
  }

  const aceitos = [...familias.values()].map((grupo) => {
    const ordenado = [...grupo].sort((a, b) => (a.pageBox?.y ?? 0) - (b.pageBox?.y ?? 0));
    return { no: ordenado[0] as StructuralNode, quantidade: grupo.length };
  });

  // Corte por relevância visual (área × repetição), depois volta à ordem da
  // página: quem lê a Galeria lê de cima para baixo, não por pontuação.
  const teto = opts.max ?? MAX_PECAS;
  const porRelevancia = [...aceitos].sort(
    (a, b) => area(b.no) * b.quantidade - area(a.no) * a.quantidade,
  );
  const cortados = new Set(porRelevancia.slice(0, teto).map((x) => x.no.fingerprint.hash));

  return aceitos
    .filter((x) => cortados.has(x.no.fingerprint.hash))
    .sort((a, b) => (a.no.pageBox?.y ?? 0) - (b.no.pageBox?.y ?? 0))
    .map((x, i) => {
      const categoria = CATEGORIA_POR_PAPEL[x.no.role] as ComponentCategory;
      const base = NOME_BASE[categoria] ?? 'Peça';
      return {
        hash: x.no.fingerprint.hash,
        categoria,
        nome: x.quantidade >= 2 ? `${base} (×${x.quantidade})` : base,
        quantidade: x.quantidade,
        secaoHash: secaoDe(x.no, porHash),
        ordem: i,
      };
    });
};
