import type { ResultadoDeAceite, VereditoDaRegra } from './regras-de-aceite.js';
import {
  DIMENSAO_DO_FORMATO,
  type FormatoCriativo,
  claimsAutorizados,
} from './schemas/criativo.js';

/**
 * As regras de aceite da PEÇA CRIATIVA, executáveis.
 *
 * O texto delas mora em `docs/regras-de-aceite.md`, junto com as da Galeria e as
 * do Site. Aqui elas viram conferência, porque regra que só existe em documento
 * é regra que a primeira pressa contorna.
 *
 * ## O que muda em relação às outras duas
 *
 * A peça criativa custa DINHEIRO e vai para fora da casa. Isso desloca o peso
 * do veredito `pendente`: na Galeria ele é um limite técnico conhecido (um
 * runtime que não viaja); aqui ele é, quase sempre, uma coisa que **não temos
 * como medir** — e o que não se mede não pode ser chamado de aprovado.
 *
 * Por isso a peça com pendência sai rotulada **"aprovada com ressalva"**, com a
 * ressalva nomeada, e não como `aprovada`. A docstring de `criativo.ts` define
 * `aprovada` como "passou a verificação (dimensão exata, texto legível, nada
 * inventado, produto preservado)"; chamar de aprovada o que não teve "nada
 * inventado" medido é exatamente o carimbo verde que este repositório já pagou
 * uma vez para aprender a não dar.
 *
 * ## Por que os campos são todos opcionais
 *
 * Cada campo ausente vira `pendente`, nunca `passou`. Uma conferência que
 * recebe um objeto vazio tem de sair com zero verdes — senão a ausência de
 * medição viraria aprovação, que é o pior defeito possível numa régua.
 */

/**
 * Onde um papel FOI PARAR dentro do quadro, medido no navegador.
 *
 * Existe porque `innerText` responde à pergunta errada. Ele diz o que está no
 * DOCUMENTO, e a peça é o que está no PIXEL: medido num `banner-3x1` com uma
 * headline de 176 caracteres (o schema permite 200), a linha da marca terminou
 * **601px acima** do topo do quadro, a headline entrou cortada no meio — e as
 * dez regras ficaram verdes, porque todas liam texto e nenhuma olhava lugar.
 *
 * As coordenadas são as do `getBoundingClientRect()`, na mesma origem do
 * quadro: `topo` negativo é acima da borda de cima, `base` maior que a altura é
 * abaixo da de baixo.
 */
export type CaixaDoPapel = {
  /** O `data-papel` do elemento: `marca`, `headline`, `cta`, `assinatura`. */
  readonly papel: string;
  /**
   * O que ESTE papel renderizou.
   *
   * Separado da lista solta de textos porque a pergunta de C3 é sobre um papel
   * específico: a marca. Procurando a grafia em QUALQUER texto da peça, uma
   * headline que mencionasse a marca satisfazia a regra enquanto a linha da
   * marca estava errada, ou ausente. Numa imagem (o logotipo) o texto é o
   * `alt`, que é onde o nome da marca vive.
   */
  readonly texto: string;
  readonly esquerda: number;
  readonly topo: number;
  readonly direita: number;
  readonly base: number;
  /**
   * A dimensão REAL do arquivo, quando o papel é uma imagem (o logotipo).
   * `null` quando o papel é texto.
   *
   * Serve para duas perguntas que só a imagem tem. A primeira: ela carregou?
   * `larguraReal` zero é a imagem quebrada — e o elemento continua com caixa,
   * então nenhuma medida de geometria percebe o buraco. A segunda: ela está
   * deformada? A proporção do arquivo contra a proporção da caixa responde
   * exato, e logo esticada é a falha que o cliente reconhece antes de todas.
   */
  readonly imagem?: { readonly larguraReal: number; readonly alturaReal: number } | null;
  /**
   * A opacidade COMPUTADA do elemento.
   *
   * Ela entra na régua porque o contraste da peça é calculado entre duas cores
   * declaradas, e esse número só é verdade enquanto o texto for opaco sobre a
   * faixa sólida. Medido no mesmo banner: a marca vinha com `opacity:.85` sobre
   * o trecho transparente de um degradê, e o pixel real dava 2,51:1 enquanto
   * C4 declarava 11,82.
   */
  readonly opacidade: number;
};

