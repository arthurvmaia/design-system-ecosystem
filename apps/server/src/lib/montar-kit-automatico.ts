import { mecanismoDoComportamento } from '@ds/engine-v2';
import {
  CATEGORIAS_DE_COMPORTAMENTO,
  CATEGORIA_DE_FUNDO,
  type EtapaDeMarketing,
  type ObjetivoDoSite,
  ROLE_CATEGORIES,
  SEQUENCIAS,
  type SectionRole,
  nomeDaEtapa,
} from '@ds/shared/schemas';

/**
 * Montagem automática de kit: a sequência argumentativa do objetivo, vestida
 * com as peças da Biblioteca que mais combinam.
 *
 * Não há modelo de linguagem aqui, de propósito: o servidor roda em modo fila
 * (API paga bloqueada por padrão) e um botão que só funciona com credencial e
 * custo não é um botão — é uma promessa quebrada. O conhecimento "o que vem em
 * que ordem" já foi curado em `SEQUENCIAS` (papel, o que a etapa FAZ, AIDA), e
 * o "combina" é medível: papel→categoria (`ROLE_CATEGORIES`), coerência de
 * origem (kit de uma origem só veste melhor que colcha de retalhos) e alcance
 * da marca (peça que a recoloração alcança serve à identidade do projeto).
 *
 * O que a régua decide, na ordem do peso:
 *   1. a peça é da categoria que o papel pede;
 *   2. a montagem cobre o MÁXIMO de etapas com peça (pareamento, não gula:
 *      a peça `card` que serviria a dois papéis vai para o papel em que ela é
 *      insubstituível, e o outro papel fica com a peça que só serve a ele);
 *   3. é da ORIGEM PRINCIPAL do kit (a origem que cobre mais etapas vence);
 *   4. veste mais marca (taxa de recolorabilidade).
 *
 * O item 2 é a resposta ao "poucos componentes e sempre os mesmos": a versão
 * gulosa dava à primeira etapa a melhor peça e deixava as seguintes vazias
 * mesmo havendo peça sobrando que a primeira também aceitaria. O pareamento
 * (caminhos aumentantes, a Biblioteca é pequena) remaneja: mais peças da
 * Biblioteca em uso, menos seções "criadas no estilo".
 *
 * Papel sem peça não é erro: sai declarado em `passos` com `componentId: null`
 * — a geração cria a seção no estilo do kit quando a permissão está ligada.
 */

export type PecaParaMontagem = {
  id: string;
  name: string;
  category: string;
  kind: string;
  designSystemId: string;
};

export type PassoDaMontagem = {
  papel: SectionRole;
  etapa: string;
  /** O que esta etapa faz no argumento (da sequência curada). */
  faz: string;
  componentId: string | null;
  nome: string | null;
  motivo: string;
};

export type KitAutomatico = {
  componentIds: string[];
  passos: PassoDaMontagem[];
  origemPrincipal: string | null;
  nomeSugerido: string;
  avisos: string[];
};

const candidatasDe = (
  papel: SectionRole,
  pecas: readonly PecaParaMontagem[],
): PecaParaMontagem[] => {
  const categorias = ROLE_CATEGORIES[papel] ?? [papel];
  return pecas.filter((p) => categorias.includes(p.category) || p.category === papel);
};

