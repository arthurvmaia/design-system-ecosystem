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

// ── Limites de texto ─────────────────────────────────────────────────────────

/**
 * Os limites de texto do pedido, com nome e exportados porque as TELAS falam
 * deles: a frase "a headline passou de N caracteres" tem de citar o MESMO N
 * que o schema cobra, e um N redigitado na tela diverge na primeira mudança
 * aqui — a mesma razão que pôs `DIMENSAO_DO_FORMATO` neste arquivo.
 */
export const LIMITES_DO_PEDIDO = {
  /** Nome de marca maior que isso não cabe legível numa peça. */
  marca: 80,
  headline: 200,
  /** Botão é uma ordem curta. */
  cta: 80,
  descricaoParaGerar: 2000,
  restricoes: 2000,
} as const;

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
    descricaoParaGerar: z
      .string()
      .min(1)
      .max(LIMITES_DO_PEDIDO.descricaoParaGerar)
      .nullable()
      .default(null),
  })
  .superRefine((v, ctx) => {
    if (v.origem === 'upload' && v.caminhoDoUpload === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caminhoDoUpload'],
        message: 'Origem "upload" exige o caminho do arquivo enviado.',
      });
    }
    /**
     * O espelho ambíguo também reprova — achado do revisor do MVP.
     *
     * A regra "inviolável por construção" só vale se valer nos DOIS sentidos:
     * `gerar` com arquivo já reprovava, mas `upload` com descrição de geração
     * passava — e um payload montado fora da tela (o payload é a fonte da
     * verdade, não a UI) chegaria ao motor deixando ao handler a interpretação
     * que o schema existe para eliminar.
     */
    if (v.origem === 'upload' && v.descricaoParaGerar !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['descricaoParaGerar'],
        message:
          'Há um arquivo enviado: a descrição de geração não vale aqui — o upload nunca passa por geração.',
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
    headline: z.string().min(1).max(LIMITES_DO_PEDIDO.headline).nullable().default(null),
    /** A chamada de ação, literal. Opcional mesmo com headline: nem toda peça tem botão. */
    cta: z.string().min(1).max(LIMITES_DO_PEDIDO.cta).nullable().default(null),
    /**
     * A copy de CADA variação, quando elas não devem dizer a mesma coisa.
     *
     * Vazio = todas usam a headline e o CTA de cima, e diferem só na imagem.
     *
     * Existe porque a peça criativa desta casa é, por regra do dono, um
     * criativo de VENDAS com CTA — e num criativo de vendas testar copy é
     * metade do teste. Com um texto por PEDIDO, duas variações saíam com a
     * mesma frase e a rodada só media imagem: meia fatura, e a metade que
     * costuma mover mais resultado ficava de fora.
     *
     * O tamanho é conferido contra `variacoes` no pedido, e não aqui: este
     * objeto não conhece o irmão. Faltando ou sobrando entrada, o parse
     * reprova, porque "qual variação usa qual copy" não pode ser adivinhado.
     */
    porVariacao: z
      .array(
        z.object({
          headline: z.string().min(1).max(LIMITES_DO_PEDIDO.headline).nullable().default(null),
          cta: z.string().min(1).max(LIMITES_DO_PEDIDO.cta).nullable().default(null),
        }),
      )
      .max(8)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.semTexto && v.porVariacao.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['porVariacao'],
        message: '"Sem texto" com copy por variação é ambíguo: qual dos dois vale?',
      });
    }
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

// ── A direção de marca ───────────────────────────────────────────────────────

/** `#RRGGBB`, a mesma forma que `CorDaPaleta` cobra — sem importar `brand.ts` para cá. */
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A cor precisa estar em #RRGGBB.');

