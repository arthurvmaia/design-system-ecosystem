import { z } from 'zod';

/**
 * O contrato do job `marca`: o cliente pede a MARCA, não uma peça.
 *
 * ## Por que é um contrato separado do `criativo`
 *
 * `PedidoCriativo` é inteiro moldado numa peça: formato com dimensão exata,
 * origem da imagem, headline e CTA literais, número de variações. Nada disso
 * descreve a criação de uma marca — não há dimensão de canal, não há copy que
 * vai queimada no pixel, e a entrega não é uma peça e sim um conjunto de
 * arquivos que precisam ser a MESMA marca em roupas diferentes.
 *
 * Enfiar os dois no mesmo objeto obrigaria metade dos campos a serem ignorados
 * conforme o `tipo`, e campo que o parse aceita e o motor ignora é o começo de
 * uma divergência: alguém preenche, nada acontece, e ninguém descobre por quê.
 *
 * ## O que trava e o que se assume
 *
 * O mesmo critério do resto da casa: **fato trava, direção se assume e se
 * registra**. O nome com a grafia exata trava (é ele que vai no logotipo). O
 * que a marca faz trava (sem isso o símbolo é sorteio). Teto de crédito trava.
 * Tom, referências e a cor preferida são direção: guiam e ficam registrados.
 */

export const LIMITES_DA_MARCA = {
  nome: 80,
  /** O que a marca faz, para quem. Curto de propósito: briefing longo vira ruído no prompt. */
  oQueFaz: 600,
  /** O que ela NÃO pode parecer. É o campo que mais economiza tentativa. */
  evitar: 400,
  tom: 200,
} as const;

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A cor precisa estar em #RRGGBB.');

/**
 * A FAMÍLIA do símbolo, que é a decisão de desenho que mais muda o resultado.
 *
 * Existe como escolha fechada, e não como texto livre, porque é a diferença que
 * o cliente reconhece ao olhar e não sabe nomear. Deixá-la no briefing faz o
 * gerador escolher, e escolher diferente a cada tentativa.
 */
export const FamiliaDoSimbolo = z.enum([
  /** Uma forma abstrata: geometria, sem representar coisa nenhuma. */
  'abstrato',
  /** Uma coisa do mundo, simplificada ao essencial. */
  'pictorico',
  /** As iniciais viradas forma. */
  'monograma',
  /** O Orbis escolhe pela natureza do negócio, e registra o que escolheu. */
  'decida-por-mim',
]);
export type FamiliaDoSimbolo = z.infer<typeof FamiliaDoSimbolo>;

export const ROTULO_DA_FAMILIA: Record<FamiliaDoSimbolo, string> = {
  abstrato: 'Forma abstrata',
  pictorico: 'Um símbolo do que vocês fazem',
  monograma: 'As iniciais',
  'decida-por-mim': 'Decida por mim',
};

/**
 * Quantas cores de apoio a marca aceita, e por que TRÊS.
 *
 * A composição tem faixa, tinta e acento — três lugares onde uma cor pousa.
 * Cor que não tem onde pousar é campo que cobra de quem preenche e devolve
 * nada. É o mesmo número da peça criativa, pela mesma razão.
 */
export const LIMITE_DE_CORES_DE_APOIO = 3;

/**
 * O FORMATO da capa de coleção, e por que ele não custa geração.
 *
 * A imagem nasce QUADRADA, uma vez, e o formato sai dela por máscara — que é
 * geometria, e geometria não gasta crédito. É a mesma regra do símbolo ("do
 * símbolo saem as versões, por cálculo"), aplicada onde ela economiza de novo:
 * trocar de redonda para quadrada depois de pronto é reprocessar um pixel que
 * já está em disco.
 *
 * Pedir ao gerador "uma imagem redonda" faria o contrário: cada troca de
 * formato seria um pedido novo, e a borda ficaria por conta do modelo, que é
 * onde ele mais erra.
 */
export const FormatoDaColecao = z.enum(['redonda', 'quadrada', 'arredondada']);
export type FormatoDaColecao = z.infer<typeof FormatoDaColecao>;

