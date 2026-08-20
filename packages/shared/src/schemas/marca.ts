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
 * Um pacote completo custa 750, e o símbolo é o primeiro passo. Empenhar os
 * 750 de saída significaria descobrir no fim que o desenho não presta depois de
 * ter queimado tudo; empenhando por estágio, uma marca que erra no símbolo para
 * em 75. O estágio seguinte só empenha depois de o anterior passar na régua.
 *
 * ## Por que 22 seções custam 9 gerações
 *
 * Porque a maior parte de um brandbook é COMPOSIÇÃO, não geração — é a regra da
 * casa (determinístico antes de generativo) aplicada ao caso onde ela mais
 * economiza. Favicon, lockup, área de proteção, paleta, tipografia, contraste,
 * formatos de rede e faça/evite saem todos do mesmo símbolo por cálculo. E as
 * versões desktop e mobile de um banner são o MESMO pixel composto duas vezes,
 * não duas gerações.
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
    /** Desktop e mobile saem do MESMO pixel, compostos: são 2 gerações, não 4. */
    geracoes: 2,
    creditos: 150,
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
