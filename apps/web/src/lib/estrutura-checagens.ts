import {
  ROLE_CATEGORIES,
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  SectionRole,
  adicionarSecao,
  ehPecaDeFundo,
  moverSecao,
  papelParaCategoria,
  slugDaSecao,
} from '@ds/shared/schemas';

/**
 * As checagens puras da etapa Estrutura.
 *
 * A tela virou um editor visual (lista de seções + prévia empilhada + grade de
 * peças), e cada decisão que não é desenho vive aqui, testável sem navegador:
 * que papéis obrigatórios faltam, que peça encaixa onde, e como as peças de
 * fundo são separadas do fluxo sem mudar o modelo de dados.
 */

/** O mínimo que estas checagens precisam saber de uma peça do kit. */
export type PecaDoKit = { id: string; name: string; category: string; kind?: string };

/**
 * `ehPecaDeFundo` do shared pede `kind` sempre; o resumo que a resolução usa
 * não o carrega. Ler com defesa atende os dois formatos — sem `kind` sobra a
 * detecção por categoria, igual ao `temCaraDeFundo` do próprio shared.
 */
export const ehFundo = (p: PecaDoKit): boolean =>
  ehPecaDeFundo({ category: p.category, kind: p.kind ?? '' });

// ── Papéis obrigatórios ─────────────────────────────────────────────────────

/**
 * Toda página precisa de navegação, abertura e rodapé. Não é gosto: sem nav o
 * visitante não circula, sem hero a página não se apresenta, e o CSS responsivo
 * tem regra presa a `[data-secao="nav"]` que some calada se a seção não existe.
 */
export const PAPEIS_OBRIGATORIOS = ['nav', 'hero', 'footer'] as const;
export type PapelObrigatorio = (typeof PAPEIS_OBRIGATORIOS)[number];

/** Por que cada papel obrigatório importa, na frase que o aviso mostra. */
export const MOTIVO_DO_PAPEL: Record<PapelObrigatorio, string> = {
  nav: 'sem ela, quem chega não tem como circular pelo site',
  hero: 'sem ela, a página começa sem dizer o que é',
  footer: 'sem ele, o site termina sem contato nem fechamento',
};

/**
 * Que papéis obrigatórios a estrutura ainda não tem.
 *
 * Usa a MESMA inferência do gerador (`slugDaSecao`): uma seção sem papel
 * declarado mas com uma peça de navegação conta como navegação — cobrar dela
 * seria pedir o que já existe.
 */
export const papeisObrigatoriosFaltantes = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly PecaDoKit[],
): PapelObrigatorio[] => {
  const presentes = new Set(secoes.map((s) => slugDaSecao(s, componentes)));
  return PAPEIS_OBRIGATORIOS.filter((p) => !presentes.has(p));
};

// ── Papel efetivo e selinho de posição ──────────────────────────────────────

/**
 * O papel que a seção EXERCE: o declarado, ou o inferido pela primeira peça.
 *
 * É `slugDaSecao` tipado de volta — o "não sei" dele (`'secao'`) não é um
 * `SectionRole`, e o parse do enum devolve `undefined` sem cast na mão.
 */
export const papelEfetivoDaSecao = (
  secao: SecaoDoSite,
  componentes: readonly PecaDoKit[],
): SectionRole | undefined => {
  const tentado = SectionRole.safeParse(slugDaSecao(secao, componentes));
  return tentado.success ? tentado.data : undefined;
};

/**
 * O selinho da grade de peças: onde esta peça costuma funcionar melhor.
 * Categoria que nenhum papel reivindica fica sem selinho — chutar seria pior.
 */
export const selinhoDaPeca = (categoria: string): string | undefined => {
  const papel = papelParaCategoria(categoria);
  return papel === undefined
    ? undefined
    : `boa para ${ROTULO_DE_PAPEL[papel].toLocaleLowerCase('pt-BR')}`;
};

// ── Agrupamento da grade de peças ───────────────────────────────────────────

/**
 * Divide as peças do kit para a grade de escolha: as que encaixam no papel da
 * seção primeiro, o resto depois. Peça de fundo não entra em nenhum grupo —
 * ela tem slot próprio na página e posta numa seção colapsaria numa faixa.
 */
export const agruparPecasParaSecao = (
  componentes: readonly PecaDoKit[],
  papel: SectionRole | undefined,
): { encaixam: PecaDoKit[]; outras: PecaDoKit[] } => {
  const cats = papel !== undefined ? ROLE_CATEGORIES[papel] : [];
  const encaixam: PecaDoKit[] = [];
  const outras: PecaDoKit[] = [];
  for (const c of componentes) {
    if (ehFundo(c)) continue;
    (cats.includes(c.category) ? encaixam : outras).push(c);
  }
  return { encaixam, outras };
};

// ── Fundo da página ─────────────────────────────────────────────────────────

/** Uma peça de fundo em uso, com a seção que a hospeda no modelo de dados. */
export type FundoEmUso = {
  secaoId: string;
  peca: PecaDoKit;
  /** A seção existe SÓ para carregar este fundo; a lista a esconde. */
  secaoSoDeFundo: boolean;
};

