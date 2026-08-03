import type { KitDesignSystem, OrigemConsolidada, SectionRole } from '@ds/shared/schemas';

/**
 * O desenho de uma seção que ainda não tem peça — nas cores e nas fontes do kit.
 *
 * ## O defeito que isto conserta
 *
 * A prévia empilhada mostrava a seção sem peça como um retângulo pontilhado com
 * três frases dentro: o nome, "criada no estilo do kit" e a sugestão de peça.
 * Ou seja, a DESCRIÇÃO de uma prévia no lugar da prévia. Quem estava montando a
 * página via metade dela renderizada de verdade e a outra metade em texto, e a
 * pergunta que a coluna existe para responder ("como isto vai ficar?") continuava
 * sem resposta justamente onde ela é mais difícil de imaginar.
 *
 * O material para responder já estava no app: o design system CONSOLIDADO do kit
 * (`api.getKitDesignSystem`) traz as cores com papel semântico, as fontes e a
 * escala medida na captura. É a mesma fonte que a Bancada e a fórmula do kit
 * usam. Faltava alguém desenhar com ela.
 *
 * ## As duas metades, separadas de propósito
 *
 * - **A FORMA** (`formaDoPapel`) vem do papel da seção e não sabe nada do kit:
 *   uma abertura tem título grande, uma linha de apoio e um botão; uma grade de
 *   preços tem três colunas com um botão em cada. É o mesmo conhecimento que a
 *   sequência de marketing já carrega em `sugestao`, agora em forma de layout.
 * - **O ESTILO** (`estiloDoEsqueleto`) vem do kit e não sabe nada do papel: qual
 *   é o fundo, qual é a cor de texto, qual é a fonte de título, quanto aquele
 *   site arredonda os cantos.
 *
 * Separadas, cada uma se testa sozinha e nenhuma delas precisa de navegador.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não inventa texto. O único texto do esqueleto é o NOME que a pessoa deu à
 * seção; todo o resto é barra cinza no lugar de uma linha. Escrever uma chamada
 * de exemplo faria a prévia prometer uma frase que a geração não vai escrever, e
 * um esqueleto que mente é pior que um pontilhado que se cala.
 *
 * Sem design system consolidado, `estiloDoEsqueleto` devolve o motivo por
 * extenso e quem chama mantém o pontilhado. Desenhar um bloco em cinza genérico
 * seria dizer "o seu kit é assim" sobre um kit que ninguém leu.
 */

// ── A forma: o que o papel da seção pede ────────────────────────────────────

/** Um traço do esqueleto. Nenhum deles carrega texto, fora o `nome`. */
export type TracoDoEsqueleto =
  /**
   * O NOME da seção, escrito na fonte de título do kit. É o único texto do
   * esqueleto porque é o único que a pessoa escreveu — e é o que mostra a
   * tipografia do kit, que uma barra cinza não mostraria.
   */
  | { tipo: 'nome'; escala: number }
  /** Uma linha de texto, no lugar dela. `escala` é o múltiplo do corpo. */
  | { tipo: 'linha'; largura: number; escala?: number }
  | { tipo: 'botao'; largura: number }
  | { tipo: 'campo'; largura: number }
  /** Um selo, um logo, um avatar: bloquinho baixo e curto. */
  | { tipo: 'pastilha'; largura: number }
  /** O lugar de uma imagem. `altura` é o múltiplo do corpo. */
  | { tipo: 'moldura'; altura: number };

/** A grade que se repete dentro da seção (as colunas de preço, os cartões). */
export type GradeDoEsqueleto = {
  colunas: number;
  linhas: number;
  /** O miolo de UMA célula, empilhado. Todas as células são iguais. */
  item: readonly TracoDoEsqueleto[];
};

export type FormaDaSecao = {
  /**
   * Uma faixa fina com os traços lado a lado, para os papéis que são barra e não
   * bloco (navegação e rodapé). O primeiro traço fica à esquerda e o resto vai
   * para a direita, que é o desenho de toda barra de topo.
   */
  barra: readonly TracoDoEsqueleto[] | null;
  /** Empilhados, uma vez só: o título da seção e o apoio dele. */
  topo: readonly TracoDoEsqueleto[];
  grade: GradeDoEsqueleto | null;
  /** Abertura e chamada centralizam; lista e formulário alinham à esquerda. */
  centralizado: boolean;
};