/**
 * A DIREÇÃO DA MARCA: o que a peça precisa saber para parecer daquela marca.
 *
 * ## Por que ela existe
 *
 * O pedido levava duas coisas sobre a marca: a grafia do nome e uma cor. A tela
 * dos quatro passos, no caminho de quem tem projeto, mostrava logotipo, paleta,
 * tipografia e voz, e escrevia em letra miúda "paleta, tipografia e voz vêm
 * junto". Não vinham: `montarPedido` mandava `marca` e `corPrincipal`, e o
 * resto morria no navegador. A peça saía com o nome da marca em `system-ui`
 * sobre uma cor — que é o quanto dá para fazer com o que chegava.
 *
 * ## O critério do que entra aqui
 *
 * Um criativo de tráfego pago tem cinco segundos e um objetivo. Cada campo
 * abaixo só existe porque a COMPOSIÇÃO consegue usá-lo e a RÉGUA consegue
 * medi-lo — pedir o que não vira pixel é formulário cobrando trabalho de quem
 * preenche e devolvendo nada.
 *
 * E a separação de sempre vale aqui inteira: `logotipo`, `coresDeApoio`,
 * `fonteTitulos` e `assinatura` são **fato** (o cliente forneceu, e a peça usa
 * exatamente aquilo); `tom` e `estiloVisual` são **direção** (guiam quem
 * escreve e quem pede o pixel, e nunca viram texto na peça sozinhos).
 */
export const DirecaoDeMarca = z.object({
  /**
   * As cores além da principal, na ordem de preferência da marca.
   *
   * A principal é a faixa de leitura. A primeira daqui que passar no piso de
   * contraste contra ela vira o ACENTO — o botão. Num criativo de tráfego o
   * botão é o elemento de conversão, e ele sair numa inversão calculada do
   * preto-e-branco em vez da segunda cor da marca é a diferença entre a peça
   * parecer da marca e parecer de um gerador.
   *
   * Três, e não uma paleta inteira: a peça tem faixa, tinta e botão. Cor que a
   * composição não tem onde pôr é campo que cobra e descarta.
   */
  coresDeApoio: z.array(HEX).max(3).default([]),
  /**
   * O logotipo, relativo à pasta do job. `null` = a marca assina em texto.
   *
   * É a maior diferença visual entre um banner genérico e o anúncio de uma
   * marca. Entra como imagem com `object-fit: contain` e altura calculada —
   * nunca esticado, porque logo deformada é a falha que o cliente reconhece
   * antes de qualquer outra.
   */
  logotipo: z.string().min(1).nullable().default(null),
  /**
   * A família tipográfica dos títulos, como o catálogo de fontes a nomeia.
   *
   * `null` = a fonte da casa. Quando vem preenchida, a composição EMBUTE o
   * arquivo da fonte na peça e mede se ela realmente aplicou: pedir uma família
   * que o navegador não tem faz o texto sair noutra letra sem avisar ninguém, e
   * a peça diria ser da marca sem ser.
   */
  fonteTitulos: z.string().min(1).max(80).nullable().default(null),
  /**
   * Como a marca fala, em poucas palavras. DIREÇÃO, nunca texto da peça.
   *
   * Guia quem escreve a headline e o CTA. Não vira legenda: um tom colado na
   * arte seria exatamente o "conteúdo inventado" que o resto deste contrato
   * existe para impedir.
   */
  tom: z.string().max(200).default(''),
  /**
   * Como as imagens desta marca parecem — luz, cenário, acabamento. DIREÇÃO.
   *
   * Entra no prompt quando a origem é `gerar`, e é ignorada quando é `upload`:
   * material do cliente não se reinterpreta.
   */
  estiloVisual: z.string().max(300).default(''),
  /**
   * Onde encontrar a marca: `@perfil`, `site.com.br`. FATO, e opcional.
   *
   * Um criativo de tráfego que não diz para onde ir gasta a impressão. Só entra
   * se o cliente digitou — inventar um @ é inventar material, e um @ errado
   * manda a verba para o perfil de outra pessoa.
   */
  assinatura: z.string().min(1).max(80).nullable().default(null),
});
export type DirecaoDeMarca = z.infer<typeof DirecaoDeMarca>;

/** A direção vazia: nenhuma informação, nenhuma invenção. */
export const DIRECAO_VAZIA: DirecaoDeMarca = DirecaoDeMarca.parse({});

// ── O pedido ─────────────────────────────────────────────────────────────────

/**
 * O `payload` de um job `criativo` — o briefing inteiro, fonte da verdade.
 * Quem processa não vai ler o banco por fora: o que não está aqui não existe.
 */