/**
 * Separa a APRESENTAÇÃO: seções que aparecem na lista reordenável e peças de
 * fundo que aparecem no bloco "Fundo da página". O modelo de dados não muda —
 * todo fundo continua dentro de uma seção em `layout.secoes`, e é o gerador
 * (`separarCamadasDePagina`) que o transforma em camada fixa na hora de montar.
 *
 * Seção com instrução ou com peça de conteúdo fica na lista mesmo carregando
 * fundo: ainda há o que gerar nela. Só a seção que existe apenas para hospedar
 * o fundo sai da lista, senão ela apareceria como uma seção vazia misteriosa.
 */
export const separarFundos = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly PecaDoKit[],
): { visiveis: SecaoDoSite[]; fundos: FundoEmUso[] } => {
  const porId = new Map(componentes.map((c) => [c.id, c]));
  const visiveis: SecaoDoSite[] = [];
  const fundos: FundoEmUso[] = [];
  for (const s of secoes) {
    const resolvidas = s.componentIds.flatMap((id) => {
      const c = porId.get(id);
      return c === undefined ? [] : [c];
    });
    const deFundo = resolvidas.filter(ehFundo);
    const temConteudo = resolvidas.some((c) => !ehFundo(c));
    const soDeFundo = deFundo.length > 0 && !temConteudo && (s.instrucao ?? '').trim() === '';
    for (const f of deFundo) fundos.push({ secaoId: s.id, peca: f, secaoSoDeFundo: soDeFundo });
    if (!soDeFundo) visiveis.push(s);
  }
  return { visiveis, fundos };
};

/** Peças de fundo do kit que ainda não estão em nenhuma seção — a oferta do bloco. */
export const fundosDisponiveis = (
  componentes: readonly PecaDoKit[],
  fundosEmUso: readonly FundoEmUso[],
): PecaDoKit[] => {
  const usados = new Set(fundosEmUso.map((f) => f.peca.id));
  return componentes.filter((c) => ehFundo(c) && !usados.has(c.id));
};

/**
 * Põe um fundo na página: cria a seção hospedeira no fim da lista. A posição
 * não importa (o gerador tira o fundo do fluxo de qualquer jeito), e o nome
 * vem preenchido porque o gate de navegação exige nome em toda seção.
 */
export const adicionarFundo = (
  secoes: readonly SecaoDoSite[],
  componenteId: string,
  novoId?: () => string,
): SecaoDoSite[] => {
  const lista = novoId === undefined ? adicionarSecao(secoes) : adicionarSecao(secoes, novoId);
  const nova = lista[lista.length - 1];
  if (nova !== undefined)
    lista[lista.length - 1] = { ...nova, nome: 'Fundo da página', componentIds: [componenteId] };
  return lista;
};

/**
 * Tira um fundo da página. Se a seção existia só para carregá-lo (e não sobra
 * outro fundo nela), ela sai junto — deixá-la viraria uma seção vazia invisível
 * que o site geraria mesmo assim, sem ninguém saber de onde veio.
 */
export const tirarFundo = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly PecaDoKit[],
  secaoId: string,
  componenteId: string,
): SecaoDoSite[] => {
  const { fundos } = separarFundos(secoes, componentes);
  const alvo = fundos.find((f) => f.secaoId === secaoId && f.peca.id === componenteId);
  if (alvo === undefined) return [...secoes];
  const sobraOutroFundo = fundos.some((f) => f.secaoId === secaoId && f.peca.id !== componenteId);
  return secoes.flatMap((s) => {
    if (s.id !== secaoId) return [s];
    if (alvo.secaoSoDeFundo && !sobraOutroFundo) return [];
    return [{ ...s, componentIds: s.componentIds.filter((id) => id !== componenteId) }];
  });
};

/**
 * Move uma seção entre as VISÍVEIS. `moverSecao` puro anda uma posição na
 * lista completa, e uma seção hospedeira de fundo escondida no meio faria o
 * movimento "não acontecer" na tela. Aqui o passo é entre vizinhas visíveis, e
 * as hospedeiras vão para o fim — posição delas não significa nada.
 */
export const moverSecaoVisivel = (
  secoes: readonly SecaoDoSite[],
  componentes: readonly PecaDoKit[],
  id: string,
  direcao: 'cima' | 'baixo',
): SecaoDoSite[] => {
  const { visiveis } = separarFundos(secoes, componentes);
  const movidas = moverSecao(visiveis, id, direcao);
  const mudou = movidas.some((s, i) => s.id !== visiveis[i]?.id);
  // Movimento nulo (primeira para cima, última para baixo) devolve a lista
  // como está — reordenar as escondidas aqui só dispararia autosave à toa.
  if (!mudou) return [...secoes];
  const idsVisiveis = new Set(visiveis.map((s) => s.id));
  return [...movidas, ...secoes.filter((s) => !idsVisiveis.has(s.id))];
};