/**
 * A folga, em pixels, entre a caixa do texto e a borda do quadro.
 *
 * Um pixel, e ele é de arredondamento: `getBoundingClientRect()` devolve
 * fracionário e a comparação é contra inteiro. Não é margem de tolerância a
 * texto cortado — texto cortado é texto que não está na peça.
 */
const FOLGA_DA_BORDA = 1;

/**
 * Quanto a proporção do logotipo na peça pode divergir da do arquivo.
 *
 * 2%, e é folga de ARREDONDAMENTO: a caixa é medida em pixel inteiro e um
 * logotipo pequeno divide números pequenos, onde meio pixel já move a segunda
 * casa. Não é tolerância a deformação — a composição fixa a altura e deixa a
 * largura em `auto`, então proporção certa é o resultado normal, e desvio
 * acima disto significa que alguém escreveu uma largura em pixel.
 */
const DESVIO_DE_PROPORCAO = 0.02;

/**
 * A assinatura do acento EMBARALHADO, que não deixa rastro de perda.
 *
 * Quando bytes de UTF-8 são lidos como se fossem de uma tabela de um byte,
 * "coleção" vira "coleÃ§Ã£o": nada se perdeu, e por isso não há U+FFFD para
 * denunciar. C10 procurava só o caractere de substituição e passava por cima
 * desta classe inteira.
 *
 * O padrão é a sequência que só aparece nesse acidente: um `Ã` ou `Â` seguido
 * de um caractere da faixa de continuação de UTF-8, ou o `â€` das aspas
 * tipográficas. Português de verdade não produz nenhum dos dois.
 */
const MOJIBAKE = /[ÃÂ][-¿]|â€/;

/** O que a conferência precisa saber sobre UMA variação produzida. */
export type VariacaoParaAceite = {
  /** O formato pedido. Decide a dimensão exata que a peça tem de ter. */
  readonly formato: FormatoCriativo;
  /** Largura e altura MEDIDAS no arquivo. `null` = ninguém mediu. */
  readonly largura: number | null;
  readonly altura: number | null;
  /**
   * Houve pixel GERADO nesta peça? Muda o que precisa ser conferido: peça
   * inteiramente composta de material do cliente não tem como inventar texto.
   */
  readonly houvePixelGerado: boolean;
  /** O texto que a peça deveria exibir, literal. `null` quando é peça sem texto. */
  readonly headline: string | null;
  readonly cta: string | null;
  /** O texto REALMENTE renderizado, como o navegador o entregou. */
  readonly textoRenderizado: readonly string[] | null;
  /**
   * Onde cada papel foi parar, medido. `null` = ninguém mediu a geometria.
   *
   * Separado de `textoRenderizado` porque as duas medições respondem coisas
   * diferentes, e foi por confundi-las que a régua passou a mentir: ler o texto
   * prova que ele existe, medir a caixa prova que ele aparece.
   */
  readonly caixasDosPapeis: readonly CaixaDoPapel[] | null;
  /** A grafia exata da marca, como o cliente digitou. */
  readonly marca: string;
  /** O menor contraste medido entre texto e fundo, no tamanho real. */
  readonly menorContraste: number | null;
  /** O hash do conteúdo desta variação, para comparar com as irmãs. */
  readonly hash: string | null;
  /** Os hashes das outras variações do mesmo pedido. */
  readonly hashesIrmas: readonly string[];
  /**
   * Houve upload do cliente neste pedido?
   *
   * Separado de `uploadPreservado` de propósito: um `null` sozinho significaria
   * as duas coisas ao mesmo tempo — "não havia o que preservar" e "ninguém
   * conferiu" —, e a régua daria verde para a segunda. Foi exatamente o que o
   * teste "sem medição nenhuma, NADA fica verde" pegou.
   */
  readonly houveUpload: boolean;
  /** O upload ainda está na peça? `null` = ninguém conferiu. */
  readonly uploadPreservado: boolean | null;
  /** De onde veio cada parte: o registro de proveniência. */
  readonly procedencia: { readonly modelo: string; readonly preset: string } | null;
  /**
   * A tipografia que o pedido escolheu, e se ela APLICOU.
   *
   * `familia: null` = o pedido não escolheu nenhuma, e a peça sai na letra da
   * casa por decisão. `aplicou: null` = ninguém mediu.
   */
  readonly tipografia: { readonly familia: string | null; readonly aplicou: boolean | null } | null;
};