/**
 * Quantas coleções o Orbis cria quando o cliente não diz.
 *
 * Quatro, fixo, por decisão do dono: preço previsível vale mais que ajustar ao
 * nicho. Uma loja com muitas categorias sai representada por quatro, e isso é
 * escolha declarada — não um limite que alguém esqueceu de mexer.
 */
export const COLECOES_QUANDO_O_ORBIS_DECIDE = 4;

/** O teto de coleções que o cliente pode pedir. Cada uma é uma geração paga. */
export const LIMITE_DE_COLECOES = 8;

/** Nome de coleção maior que isto não cabe legível sobre a capa. */
export const LIMITE_DO_NOME_DA_COLECAO = 28;

export const PedidoDeMarca = z.object({
  /**
   * O nome, com a GRAFIA EXATA. Trava porque é ele que vai desenhado no
   * logotipo, e modelo erra grafia de marca com facilidade.
   */
  nome: z.string().min(1).max(LIMITES_DA_MARCA.nome),
  /**
   * O que a marca faz, e para quem. Trava porque sem isso o símbolo é sorteio:
   * o gerador desenha alguma coisa bonita que não tem relação com o negócio, e
   * a única forma de descobrir é gerando de novo.
   */
  oQueFaz: z.string().min(1).max(LIMITES_DA_MARCA.oQueFaz),
  familia: FamiliaDoSimbolo,
  /** Como a marca fala e se apresenta. Direção. */
  tom: z.string().max(LIMITES_DA_MARCA.tom).default(''),
  /** O que ela NÃO pode parecer. Direção, e a que mais economiza tentativa. */
  evitar: z.string().max(LIMITES_DA_MARCA.evitar).default(''),
  /**
   * A cor preferida, se houver. `null` = o Orbis escolhe e REGISTRA a escolha.
   *
   * Diferente da peça criativa, aqui escolher cor é legítimo: é justamente o
   * que se está pedindo. O que não pode é escolher em silêncio — a cor entra no
   * resultado com a decisão escrita ao lado.
   */
  corPreferida: HEX.nullable().default(null),
  /**
   * As outras cores da paleta, se o cliente já as tem.
   *
   * Uma marca não é uma cor: ela tem a principal e as que a acompanham. O
   * formulário pedia UMA e o resto da paleta não tinha onde entrar — quem já
   * tinha as suas cores era obrigado a jogar fora todas menos uma, e a
   * apresentação saía dizendo que a marca tem uma cor só.
   *
   * O modelo é o MESMO da peça criativa (`PedidoCriativo.direcao.coresDeApoio`)
   * de propósito, e não um segundo: `coresDerivadas(principal, apoio)` já é a
   * função que decide qual delas vira o botão, e ela é única na casa. Um
   * segundo modelo de paleta divergiria na primeira mudança e apareceria como
   * "a cor do site não é a do brandbook".
   *
   * Três, pelo mesmo motivo de lá: a composição tem faixa, tinta e acento. Cor
   * que não tem onde pousar é campo que cobra e descarta.
   */
  coresDeApoio: z.array(HEX).max(LIMITE_DE_CORES_DE_APOIO).default([]),
  /**
   * As COLEÇÕES da marca: as categorias que a loja mostra na vitrine.
   *
   * Cada uma ganha uma capa própria, e elas entram na entrega e na apresentação
   * — uma marca de loja sem as capas de categoria obriga quem recebe a inventar
   * a vitrine sozinho, que é o trabalho que contratar a marca vinha evitar.
   *
   * **Lista vazia = o Orbis decide**, e essa é a mesma convenção de
   * `corPreferida`: escolher pelo cliente é legítimo quando ele não escolheu; o
   * que não pode é escolher em SILÊNCIO. Os nomes que o Orbis inventar entram no
   * resultado com a decisão escrita ao lado, como a cor.
   */
  colecoes: z
    .array(z.string().min(1).max(LIMITE_DO_NOME_DA_COLECAO))
    .max(LIMITE_DE_COLECOES)
    .default([]),
  /**
   * O formato das capas. `null` = o Orbis decide, e escreve o porquê.
   *
   * Ele vale para TODAS: uma vitrine com capas redondas e quadradas misturadas
   * não parece variedade, parece descuido.
   */
  formatoDasColecoes: FormatoDaColecao.nullable().default(null),
  /**
   * Teto de gasto, em créditos. OBRIGATÓRIO e sem default, pela mesma razão do
   * pedido criativo: parar ao zerar exige saber onde fica o zero.
   */
  tetoDeCreditos: z.number().positive(),
  /**
   * O custo estimado MOSTRADO a quem confirmou. Metade da conta: sem ele,
   * comparar o prometido com o gasto depende da memória de alguém.
   */
  estimativa: z.number().min(0).nullable().default(null),
  /**
   * Qual preset produzir o símbolo. `null` = o motor resolve (`imagem-marca`).
   * É o nome DO PRODUTO, nunca o slug do provedor.
   */
  preset: z.string().min(1).nullable().default(null),
});
export type PedidoDeMarca = z.infer<typeof PedidoDeMarca>;

