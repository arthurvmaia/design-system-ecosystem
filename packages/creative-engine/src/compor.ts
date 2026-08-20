import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { CaixaDoPapel } from '@ds/shared';
import {
  type CoresDaPeca,
  DIMENSAO_DO_FORMATO,
  type FormatoCriativo,
  contrasteDaPeca,
} from '@ds/shared/schemas';

/**
 * A composição da peça: o pixel gerado entra como FUNDO, e todo o resto é
 * desenhado por nós.
 *
 * ## Por que o texto não nasce dentro da imagem
 *
 * Modelo de imagem erra letra. Ele escreve "CAFÉ DA ESTACÃO", inventa uma
 * segunda linha que ninguém pediu, e assina a peça com um rabisco que parece
 * logotipo. Nada disso é conferível depois: para saber o que está escrito
 * DENTRO de um PNG seria preciso OCR.
 *
 * Compondo, a pergunta muda de "o que será que ele escreveu?" para "o texto que
 * eu escrevi está aqui?" — e essa segunda tem resposta exata, lida do próprio
 * documento.
 *
 * ## Por que a dimensão sai daqui, e não do provedor
 *
 * O provedor devolve a proporção que ele quer. Medido na primeira geração paga:
 * um pedido de 1080×1080 voltou 736×414. A janela do navegador é aberta na
 * medida EXATA do formato e o fundo entra com `cover`, então a peça sai certa
 * por construção — e a régua confere depois, em vez de esperar.
 *
 * ## Por que o contraste é garantido, e não amostrado
 *
 * O texto fica sempre sobre a faixa de leitura, cuja cor sólida nós escolhemos.
 * O contraste é o par entre a cor do texto e essa faixa: um número exato, não
 * uma média de pixels. Texto solto sobre a foto exigiria amostrar o pixel
 * embaixo de cada letra — e é justamente por isso que ele não fica solto.
 *
 * Esse número só é verdade sob duas condições, e as duas são construídas aqui
 * de propósito: a faixa sob o texto é SÓLIDA (o degradê que amacia a emenda com
 * a foto vive fora da caixa de texto, num véu acima dela) e o texto é OPACO.
 * Enquanto a faixa era um degradê que começava transparente e a marca tinha
 * `opacity:.85`, este arquivo declarava 11,82:1 sobre um pixel que media
 * 2,51:1. A régua mede as duas condições em vez de acreditar nesta docstring.
 *
 * ## Por que o corpo do texto sai de conta, e não de constante
 *
 * O tamanho da letra era uma fração fixa da LARGURA. Num `banner-3x1` de
 * 1500×500 isso dava 93px de headline, e uma headline realista — o schema
 * permite 200 caracteres — empurrava a faixa para cima até a marca terminar
 * 601px ACIMA do topo do quadro. A peça saía sem marca e a régua dizia
 * "aprovada", porque texto fora do quadro continua respondendo à leitura.
 *
 * Hoje o corpo é derivado do formato e do COMPRIMENTO do texto: a escala parte
 * do tamanho ideal e desce em degraus até o bloco caber na caixa disponível.
 * A conta é uma estimativa — o navegador é quem tem a verdade —, então ela é
 * deliberadamente conservadora e a régua confere a geometria MEDIDA depois. É
 * a mesma divisão de trabalho do resto da casa: o determinístico tenta acertar,
 * a medição decide se acertou.
 */

/**
 * As cores e o contraste da peça vêm do CONTRATO, e são reexportados aqui.
 *
 * A tela do pedido mostra qual cor da paleta vira o botão antes de a pessoa
 * confirmar, e este motor pinta. Duas implementações dariam duas respostas, e a
 * divergência apareceria como "a prévia prometia outra cor" depois de pago.
 */
export {
  type CoresDaPeca,
  coresDerivadas,
  contrasteDaPeca,
  PISO_DO_BOTAO,
} from '@ds/shared/schemas';