/**
 * A forma de cada papel.
 *
 * Não é invenção de layout: é a mesma descrição que `EtapaDeMarketing.sugestao`
 * já dá em português ("três ou quatro cartões curtos", "uma faixa horizontal de
 * logos"), traduzida para o que dá para desenhar. Quando as duas divergirem, a
 * `sugestao` é a fonte — ela é o dado curado, esta tabela é o desenho dela.
 */
const FORMAS: Record<SectionRole, FormaDaSecao> = {
  nav: {
    barra: [
      { tipo: 'pastilha', largura: 0.24 },
      { tipo: 'linha', largura: 0.1 },
      { tipo: 'linha', largura: 0.1 },
      { tipo: 'linha', largura: 0.1 },
      { tipo: 'botao', largura: 0.18 },
    ],
    topo: [],
    grade: null,
    centralizado: false,
  },
  hero: {
    barra: null,
    topo: [
      { tipo: 'nome', escala: 2.4 },
      { tipo: 'linha', largura: 0.82 },
      { tipo: 'linha', largura: 0.58 },
      { tipo: 'botao', largura: 0.36 },
    ],
    grade: { colunas: 1, linhas: 1, item: [{ tipo: 'moldura', altura: 4.5 }] },
    centralizado: true,
  },
  logos: {
    barra: null,
    topo: [{ tipo: 'linha', largura: 0.4 }],
    grade: { colunas: 5, linhas: 1, item: [{ tipo: 'pastilha', largura: 1 }] },
    centralizado: true,
  },
  features: {
    barra: null,
    topo: [
      { tipo: 'nome', escala: 1.5 },
      { tipo: 'linha', largura: 0.62 },
    ],
    grade: {
      colunas: 3,
      linhas: 1,
      item: [
        { tipo: 'pastilha', largura: 0.34 },
        { tipo: 'linha', largura: 0.9, escala: 1.15 },
        { tipo: 'linha', largura: 1 },
        { tipo: 'linha', largura: 0.7 },
      ],
    },
    centralizado: true,
  },
  showcase: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: {
      colunas: 3,
      linhas: 1,
      item: [
        { tipo: 'moldura', altura: 2.4 },
        { tipo: 'linha', largura: 0.9 },
        { tipo: 'linha', largura: 0.66 },
      ],
    },
    centralizado: false,
  },
  stats: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.4 }],
    grade: {
      colunas: 3,
      linhas: 1,
      item: [
        { tipo: 'linha', largura: 0.62, escala: 2.1 },
        { tipo: 'linha', largura: 0.9 },
      ],
    },
    centralizado: true,
  },
  pricing: {
    barra: null,
    topo: [
      { tipo: 'nome', escala: 1.6 },
      { tipo: 'linha', largura: 0.56 },
    ],
    grade: {
      colunas: 3,
      linhas: 1,
      item: [
        { tipo: 'linha', largura: 0.66, escala: 1.2 },
        { tipo: 'linha', largura: 0.48, escala: 1.9 },
        { tipo: 'linha', largura: 1 },
        { tipo: 'linha', largura: 0.82 },
        { tipo: 'botao', largura: 1 },
      ],
    },
    centralizado: true,
  },
  testimonials: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: {
      colunas: 2,
      linhas: 1,
      item: [
        { tipo: 'linha', largura: 1 },
        { tipo: 'linha', largura: 0.94 },
        { tipo: 'linha', largura: 0.6 },
        { tipo: 'pastilha', largura: 0.42 },
      ],
    },
    centralizado: false,
  },
  faq: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: {
      colunas: 1,
      linhas: 4,
      item: [{ tipo: 'linha', largura: 0.78, escala: 1.1 }],
    },
    centralizado: false,
  },
  about: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.6 }],
    grade: {
      colunas: 1,
      linhas: 1,
      item: [
        { tipo: 'moldura', altura: 3.2 },
        { tipo: 'linha', largura: 1 },
        { tipo: 'linha', largura: 0.94 },
        { tipo: 'linha', largura: 0.7 },
      ],
    },
    centralizado: false,
  },
  team: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: {
      colunas: 3,
      linhas: 1,
      item: [
        { tipo: 'moldura', altura: 2.6 },
        { tipo: 'linha', largura: 0.8 },
        { tipo: 'linha', largura: 0.6 },
      ],
    },
    centralizado: true,
  },
  gallery: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: { colunas: 3, linhas: 2, item: [{ tipo: 'moldura', altura: 2 }] },
    centralizado: true,
  },
  catalog: {
    barra: null,
    topo: [{ tipo: 'nome', escala: 1.5 }],
    grade: {
      colunas: 2,
      linhas: 2,
      item: [
        { tipo: 'moldura', altura: 2.4 },
        { tipo: 'linha', largura: 0.9 },
        { tipo: 'linha', largura: 0.5 },
        { tipo: 'botao', largura: 0.72 },
      ],
    },
    centralizado: false,
  },
  contact: {
    barra: null,
    topo: [
      { tipo: 'nome', escala: 1.7 },
      { tipo: 'linha', largura: 0.7 },
    ],
    grade: {
      colunas: 1,
      linhas: 1,
      item: [
        { tipo: 'campo', largura: 1 },
        { tipo: 'campo', largura: 1 },
        { tipo: 'campo', largura: 1 },
        { tipo: 'botao', largura: 0.5 },
      ],
    },
    centralizado: false,
  },
  cta: {
    barra: null,
    topo: [
      { tipo: 'nome', escala: 2 },
      { tipo: 'linha', largura: 0.7 },
      { tipo: 'botao', largura: 0.42 },
    ],
    grade: null,
    centralizado: true,
  },
  footer: {
    barra: [
      { tipo: 'pastilha', largura: 0.24 },
      { tipo: 'linha', largura: 0.1 },
      { tipo: 'linha', largura: 0.1 },
      { tipo: 'linha', largura: 0.1 },
    ],
    topo: [],
    grade: { colunas: 1, linhas: 1, item: [{ tipo: 'linha', largura: 0.46, escala: 0.85 }] },
    centralizado: false,
  },
};