// ── Os estágios que gastam ───────────────────────────────────────────────────

/**
 * Os estágios PAGOS de uma marca, com o custo declarado de cada um.
 *
 * ## Por que o empenho é por estágio, e não de uma vez
 *
 * Um pacote completo custa a soma dos estágios abaixo, e o símbolo é o primeiro
 * passo. Empenhar o total de saída significaria descobrir no fim que o desenho
 * não presta depois de ter queimado tudo; empenhando por estágio, uma marca que
 * erra no símbolo para em 75. O estágio seguinte só empenha depois de o
 * anterior passar na régua.
 *
 * O total não é escrito em lugar nenhum: ele é `TETO_DA_MARCA_COMPLETA`, que
 * SOMA a lista. Um número digitado ao lado dela envelheceria na primeira
 * mudança de estágio — e envelheceu, quando o banner passou de 2 para 4
 * gerações e a tela continuou prometendo o total antigo.
 *
 * ## Por que a maior parte de um brandbook não gera nada
 *
 * Porque ela é COMPOSIÇÃO — a regra da casa (determinístico antes de
 * generativo) aplicada ao caso onde ela mais economiza. Favicon, lockup, área
 * de proteção, paleta, tipografia, contraste, formatos de rede e faça/evite
 * saem todos do mesmo símbolo por cálculo, e nenhum deles aparece na lista
 * abaixo.
 *
 * ## Por que o banner deixou de ser 2 gerações e passou a ser 4
 *
 * Esta lista dizia, com todas as letras, que "as versões desktop e mobile de um
 * banner são o MESMO pixel composto duas vezes, não duas gerações". Era verdade
 * enquanto o compositor escrevia o texto: o mesmo pixel entrava em dois quadros
 * e a diagramação era nossa, de graça.
 *
 * Deixou de ser. A arte passou a ser gerada por inteiro — texto dentro do pixel
 * — e o mobile não pode sair da larga por recorte, porque o texto foi
 * diagramado para a largura que o recorte destrói. É a mesma razão de M11
 * existir, e ela custa: dois conceitos viram quatro gerações.
 *
 * Uma estimativa que não acompanha o motor é pior que nenhuma. Ela promete um
 * preço ao cliente, o motor cobra outro, e quem descobre é o razão no meio do
 * trabalho — que foi exatamente o que aconteceu neste job.
 */