export type PecaComposta = {
  readonly png: Uint8Array;
  readonly largura: number;
  readonly altura: number;
  /** O texto que o navegador entregou, para a régua conferir. */
  readonly textos: readonly string[];
  /**
   * ONDE cada papel foi parar, e com que opacidade. É o que separa "o texto
   * existe" de "o texto aparece" — as duas coisas que a régua confundia.
   */
  readonly caixas: readonly CaixaDoPapel[];
  /** O menor contraste entre texto e faixa. */
  readonly menorContraste: number | null;
  /**
   * A fonte da marca REALMENTE aplicou?
   *
   * `null` = nenhuma foi pedida, e a peça saiu na letra da casa por decisão.
   * `false` = uma foi pedida e o navegador caiu no fallback — a peça está numa
   * letra que não é a da marca, e nada nela diria isso sem esta medida.
   */
  readonly fonteAplicada: boolean | null;
};

const MIME_POR_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * O fundo vai embutido como data URI.
 *
 * Nada de `file://` nem de servidor local: a página tem de se compor com o que
 * está na mão, sem depender de rede nem de caminho absoluto da máquina — o
 * mesmo motivo pelo qual os bundles do acervo viajam autossuficientes.
 */
const fundoEmbutido = (caminho: string): string => {
  const mime = MIME_POR_EXT[extname(caminho).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${readFileSync(caminho).toString('base64')}`;
};

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type EntradaDaComposicao = {
  readonly formato: FormatoCriativo;
  /** O arquivo de fundo em disco. `null` = peça sem imagem. */
  readonly fundo: string | null;
  readonly marca: string;
  /**
   * O arquivo do logotipo em disco. Ausente ou `null` = a marca assina em texto,
   * que é como toda peça assinava antes de a direção de marca existir.
   *
   * Quando ele existe, ele SUBSTITUI a linha de texto da marca em vez de somar:
   * a marca escrita ao lado do próprio logotipo é a duplicação que faz uma peça
   * de tráfego parecer rascunho.
   */
  readonly logotipo?: string | null;
  readonly headline: string | null;
  readonly cta: string | null;
  /** `@perfil` ou `site.com.br`, literal. Ausente = a peça não diz para onde ir. */
  readonly assinatura?: string | null;
  /**
   * A fonte da marca, já EMBUTIDA: o nome da família e o `@font-face` com o
   * binário dentro, como `cssDaFonte` devolve.
   *
   * Ausente = a letra da casa. Passar só o nome da família não serviria: o
   * Chromium da composição não tem as fontes do mundo instaladas, e um
   * `font-family` sem o arquivo cai no fallback sem avisar ninguém.
   */
  readonly fonte?: { readonly familia: string; readonly css: string } | null;
  readonly cores: CoresDaPeca;
};

/**
 * O avanço médio de um caractere, em fração do corpo da letra.
 *
 * É o número que transforma "quantos caracteres" em "quantos pixels de linha".
 * Vale para sans-serif em texto misto português; a estimativa é conservadora de
 * propósito (o valor solto na literatura para system-ui é ~0,50, e o negrito da
 * headline é mais largo que isso) porque errar para MENOS aqui significa
 * prometer que cabe e a régua reprovar depois, com o pixel já pago.
 */
const AVANCO_MEDIO = 0.55;

/** Abaixo disso a letra deixa de servir, e quem decide é a régua, não o encolhimento. */
const FATOR_MINIMO = 0.34;

/** O degrau do encolhimento. Menor que isso é precisão que a estimativa não tem. */
const DEGRAU = 0.02;

/**
 * A folga que a estimativa exige de si mesma, e por que ela é 15%.
 *
 * A conta de linhas assume empacotamento perfeito: `ceil(caracteres × avanço ÷
 * largura)`. Texto real quebra em PALAVRA, então a última palavra de cada linha
 * transborda para a seguinte e o navegador sempre gasta linhas iguais ou mais
 * do que a conta previu. O erro é sistemático e só para um lado.
 *
 * Medido nos quatro formatos com o texto no teto do schema (marca de 80,
 * headline de 200, CTA de 80 caracteres): a estimativa errou para MENOS em até
 * 9,5% — previu 666px de bloco no `feed-1x1` e o navegador entregou 729px.
 *
 * Sem este número a peça continuava cabendo, mas por acidente: quem segurava
 * era o limite de 62% da altura, que existe por razão de DESENHO (não deixar o
 * texto comer a peça inteira num story). Alguém afrouxar aquele 62% por gosto
 * encolheria esta margem sem perceber que mexeu nela. Aqui a folga tem nome,
 * número medido e motivo — e continua havendo a régua depois, que mede.
 */
const FOLGA_DA_ESTIMATIVA = 1.15;

/**
 * A altura do logotipo, em múltiplos do corpo da linha da marca.
 *
 * Um logotipo precisa de mais altura que uma linha de texto para se ler: ele
 * costuma ter símbolo e palavra empilhados dentro do próprio arquivo, e a
 * palavra dentro dele acaba menor que a caixa inteira. 2,4 é o que faz a parte
 * escrita de um lockup ficar perto do corpo que o nome teria em texto.
 */
const ALTURA_DO_LOGOTIPO = 2.4;

/** A escala tipográfica e o respiro da peça, em pixels. */
export type EscalaDaPeca = {
  readonly padX: number;
  readonly padY: number;
  readonly marca: number;
  /** A altura reservada ao logotipo quando ele existe. */
  readonly logotipo: number;
  readonly headline: number;
  readonly cta: number;
  /** O corpo da assinatura (`@perfil`), menor que o da marca. */
  readonly assinatura: number;
  /** A altura do véu que faz a emenda entre a foto e a faixa sólida. */
  readonly veu: number;
  /** O fator aplicado sobre o corpo ideal. 1 = o texto coube sem encolher. */
  readonly fator: number;
  /** A altura estimada do bloco de texto e a caixa que ele tinha para ocupar. */
  readonly alturaEstimada: number;
  readonly alturaDisponivel: number;
};

/**
 * A escala DERIVADA do formato e do comprimento do texto.
 *
 * Duas decisões de geometria valem ser lidas:
 *
 * **O respiro vertical sai da ALTURA.** Em CSS, `padding` em porcentagem
 * resolve contra a LARGURA do bloco — inclusive o de cima e o de baixo. Os
 * `6% 7% 7%` de antes viravam 195px de respiro vertical num banner de 500px de
 * altura, ou seja, 39% da peça gasta em margem antes de escrever a primeira
 * letra.
 *
 * **O corpo de referência não é a largura.** Numa peça larga e baixa, uma
 * fração da largura é grande demais para a altura que sobra: 6,2% de 1500 são
 * 93px de headline num quadro de 500px. `min(largura, altura × 1,6)` deixa
 * quadrado e story exatamente como estavam — nos dois a largura já é o menor
 * dos dois termos — e corrige só o formato cuja proporção a fórmula antiga não
 * servia.
 */
export const escalaDaPeca = (e: {
  readonly formato: FormatoCriativo;
  readonly marca: string;
  readonly headline: string | null;
  readonly cta: string | null;
  /** Só importa se EXISTE: o logotipo ocupa altura no lugar da linha de texto. */
  readonly logotipo?: string | null;
  readonly assinatura?: string | null;
}): EscalaDaPeca => {
  const d = DIMENSAO_DO_FORMATO[e.formato];
  const padX = Math.round(d.largura * 0.06);
  const padY = Math.round(d.altura * 0.07);
  const larguraUtil = d.largura - 2 * padX;
  // A faixa é ancorada embaixo e cresce para cima. O limite é o quadro menos o
  // respiro; os 62% seguram o caso alto (story), onde deixar o texto ocupar a
  // peça inteira daria um bloco de legenda no lugar de uma peça de campanha.
  const alturaDisponivel = Math.min(d.altura - 2 * padY, Math.round(d.altura * 0.62));

  const referencia = Math.min(d.largura, d.altura * 1.6);
  const IDEAL = {
    marca: referencia * 0.026,
    headline: referencia * 0.062,
    cta: referencia * 0.028,
    assinatura: referencia * 0.023,
  };

  const temLogotipo = e.logotipo !== null && e.logotipo !== undefined;
  const assinatura = e.assinatura ?? null;

  const linhas = (texto: string, corpo: number): number =>
    Math.max(1, Math.ceil((texto.length * AVANCO_MEDIO * corpo) / larguraUtil));

  /** A altura do bloco de texto com o corpo ideal multiplicado por `k`. */
  const alturaCom = (k: number): number => {
    const sMarca = IDEAL.marca * k;
    const sHeadline = IDEAL.headline * k;
    const sCta = IDEAL.cta * k;
    const sAssinatura = IDEAL.assinatura * k;
    // O logotipo ENTRA NO LUGAR da linha de texto da marca, e não além dela.
    let h = temLogotipo ? sMarca * ALTURA_DO_LOGOTIPO : linhas(e.marca, sMarca) * 1.2 * sMarca;
    // `.4em` de margem, entrelinha de 1,12 — os mesmos números do CSS abaixo.
    if (e.headline !== null)
      h += 0.4 * sHeadline + linhas(e.headline, sHeadline) * 1.12 * sHeadline;
    // `.9em` de margem + `.55em` de recheio em cima e embaixo + a linha.
    if (e.cta !== null) h += 0.9 * sCta + 1.1 * sCta + linhas(e.cta, sCta) * sCta;
    // `.6em` de margem + a linha.
    if (assinatura !== null)
      h += 0.6 * sAssinatura + linhas(assinatura, sAssinatura) * 1.2 * sAssinatura;
    return h;
  };

  let fator = 1;
  while (fator > FATOR_MINIMO && alturaCom(fator) * FOLGA_DA_ESTIMATIVA > alturaDisponivel) {
    fator = Number((fator - DEGRAU).toFixed(2));
  }

  return {
    padX,
    padY,
    marca: Math.round(IDEAL.marca * fator),
    logotipo: Math.round(IDEAL.marca * fator * ALTURA_DO_LOGOTIPO),
    headline: Math.round(IDEAL.headline * fator),
    cta: Math.round(IDEAL.cta * fator),
    assinatura: Math.round(IDEAL.assinatura * fator),
    veu: Math.round(d.altura * 0.12),
    fator,
    alturaEstimada: Math.round(alturaCom(fator)),
    alturaDisponivel,
  };
};

/**
 * O HTML da peça. Separado da execução do navegador para poder ser conferido
 * sem subir Chromium — e para a decisão de layout ficar legível.
 */
export const htmlDaPeca = (e: EntradaDaComposicao): string => {
  const d = DIMENSAO_DO_FORMATO[e.formato];
  const s = escalaDaPeca(e);
  // A família da marca vem PRIMEIRO e a da casa fica de rede: se o arquivo
  // embutido falhar, a peça ainda sai legível — e a medição no navegador diz
  // qual das duas realmente aplicou.
  const familia =
    e.fonte === null || e.fonte === undefined
      ? 'system-ui,sans-serif'
      : `'${e.fonte.familia.replace(/'/g, '')}',system-ui,sans-serif`;
  const faceDaFonte = e.fonte === null || e.fonte === undefined ? '' : e.fonte.css;
  const fundo =
    e.fundo === null
      ? `background: ${e.cores.faixa};`
      : `background-image: url('${fundoEmbutido(e.fundo)}'); background-size: cover; background-position: center;`;

  // O logotipo assina no lugar do texto — as duas coisas juntas repetem a marca
  // e é isso que faz peça de tráfego parecer rascunho. `alt` leva o nome, então
  // a leitura da régua continua achando a grafia.
  const assinaturaDaMarca =
    e.logotipo === null || e.logotipo === undefined
      ? `<div class="marca" data-papel="marca">${escapar(e.marca)}</div>`
      : `<img class="logotipo" data-papel="marca" src="${fundoEmbutido(e.logotipo)}" alt="${escapar(e.marca)}">`;

  // `text-transform` fica de fora de propósito: ele muda o que se vê sem mudar o
  // documento, e a régua compara a GRAFIA que o cliente digitou. `opacity` fica
  // de fora pelo mesmo tipo de razão: ela muda o pixel sem mudar o par de cores
  // que o contraste declarou.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  ${faceDaFonte}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${d.largura}px;height:${d.altura}px;overflow:hidden}
  .peca{position:relative;width:${d.largura}px;height:${d.altura}px;${fundo}}
  .faixa{position:absolute;left:0;right:0;bottom:0;padding:${s.padY}px ${s.padX}px;
    background:${e.cores.faixa}}
  /* O véu vive ACIMA da faixa, fora da caixa de texto: ele amacia a emenda com
     a foto sem pôr uma letra sequer sobre pixel semitransparente. */
  .faixa::before{content:'';position:absolute;left:0;right:0;bottom:100%;height:${s.veu}px;
    background:linear-gradient(to top, ${e.cores.faixa} 0%, transparent 100%)}
  .marca,.headline,.cta,.assinatura{overflow-wrap:anywhere}
  .marca{font:600 ${s.marca}px/1.2 ${familia};
    letter-spacing:.08em;color:${e.cores.texto}}
  /* Altura fixa e largura AUTO: é o que garante a proporção do arquivo. O
     \`contain\` é o cinto do suspensório — com os dois, esticar exigiria alguém
     escrever \`width\` em pixel, e aí a régua mede e reprova. */
  .logotipo{display:block;height:${s.logotipo}px;width:auto;
    max-width:45%;object-fit:contain;object-position:left center}
  .headline{margin-top:.4em;font:700 ${s.headline}px/1.12 ${familia};
    color:${e.cores.texto}}
  .cta{display:inline-block;margin-top:.9em;padding:.55em 1.1em;
    font:600 ${s.cta}px/1 ${familia};
    color:${e.cores.tintaDoAcento};background:${e.cores.acento}}
  .assinatura{margin-top:.6em;font:500 ${s.assinatura}px/1.2 ${familia};
    letter-spacing:.04em;color:${e.cores.texto}}