/**
 * A forma da seção livre: papel não declarado e nenhuma peça que o revele.
 *
 * Um bloco genérico é a resposta honesta. Chutar a forma de uma abertura porque
 * "seção sem papel costuma ser abertura" desenharia uma promessa que o gerador
 * não fez.
 */
const FORMA_LIVRE: FormaDaSecao = {
  barra: null,
  topo: [
    { tipo: 'nome', escala: 1.6 },
    { tipo: 'linha', largura: 0.92 },
    { tipo: 'linha', largura: 0.64 },
  ],
  grade: null,
  centralizado: false,
};

export const formaDoPapel = (papel: SectionRole | undefined): FormaDaSecao =>
  papel === undefined ? FORMA_LIVRE : FORMAS[papel];

/**
 * A forma já escreve o nome da seção lá dentro?
 *
 * A prévia rotula cada bloco com uma legenda por cima. Onde o esqueleto escreve
 * o nome na fonte do kit, a legenda repetiria a mesma palavra duas vezes em dois
 * centímetros — então quem chama usa isto para mostrar uma só.
 */
export const formaEscreveONome = (forma: FormaDaSecao): boolean =>
  forma.topo.some((t) => t.tipo === 'nome');

// ── O estilo: o que o design system consolidado do kit diz ──────────────────

export type EstiloDoEsqueleto = {
  fundo: string;
  texto: string;
  /** A cor de ação: o botão do esqueleto. */
  destaque: string;
  /** A borda do kit. `null` = nenhuma cor recebeu esse papel; use o texto. */
  borda: string | null;
  fonteTitulo: string | null;
  fonteTexto: string | null;
  /**
   * `display / corpo` medido na captura. É o quanto aquele site GRITA no
   * título, e a forma genérica não teria como saber. `null` = ninguém mediu.
   */
  destaqueTipografico: number | null;
  /** O raio de canto da origem, em px do site real. `null` = não medido. */
  raio: number | null;
  /** O corpo da origem, em px do site real. Serve para reduzir o raio na mesma proporção. */
  corpoMedido: number | null;
  /** De qual origem saiu tudo isto. */
  origemId: string;
  /** O que este estilo esconde do kit, quando esconde. Nunca calado. */
  aviso: string | null;
};

export type LeituraDoEstilo =
  | { ok: true; estilo: EstiloDoEsqueleto }
  | { ok: false; porque: string };