/**
 * O piso de contraste. É o mesmo das outras réguas da casa
 * (`PISO_DE_CONTRASTE`, `PISO_DO_PAR`): abaixo de 3 o texto deixa de se ler no
 * tamanho real, e uma peça de tráfego que não se lê não cumpre função nenhuma.
 */
export const PISO_DE_CONTRASTE_DA_PECA = 3;

const passou = (codigo: string, titulo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'passou',
  motivo: '',
});
const reprovou = (codigo: string, titulo: string, motivo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'reprovou',
  motivo,
});
const pendente = (codigo: string, titulo: string, motivo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'pendente',
  motivo,
});

/**
 * Normaliza para comparar GRAFIA, não formatação.
 *
 * `text-transform: uppercase` muda o que se vê sem mudar o texto do documento:
 * "iFood" vira "IFOOD" na tela e continua "iFood" no DOM. Comparar o que o
 * navegador ENTREGOU com o que o cliente digitou, sem normalizar o caixa,
 * é o que pega esse caso — e é por isso que a comparação abaixo é sensível a
 * maiúsculas de propósito.
 */
const semEspacosRepetidos = (s: string): string => s.replace(/\s+/g, ' ').trim();

export const conferirVariacaoCriativa = (v: VariacaoParaAceite): ResultadoDeAceite => {
  const vereditos: VereditoDaRegra[] = [];
  const esperada = DIMENSAO_DO_FORMATO[v.formato];

  // C1 ─────────────────────────────────────────────────────────────────────
  if (v.largura === null || v.altura === null) {
    vereditos.push(
      pendente('C1', 'A dimensão é exatamente a do formato', 'Ninguém mediu o arquivo.'),
    );
  } else if (v.largura !== esperada.largura || v.altura !== esperada.altura) {
    vereditos.push(
      reprovou(
        'C1',
        'A dimensão é exatamente a do formato',
        `A peça saiu ${v.largura}×${v.altura} e o formato ${v.formato} pede ${esperada.largura}×${esperada.altura}. Peça fora de medida não entra no lugar.`,
      ),
    );
  } else {
    vereditos.push(passou('C1', 'A dimensão é exatamente a do formato'));
  }

  // C2 ─────────────────────────────────────────────────────────────────────
  // Duas perguntas, e a segunda é a que faltava: o texto pedido foi escrito, e
  // o texto escrito CABE no quadro. Uma peça cujo título existe no documento e
  // termina 600px acima da borda de cima não tem o texto pedido — tem o
  // registro de que alguém o escreveu.
  const TITULO_C2 = 'O texto pedido está na peça, e dentro do quadro';
  const pedidos = [v.headline, v.cta].filter((t): t is string => t !== null && t.trim() !== '');
  if (v.textoRenderizado === null) {
    vereditos.push(pendente('C2', TITULO_C2, 'Ninguém leu o que a peça renderizou.'));
  } else {
    const lido = v.textoRenderizado.map(semEspacosRepetidos);
    const faltando = pedidos.filter((t) => !lido.some((l) => l.includes(semEspacosRepetidos(t))));
    if (faltando.length > 0) {
      vereditos.push(
        reprovou(
          'C2',
          TITULO_C2,
          `O texto literal não apareceu: ${faltando.map((t) => `"${t}"`).join(', ')}.`,
        ),
      );
    } else if (v.caixasDosPapeis === null) {
      vereditos.push(
        pendente(
          'C2',
          TITULO_C2,
          'O texto está no documento, mas ninguém mediu ONDE ele foi parar. Texto fora do quadro continua respondendo à leitura, e é assim que uma peça sem marca visível passa por aprovada.',
        ),
      );
    } else {
      const fora = v.caixasDosPapeis.filter(
        (c) =>
          c.topo < -FOLGA_DA_BORDA ||
          c.esquerda < -FOLGA_DA_BORDA ||
          c.base > esperada.altura + FOLGA_DA_BORDA ||
          c.direita > esperada.largura + FOLGA_DA_BORDA,
      );
      vereditos.push(
        fora.length === 0
          ? passou('C2', TITULO_C2)
          : reprovou(
              'C2',
              TITULO_C2,
              `Fica fora do quadro de ${esperada.largura}×${esperada.altura}: ${fora
                .map((c) => `"${c.papel}" (${c.esquerda},${c.topo} a ${c.direita},${c.base})`)
                .join(', ')}. Está no documento e não está na peça.`,
            ),
      );
    }
  }

  // C3 ─────────────────────────────────────────────────────────────────────
  // A marca assina de duas maneiras, e "exata" quer dizer coisas diferentes em
  // cada uma. Em TEXTO, exata é a grafia: "iFood" e não "IFOOD". Em LOGOTIPO,
  // exata é a arte — o arquivo carregou, e ele não está deformado. Um logotipo
  // esticado é a falha que o cliente reconhece antes de qualquer outra, e ela
  // não aparece em leitura nenhuma de texto.
  const TITULO_C3 = 'A marca está na peça, exata';
  const caixaDaMarca = (v.caixasDosPapeis ?? []).find((c) => c.papel === 'marca') ?? null;
  const logotipo = caixaDaMarca === null ? null : (caixaDaMarca.imagem ?? null);
  if (caixaDaMarca !== null && logotipo !== null) {
    if (logotipo.larguraReal === 0 || logotipo.alturaReal === 0) {
      vereditos.push(
        reprovou(
          'C3',
          TITULO_C3,
          'O logotipo não carregou. O elemento continua ocupando lugar, então a peça sai com um buraco onde deveria estar a marca e nenhuma medida de geometria reclama.',
        ),
      );
    } else {
      const proporcaoDoArquivo = logotipo.larguraReal / logotipo.alturaReal;
      const larguraNaPeca = caixaDaMarca.direita - caixaDaMarca.esquerda;
      const alturaNaPeca = caixaDaMarca.base - caixaDaMarca.topo;
      const proporcaoNaPeca = alturaNaPeca === 0 ? 0 : larguraNaPeca / alturaNaPeca;
      const desvio =
        proporcaoDoArquivo === 0
          ? 1
          : Math.abs(proporcaoNaPeca - proporcaoDoArquivo) / proporcaoDoArquivo;
      vereditos.push(
        desvio <= DESVIO_DE_PROPORCAO
          ? passou('C3', TITULO_C3)
          : reprovou(
              'C3',
              TITULO_C3,
              `O logotipo saiu deformado: o arquivo é ${logotipo.larguraReal}×${logotipo.alturaReal} (proporção ${proporcaoDoArquivo.toFixed(2)}) e na peça ele ocupa ${larguraNaPeca}×${alturaNaPeca} (proporção ${proporcaoNaPeca.toFixed(2)}). Marca esticada é a primeira coisa que o dono dela percebe.`,
            ),
      );
    }
  } else if (v.textoRenderizado === null) {
    vereditos.push(pendente('C3', TITULO_C3, 'Ninguém leu o que a peça renderizou.'));
  } else {
    /**
     * A grafia é procurada no PAPEL da marca, não na peça toda.
     *
     * Varrendo todos os textos, uma headline que mencionasse a marca satisfazia
     * C3 enquanto a linha da marca estava com outra grafia — ou não estava lá.
     * Sem a geometria medida não há como saber qual texto é de qual papel, e aí
     * a varredura antiga é o que há; o veredito diz isso na frase, em vez de
     * afirmar mais do que mediu.
     */
    const ondeProcurar = caixaDaMarca === null ? v.textoRenderizado : [caixaDaMarca.texto];
    const achouExata = ondeProcurar.some((t) => t.includes(v.marca));
    const achouIgnorandoCaixa = ondeProcurar.some((t) =>
      t.toLowerCase().includes(v.marca.toLowerCase()),
    );
    if (achouExata) {
      vereditos.push(passou('C3', TITULO_C3));
    } else if (achouIgnorandoCaixa) {
      vereditos.push(
        reprovou(
          'C3',
          TITULO_C3,
          `A marca aparece com outra caixa que não "${v.marca}". Um "text-transform" muda o que se vê sem mudar o documento, e a grafia da marca é FATO, não estilo.`,
        ),
      );
    } else {
      vereditos.push(
        pendente(
          'C3',
          TITULO_C3,
          'A marca não aparece no texto renderizado. Pode ser peça sem assinatura, e isso não dá para afirmar daqui.',
        ),
      );
    }
  }

  // C4 ─────────────────────────────────────────────────────────────────────
  // O contraste é calculado entre duas cores DECLARADAS, e não amostrado do
  // pixel. Isso é barato e exato — enquanto valer a condição que o torna
  // verdade: texto opaco sobre a faixa sólida. Quando ela não vale, o número
  // continua saindo bonito e deixa de descrever a peça, que é a pior forma de
  // um número errar. Por isso a condição é MEDIDA aqui, e não presumida.
  const TITULO_C4 = 'O texto se lê no tamanho real';
  const translucidos = (v.caixasDosPapeis ?? []).filter((c) => c.opacidade < 1);
  if (v.menorContraste === null) {
    vereditos.push(pendente('C4', TITULO_C4, 'Ninguém mediu o contraste.'));
  } else if (!Number.isFinite(v.menorContraste)) {
    // `NaN < piso` é `false`: sem esta linha, contraste que não deu para
    // calcular passava por baixo do piso e saía verde.
    vereditos.push(
      pendente(
        'C4',
        TITULO_C4,
        'O contraste não deu para calcular (deu NaN). Cor em formato que a conta não lê passa por baixo do piso em silêncio, então isto fica pendente em vez de verde.',
      ),
    );
  } else if (v.menorContraste < PISO_DE_CONTRASTE_DA_PECA) {
    vereditos.push(
      reprovou(
        'C4',
        TITULO_C4,
        `O menor contraste medido é ${v.menorContraste.toFixed(2)}:1, abaixo do piso de ${PISO_DE_CONTRASTE_DA_PECA}:1.`,
      ),
    );
  } else if (v.caixasDosPapeis === null) {
    vereditos.push(
      pendente(
        'C4',
        TITULO_C4,
        `O contraste declarado é ${v.menorContraste.toFixed(2)}:1, mas ele sai das cores escolhidas e ninguém conferiu se é isso que está no pixel. Um texto translúcido, ou sobre degradê, mantém o número e perde a leitura.`,
      ),
    );
  } else if (translucidos.length > 0) {
    vereditos.push(
      reprovou(
        'C4',
        TITULO_C4,
        `O contraste declarado é ${v.menorContraste.toFixed(2)}:1, e ele não vale: ${translucidos
          .map((c) => `"${c.papel}" está com opacidade ${c.opacidade}`)
          .join(
            ', ',
          )}. Texto translúcido não tem o contraste do par que foi calculado — tem o do pixel que sobrou.`,
      ),
    );
  } else {
    vereditos.push(passou('C4', TITULO_C4));
  }

  // C5 ─────────────────────────────────────────────────────────────────────
  if (!v.houveUpload) {
    vereditos.push(passou('C5', 'O material do cliente foi preservado'));
  } else if (v.uploadPreservado === null) {
    vereditos.push(
      pendente(
        'C5',
        'O material do cliente foi preservado',
        'Houve upload e ninguém conferiu se ele sobreviveu à composição.',
      ),
    );
  } else if (!v.uploadPreservado) {
    vereditos.push(
      reprovou(
        'C5',
        'O material do cliente foi preservado',
        'O arquivo que o cliente enviou não está na peça. Upload vence geração: trocá-lo por material inventado é o contrário do que ele pediu.',
      ),
    );
  } else {
    vereditos.push(passou('C5', 'O material do cliente foi preservado'));
  }

  // C6 ─────────────────────────────────────────────────────────────────────
  if (v.hash === null) {
    vereditos.push(
      pendente('C6', 'As variações são de fato diferentes', 'Ninguém calculou o hash da peça.'),
    );
  } else if (v.hashesIrmas.includes(v.hash)) {
    vereditos.push(
      reprovou(
        'C6',
        'As variações são de fato diferentes',
        'Esta variação é byte a byte igual a outra do mesmo pedido: cobrou duas e entregou uma.',
      ),
    );
  } else {
    vereditos.push(passou('C6', 'As variações são de fato diferentes'));
  }

  // C7 ─────────────────────────────────────────────────────────────────────
  if (!v.houvePixelGerado) {
    vereditos.push(passou('C7', 'Nenhum texto espúrio dentro do pixel'));
  } else {
    vereditos.push(
      pendente(
        'C7',
        'Nenhum texto espúrio dentro do pixel',
        'Não temos como ler o que está DENTRO da imagem gerada: leria letra torta, marca d’água e legenda inventada, e isso exige OCR, que este repositório não tem. Vai para revisão humana em vez de passar.',
      ),
    );
  }

  // C8 ─────────────────────────────────────────────────────────────────────
  if (!v.houvePixelGerado) {
    vereditos.push(passou('C8', 'Sem marca d’água do provedor'));
  } else {
    vereditos.push(
      pendente(
        'C8',
        'Sem marca d’água do provedor',
        'O plano da conta não é prova sobre o pixel: ninguém olhou a imagem. Vai para revisão humana.',
      ),
    );
  }

  // C9 ─────────────────────────────────────────────────────────────────────
  if (v.procedencia === null) {
    vereditos.push(
      pendente(
        'C9',
        'A procedência está registrada',
        'A peça não diz de que modelo e preset saiu, então não dá para reproduzi-la nem auditá-la.',
      ),
    );
  } else {
    vereditos.push(passou('C9', 'A procedência está registrada'));
  }

  // C10 ────────────────────────────────────────────────────────────────────
  if (v.textoRenderizado === null) {
    vereditos.push(
      pendente('C10', 'Nenhum caractere se perdeu no caminho', 'Ninguém leu o texto da peça.'),
    );
  } else {
    const perdidos = v.textoRenderizado.filter((t) => t.includes('�'));
    const embaralhados = v.textoRenderizado.filter((t) => MOJIBAKE.test(t));
    if (perdidos.length > 0) {
      vereditos.push(
        reprovou(
          'C10',
          'Nenhum caractere se perdeu no caminho',
          `Há caractere de substituição no texto: ${perdidos.map((t) => `"${t}"`).join(', ')}. Alguma etapa leu os bytes com a codificação errada, e "coleção" virou "cole��o" na peça.`,
        ),
      );
    } else if (embaralhados.length > 0) {
      vereditos.push(
        reprovou(
          'C10',
          'Nenhum caractere se perdeu no caminho',
          `O texto está com acento embaralhado: ${embaralhados.map((t) => `"${t}"`).join(', ')}. Nada se perdeu — os bytes de UTF-8 foram LIDOS como se fossem de outra tabela, e "coleção" virou "coleÃ§Ã£o". Não há caractere de substituição para denunciar, e por isso esta conferência existe além da outra.`,
        ),
      );
    } else {
      vereditos.push(passou('C10', 'Nenhum caractere se perdeu no caminho'));
    }
  }

  // C11 ────────────────────────────────────────────────────────────────────
  // O `font-family` do CSS é um PEDIDO, e o fallback dele é silencioso por
  // desenho: sem a fonte carregada o navegador desenha noutra letra e nada no
  // arquivo diz que isso aconteceu. Uma peça na tipografia errada não é a peça
  // daquela marca, e recompor não custa pixel nenhum — o arquivo gerado já está
  // pago e em disco —, então isto reprova em vez de virar ressalva.
  const TITULO_C11 = 'A peça saiu na tipografia da marca';
  if (v.tipografia === null) {
    vereditos.push(
      pendente('C11', TITULO_C11, 'Ninguém disse se este pedido escolheu uma tipografia.'),
    );
  } else if (v.tipografia.familia === null) {
    vereditos.push(passou('C11', TITULO_C11));
  } else if (v.tipografia.aplicou === null) {
    vereditos.push(
      pendente(
        'C11',
        TITULO_C11,
        `O pedido escolheu "${v.tipografia.familia}" e ninguém conferiu se ela carregou. Fonte que não carrega não avisa: ela some para o fallback.`,
      ),
    );
  } else if (!v.tipografia.aplicou) {
    vereditos.push(
      reprovou(
        'C11',
        TITULO_C11,
        `O pedido escolheu "${v.tipografia.familia}" e o navegador desenhou na letra de reserva. A peça está numa tipografia que não é a da marca. Recompor não gasta crédito: o pixel já está em disco.`,
      ),
    );
  } else {
    vereditos.push(passou('C11', TITULO_C11));
  }

  return {
    aprovado: !vereditos.some((x) => x.estado === 'reprovou'),
    comPendencia: vereditos.some((x) => x.estado === 'pendente'),
    vereditos,
  };
};