export const ESTAGIOS_DA_MARCA = [
  {
    id: 'simbolo',
    rotulo: 'O símbolo',
    /** Uma geração. Dela saem, por cálculo, todas as versões da logo. */
    geracoes: 1,
    creditos: 75,
  },
  {
    id: 'direcao-de-imagem',
    rotulo: 'A direção de imagem',
    /** As capas de categoria da referência: como as fotos desta marca são. */
    geracoes: 3,
    creditos: 225,
  },
  {
    id: 'key-visual',
    rotulo: 'Os key visuals',
    geracoes: 2,
    creditos: 150,
  },
  {
    id: 'conceito-de-banner',
    rotulo: 'Os conceitos de banner',
    /**
     * Duas propostas visuais, cada uma em desktop E mobile: 4 gerações.
     *
     * Não são dois tamanhos do mesmo pixel — o texto vive dentro da arte e o
     * mobile é diagramado do zero. Ver M10 (propostas diferentes) e M11
     * (desktop e mobile).
     */
    geracoes: 4,
    creditos: 300,
  },
  {
    id: 'colecao',
    rotulo: 'As capas de coleção',
    /**
     * Uma geração por coleção, e o formato sai por máscara.
     *
     * O número é o do `COLECOES_QUANDO_O_ORBIS_DECIDE`: é o que a estimativa
     * promete quando ninguém disse quantas. Cliente que pedir mais paga mais, e
     * a tela mostra a conta antes de ele confirmar.
     */
    geracoes: COLECOES_QUANDO_O_ORBIS_DECIDE,
    creditos: 75 * COLECOES_QUANDO_O_ORBIS_DECIDE,
  },
  {
    id: 'vetor',
    rotulo: 'O símbolo em vetor',
    /**
     * `images_to_svg`, medido em 150. Entra porque a referência entrega vetor e
     * a espec proíbe "SVG que seja apenas bitmap disfarçado".
     */
    geracoes: 1,
    creditos: 150,
  },
] as const;

export type EstagioDaMarca = (typeof ESTAGIOS_DA_MARCA)[number]['id'];

/** O teto de um pacote completo: a soma dos estágios, e não um número escolhido. */
export const TETO_DA_MARCA_COMPLETA = ESTAGIOS_DA_MARCA.reduce((t, e) => t + e.creditos, 0);

/** Quantas gerações pagas um pacote completo custa. */
export const GERACOES_DA_MARCA_COMPLETA = ESTAGIOS_DA_MARCA.reduce((t, e) => t + e.geracoes, 0);

// ── A entrega ────────────────────────────────────────────────────────────────

/**
 * Os arquivos que uma marca entrega, e o que cada um resolve.
 *
 * São CINCO e não dezessete. O kit anterior desta casa tinha seis formas de
 * monograma, três lockups horizontais, três por extenso e duas de rede social —
 * e quem abria a pasta não sabia qual era a logo. Escolher por quem recebe é
 * parte da entrega.
 */
export const PecaDaMarca = z.enum([
  /** O símbolo recortado, fundo transparente. É a logo. */
  'logotipo',
  /** O mesmo símbolo sobre branco, para papel e para fundo claro. */
  'logotipo-fundo-branco',
  /** A silhueta, para bordado, carimbo e uma tinta só. */
  'logotipo-fundo-preto',
  /**
   * O NEGATIVO: a silhueta branca com fundo transparente.
   *
   * É a versão que vai por cima de fundo escuro. A falta dela tem um custo que
   * só apareceu na peça pronta: o logotipo colorido sobre uma faixa da PRÓPRIA
   * cor da marca some, e nenhuma leitura de texto percebe.
   */
  'logotipo-negativo',
  /** O símbolo como o gerador o entregou, antes do recorte. */
  'simbolo-original',
  /**
   * Os LOCKUPS e o nome, que o motor desenha junto das versões.
   *
   * Eles faltavam aqui, e o buraco não era teórico: `derivarPacoteDaMarca`
   * grava as doze peças abaixo, e `ResultadoDeMarca` só conhecia as cinco de
   * cima. Medido no job de prova (Sorriso Vivo, doze peças em disco): o parse
   * reprovava em OITO delas, então `problemasDaEntregaDeMarca` — o portão que
   * o `fila:concluir` roda — recusava fechar qualquer marca que tivesse
   * lockup ou favicon, que são todas.
   *
   * Esta lista tem de sair do que o motor PRODUZ, e não do que parecia bastar:
   * peça nova em `pacote.ts` é entrada nova aqui, senão a entrega trava sem
   * ninguém ver o que travou.
   */
  'lockup-horizontal',
  'lockup-vertical',
  'nome-por-extenso',
  /**
   * O símbolo em VETOR, traçado do recorte.
   *
   * É a peça que faltava para tamanho grande: fachada, veículo, bordado. A
   * espec proíbe "SVG que seja apenas bitmap disfarçado", e a diferença se mede
   * — um arquivo com `<image>` e base64 dentro é o PNG com outra extensão, e
   * ampliá-lo devolve o mesmo borrão.
   */
  'logotipo-svg',
  /** Os favicons, nos lados de `LADOS_DO_FAVICON`. */
  'favicon-16',
  'favicon-32',
  'favicon-48',
  'favicon-180',
  'favicon-512',
]);
export type PecaDaMarca = z.infer<typeof PecaDaMarca>;

