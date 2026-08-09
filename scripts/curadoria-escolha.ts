import {
  type PecaParaAceite,
  ROLE_CATEGORIES,
  SEQUENCIAS,
  type SectionRole,
  conferirPecaDaGaleria,
} from '@ds/shared';

/**
 * A DECISÃO da curadoria, separada da leitura de disco.
 *
 * `curar-biblioteca.ts` continua sendo o comando: ele lê o banco, o manifesto e
 * o bundle. O que mora aqui é a parte que não toca em nada — dar nota e
 * escolher — porque era justamente essa parte que não tinha teste: o arquivo
 * chamava `principal()` na importação, e importá-lo num teste rodaria a
 * curadoria do acervo de verdade da máquina.
 */

export type Nota = {
  segId: string;
  dsId: string;
  nome: string;
  categoria: string;
  kind: string;
  nota: number;
  motivos: string[];
  reprova: string | null;
  /** O motivo da reprova SEM os números — é por ele que o resumo agrupa. */
  reprovaTipo: string | null;
  jaNaBiblioteca: boolean;
};

/** Categorias cujo valor é o COMPORTAMENTO, não o tamanho do HTML. */
const PEQUENAS_POR_NATUREZA = new Set(['interaction', 'cursor']);

/** Tudo o que a nota precisa saber, já lido do disco por quem chama. */
export type EntradaDeAvaliacao = {
  segId: string;
  dsId: string;
  nome: string;
  categoria: string;
  kind: string;
  htmlSnippet: string | null;
  jaNaBiblioteca: boolean;
  /** Fidelidade medida na captura (0-100). */
  fidelidade: number;
  /** Representação decidida no manifesto do BUNDLE. */
  representacao: PecaParaAceite['representacao'];
  /** Representação declarada no insight do segmento (é a que o aceite lê). */
  representacaoDoInsight: PecaParaAceite['representacao'];
  interacoes: number;
  /** A captura mediu movimento na região? */
  movimentoProprio: boolean;
  suporte: string | null;
  /** `false` quando a comparação de pixel reprovou; `null` quando não houve. */
  comparacaoVisualOk: boolean | null;
  comparacaoVisualDelta: number | null;
  /** O rastreamento de terceiro que o bundle carrega (G8). */
  rastreamento: PecaParaAceite['rastreamento'];
  alvosPerdidos: PecaParaAceite['alvosPerdidos'];
};

