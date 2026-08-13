import { z } from 'zod';

/**
 * O contrato do job `criativo`: o cliente pede imagem ou vídeo para a marca
 * dele e baixa o resultado na máquina. Espec em
 * `references/12-frente-criativos-mvp.md`.
 *
 * O critério que organiza este arquivo é o mesmo do motor: **fato trava,
 * direção se assume e se registra**. Grafia da marca, formato, origem da
 * imagem, texto literal, autorização de claim e teto de orçamento são fatos —
 * o parse REPROVA quando faltam, porque cada um deles, inventado, já produziu
 * um tipo conhecido de estrago (marca com grafia errada na peça, desconto que
 * o cliente nunca ofereceu, job que estoura o saldo em silêncio).
 */

// ── Formato ──────────────────────────────────────────────────────────────────

/**
 * Os formatos do MVP, com a proporção no próprio nome para a tela mostrar a
 * medida sem tabela auxiliar. Formato novo = entrada nova aqui e em
 * `DIMENSAO_DO_FORMATO` — nunca uma dimensão "parecida" esticada.
 */
export const FormatoCriativo = z.enum(['feed-1x1', 'story-9x16', 'reels-9x16', 'banner-3x1']);
export type FormatoCriativo = z.infer<typeof FormatoCriativo>;

/**
 * A dimensão exata de cada formato, em pixels.
 *
 * Mora AQUI, e não na tela ou no motor, porque a verificação que libera o
 * download cobra "dimensão exatamente a do formato pedido" — e dois lados
 * medindo contra números digitados em lugares diferentes é como a medida
 * diverge sem ninguém errar.
 */
export const DIMENSAO_DO_FORMATO: Record<FormatoCriativo, { largura: number; altura: number }> = {
  'feed-1x1': { largura: 1080, altura: 1080 },
  'story-9x16': { largura: 1080, altura: 1920 },
  // Reels divide a tela do story (9:16 em 1080×1920), mas é formato separado
  // porque a escolha do cliente carrega intenção: reels nasce vídeo.
  'reels-9x16': { largura: 1080, altura: 1920 },
  // 3:1 na base de cabeçalho mais comum da web (1500×500). Canal que pedir
  // outra base 3:1 entra como formato novo, com a medida dele.
  'banner-3x1': { largura: 1500, altura: 500 },
};

// ── Origem da imagem ─────────────────────────────────────────────────────────

/**
 * De onde vem a imagem da peça. É a regra que decide tudo, nas palavras da
 * espec:
 *
 * > "Só gera imagem por IA quando não houver imagem. Se o admin ou o cliente
 * > forneceu o arquivo, ele é usado — gerar ali seria trocar material real por
 * > material inventado."
 *
 * O schema torna a regra inviolável POR CONSTRUÇÃO, em vez de confiar que o
 * handler lembre de conferir: `origem: 'gerar'` com um arquivo presente
 * reprova no parse. O caminho do upload nunca passa por geração.
 */
export const OrigemDaImagem = z
  .object({
    /** A escolha do cliente no formulário: "tenho a foto" ou "o Orbis cria". */
    origem: z.enum(['upload', 'gerar']),
    /**
     * Caminho do arquivo que o cliente enviou, relativo à pasta do job.
     * Obrigatório quando `origem: 'upload'` — upload sem arquivo é um pedido
     * que não diz o que usar.
     */
    caminhoDoUpload: z.string().min(1).nullable().default(null),
    /**
     * O que o Orbis deve criar, nas palavras do cliente. Obrigatório quando
     * `origem: 'gerar'` — gerar sem descrição seria o motor inventando o
     * assunto da peça.
     */
    descricaoParaGerar: z.string().min(1).max(2000).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.origem === 'upload' && v.caminhoDoUpload === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caminhoDoUpload'],
        message: 'Origem "upload" exige o caminho do arquivo enviado.',
      });
    }
    if (v.origem === 'gerar') {
      if (v.caminhoDoUpload !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['caminhoDoUpload'],
          message:
            'Há um arquivo fornecido: gerar seria trocar material real por material inventado. O upload vence a geração.',
        });
      }
      if (v.descricaoParaGerar === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['descricaoParaGerar'],
          message: 'Origem "gerar" exige a descrição do que criar.',
        });
      }
    }
  });