export const montarKitAutomatico = (
  objetivo: ObjetivoDoSite,
  pecas: readonly PecaParaMontagem[],
  marcaDe: (id: string) => number | null,
  opcoes?: {
    /**
     * A origem que o usuário QUER vestir, quando ele escolheu uma.
     *
     * Sem ela, a origem principal é sempre a de maior cobertura — e dois sites
     * feitos no mesmo dia saem com as mesmas peças, por mais que a Biblioteca
     * tenha outras. Com ela, a mesma Biblioteca dá visuais diferentes: é a
     * diferença entre um acervo e um carimbo.
     */
    origemPreferida?: string | null;
  },
): KitAutomatico => {
  const etapas: readonly EtapaDeMarketing[] = SEQUENCIAS[objetivo];
  const avisos: string[] = [];

  // A origem principal é a que consegue COBRIR mais etapas — decidida antes de
  // escolher qualquer peça, senão a primeira escolha enviesa todas as outras.
  const cobertura = new Map<string, number>();
  for (const etapa of etapas) {
    const origens = new Set(candidatasDe(etapa.papel, pecas).map((p) => p.designSystemId));
    for (const o of origens) cobertura.set(o, (cobertura.get(o) ?? 0) + 1);
  }
  const porCobertura = [...cobertura.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const preferida = opcoes?.origemPreferida ?? null;
  // A preferência só vale se aquela origem cobrir alguma etapa: preferir uma
  // origem sem peça nenhuma para este objetivo produziria um kit vazio em
  // silêncio, e o certo é dizer que ela não serve e seguir com a que serve.
  const preferidaServe = preferida !== null && (cobertura.get(preferida) ?? 0) > 0;
  if (preferida !== null && !preferidaServe) {
    avisos.push(
      `A origem preferida (${preferida}) não tem peça para nenhuma etapa deste objetivo: a montagem seguiu pela origem de maior cobertura.`,
    );
  }
  const origemPrincipal = preferidaServe ? preferida : porCobertura;

  /**
   * Peça VIVA na frente, peça MORTA no fim.
   *
   * `kind: 'asset'` é a peça que a captura não conseguiu reproduzir e promoveu
   * como imagem congelada do site de origem. Ela não aceita o texto da marca
   * nem a recoloração — entra no site como um retrato de OUTRA empresa. Uma
   * seção criada no estilo do kit é melhor que isso, então ela só é escolhida
   * quando nada mais cobre o papel, e o motivo diz.
   *
   * `kind: 'animation'` é o oposto: a peça carrega movimento (fade por scroll,
   * parallax, reveal). O dono pediu que o movimento venha sempre que existir
   * na Biblioteca — então ele vale meio ponto no desempate, o bastante para
   * ganhar de uma peça estática equivalente sem atropelar a coerência de
   * origem, que continua valendo mais.
   */
  const vitalidade = (kind: string): number =>
    kind === 'asset' ? -10 : kind === 'animation' ? 0.5 : 0;
  const nota = (c: { daOrigem: boolean; marca: number | null; kind: string }): number =>
    (c.daOrigem ? 2 : 0) + (c.marca ?? 0) + vitalidade(c.kind);

  const candidatasPorEtapa = etapas.map((etapa) =>
    candidatasDe(etapa.papel, pecas)
      .map((p) => ({
        p,
        daOrigem: p.designSystemId === origemPrincipal,
        marca: marcaDe(p.id),
        kind: p.kind,
      }))
      .sort((a, b) => nota(b) - nota(a)),
  );

  // Pareamento máximo etapa×peça por caminhos aumentantes (Kuhn): quando a
  // peça preferida de uma etapa já está ocupada, a etapa dona tenta a própria
  // alternativa antes de negar — é o remanejo que a gula não fazia. A ordem de
  // preferência acima decide QUAL pareamento máximo sai; o tamanho é máximo
  // de qualquer jeito. Determinístico: sem sorteio, mesma entrada → mesmo kit.
  const etapaDaPeca = new Map<string, number>();
  const escolhaDaEtapa = new Map<
    number,
    { p: PecaParaMontagem; daOrigem: boolean; marca: number | null }
  >();
  const tentarCobrir = (i: number, visitadas: Set<string>): boolean => {
    for (const candidata of candidatasPorEtapa[i] ?? []) {
      if (visitadas.has(candidata.p.id)) continue;
      visitadas.add(candidata.p.id);
      const dona = etapaDaPeca.get(candidata.p.id);
      if (dona === undefined || tentarCobrir(dona, visitadas)) {
        etapaDaPeca.set(candidata.p.id, i);
        escolhaDaEtapa.set(i, candidata);
        return true;
      }
    }
    return false;
  };
  etapas.forEach((_, i) => {
    tentarCobrir(i, new Set());
  });

  /**
   * Terceira passada: REUSO, e só como último recurso.
   *
   * As sequências foram alongadas (de 5-7 seções de conteúdo para 9-10) e os
   * kits têm 7 a 9 peças. Depois do pareamento máximo ainda sobram etapas
   * vazias que TÊM candidata — a peça existe e já está em outra etapa. Uma
   * `card` servindo a "Demonstração" e a "Catálogo" não é preguiça: o conteúdo
   * muda, a forma repete, e é o que qualquer site real faz.
   *
   * Três limites, porque reuso sem limite vira página de uma peça só:
   * no máximo UM reuso por peça (ela serve a duas etapas, nunca três), nunca no
   * MESMO papel (aí seria a mesma seção duas vezes) e sempre depois do
   * pareamento, para não roubar a vaga de quem só tem aquela.
   */
  const REUSO_MAXIMO = 1;
  const reusosDaPeca = new Map<string, number>();
  const reusadaDe = new Map<number, number>();
  etapas.forEach((etapa, i) => {
    if (escolhaDaEtapa.has(i)) return;
    for (const candidata of candidatasPorEtapa[i] ?? []) {
      const dona = etapaDaPeca.get(candidata.p.id);
      if (dona === undefined) continue;
      if ((reusosDaPeca.get(candidata.p.id) ?? 0) >= REUSO_MAXIMO) continue;
      if (etapas[dona]?.papel === etapa.papel) continue;
      reusosDaPeca.set(candidata.p.id, (reusosDaPeca.get(candidata.p.id) ?? 0) + 1);
      reusadaDe.set(i, dona);
      escolhaDaEtapa.set(i, candidata);
      return;
    }
  });

  const passos: PassoDaMontagem[] = etapas.map((etapa, i) => {
    const escolhida = escolhaDaEtapa.get(i);
    if (escolhida === undefined) {
      const haviaCandidata = (candidatasPorEtapa[i]?.length ?? 0) > 0;
      return {
        papel: etapa.papel,
        etapa: nomeDaEtapa(etapa),
        faz: etapa.faz,
        componentId: null,
        nome: null,
        motivo: haviaCandidata
          ? 'as peças desta categoria já cobrem outras etapas: a geração cria a seção no estilo do kit quando a permissão "criar seções faltantes" está ligada.'
          : 'sem peça desta categoria na Biblioteca: a geração cria a seção no estilo do kit quando a permissão "criar seções faltantes" está ligada.',
      };
    }
    const origemDoReuso = reusadaDe.get(i);
    if (origemDoReuso !== undefined) {
      const de = etapas[origemDoReuso];
      return {
        papel: etapa.papel,
        etapa: nomeDaEtapa(etapa),
        faz: etapa.faz,
        componentId: escolhida.p.id,
        nome: escolhida.p.name,
        motivo: `reaproveitada da etapa "${de === undefined ? '?' : nomeDaEtapa(de)}": o conteúdo muda, a forma repete.`,
      };
    }
    const razoes = [
      escolhida.daOrigem ? 'da origem principal' : 'de outra origem (cobre uma etapa a mais)',
      escolhida.marca !== null
        ? `veste ${Math.round(escolhida.marca * 100)}% da marca`
        : 'marca não medida',
    ];
    return {
      papel: etapa.papel,
      etapa: nomeDaEtapa(etapa),
      faz: etapa.faz,
      componentId: escolhida.p.id,
      nome: escolhida.p.name,
      motivo: razoes.join('; '),
    };
  });

  const escolhidos = passos.filter((p) => p.componentId !== null);
  const origensUsadas = new Set(
    escolhidos
      .map((p) => pecas.find((x) => x.id === p.componentId)?.designSystemId)
      .filter((o): o is string => o !== undefined),
  );
  if (origensUsadas.size > 1) {
    avisos.push(
      `A montagem misturou ${origensUsadas.size} origens: a origem principal não cobre todos os papéis. A recoloração aproxima, mas vale conferir a prévia.`,
    );
  }
  const semPeca = passos.filter((p) => p.componentId === null);
  if (semPeca.length > 0) {
    avisos.push(
      `${semPeca.length} etapa(s) da sequência ficaram sem peça: ${semPeca.map((p) => p.etapa).join(', ')}.`,
    );
  }

  /**
   * Os comportamentos da página entram FORA da disputa por papéis.
   *
   * A montagem casa peça com etapa da sequência, e comportamento não é etapa de
   * sequência nenhuma: ele não ocupa lugar na página. Por isso ele não constava
   * de `ROLE_CATEGORIES` e simplesmente nunca era escolhido — o dono podia curtir
   * uma animação na Galeria e ela jamais apareceria num kit automático.
   *
   * Duas correções, e as duas vêm de medição no acervo:
   *
   * 1. **O pool são as origens QUE ENTRARAM na página.** `origensUsadas` já era
   *    calculada logo acima e jogada fora. O CSS de um comportamento é escopado
   *    por origem (`compor.ts`, proxies `data-ds-raiz`/`data-ds-corpo`), então
   *    um comportamento de origem AUSENTE não alcança elemento nenhum: ele
   *    viaja como peso de JS e CSS e a página fica parada. Medido: 12 de 12 kits
   *    carregavam um "Revelar ao rolar" nessa condição, e o aviso antigo dizia
   *    que ele "vale para todas as seções" — falso em 12 de 12.
   * 2. **A deduplicação é por MECANISMO, não por categoria.** Só existem duas
   *    categorias de comportamento (`interaction` e `cursor`) e `cursor` está em
   *    zero no acervo: o teto de 2 por categoria era, na prática, 1. Entre as 45
   *    `interaction` aprovadas há 4 mecanismos distintos (parallax 17, aparecer
   *    13, fixar 8, revelar 7), média de 1,80 por origem.
   *
   * Nenhum comportamento das origens usadas significa NENHUM comportamento, e o
   * aviso diz isso por extenso. Trocar um aviso falso por uma ausência declarada
   * é ganho, não perda.
   */
  const TETO_DE_MECANISMOS = 2;
  const comportamentosPossiveis = pecas.filter((p) =>
    CATEGORIAS_DE_COMPORTAMENTO.includes(p.category),
  );
  const alcancam = comportamentosPossiveis
    .filter((p) => origensUsadas.has(p.designSystemId))
    .sort((a, b) => {
      const daOrigem = (p: PecaParaMontagem): number =>
        p.designSystemId === origemPrincipal ? 0 : 1;
      return daOrigem(a) - daOrigem(b) || a.name.localeCompare(b.name);
    });
  const porMecanismo = new Map<string, PecaParaMontagem>();
  for (const p of alcancam) {
    // Peça cujo nome não veio da tabela de famílias não tem mecanismo conhecido:
    // ela conta como o próprio nome, para não ser confundida com nenhuma outra.
    const mecanismo = mecanismoDoComportamento(p.name) ?? `nome:${p.name}`;
    if (!porMecanismo.has(mecanismo)) porMecanismo.set(mecanismo, p);
  }
  const comportamentos = [...porMecanismo.values()].slice(0, TETO_DE_MECANISMOS);
  if (comportamentos.length > 0) {
    avisos.push(
      `${comportamentos.length} comportamento(s) de página no kit (${comportamentos.map((c) => c.name).join(', ')}): eles vêm de origens que estão na página, então alcançam as seções dela.`,
    );
  } else if (comportamentosPossiveis.length > 0) {
    avisos.push(
      `Nenhum comportamento de página entrou: os ${comportamentosPossiveis.length} que a Biblioteca tem vêm de origens que não estão nesta página. O CSS deles é escopado por origem — viajariam sem alcançar elemento nenhum, e a página sairia parada com o carimbo de que se mexe.`,
    );
  }

  /**
   * Uma camada de fundo, no máximo, e só da ORIGEM PRINCIPAL.
   *
   * Fundo é da PÁGINA: `ehPecaDeFundo` manda a peça para
   * `separarCamadasDePagina`, que a envolve como camada fixa atrás de tudo. Ela
   * não disputa seção com ninguém — e por isso nunca era escolhida.
   *
   * Só da origem principal porque o fundo é a superfície que TODAS as seções
   * pisam: vindo de outra origem, a luminância dele briga com o resto e o
   * resgate de contraste por origem não o alcança. Uma só, porque duas camadas
   * fixas se sobrepõem e a de baixo não é vista.
   */
  const fundo =
    origemPrincipal === null
      ? undefined
      : pecas.find(
          (p) => p.category === CATEGORIA_DE_FUNDO && p.designSystemId === origemPrincipal,
        );
  if (fundo !== undefined) {
    avisos.push(
      `A camada de fundo "${fundo.name}" entra como fundo da PÁGINA, atrás de todas as seções: ela não ocupa etapa nenhuma da sequência.`,
    );
  }

  return {
    // `Set` porque a mesma peça pode servir a duas etapas depois do reuso, e o
    // kit é um inventário: repetir o id ali significaria duas cópias do bundle.
    componentIds: [
      ...new Set([
        ...escolhidos.map((p) => p.componentId as string),
        ...comportamentos.map((c) => c.id),
        ...(fundo === undefined ? [] : [fundo.id]),
      ]),
    ],
    passos,
    origemPrincipal,
    nomeSugerido: `Kit ${objetivo.replace(/-/g, ' ')}`,
    avisos,
  };
};