</style></head><body><div class="peca"><div class="faixa">
  ${assinaturaDaMarca}
  ${e.headline === null ? '' : `<div class="headline" data-papel="headline">${escapar(e.headline)}</div>`}
  ${e.cta === null ? '' : `<div class="cta" data-papel="cta">${escapar(e.cta)}</div>`}
  ${e.assinatura === null || e.assinatura === undefined ? '' : `<div class="assinatura" data-papel="assinatura">${escapar(e.assinatura)}</div>`}
</div></div></body></html>`;
};

/**
 * O código que roda DENTRO da página, como string.
 *
 * É o mesmo idioma de `scripts/conferir-site.ts`: escrito como texto, e não
 * como função, porque uma função aqui obrigaria este pacote inteiro a carregar
 * os tipos de DOM — e ele não é código de navegador, é código que MANDA um
 * navegador fazer uma coisa.
 */
const LER_PAPEIS = `() => {
  /**
   * A cor do navegador (rgb/rgba) vira #RRGGBB. Alfa zero devolve null: não é cor.
   *
   * A classe é [0-9] e não \\d de propósito. Este texto vive dentro de um
   * template literal, e ali uma barra invertida seguida de letra é escape
   * DESCONHECIDO: o JavaScript a descarta e entrega só a letra. A regex virava
   * /d+/ e procurava a letra "d" — casava com nada, \`fundoAtras\` saía null, e
   * C3 ficava eternamente pendente sem que nada acusasse.
   */
  const paraHex = (cru) => {
    const n = (cru || '').match(/[0-9]+([.][0-9]+)?/g);
    if (!n || n.length < 3) return null;
    if (n.length > 3 && Number(n[3]) === 0) return null;
    const h = (v) => Number(v).toString(16).padStart(2, '0');
    return '#' + h(n[0]) + h(n[1]) + h(n[2]);
  };

  /** A primeira cor OPACA subindo pelos ancestrais: é o fundo em que a peça pousa. */
  const fundoAtrasDe = (el) => {
    let p = el.parentElement;
    while (p) {
      const cor = paraHex(getComputedStyle(p).backgroundColor);
      if (cor !== null) return cor;
      p = p.parentElement;
    }
    return null;
  };

  /**
   * A tinta DOMINANTE de uma imagem: a cor opaca mais frequente, em degraus
   * grossos. Grossos porque a borda macia de um recorte cria dezenas de tons
   * que não são a cor da marca, e contá-los diluiria a resposta.
   */
  const tintaDe = (img) => {
    if (!img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    const conta = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const chave = (d[i] >> 4) * 4096 + (d[i + 1] >> 4) * 256 + (d[i + 2] >> 4) * 16;
      conta.set(chave, (conta.get(chave) || 0) + 1);
    }
    let melhor = null; let quantas = 0;
    for (const [k, n] of conta) { if (n > quantas) { quantas = n; melhor = k; } }
    if (melhor === null) return null;
    const h = (v) => Math.min(255, v).toString(16).padStart(2, '0');
    return '#' + h(Math.floor(melhor / 4096) * 16) + h((Math.floor(melhor / 256) % 16) * 16) + h((Math.floor(melhor / 16) % 16) * 16);
  };

  return Array.from(document.querySelectorAll('[data-papel]')).map((el) => {
    const r = el.getBoundingClientRect();
    const ehImagem = el.tagName === 'IMG';
    return {
      papel: el.getAttribute('data-papel') || '',
      texto: ehImagem ? (el.getAttribute('alt') || '').trim() : el.innerText.trim(),
      esquerda: Math.round(r.left),
      topo: Math.round(r.top),
      direita: Math.round(r.right),
      base: Math.round(r.bottom),
      opacidade: Number(getComputedStyle(el).opacity),
      imagem: ehImagem
        ? {
            larguraReal: el.naturalWidth,
            alturaReal: el.naturalHeight,
            tinta: tintaDe(el),
            fundoAtras: fundoAtrasDe(el),
          }
        : null,
    };
  });
}`;

/**
 * Compõe e fotografa, na dimensão exata.
 *
 * O navegador entra por parâmetro para o chamador decidir o ciclo de vida: numa
 * rodada de oito variações, subir e derrubar o Chromium oito vezes é o tipo de
 * desperdício que faz o processo parecer travado.
 */
export const comporPeca = async (
  navegador: {
    newPage(opts: { viewport: { width: number; height: number } }): Promise<{
      setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
      screenshot(opts: { type: 'png' }): Promise<Buffer>;
      evaluate<T>(expressao: string): Promise<T>;
      close(): Promise<void>;
    }>;
  },
  entrada: EntradaDaComposicao,
): Promise<PecaComposta> => {
  const d = DIMENSAO_DO_FORMATO[entrada.formato];
  const pagina = await navegador.newPage({
    viewport: { width: d.largura, height: d.altura },
  });
  try {
    await pagina.setContent(htmlDaPeca(entrada), { waitUntil: 'load' });
    // Texto passado ao `evaluate` é avaliado como EXPRESSÃO: sem os parênteses
    // de chamada, o que volta é a própria função e o resultado chega
    // `undefined`. A mesma armadilha está anotada em `conferir-site.ts:1120`.
    const caixas = await pagina.evaluate<(CaixaDoPapel & { texto: string })[]>(`(${LER_PAPEIS})()`);
    /**
     * A fonte pedida entrou mesmo?
     *
     * A pergunta certa é se a FACE embutida carregou — não se o navegador
     * consegue desenhar o texto de algum jeito. `document.fonts.check()`
     * responde a segunda: para uma família que não existe, ele devolve `true`,
     * porque o fallback do sistema dá conta. Medido aqui: uma família inventada
     * passava por aplicada.
     *
     * Percorrer `document.fonts` responde a primeira, e é exata para esta
     * composição: a fonte da marca SEMPRE chega embutida, então ou existe uma
     * `FontFace` daquela família com `status: 'loaded'`, ou a peça saiu na letra
     * de reserva.
     */
    const familiaPedida = entrada.fonte?.familia ?? null;
    const fonteAplicada =
      familiaPedida === null
        ? null
        : await pagina.evaluate<boolean>(
            `(async () => {
              try { await document.fonts.ready; } catch {}
              const alvo = ${JSON.stringify(familiaPedida.toLowerCase())};
              return Array.from(document.fonts).some(
                (f) => f.family.replace(/['"]/g, '').toLowerCase() === alvo && f.status === 'loaded',
              );
            })()`,
          );

    const png = await pagina.screenshot({ type: 'png' });
    return {
      png: new Uint8Array(png),
      largura: d.largura,
      altura: d.altura,
      textos: caixas.map((c) => c.texto),
      caixas,
      menorContraste: contrasteDaPeca(entrada.cores, entrada.cta !== null),
      fonteAplicada,
    };
  } finally {
    await pagina.close();
  }
};