export const PedidoCriativo = z
  .object({
    /**
     * Nome da marca, com a GRAFIA EXATA. Trava se faltar porque modelo erra
     * grafia de marca — e é justamente o que aparece na peça.
     */
    marca: z.string().min(1).max(LIMITES_DO_PEDIDO.marca),
    /** Imagem ou vídeo — muda todo o resto: rota de geração, custo e verificação. */
    tipo: z.enum(['imagem', 'video']),
    /** Define a dimensão. Peça fora de medida não entra no lugar. */
    formato: FormatoCriativo,
    imagem: OrigemDaImagem,
    texto: TextoDaPeca,
    /** O que NÃO pode aparecer, nas palavras do cliente. Campo livre, opcional. */
    restricoes: z.string().max(LIMITES_DO_PEDIDO.restricoes).default(''),
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
    /**
     * Qual preset do catálogo produzir (`imagem-padrao`, `imagem-marca`, …).
     *
     * É o nome DO PRODUTO, nunca o slug do provedor. O slug muda por transporte —
     * o mesmo modelo se chama `imagen-nano-banana-2-flash` no MCP e
     * `text-to-image/nano-banana-pro-flash` no REST — e gravar um deles no pedido
     * amarraria a peça ao transporte que estava ligado no dia.
     *
     * `null` = o motor resolve pelo tipo e pelo formato.
     */
    preset: z.string().min(1).nullable().default(null),
    /**
     * O custo estimado que foi MOSTRADO a quem confirmou, em créditos.
     *
     * Fica no pedido, e não só na tela, porque é metade da conta: sem ele,
     * comparar o que se prometeu com o que se gastou depende da memória de
     * alguém. `null` nos pedidos anteriores a esta medição.
     */
    estimativa: z.number().min(0).nullable().default(null),
    /**
     * A cor principal da marca, em `#RRGGBB`.
     *
     * A peça é COMPOSTA por nós — faixa de leitura, título, botão — e compor sem
     * a cor do cliente significaria escolher uma. Escolher cor por ele é inventar
     * material, que é justamente o que este contrato existe para impedir em preço,
     * prazo e depoimento; não há razão para a cor ser exceção.
     *
     * Uma só, e não uma paleta: o resto é DERIVADO por cálculo (a tinta que se lê
     * sobre ela, o par do botão), então pedir três seria pedir duas a mais para
     * chegar no mesmo lugar. `null` nos pedidos anteriores a esta composição.
     */
    corPrincipal: HEX.nullable().default(null),
    /**
     * O resto da direção de marca: logotipo, cores de apoio, fonte, tom, estilo e
     * assinatura.
     *
     * Separada de `corPrincipal` e de `marca` de propósito. Esses dois são o
     * mínimo que trava o pedido — sem eles a peça não sai —, e todo o resto é
     * material que MELHORA a peça quando existe e não pode travá-la quando falta.
     * Misturar as duas naturezas no mesmo nível faria o parse reprovar um pedido
     * legítimo de quem ainda não tem logotipo.
     *
     * O default vazio é o mesmo princípio de `autorizacoesDeClaim`: na ausência
     * de material, a peça não inventa nenhum.
     */
    direcao: DirecaoDeMarca.default(DIRECAO_VAZIA),
  })
  .superRefine((v, ctx) => {
    /**
     * A copy por variação, se existe, cobre TODAS as variações.
     *
     * Sobrando ou faltando entrada, "qual variação usa qual copy" vira palpite
     * de quem processa — e num criativo de vendas a copy é o que se está
     * testando. Conferir aqui, e não em `TextoDaPeca`, porque só o pedido
     * conhece os dois lados da conta.
     */
    if (v.texto.porVariacao.length > 0 && v.texto.porVariacao.length !== v.variacoes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['texto', 'porVariacao'],
        message: `Há ${v.texto.porVariacao.length} copy(s) para ${v.variacoes} variação(ões). Ou uma para cada, ou nenhuma e todas usam a de cima.`,
      });
    }
  });
export type PedidoCriativo = z.infer<typeof PedidoCriativo>;

/**
 * As cores da peça na ordem em que a composição as quer: a principal primeiro.
 *
 * Uma função, e não um campo, porque a principal já tem dono (`corPrincipal`) e
 * guardá-la duas vezes é a receita conhecida para as duas cópias divergirem.
 */
export const coresDoPedido = (p: {
  readonly corPrincipal: string | null;
  readonly direcao: DirecaoDeMarca;
}): readonly string[] =>
  p.corPrincipal === null ? p.direcao.coresDeApoio : [p.corPrincipal, ...p.direcao.coresDeApoio];