/**
 * Famílias que são fim de pilha de fallback, não escolha de tipografia.
 *
 * A consolidação nova já as descarta na origem (`inventariarFontes` guarda só a
 * primeira família não genérica), mas kit consolidado antes disso ainda tem
 * `Apple Color Emoji` na lista, e uma delas ganhando por ocorrências escreveria
 * o nome da seção em fonte de emoji.
 */
const FAMILIAS_DE_SISTEMA = new Set([
  'apple color emoji',
  'segoe ui emoji',
  'segoe ui symbol',
  'noto color emoji',
  'sfmono-regular',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'sans-serif',
  'serif',
  'monospace',
  'inherit',
  'initial',
]);

export const ehFamiliaDeSistema = (familia: string): boolean =>
  FAMILIAS_DE_SISTEMA.has(
    familia
      .trim()
      .toLowerCase()
      .replace(/^["']|["']$/g, ''),
  );

/**
 * A cor de um papel, entre os clusters da origem: a de maior confiança, e em
 * empate a que aparece mais no CSS.
 *
 * Aqui o limiar de recoloração (`CONFIANCA_MINIMA_PARA_RECOLORIR`) NÃO se
 * aplica, e é decisão, não esquecimento. Aquele limiar existe porque recolorir
 * na dúvida estraga o site entregue; aqui nada é entregue, é um esboço numa
 * coluna de 250px. Descartar o papel de baixa confiança deixaria o esqueleto
 * sem fundo e sem texto justamente nos kits mais difíceis, que são os que mais
 * precisam ser vistos antes de gerar.
 */
const corDoPapel = (origem: OrigemConsolidada, ...papeis: string[]): string | null => {
  for (const papel of papeis) {
    const candidatos = origem.clusters.filter((c) => c.papel === papel);
    if (candidatos.length === 0) continue;
    const peso = (c: (typeof candidatos)[number]): number =>
      c.membros.reduce((s, m) => s + m.ocorrencias, 0);
    const melhor = candidatos.reduce((a, b) =>
      b.confianca > a.confianca || (b.confianca === a.confianca && peso(b) > peso(a)) ? b : a,
    );
    return melhor.corCanonica;
  }
  return null;
};

const fontesDoKit = (
  origem: OrigemConsolidada,
): { titulo: string | null; texto: string | null } => {
  const uteis = origem.fontes.filter(
    (f) => f.papelSugerido !== 'mono' && !ehFamiliaDeSistema(f.familia),
  );
  if (uteis.length === 0) return { titulo: null, texto: null };
  const maisUsada = uteis.reduce((a, b) => (b.ocorrencias > a.ocorrencias ? b : a));
  const display = uteis.find((f) => f.papelSugerido === 'display');
  const corpo = uteis.find((f) => f.papelSugerido === 'body');
  return {
    titulo: (display ?? corpo ?? maisUsada).familia,
    texto: (corpo ?? maisUsada).familia,
  };
};

/** A mediana dos raios da origem: o canto que aquele site usa de hábito. */
const raioTipico = (raios: readonly number[]): number | null => {
  const uteis = [...raios].filter((r) => r > 0).sort((a, b) => a - b);
  return uteis[Math.floor(uteis.length / 2)] ?? null;
};

/**
 * Qual origem dita o esqueleto: a que a consolidação entendeu melhor, medida em
 * quantos clusters dela receberam papel. Empate desempata por total de clusters.
 *
 * Um kit de várias origens não tem "a" cara, e escolher a mais bem consolidada é
 * melhor que misturar duas paletas num bloco só — misturar produziria uma cara
 * que nenhuma peça do kit tem.
 */
const origemQueDita = (origens: readonly OrigemConsolidada[]): OrigemConsolidada | null => {
  const comPapel = (o: OrigemConsolidada): number =>
    o.clusters.filter((c) => c.papel !== null).length;
  return origens.reduce<OrigemConsolidada | null>((melhor, o) => {
    if (melhor === null) return o;
    if (comPapel(o) > comPapel(melhor)) return o;
    if (comPapel(o) === comPapel(melhor) && o.clusters.length > melhor.clusters.length) return o;
    return melhor;
  }, null);
};

/**
 * O estilo do esqueleto, ou o motivo de não haver um.
 *
 * Fundo e texto são o mínimo: sem os dois não dá para desenhar um bloco que se
 * pareça com o kit, e um bloco em cinza genérico diria "o seu kit é assim" sobre
 * um kit que ninguém leu. Nesse caso quem chama mantém o pontilhado e mostra o
 * `porque`.
 */
export const estiloDoEsqueleto = (ds: KitDesignSystem | null | undefined): LeituraDoEstilo => {
  if (ds === null || ds === undefined) {
    return {
      ok: false,
      porque: 'Ainda não consolidei as cores e as fontes deste kit, então aqui fica só o contorno.',
    };
  }
  const origem = origemQueDita(ds.origens);
  if (origem === null) {
    return {
      ok: false,
      porque: 'Nenhuma peça deste kit rendeu cor ou fonte para eu desenhar com elas.',
    };
  }
  const fundo = corDoPapel(origem, 'background', 'surface');
  const texto = corDoPapel(origem, 'heading', 'body');
  if (fundo === null || texto === null) {
    return {
      ok: false,
      porque:
        'As cores deste kit não receberam papel de fundo e de texto, e desenhar sem eles seria chutar a cara do bloco.',
    };
  }

  const fontes = fontesDoKit(origem);
  const escala = origem.escala;
  const corpo = escala?.corpo ?? null;
  const display = escala?.display ?? null;
  // Origem de tema divergente é o caso em que a escolha de UMA origem muda mais
  // a cara do bloco: um kit misto tem peça clara e peça escura, e o esqueleto
  // vai sair de um lado só.
  const aviso =
    ds.tema === 'misto'
      ? 'As origens deste kit têm temas diferentes. Desenhei com as cores de uma delas.'
      : ds.origens.length > 1
        ? 'Este kit junta mais de uma origem. Desenhei com as cores da que consolidei melhor.'
        : null;

  return {
    ok: true,
    estilo: {
      fundo,
      texto,
      destaque: corDoPapel(origem, 'primary', 'accent', 'link', 'secondary') ?? texto,
      borda: corDoPapel(origem, 'border'),
      fonteTitulo: fontes.titulo,
      fonteTexto: fontes.texto,
      destaqueTipografico: corpo !== null && display !== null && corpo > 0 ? display / corpo : null,
      raio: raioTipico(escala?.raios ?? []),
      corpoMedido: corpo,
      origemId: origem.designSystemId,
      aviso,
    },
  };
};

// ── Do estilo para os pixels da prévia ──────────────────────────────────────

/**
 * O corpo do esqueleto na prévia, em px.
 *
 * A coluna da prévia tem ~250px. 6px de corpo põe um título de abertura em
 * ~14px, que é o mesmo salto que a página real dá entre corpo e display — a
 * miniatura precisa manter a PROPORÇÃO, não o tamanho.
 */
export const CORPO_NA_PREVIA = 6;

/** O corpo que um site assume quando ninguém mediu o dele. */
const CORPO_PADRAO_DA_WEB = 16;

/**
 * A escala do nome no esqueleto.
 *
 * Quando a captura mediu o degrau de destaque da origem, é ELE que manda: a
 * razão display/corpo é o quanto aquele site grita no título, e é exatamente o
 * que a forma genérica não tem como saber. Um kit de tipografia plana (razão
 * 1.3) desenha um título discreto; um editorial (razão 3.5) desenha um título
 * que domina o bloco. Teto de 4 porque acima disso a palavra não cabe na coluna
 * e o esqueleto vira uma letra cortada, que lê como defeito.
 *
 * Só vale para título grande (escala >= 2): num rótulo de 1.5 a medida do site
 * não está falando daquele degrau.
 */
export const escalaDoNome = (daForma: number, medido: number | null): number =>
  medido === null || daForma < 2 ? daForma : Math.min(medido, 4);

/**
 * O raio do kit reduzido na MESMA proporção do texto: um canto de 12px num site
 * de corpo 16 vira 4.5px numa miniatura de corpo 6. Reduzir na proporção é o que
 * mantém a diferença entre um kit de cantos retos e um de cantos redondos, que é
 * a informação que o raio carrega. Sem medida, 2px — que não afirma nada.
 */
export const raioNaPrevia = (raio: number | null, corpoMedido: number | null): number =>
  raio === null
    ? 2
    : Math.round(
        raio *
          (CORPO_NA_PREVIA /
            (corpoMedido !== null && corpoMedido > 0 ? corpoMedido : CORPO_PADRAO_DA_WEB)),
      );