export const ResultadoDeMarca = z.object({
  /** Os arquivos, relativos à pasta do job. */
  pecas: z.array(
    z.object({
      peca: PecaDaMarca,
      caminho: z.string().min(1),
      /** Largura e altura MEDIDAS no arquivo. */
      largura: z.number().int().positive(),
      altura: z.number().int().positive(),
    }),
  ),
  /**
   * A cor da marca, decidida. Quando o cliente não escolheu, é aqui que a
   * escolha do Orbis fica registrada, com o motivo.
   */
  cor: z.object({ hex: HEX, decidida: z.enum(['cliente', 'orbis']), motivo: z.string() }),
  /** De que modelo e preset o símbolo saiu, para poder reproduzir e auditar. */
  procedencia: z.object({ modelo: z.string().min(1), preset: z.string().min(1) }),
  /** O prompt EXATO que gerou o símbolo. Sem ele a peça não é reproduzível. */
  promptDoSimbolo: z.string().min(1),
  /** A folha de conferência: o que cada regra respondeu sobre esta marca. */
  conferencia: z
    .array(
      z.object({
        codigo: z.string().min(1),
        titulo: z.string().min(1),
        estado: z.enum(['passou', 'reprovou', 'pendente']),
        motivo: z.string().default(''),
      }),
    )
    .nullable()
    .default(null),
  custoGasto: z.number().min(0),
});
export type ResultadoDeMarca = z.infer<typeof ResultadoDeMarca>;

/**
 * O portão da entrega da MARCA.
 *
 * Ele não existia, e o buraco era o mesmo que o `criativo` já tinha tido: um
 * job que gasta dinheiro caía direto no `finishJob`. Resultado ausente, fora do
 * contrato, apontando para arquivo que não existe, sem apresentação ou com
 * regra reprovada — tudo fechava calado, como "concluído".
 *
 * As perguntas, na ordem em que doem:
 *
 * 1. Há resultado, e ele passa no contrato?
 * 2. Os arquivos que ele cita existem em disco?
 * 3. A folha cobre a régua INTEIRA, e nenhuma regra reprovou?
 * 4. A apresentação existe? Marca sem apresentação não é marca pronta.
 * 5. O gasto bate com o razão, e não passou do teto do pedido?
 */