export const avaliarPeca = (e: EntradaDeAvaliacao): Nota => {
  const motivos: string[] = [];
  let nota = 0;
  let reprova: string | null = null;
  let reprovaTipo: string | null = null;

  const html = e.htmlSnippet ?? '';

  /**
   * A REGRA DE ACEITE DA GALERIA manda aqui (`docs/regras-de-aceite.md`).
   *
   * Ela é o portão que o dono pediu: "uma etapa de conferência antes de você
   * realmente colocar isso na galeria". A curadoria continua tendo a nota dela
   * para ORDENAR, mas quem decide se a peça pode subir é a regra — senão haveria
   * dois critérios, e o mais frouxo venceria na primeira pressa.
   */
  const aceite = conferirPecaDaGaleria({
    categoria: e.categoria,
    kind: e.kind,
    htmlSnippet: html,
    representacao: e.representacaoDoInsight,
    // A captura não guarda, por segmento, qual runtime trouxe script — isso
    // mora no manifesto do bundle. Aqui a lista fica vazia e G1 passa; a
    // conferência completa de G1 acontece na compilação, onde o bundle existe.
    runtimes: [],
    // G8 é a exceção, e por um motivo simples: o bundle ESTÁ em disco na hora
    // da curadoria. Era o primeiro campo a sair do limbo do comentário acima.
    rastreamento: e.rastreamento,
    alvosPerdidos: e.alvosPerdidos,
    movimentoProprio: e.movimentoProprio,
    classesDeRevelacao: [],
    temObservadorDeRolagem: false,
    refsQuebradas: [],
    assetsNaOrigem: [],
  });
  const primeiraReprovacao = aceite.vereditos.find((v) => v.estado === 'reprovou');
  if (primeiraReprovacao !== undefined) {
    reprova = `${primeiraReprovacao.codigo}: ${primeiraReprovacao.motivo}`;
    reprovaTipo = `${primeiraReprovacao.codigo} — ${primeiraReprovacao.titulo}`;
  }
  for (const p of aceite.vereditos.filter((v) => v.estado === 'pendente')) {
    motivos.push(`pendência ${p.codigo}`);
  }

  if (e.suporte === 'nao-suportado') {
    reprova = 'a captura não reproduz este item';
    reprovaTipo = 'a captura não reproduz este item';
  }
  if (e.comparacaoVisualOk === false) {
    reprova = `o bundle não bate com o que a captura viu (${Math.round((e.comparacaoVisualDelta ?? 0) * 100)}% de diferença)`;
    reprovaTipo = 'o bundle não bate com o que a captura viu';
  }
  if (e.kind === 'asset') {
    reprova = 'peça promovida como imagem congelada do site de origem';
    reprovaTipo = 'imagem congelada do site de origem';
  }

  nota += e.fidelidade;
  if (e.fidelidade > 0) motivos.push(`fidelidade ${e.fidelidade}`);

  if (e.representacao === 'capsula-runtime') {
    nota += 8;
    motivos.push('cena viva (cápsula de runtime)');
  }
  if (e.interacoes > 0) {
    nota += 6;
    motivos.push(`${e.interacoes} interação(ões)`);
  }
  if (e.kind === 'animation') {
    nota += 10;
    motivos.push('carrega movimento');
  }
  if (PEQUENAS_POR_NATUREZA.has(e.categoria)) {
    nota += 12;
    motivos.push('comportamento de página: vale para o site inteiro');
  }
  // Conteúdo, com retorno decrescente: uma peça de 40 KB não vale o dobro de
  // uma de 20 KB — passa a ser uma dobra inteira, que é outra coisa.
  nota += Math.min(10, Math.round(Math.log2(Math.max(1, html.length / 200)) * 2));

  return {
    segId: e.segId,
    dsId: e.dsId,
    nome: e.nome,
    categoria: e.categoria,
    kind: e.kind,
    nota,
    motivos,
    reprova,
    reprovaTipo,
    jaNaBiblioteca: e.jaNaBiblioteca,
  };
};

/**
 * A escolha é POR CATEGORIA, e não uma fila única de notas.
 *
 * Uma fila única parece mais justa e é inútil aqui: medido nesta Galeria, as
 * quinze primeiras colocadas eram TODAS `interaction`, porque comportamento de
 * página soma pontos por natureza. Com teto por origem, elas ocupariam as vagas
 * e sobrariam poucas seções — e uma Biblioteca sem hero, sem preços e sem
 * rodapé não monta kit nenhum, por melhor que seja a nota média.
 *
 * `interaction` SAIU desta tabela, e o número é o motivo: a cota de 8 barrava
 * 37 peças aprovadas cuja nota mediana (122) era a MAIOR do banco — as
 * escolhidas medianas ficavam em 104. Estava travando exatamente o que o dono
 * cobra toda rodada (movimento), e ainda por cima o melhor material. Com a cota
 * padrão, a chance de a origem principal de um kit ter comportamento PRÓPRIO
 * sobe, que é a única forma de o comportamento alcançar a página.
 *
 * As cotas fantasma continuam: `cursor`, `overlay` e `typography` têm oferta
 * zero hoje, e mexer nelas não produziria uma peça. As 2 `cursor` do acervo são
 * reprovadas por G6 (11691 caracteres de HTML): o defeito ali é de recorte.
 */
export const COTA_POR_CATEGORIA: Record<string, number> = {
  cursor: 6,
  background: 8,
  overlay: 4,
  typography: 4,
};
export const COTA_PADRAO = 24;

/**
 * Quantas peças cada PAPEL de seção pode reservar antes de a cota rodar.
 *
 * Ter matéria-prima não basta. A lista é ordenada por nota GLOBAL, e `card`,
 * `nav` e `hero` — abundantes e de nota alta — gastam o teto de 6 por origem
 * antes de a `stats` da mesma origem ser alcançada. Medido: 125 peças barradas
 * pelo teto de origem e 829 pela cota, com quatro papéis das sequências em zero.
 *
 * A reserva roda ANTES, papel a papel, e é ela que faz a origem que já deu seis
 * seções ainda poder dar o seu depoimento. O estouro é o que torna isso
 * possível, e é limitado de propósito: no máximo `ESTOURO_RESERVA` peças acima
 * do teto por origem, e no máximo `PISO_POR_PAPEL` peças por papel. Sem esses
 * dois limites a reserva viraria a escolha inteira, e o teto por origem — que é
 * o que garante variedade — deixaria de existir.
 */