/**
 * O teto do job, dado o custo de UMA variação.
 *
 * Mora no CONTRATO, e não na tela, porque é a mesma conta dos dois lados: a
 * tela mostra o número antes de confirmar, e o servidor confere o mesmo número
 * quando o pedido chega. Duas cópias divergem, e a que divergir decide sozinha
 * quanto do saldo de alguém pode queimar.
 *
 * O teto nascia IGUAL à estimativa, e isso deixava o pedido sem margem
 * nenhuma: `problemasDaEntregaCriativa` recusa fechar um job cujo gasto passou
 * do teto, então uma variação a mais — a tentativa que o cliente tem direito de
 * pedir, ou uma peça refeita depois de falha técnica — travava o job para
 * sempre, com a arte paga em disco e nenhum caminho para fechá-lo.
 *
 * A folga é de UMA variação, e não uma porcentagem inventada: é o tamanho
 * exato da tentativa incluída, e por isso a tela consegue explicá-la em uma
 * frase.
 */
export const tetoComFolga = (custoPorVariacao: number, variacoes: number): number =>
  custoPorVariacao * (variacoes + 1);

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
    /**
     * A FOLHA DE CONFERÊNCIA: o que cada regra respondeu sobre esta peça.
     *
     * Existe porque `aprovada` é uma afirmação forte — a docstring acima a
     * define como "passou a verificação (dimensão exata, texto legível, nada
     * inventado, produto preservado)" — e sem a folha ela vira palavra dada.
     * Com a folha, quem recebe vê O QUE foi medido, e o que ficou pendente
     * viaja com a peça em vez de sumir.
     *
     * `null` nos resultados anteriores a esta régua.
     */
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

/**
 * Os códigos que a régua da peça produz, na ordem.
 *
 * Mora no CONTRATO e não na régua para o portão da entrega poder cobrar a folha
 * COMPLETA sem importar a régua — e sem o ciclo que isso criaria. Um teste
 * amarra os dois: a régua tem de produzir exatamente esta lista.
 *
 * Existe porque o portão aceitava folha com uma regra só. "Aprovada com folha"
 * parecia auditável e não era: bastava declarar C1 e o resto sumia sem que
 * ninguém notasse a ausência, que é justamente o tipo de omissão que uma folha
 * existe para impedir.
 */
export const CODIGOS_DA_REGUA = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'C9',
  'C10',
  'C11',
] as const;

// ── O portão da entrega ──────────────────────────────────────────────────────

/**
 * Contra QUAL pedido a entrega é conferida, e se o retrato precisa ser gravado.
 *
 * O fechamento mede o gasto contra o `tetoDeCreditos` e o texto contra os
 * `autorizacoesDeClaim`. De onde esses dois saem decide se a régua vale, e por
 * isso a decisão mora no CONTRATO e não no script que fecha: é a mesma pergunta
 * que `problemasDaEntregaCriativa` responde logo depois.
 *
 * O payload da fila é o lado MUTÁVEL — um JSON em disco que qualquer coisa
 * edita, e que o `fila:limpar` apaga. O retrato é o lado que existe para não
 * mudar, gravado no ato do pedido.
 *
 * O `fila:concluir` reescrevia o retrato com o payload da fila a cada
 * fechamento, logo antes de conferir o gasto contra ele. Ou seja: deixava o
 * conferido escolher a própria régua, e ninguém veria, porque o número
 * continuava saindo.
 *
 * Sem retrato (job anterior ao POST, ou pasta que se perdeu) o payload é o que
 * há, e aí gravá-lo é rede de segurança, não sobrescrita.
 */
export const referenciaDoPedido = (opts: {
  /** O retrato lido. `null` = não existe; `undefined` = existe e não deu para ler. */
  readonly retrato: unknown | undefined;
  readonly payloadDaFila: unknown;
}): { readonly pedido: unknown; readonly gravarRetrato: boolean; readonly ilegivel: boolean } => {
  // Existe e ilegível: não fecho um job pago sem saber contra que teto medir, e
  // não gravo por cima do que não consegui ler.
  if (opts.retrato === undefined) {
    return { pedido: opts.payloadDaFila, gravarRetrato: false, ilegivel: true };
  }
  if (opts.retrato === null) {
    return { pedido: opts.payloadDaFila, gravarRetrato: true, ilegivel: false };
  }
  return { pedido: opts.retrato, gravarRetrato: false, ilegivel: false };
};