export const problemasDaEntregaDeMarca = (entrada: {
  /** O conteúdo lido de `resultado.json`, ainda não validado. */
  readonly resultado: unknown;
  /** O retrato do pedido, de onde sai o teto que valia para ESTE job. */
  readonly pedido: unknown;
  /** O caminho relativo à pasta do job existe em disco? */
  readonly existe: (caminhoRelativo: string) => boolean;
  /** A apresentação em PDF existe? */
  readonly temApresentacao: boolean;
  /** O que o RAZÃO diz que foi gasto e o que ainda está em voo. */
  readonly razao?: { readonly gasto: number; readonly empenhado: number };
  /** Os códigos que a régua da marca produz. Vem de fora para não criar ciclo. */
  readonly codigosDaRegua: readonly string[];
  /**
   * O teto que vale HOJE, quando o dono autorizou mais depois do pedido.
   *
   * Ausente = vale o do retrato, que é o comportamento de sempre.
   *
   * O retrato do pedido é gravado ANTES da fila e é isso que o torna uma trava:
   * um número que o processamento não alcança não pode ser movido para
   * justificar o que já se gastou. Mas o dono PODE liberar mais — e quando ele
   * libera, o aumento vira lançamento no razão, com data e motivo.
   *
   * Sem este campo o portão só enxergava o retrato, e recusava a entrega de um
   * job cujo estouro tinha autorização escrita. Medido no job de prova: gasto
   * 1425, retrato 825, e 600 liberados um a um no razão. Recusar ali seria
   * chamar de estouro o que estava registrado como decisão.
   */
  readonly tetoEmVigor?: number;
}): string[] => {
  const problemas: string[] = [];

  const lido = ResultadoDeMarca.safeParse(entrada.resultado);
  if (!lido.success) {
    for (const i of lido.error.issues) {
      problemas.push(`resultado.json → ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    }
    return problemas;
  }

  for (const peca of lido.data.pecas) {
    if (!entrada.existe(peca.caminho)) {
      problemas.push(
        `o resultado cita ${peca.caminho} e ele não existe em disco: a entrega apontaria para o vazio.`,
      );
    }
  }

  if (lido.data.conferencia === null || lido.data.conferencia.length === 0) {
    problemas.push(
      'a marca não tem folha de conferência: "pronta" afirma que alguém mediu, e aqui não há o que mostrar.',
    );
  } else {
    const presentes = new Set(lido.data.conferencia.map((r) => r.codigo));
    const faltando = entrada.codigosDaRegua.filter((c) => !presentes.has(c));
    if (faltando.length > 0) {
      problemas.push(
        `folha INCOMPLETA: falta ${faltando.join(', ')}. Regra que some da folha é regra que ninguém rodou.`,
      );
    }
    const reprovadas = lido.data.conferencia.filter((r) => r.estado === 'reprovou');
    if (reprovadas.length > 0) {
      problemas.push(
        `${reprovadas.length} regra(s) REPROVADA(S) na folha (${reprovadas.map((r) => r.codigo).join(', ')}): o veredito contradiz a medição.`,
      );
    }
  }

  /**
   * A apresentação é obrigatória, e é regra do dono.
   *
   * Um punhado de PNGs obriga quem recebe a adivinhar qual é a logo e quando
   * usar cada versão — o trabalho que contratar uma marca vinha evitar.
   */
  if (!entrada.temApresentacao) {
    problemas.push(
      'não há apresentação em PDF. Marca sem apresentação não é marca pronta: quem recebe fica com arquivos soltos e sem saber qual usar onde.',
    );
  }

  if (entrada.razao !== undefined) {
    if (entrada.razao.empenhado > 0) {
      problemas.push(
        `há ${entrada.razao.empenhado} crédito(s) empenhados e sem desfecho no razão: ou o provedor cobrou e falta debitar, ou não cobrou e falta liberar.`,
      );
    }
    if (lido.data.custoGasto !== entrada.razao.gasto) {
      problemas.push(
        `o resultado diz ${lido.data.custoGasto} crédito(s) e o razão registra ${entrada.razao.gasto}: a entrega afirmaria um custo que os lançamentos não sustentam.`,
      );
    }
  }

  const pedido = PedidoDeMarca.safeParse(entrada.pedido);
  const tetoQueVale = entrada.tetoEmVigor ?? (pedido.success ? pedido.data.tetoDeCreditos : 0);
  if (pedido.success && lido.data.custoGasto > tetoQueVale) {
    problemas.push(
      // A frase diz os DOIS números quando eles diferem: sem isso, quem lê não
      // sabe se o teto que barrou é o do pedido ou um que alguém liberou depois.
      tetoQueVale === pedido.data.tetoDeCreditos
        ? `o gasto (${lido.data.custoGasto}) passou do teto do pedido (${tetoQueVale}). Fechar assim registraria o estouro como sucesso.`
        : `o gasto (${lido.data.custoGasto}) passou do teto em vigor (${tetoQueVale} = ${pedido.data.tetoDeCreditos} do retrato + ${tetoQueVale - pedido.data.tetoDeCreditos} liberado(s) depois). Fechar assim registraria o estouro como sucesso.`,
    );
  }

  return problemas;
};