/**
 * O rótulo que a peça leva para a tela e para o manifesto.
 *
 * "aprovada com ressalva" existe porque a alternativa era mentir de um dos dois
 * lados: chamar de `aprovada` o que não teve tudo medido, ou de `reprovada` o
 * que não tem defeito nenhum. A ressalva é nomeada, e viaja junto.
 */
export type RotuloDaPeca =
  | 'aprovada'
  | 'aprovada com ressalva'
  | 'reprovada'
  /** Não há folha de conferência: ninguém mediu esta peça, e isso não é aprovação. */
  | 'sem folha';

export const rotuloDaPeca = (r: ResultadoDeAceite): RotuloDaPeca => {
  if (!r.aprovado) return 'reprovada';
  return r.comPendencia ? 'aprovada com ressalva' : 'aprovada';
};

/**
 * O mesmo rótulo, derivado da FOLHA que viaja com a peça.
 *
 * Existe porque o rótulo não cabe no `estado` gravado em disco: o schema só
 * conhece `aprovada | reprovada | falhou`, então "aprovada com ressalva"
 * colapsava em "aprovada" na hora de gravar e a ressalva sumia da entrega —
 * `criativo-compor.ts` calculava o rótulo certo e o descartava na linha
 * seguinte, e a tela dizia "3 de 3 aprovadas" sobre peças com pendência
 * nomeada.
 *
 * Guardar o rótulo num campo novo seria guardar duas vezes a mesma verdade, e
 * as duas cópias divergiriam na primeira regra nova. A folha já viaja: quem
 * mostra deriva dela, e derivar é sempre igual.
 */