/**
 * O que impede um job `criativo` de fechar. Lista vazia = pode fechar.
 *
 * ## Por que existe
 *
 * O `fila:concluir` validava `extract` e `generate` e deixava o `criativo`
 * passar direto para o `finishJob` — justamente o job que gasta DINHEIRO.
 * Resultado ausente, fora do schema, apontando para arquivo inexistente ou com
 * gasto acima do teto: tudo fechava calado, registrado como "concluído". O
 * buraco apareceu ao exercitar o fluxo de ponta a ponta pela primeira vez, que
 * é para isso que se exercita.
 *
 * ## Por que mora aqui, e sem `fs`
 *
 * Junto do contrato que ela cobra, não no script: o schema já sabe o que é uma
 * entrega válida, e duas cópias dessa regra divergiriam na primeira mudança. A
 * existência do arquivo entra por `existe`, então este módulo continua sem
 * tocar em disco — e a conferência inteira fica testável sem escrever nada.
 */
export const problemasDaEntregaCriativa = (entrada: {
  /** O conteúdo lido de `resultado.json`, ainda não validado. */
  resultado: unknown;
  /** O `payload` do job, de onde sai o teto que valia para ESTE pedido. */
  pedido: unknown;
  /** O caminho relativo à pasta do job existe em disco? */
  existe: (caminhoRelativo: string) => boolean;
  /**
   * A dimensão MEDIDA no arquivo, lida por quem tem acesso ao disco.
   *
   * Existe para o portão conferir sozinho em vez de acreditar na folha: ela é
   * escrita por quem produziu, e uma entrega que confia na própria declaração
   * não tem portão nenhum. `undefined` quando o chamador não sabe medir —
   * e aí a conferência de dimensão simplesmente não acontece, em vez de
   * inventar um verde.
   */
  dimensaoDe?: (caminhoRelativo: string) => { largura: number; altura: number } | null;
  /**
   * O que o RAZÃO diz que foi gasto e o que ainda está em voo.
   *
   * O `custoGasto` do resultado é escrito por quem produziu; o razão é o
   * registro lançamento a lançamento. Enquanto o portão olhava só o primeiro, a
   * conferência de teto comparava um número que nasce zerado — `0 > teto` nunca
   * dispara, e "orçamento contado" virava frase.
   *
   * `undefined` quando o chamador não tem o razão em mãos.
   */
  razao?: { gasto: number; empenhado: number };
}): string[] => {
  const problemas: string[] = [];

  const lido = ResultadoCriativo.safeParse(entrada.resultado);
  if (!lido.success) {
    for (const i of lido.error.issues) {
      problemas.push(`resultado.json → ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    }
    return problemas;
  }

  /**
   * O schema garante que a aprovada tem CAMINHO preenchido, não que o caminho
   * aponta para alguma coisa. Botão de download que baixa 404 é pior que peça
   * reprovada com motivo: a reprovada avisa, esta mente.
   */
  for (const [n, v] of lido.data.variacoes.entries()) {
    if (v.estado !== 'aprovada' || v.caminho === null) continue;
    if (!entrada.existe(v.caminho)) {
      problemas.push(
        `variação ${n + 1} está aprovada mas ${v.caminho} não existe em disco: o download não teria o que baixar.`,
      );
    }
  }

  /**
   * Aprovada sem folha de conferência é palavra dada.
   *
   * `aprovada` afirma que a peça passou na verificação. Sem a folha, ninguém
   * consegue dizer O QUE foi verificado — e um carimbo verde que ninguém
   * consegue auditar é pior que peça reprovada com motivo, porque a reprovada
   * avisa e esta não. O que ficou PENDENTE também viaja aqui: a ressalva
   * acompanha a peça em vez de sumir entre a produção e a entrega.
   */
  for (const [n, v] of lido.data.variacoes.entries()) {
    if (v.estado !== 'aprovada') continue;
    if (v.conferencia === null || v.conferencia.length === 0) {
      problemas.push(
        `variação ${n + 1} está aprovada sem folha de conferência: "aprovada" afirma que alguém mediu, e aqui não há o que mostrar.`,
      );
      continue;
    }
    /**
     * A folha tem de cobrir a régua INTEIRA.
     *
     * Sem isto, uma folha com uma regra só passava: "aprovada com folha"
     * parecia auditável, e a ausência das outras dez não aparecia em lugar
     * nenhum. Regra que some de uma folha é regra que ninguém rodou.
     */
    const presentes = new Set(v.conferencia.map((r) => r.codigo));
    const faltando = CODIGOS_DA_REGUA.filter((codigo) => !presentes.has(codigo));
    if (faltando.length > 0) {
      problemas.push(
        `variação ${n + 1} tem folha INCOMPLETA: falta ${faltando.join(', ')}. Regra que some da folha é regra que ninguém rodou, e a ausência dela não aparece em lugar nenhum.`,
      );
    }
    const reprovadas = v.conferencia.filter((r) => r.estado === 'reprovou');
    if (reprovadas.length > 0) {
      problemas.push(
        `variação ${n + 1} está aprovada com ${reprovadas.length} regra(s) REPROVADA(S) na folha (${reprovadas.map((r) => r.codigo).join(', ')}): o veredito contradiz a medição.`,
      );
    }
  }

  // O teto vem do PEDIDO, nunca de constante nossa: cada job tem o seu.
  const pedido = PedidoCriativo.safeParse(entrada.pedido);

  /**
   * O razão é a fonte do que foi gasto; o resultado tem de concordar com ele.
   *
   * Divergência aqui não é detalhe de contabilidade: é a entrega afirmando ao
   * cliente um custo que os lançamentos não sustentam. E reserva em voo na hora
   * de fechar é dinheiro sem dono — ou o provedor cobrou e ninguém debitou, ou
   * não cobrou e ninguém liberou.
   */
  if (entrada.razao !== undefined) {
    if (entrada.razao.empenhado > 0) {
      problemas.push(
        `há ${entrada.razao.empenhado} crédito(s) empenhados e sem desfecho no razão: ou o provedor cobrou e falta debitar, ou não cobrou e falta liberar. Fechar assim deixa dinheiro em voo sem dono.`,
      );
    }
    if (lido.data.custoGasto !== entrada.razao.gasto) {
      problemas.push(
        `o resultado diz ${lido.data.custoGasto} crédito(s) e o razão registra ${entrada.razao.gasto}: a entrega estaria afirmando ao cliente um custo que os lançamentos não sustentam.`,
      );
    }
  }

  /**
   * A dimensão é conferida NOS BYTES, e não na folha.
   *
   * A folha diz o que quem produziu mediu. Se o arquivo for trocado depois, ou
   * se a folha for escrita à mão, ela continua dizendo que está tudo certo — e
   * o portão que só lê a folha carimba a mentira. Aqui a medida sai do arquivo.
   */
  if (pedido.success && entrada.dimensaoDe !== undefined) {
    const esperada = DIMENSAO_DO_FORMATO[pedido.data.formato];
    for (const [n, v] of lido.data.variacoes.entries()) {
      if (v.estado !== 'aprovada' || v.caminho === null) continue;
      const medida = entrada.dimensaoDe(v.caminho);
      if (medida === null) {
        // "Não consegui medir" não pode virar "passou". Pular em silêncio era o
        // caminho pelo qual um `.mp4` entregue como aprovado nunca tinha a
        // dimensão conferida — e uma imagem parada entregue como vídeo saía
        // limpa.
        problemas.push(
          `variação ${n + 1} está aprovada e eu não consigo medir ${v.caminho}: aprovar o que não foi medido é o carimbo que esta conferência existe para impedir.`,
        );
        continue;
      }
      if (medida.largura !== esperada.largura || medida.altura !== esperada.altura) {
        problemas.push(
          `variação ${n + 1} está aprovada mas o arquivo mede ${medida.largura}×${medida.altura}, e o formato ${pedido.data.formato} pede ${esperada.largura}×${esperada.altura}.`,
        );
      }
    }
  }

  // O gasto conferido é o do RAZÃO quando ele existe: o do resultado é
  // declaração de quem produziu, e nasce zerado.
  const gasto = entrada.razao?.gasto ?? lido.data.custoGasto;
  if (pedido.success && gasto > pedido.data.tetoDeCreditos) {
    problemas.push(
      `o job gastou ${gasto} crédito(s) e o teto do pedido era ${pedido.data.tetoDeCreditos}: o motor devia ter PARADO no teto, e fechar aqui registraria o estouro como sucesso.`,
    );
  }

  return problemas;
};