export const PISO_POR_PAPEL = 6;
export const ESTOURO_RESERVA = 2;

/** Os papéis das quatro sequências, na ordem em que aparecem. Determinístico. */
const PAPEIS_DAS_SEQUENCIAS: SectionRole[] = (() => {
  const vistos: SectionRole[] = [];
  for (const objetivo of Object.keys(SEQUENCIAS).sort()) {
    for (const etapa of SEQUENCIAS[objetivo as keyof typeof SEQUENCIAS]) {
      if (!vistos.includes(etapa.papel)) vistos.push(etapa.papel);
    }
  }
  return vistos;
})();

export type OpcoesDeEscolha = {
  tetoPorOrigem?: number;
  pisoPorPapel?: number;
};

/**
 * Quem entra na Biblioteca, entre as notas dadas.
 *
 * Duas fases: reserva por papel (acima) e depois a cota de sempre. As reprovadas
 * nunca entram — a regra de aceite decide isso, não a nota.
 */
export const escolherParaBiblioteca = (
  notas: readonly Nota[],
  opcoes?: OpcoesDeEscolha,
): Nota[] => {
  const tetoPorOrigem = opcoes?.tetoPorOrigem ?? 6;
  const piso = opcoes?.pisoPorPapel ?? PISO_POR_PAPEL;

  /**
   * A ordenação tinha UMA chave e o comentário prometia desempate por
   * fidelidade. Empate de nota caía na ordem em que o banco devolveu as linhas,
   * que muda com um `VACUUM`. O `segId` é ULID: desempatar por ele é arbitrário
   * mas ESTÁVEL, e estável é o que uma curadoria reproduzível precisa ser.
   */
  const aprovadas = notas
    .filter((n) => n.reprova === null)
    .slice()
    .sort((a, b) => b.nota - a.nota || (a.segId < b.segId ? -1 : a.segId > b.segId ? 1 : 0));

  const porOrigem = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  const porCategoriaNaOrigem = new Map<string, number>();
  const escolhidas: Nota[] = [];
  const jaEscolhida = new Set<string>();

  const cabe = (n: Nota, teto: number): boolean => {
    if (jaEscolhida.has(n.segId)) return false;
    if ((porCategoria.get(n.categoria) ?? 0) >= (COTA_POR_CATEGORIA[n.categoria] ?? COTA_PADRAO)) {
      return false;
    }
    // Teto por origem: sem ele a Biblioteca vira o retrato de dois ou três
    // sites e os dez kits saem parecidos.
    if ((porOrigem.get(n.dsId) ?? 0) >= teto) return false;
    // E teto por (origem, categoria): dois heros do mesmo site é repetição.
    // Este NUNCA estoura — nem na reserva. Repetição não vira cobertura.
    return (porCategoriaNaOrigem.get(`${n.dsId}|${n.categoria}`) ?? 0) < 2;
  };
  const levar = (n: Nota): void => {
    porOrigem.set(n.dsId, (porOrigem.get(n.dsId) ?? 0) + 1);
    porCategoria.set(n.categoria, (porCategoria.get(n.categoria) ?? 0) + 1);
    const chave = `${n.dsId}|${n.categoria}`;
    porCategoriaNaOrigem.set(chave, (porCategoriaNaOrigem.get(chave) ?? 0) + 1);
    jaEscolhida.add(n.segId);
    escolhidas.push(n);
  };

  // Fase 1 — reserva por papel.
  for (const papel of PAPEIS_DAS_SEQUENCIAS) {
    const categorias = ROLE_CATEGORIES[papel] ?? [papel];
    let levados = 0;
    for (const n of aprovadas) {
      if (levados >= piso) break;
      if (!categorias.includes(n.categoria)) continue;
      if (!cabe(n, tetoPorOrigem + ESTOURO_RESERVA)) continue;
      levar(n);
      levados++;
    }
  }

  // Fase 2 — a cota de sempre, sobre o que sobrou.
  for (const n of aprovadas) if (cabe(n, tetoPorOrigem)) levar(n);

  return escolhidas;
};