export const rotuloDaConferencia = (
  vereditos: readonly VereditoDaRegra[] | null | undefined,
): RotuloDaPeca => {
  if (vereditos === null || vereditos === undefined || vereditos.length === 0) return 'sem folha';
  if (vereditos.some((v) => v.estado === 'reprovou')) return 'reprovada';
  return vereditos.some((v) => v.estado === 'pendente') ? 'aprovada com ressalva' : 'aprovada';
};

/** As ressalvas nomeadas, para a tela dizer QUAL pendência a peça carrega. */
export const ressalvasDaConferencia = (
  vereditos: readonly VereditoDaRegra[] | null | undefined,
): readonly VereditoDaRegra[] => (vereditos ?? []).filter((v) => v.estado === 'pendente');

/**
 * Nenhum claim não autorizado no texto da peça.
 *
 * Fica separado das outras porque roda ANTES de gastar: o prompt e o texto
 * literal são conhecidos no momento do pedido, e barrar ali custa zero. Depois
 * da geração, a mesma conferência só serve para reprovar algo que já foi pago.
 */
export const claimsNaoAutorizados = (opts: {
  readonly textos: readonly string[];
  readonly autorizacoes: Record<string, string | null>;
}): string[] => {
  const autorizados = claimsAutorizados(
    opts.autorizacoes as Parameters<typeof claimsAutorizados>[0],
  ).map((c) => c.texto.toLowerCase());

  /** Sinais de que um número é promessa comercial, não descrição de cena. */
  const SINAIS: readonly { readonly nome: string; readonly padrao: RegExp }[] = [
    { nome: 'preço', padrao: /r\$\s*\d/i },
    { nome: 'desconto', padrao: /\d+\s*%\s*(de\s*)?(off|desconto)/i },
    { nome: 'frete', padrao: /frete\s*gr[áa]tis/i },
    { nome: 'prazo', padrao: /entrega\s+em\s+\d/i },
  ];

  const achados: string[] = [];
  for (const texto of opts.textos) {
    for (const sinal of SINAIS) {
      if (!sinal.padrao.test(texto)) continue;
      // Se o trecho todo foi autorizado, ele pode aparecer.
      if (autorizados.some((a) => texto.toLowerCase().includes(a))) continue;
      achados.push(
        `"${texto}" afirma ${sinal.nome} e ninguém autorizou: só entra o que o cliente digitou.`,
      );
    }
  }
  return achados;
};