export type OrigemDaImagem = z.infer<typeof OrigemDaImagem>;

// ── Texto da peça ────────────────────────────────────────────────────────────

/**
 * O texto que aparece NA peça: headline e CTA literais, ou a decisão explícita
 * de não ter texto.
 *
 * É fato, não direção — trava se faltar. Modelo inventa copy com facilidade, e
 * o que está queimado no pixel de uma peça publicada fala em nome da marca do
 * cliente. Ou ele digita o texto, ou declara `semTexto`; o meio-termo (deixar
 * vazio e ver o que sai) é exatamente o que este schema recusa.
 */
export const TextoDaPeca = z
  .object({
    /** `true` = a peça sai sem texto nenhum, por decisão — não por esquecimento. */
    semTexto: z.boolean().default(false),
    /** A frase principal, literal, como vai aparecer. */
    headline: z.string().min(1).max(200).nullable().default(null),
    /** A chamada de ação, literal. Opcional mesmo com headline: nem toda peça tem botão. */
    cta: z.string().min(1).max(80).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.semTexto && v.headline === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['headline'],
        message: 'Ou o texto literal da peça, ou "sem texto". Vazio não é escolha.',
      });
    }
    if (v.semTexto && (v.headline !== null || v.cta !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['semTexto'],
        message: '"Sem texto" com headline ou CTA é ambíguo: qual dos dois vale?',
      });
    }
  });
export type TextoDaPeca = z.infer<typeof TextoDaPeca>;

// ── Autorizações de claim ────────────────────────────────────────────────────

/**
 * O que o cliente AUTORIZOU a peça a afirmar.
 *
 * Preço, desconto, prazo, frete, depoimento e certificação nunca têm valor
 * sugerido e nunca são inferidos: ou o cliente digita, ou a afirmação não
 * aparece na peça. Este é o ponto onde a frente pode gerar passivo JURÍDICO —
 * um desconto inventado numa peça publicada é promessa comercial da marca, não
 * um bug visual que se regenera — e é o único lugar do MVP que não admite
 * atalho.
 *
 * `strictObject` de propósito: um tipo de claim que o contrato não conhece
 * ("garantia", "aprovado pela Anvisa") reprova no parse em vez de passar
 * despercebido, e alguém decide conscientemente se ele entra aqui.
 */
export const AutorizacoesDeClaim = z.strictObject({
  /** "R$ 49,90", como o cliente digitou. Null = preço não aparece na peça. */
  preco: z.string().min(1).nullable().default(null),
  desconto: z.string().min(1).nullable().default(null),
  prazo: z.string().min(1).nullable().default(null),
  frete: z.string().min(1).nullable().default(null),
  /** O depoimento inteiro, literal — nunca "um depoimento parecido". */
  depoimento: z.string().min(1).nullable().default(null),
  certificacao: z.string().min(1).nullable().default(null),
});
export type AutorizacoesDeClaim = z.infer<typeof AutorizacoesDeClaim>;

/**
 * Os claims que o cliente digitou, prontos para a peça e para a verificação
 * ("nada inventado que o cliente não digitou"). Só entra o que tem texto.
 */
export const claimsAutorizados = (
  autorizacoes: AutorizacoesDeClaim,
): Array<{ tipo: keyof AutorizacoesDeClaim; texto: string }> =>
  (Object.entries(autorizacoes) as Array<[keyof AutorizacoesDeClaim, string | null]>)
    .filter((par): par is [keyof AutorizacoesDeClaim, string] => par[1] !== null)
    .map(([tipo, texto]) => ({ tipo, texto }));

// ── O pedido ─────────────────────────────────────────────────────────────────

/**
 * O `payload` de um job `criativo` — o briefing inteiro, fonte da verdade.
 * Quem processa não vai ler o banco por fora: o que não está aqui não existe.
 */
export const PedidoCriativo = z.object({
  /**
   * Nome da marca, com a GRAFIA EXATA. Trava se faltar porque modelo erra
   * grafia de marca — e é justamente o que aparece na peça.
   */
  marca: z.string().min(1).max(80),
  /** Imagem ou vídeo — muda todo o resto: rota de geração, custo e verificação. */
  tipo: z.enum(['imagem', 'video']),
  /** Define a dimensão. Peça fora de medida não entra no lugar. */
  formato: FormatoCriativo,
  imagem: OrigemDaImagem,
  texto: TextoDaPeca,
  /** O que NÃO pode aparecer, nas palavras do cliente. Campo livre, opcional. */
  restricoes: z.string().max(2000).default(''),
  /**
   * Quantas variações produzir. Padrão 2 (espec: assume e registra). Teto de 8
   * porque cada variação gasta crédito e o MVP não tem galeria para absorver
   * excesso — mais que isso é outro pedido.
   */
  variacoes: z.number().int().min(1).max(8).default(2),
  /**
   * Teto de gasto do job, em créditos. OBRIGATÓRIO e sem default de propósito:
   * a contabilidade do motor é estimar antes, declarar o custo, debitar do
   * teto e PARAR ao zerar em vez de estourar em silêncio — e parar exige saber
   * onde fica o zero. Um default aqui seria o app decidindo sozinho quanto do
   * saldo do cliente pode queimar.
   */
  tetoDeCreditos: z.number().positive(),
  /**
   * Default vazio = NENHUM claim autorizado. É o único default seguro: na
   * ausência de digitação, a peça não afirma nada.
   */
  autorizacoesDeClaim: AutorizacoesDeClaim.default({}),
});
export type PedidoCriativo = z.infer<typeof PedidoCriativo>;

// ── O resultado ──────────────────────────────────────────────────────────────

/**
 * O estado de cada variação, um a um — porque o resultado honesto é "gerei 2
 * de 4; as outras duas falharam por saldo", nunca "quase tudo pronto".
 *
 * - `aprovada`: passou a verificação (dimensão exata, texto legível, nada
 *   inventado, produto preservado). Só ela ganha botão de download.
 * - `reprovada`: o arquivo existe mas a verificação barrou. Não vira download
 *   silencioso — o Orbis diz o que falhou.
 * - `falhou`: nem virou arquivo (saldo zerado, geração que não veio).
 */
export const EstadoDaVariacao = z.enum(['aprovada', 'reprovada', 'falhou']);
export type EstadoDaVariacao = z.infer<typeof EstadoDaVariacao>;

export const VariacaoCriativa = z
  .object({
    /**
     * Caminho do arquivo, relativo à pasta do job (`criativosDir`). Relativo
     * de propósito: a pasta pode ser zipada, movida ou servida pela rota de
     * download sem reescrever nada. Null quando a variação não virou arquivo.
     */
    caminho: z.string().min(1).nullable().default(null),
    estado: EstadoDaVariacao,
    /** Por que reprovou ou falhou — a frase que o Orbis mostra. Null quando aprovada. */
    motivo: z.string().min(1).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.estado === 'aprovada' && v.caminho === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caminho'],
        message: 'Variação aprovada sem arquivo: o botão de download não teria o que baixar.',
      });
    }
    if (v.estado !== 'aprovada' && v.motivo === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['motivo'],
        message: `Variação "${v.estado}" sem motivo: peça que não sai boa tem de dizer o que falhou.`,
      });
    }
  });
export type VariacaoCriativa = z.infer<typeof VariacaoCriativa>;

/**
 * O `result` de um job `criativo`. O custo entra aqui, e não só no log,
 * porque a contabilidade é parte do contrato: quem pediu com teto tem o
 * direito de ver quanto foi gasto de verdade.
 */
export const ResultadoCriativo = z.object({
  variacoes: z.array(VariacaoCriativa),
  /** Créditos efetivamente gastos. O motor para no teto; aqui fica a conta. */
  custoGasto: z.number().min(0),
});
export type ResultadoCriativo = z.infer<typeof ResultadoCriativo>;
