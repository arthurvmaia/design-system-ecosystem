import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { CaixaDoPapel } from '@ds/shared';
import {
  ARRANJO,
  ARRANJO_PADRAO,
  type ArranjoDaPeca,
  type CoresDaPeca,
  DIMENSAO_DO_FORMATO,
  type FormatoCriativo,
  PISO_DO_BOTAO,
  alfaDoVeu,
  alfaDoVeuSobre,
  contrasteDaPeca,
  contrasteRatio,
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
 * ## Por que existe mais de um ARRANJO
 *
 * Havia um só — foto em cima, faixa sólida embaixo. Dois "conceitos" de banner
 * saíam com a mesma composição e fotos diferentes, e o dono viu: *"você fez 1
 * estilo de banner só para os dois"*. Arranjo é geometria, então nenhum deles
 * custa crédito: os banners já pagos se recompõem de graça em qualquer um.
 *
 * O que muda com eles não é só desenho. Cada arranjo é uma chance NOVA de o
 * texto não caber no quadro, e por isso a escala de letra passou a sair da
 * caixa daquele arranjo (a coluna de uma tela dividida é metade da largura, e
 * a mesma headline quebra em muito mais linhas ali).
 *
 * ## Por que o contraste às vezes é garantido e às vezes é amostrado
 *
 * Enquanto o texto pousava sempre sobre a faixa sólida, o contraste era o par
 * entre duas cores que NÓS escolhemos: um número exato, não uma média de pixels.
 *
 * Dois dos arranjos põem o texto sobre a foto, e ali aquele número continuaria
 * saindo bonito e deixaria de descrever a peça — que é a pior forma de um número
 * errar. É o mesmo defeito de quando a marca tinha `opacity:.85` sobre o trecho
 * transparente de um degradê: este arquivo declarava 11,82:1 sobre um pixel que
 * media 2,51:1.
 *
 * Então o arranjo declara em que o texto pousa, e isso decide a conta:
 *
 * - **cor sólida** (`faixa-inferior`, `tela-dividida`) — contraste DECLARADO,
 *   exato por construção, como sempre foi.
 * - **foto com véu** (`veu-cheio`) — o alfa do véu é DERIVADO para o pior pixel
 *   possível ainda vencer o piso (ver `alfaDoVeu`), e o pixel é amostrado
 *   assim mesmo: a derivação é uma promessa, e promessa se confere.
 * - **foto nua** (`texto-sobre-imagem`) — não há promessa nenhuma. Só a
 *   amostragem diz se AQUELA foto carrega texto, e quando ela reprova a saída
 *   é recompor noutro arranjo, que não gasta crédito.
 *
 * A amostragem é do PIOR PIXEL sob a caixa do texto, não da média. Média
 * esconde exatamente o caso que importa: um estouro de luz debaixo de uma linha
 * de headline continua ilegível depois de diluído no resto do retângulo.
 *
 * ## Por que o corpo do texto sai de conta, e não de constante
 *
 * O tamanho da letra era uma fração fixa da LARGURA. Num `banner-3x1` de
 * 1500×500 isso dava 93px de headline, e uma headline realista — o schema
 * permite 200 caracteres — empurrava a faixa para cima até a marca terminar
 * 601px ACIMA do topo do quadro. A peça saía sem marca e a régua dizia
 * "aprovada", porque texto fora do quadro continua respondendo à leitura.
 *
 * Hoje o corpo é derivado do formato, do ARRANJO e do COMPRIMENTO do texto: a
 * escala parte do tamanho ideal e desce em degraus até o bloco caber na caixa
 * disponível. A conta é uma estimativa — o navegador é quem tem a verdade —,
 * então ela é deliberadamente conservadora e a régua confere a geometria MEDIDA
 * depois. É a mesma divisão de trabalho do resto da casa: o determinístico
 * tenta acertar, a medição decide se acertou.
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
  alfaDoVeu,
  alfaDoVeuSobre,
} from '@ds/shared/schemas';

/**
 * A que terço o bloco de texto se alinhou, quando o arranjo alinha a um terço.
 *
 * `inicio`/`meio`/`fim` e não `esquerda`/`direita` porque o eixo depende do
 * formato: num banner os terços são colunas, num story são faixas horizontais.
 */
export type TercoDaPeca = 'inicio' | 'meio' | 'fim';

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
  /** O menor contraste entre texto e o que estiver embaixo dele. */
  readonly menorContraste: number | null;
  /**
   * O ARRANJO usado. Viaja porque é a PROCEDÊNCIA do conceito, e é ela que
   * separa duas ideias de duas fotos com a mesma ideia.
   *
   * Medir "layouts diferentes" por distância de pixel foi tentado com as artes
   * e não funciona: as faixas de "mesma ideia" e "ideias diferentes" se cruzam
   * na escala. Qual arranjo foi usado é declarado, e por isso é exato.
   */
  readonly arranjo: ArranjoDaPeca;
  /**
   * O pior contraste AMOSTRADO no pixel sob o texto.
   *
   * `null` = ninguém amostrou, e não porque falhou: o arranjo pousa o texto em
   * cor sólida, onde o contraste é exato por construção e amostrar seria trocar
   * uma certeza por uma estimativa.
   */
  readonly contrasteAmostrado: number | null;
  /** A que terço o texto se alinhou. `null` = o arranjo não alinha a terço. */
  readonly terco: TercoDaPeca | null;
  /**
   * O alfa do véu REALMENTE aplicado. `null` = a peça não tem véu.
   *
   * Ele começa no pior caso possível e encolhe até o que a foto pede, então o
   * número derivado antes e o aplicado depois são diferentes de propósito — e
   * quem lê a peça tem o direito de saber qual dos dois cobriu a imagem.
   */
  readonly alfaDoVeuAplicado: number | null;
  /**
   * Quanto da peça a FOTO ainda ocupa, de 0 a 1. `null` = peça sem foto.
   *
   * É a medida que faltava, e a falta tinha endereço: medido no banner real da
   * marca de prova, a faixa saiu com 52% da peça e a foto com 48% — o dono viu
   * e disse que estava péssimo, e as ONZE regras estavam verdes. C2 pergunta se
   * o texto cabe no quadro; C4, se ele se lê. Nenhuma pergunta o que sobrou da
   * imagem, então a peça passava e continuava ruim.
   */
  readonly fracaoDaFoto: number | null;
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

/** `#RRGGBB` → os três canais, para montar o `rgba()` do véu. */
const canais = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

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
  /**
   * ONDE o texto pousa dentro do quadro. Ausente = `faixa-inferior`, o arranjo
   * que já existia — para nenhuma peça antiga mudar sozinha.
   */
  readonly arranjo?: ArranjoDaPeca | null;
  /**
   * A que terço alinhar, quando o arranjo alinha a um terço.
   *
   * Ausente = `inicio`. Quem compõe não precisa escolher: `comporPeca` MEDE os
   * três terços da foto e move o bloco para o que melhor carrega o texto, o que
   * é uma decisão que só o pixel pode tomar.
   */
  readonly terco?: TercoDaPeca | null;
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

/**
 * Quanto da largura o bloco centralizado do `veu-cheio` ocupa.
 *
 * 76% é a medida de leitura: sobra 12% de cada lado, o dobro do respiro lateral
 * comum da peça (6%). Um bloco centralizado que fosse até o respiro normal
 * pareceria uma faixa sem cor, e não um bloco.
 */
const LARGURA_DO_CENTRO = 0.76;

/**
 * Quanto da largura o bloco alinhado a um terço ocupa, no eixo largo.
 *
 * 42% e não 33%: o bloco se ALINHA ao terço, não se espreme dentro dele. Um
 * terço exato de um banner de 1500px daria 500px de coluna, e uma headline de
 * 200 caracteres ali quebraria em tantas linhas que o encolhimento comeria o
 * corpo da letra até o piso — a peça caberia e ninguém leria.
 */
const LARGURA_DO_TERCO = 0.42;

/**
 * Quanto da ALTURA o bloco alinhado a um terço ocupa, no eixo alto.
 *
 * Aqui os terços são horizontais, então o que o terço limita é a altura. É um
 * terço de verdade (0,34 com o arredondamento a favor) porque no eixo alto o
 * bloco tem a largura inteira para respirar.
 */
const ALTURA_DO_TERCO = 0.34;

/**
 * O teto da faixa de leitura — e por que ele NÃO é a metade.
 *
 * Ele segura o caso ALTO, onde deixar o texto ocupar a peça inteira daria um
 * bloco de legenda no lugar de uma peça de campanha. Não é ele que impede a
 * faixa de comer a peça, e a tentativa de fazê-lo virar isso está medida:
 *
 * - **Baixá-lo para 50% sozinho não mudou nada.** No banner real, a estimativa
 *   já cabia no orçamento menor, então a faixa continuou saindo com 52% da peça
 *   e a foto com 48%. Quem consertou aquilo foi a DISPOSIÇÃO em linha: 52% →
 *   40%, medido no mesmo banner.
 * - **Baixá-lo para 50% de verdade quebrou C2.** Com o texto no teto do schema
 *   (headline de 200 caracteres), a faixa capada não comporta o bloco nem no
 *   menor corpo de letra, e o texto sai do quadro. Texto fora do quadro é uma
 *   falha pior que faixa gorda.
 *
 * Quem cobra a proporção é C12, que MEDE quanto sobrou da foto no pixel — e
 * quando ela reprova, recompor noutro arranjo não gasta crédito nenhum. É a
 * divisão de sempre: a geometria tenta acertar, a medição decide se acertou, e
 * não se põe na geometria uma trava que a medição já faz melhor.
 */
const TETO_DA_FAIXA = 0.62;

/**
 * Quanto da linha sobra para a HEADLINE quando a faixa é uma linha só.
 *
 * Na disposição em linha, a largura é dividida entre a marca, a headline e o
 * botão. A marca e o botão são curtos e têm largura própria; a headline é a
 * única que quebra, e é dela que a conta de linhas precisa. 55% é o que sobra
 * depois de reservar folgadamente os outros dois — folgado de propósito, porque
 * errar para MENOS aqui promete que cabe e a régua reprova depois.
 */
const HEADLINE_NA_LINHA = 0.55;

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
  /** A largura da caixa daquele arranjo. É ela que decide quantas linhas. */
  readonly larguraDisponivel: number;
  /** O arranjo de que esta escala saiu. */
  readonly arranjo: ArranjoDaPeca;
  /**
   * Como a faixa de leitura se organiza: empilhada ou em LINHA.
   *
   * Só `faixa-inferior` a usa, e ela não é escolhida — é derivada. Ver
   * `escalaDaPeca`.
   */
  readonly disposicao: DisposicaoDaFaixa;
};

/**
 * Empilhada (marca, headline e botão um sob o outro) ou em LINHA (os três lado
 * a lado).
 */
export type DisposicaoDaFaixa = 'empilhada' | 'linha';

/**
 * O quadro parte no eixo LONGO.
 *
 * Uma tela dividida ao meio na vertical num story de 9:16 daria duas colunas de
 * 540px de largura por 1920 de altura — duas tiras, não duas metades. Partir no
 * eixo em que a peça é comprida é o que faz o mesmo arranjo continuar sendo o
 * mesmo arranjo em qualquer formato.
 */
const ehLargo = (d: { largura: number; altura: number }): boolean => d.largura >= d.altura;

/**
 * A caixa que o texto tem para ocupar, naquele arranjo.
 *
 * É a função que faz o arranjo mudar a ESCALA e não só o desenho: a coluna de
 * uma tela dividida é metade da largura, e a mesma headline quebra ali em
 * quase o dobro de linhas.
 */
const caixaDoArranjo = (
  arranjo: ArranjoDaPeca,
  d: { largura: number; altura: number },
  padX: number,
  padY: number,
): { largura: number; altura: number } => {
  const alturaCheia = d.altura - 2 * padY;
  const larguraCheia = d.largura - 2 * padX;
  switch (arranjo) {
    case 'faixa-inferior':
      // A faixa é ancorada embaixo e cresce para cima. O limite é o quadro menos
      // o respiro, ou o teto do caso alto — ver `TETO_DA_FAIXA`.
      return {
        largura: larguraCheia,
        altura: Math.min(alturaCheia, Math.round(d.altura * TETO_DA_FAIXA)),
      };
    case 'tela-dividida':
      return ehLargo(d)
        ? { largura: Math.round(d.largura / 2) - 2 * padX, altura: alturaCheia }
        : { largura: larguraCheia, altura: Math.round(d.altura / 2) - 2 * padY };
    case 'veu-cheio':
      return { largura: Math.round(d.largura * LARGURA_DO_CENTRO), altura: alturaCheia };
    case 'texto-sobre-imagem':
      return ehLargo(d)
        ? { largura: Math.round(d.largura * LARGURA_DO_TERCO), altura: alturaCheia }
        : { largura: larguraCheia, altura: Math.round(d.altura * ALTURA_DO_TERCO) };
  }
};

/**
 * A escala DERIVADA do formato, do ARRANJO e do comprimento do texto.
 *
 * Três decisões de geometria valem ser lidas:
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
 *
 * **A caixa é a do ARRANJO, não a do quadro.** O corpo ideal continua saindo do
 * formato, mas quantas linhas ele gasta sai da largura em que o texto quebra —
 * e essa largura é metade num `tela-dividida`. Sem isto, trocar de arranjo
 * seria trocar de chance de estourar o quadro sem nada dizer.
 */
export const escalaDaPeca = (e: {
  readonly formato: FormatoCriativo;
  readonly marca: string;
  readonly headline: string | null;
  readonly cta: string | null;
  /** Só importa se EXISTE: o logotipo ocupa altura no lugar da linha de texto. */
  readonly logotipo?: string | null;
  readonly assinatura?: string | null;
  readonly arranjo?: ArranjoDaPeca | null;
}): EscalaDaPeca => {
  const arranjo = e.arranjo ?? ARRANJO_PADRAO;
  const d = DIMENSAO_DO_FORMATO[e.formato];
  const padX = Math.round(d.largura * 0.06);
  const padY = Math.round(d.altura * 0.07);
  const caixa = caixaDoArranjo(arranjo, d, padX, padY);
  const larguraUtil = caixa.largura;
  const alturaDisponivel = caixa.altura;

  const referencia = Math.min(d.largura, d.altura * 1.6);
  const IDEAL = {
    marca: referencia * 0.026,
    headline: referencia * 0.062,
    cta: referencia * 0.028,
    assinatura: referencia * 0.023,
  };

  const temLogotipo = e.logotipo !== null && e.logotipo !== undefined;
  const assinatura = e.assinatura ?? null;

  /**
   * Quantas linhas aquele texto gasta naquela largura.
   *
   * Duas contas, e vale a MAIOR. A primeira é a de caracteres, que assume
   * empacotamento perfeito. A segunda é a de PALAVRAS, e ela existe porque
   * texto real não quebra onde a primeira acha que quebra.
   *
   * Medido: numa coluna de 484px com corpo 67, a conta de caracteres previu 4
   * linhas para "Você entende o tratamento antes de ele começar" e o navegador
   * gastou 6 — a palavra "tratamento" sozinha ocupa 370px daquela coluna, então
   * quase toda linha leva uma palavra e só. O erro passou dos 30%, muito acima
   * da folga de 15% que a estimativa se dá, e o resultado foi uma faixa de 51%
   * da peça onde a conta previa 40%.
   *
   * O erro da primeira conta cresce quando a coluna estreita, e é exatamente
   * onde a disposição em linha vive. Sem esta segunda, a escolha da disposição
   * decide olhando para um número que não descreve o que vai acontecer.
   */
  const linhas = (texto: string, corpo: number, largura: number): number => {
    const porLinha = Math.max(1, Math.floor(largura / (AVANCO_MEDIO * corpo)));
    const porContagem = Math.ceil(texto.length / porLinha);
    const palavras = texto
      .trim()
      .split(/\s+/)
      .filter((p) => p !== '');
    if (palavras.length === 0) return 1;
    // O comprimento médio de palavra JÁ inclui o espaço que a separa da próxima,
    // porque `texto.length` conta os espaços.
    const mediaDaPalavra = texto.length / palavras.length;
    const palavrasPorLinha = Math.max(1, Math.floor(porLinha / mediaDaPalavra));
    const porPalavra = Math.ceil(palavras.length / palavrasPorLinha);
    return Math.max(1, porContagem, porPalavra);
  };

  /**
   * A altura do bloco de texto com o corpo ideal multiplicado por `k`.
   *
   * EMPILHADA, a altura é a SOMA das partes com as margens entre elas. Em
   * LINHA, é o MAIOR dos três — eles ficam lado a lado, e as margens verticais
   * viram espaço horizontal. É a diferença inteira entre uma faixa de 52% da
   * peça e uma de 24%.
   */
  const alturaCom = (k: number, disposicao: DisposicaoDaFaixa): number => {
    const sMarca = IDEAL.marca * k;
    const sHeadline = IDEAL.headline * k;
    const sCta = IDEAL.cta * k;
    const sAssinatura = IDEAL.assinatura * k;
    const emLinha = disposicao === 'linha';
    // Em linha, a headline divide a largura com a marca e o botão.
    const larguraDaHeadline = emLinha ? larguraUtil * HEADLINE_NA_LINHA : larguraUtil;

    // O logotipo ENTRA NO LUGAR da linha de texto da marca, e não além dela.
    const hMarca = temLogotipo
      ? sMarca * ALTURA_DO_LOGOTIPO
      : linhas(e.marca, sMarca, larguraUtil) * 1.2 * sMarca;
    // `.4em` de margem, entrelinha de 1,12 — os mesmos números do CSS abaixo.
    const hHeadline =
      e.headline === null
        ? 0
        : (emLinha ? 0 : 0.4 * sHeadline) +
          linhas(e.headline, sHeadline, larguraDaHeadline) * 1.12 * sHeadline;
    // `.9em` de margem + `.55em` de recheio em cima e embaixo + a linha.
    const hCta =
      e.cta === null
        ? 0
        : (emLinha ? 0 : 0.9 * sCta) + 1.1 * sCta + linhas(e.cta, sCta, larguraUtil) * sCta;
    // `.6em` de margem + a linha.
    const hAssinatura =
      assinatura === null
        ? 0
        : (emLinha ? 0 : 0.6 * sAssinatura) +
          linhas(assinatura, sAssinatura, larguraUtil) * 1.2 * sAssinatura;

    return emLinha
      ? Math.max(hMarca, hHeadline, hCta, hAssinatura)
      : hMarca + hHeadline + hCta + hAssinatura;
  };

  /** O maior corpo de letra que ainda cabe, naquela disposição. */
  const fatorDe = (disposicao: DisposicaoDaFaixa): number => {
    let k = 1;
    while (k > FATOR_MINIMO && alturaCom(k, disposicao) * FOLGA_DA_ESTIMATIVA > alturaDisponivel) {
      k = Number((k - DEGRAU).toFixed(2));
    }
    return k;
  };

  /**
   * A disposição é DERIVADA, e não uma bandeira nem um limiar de proporção.
   *
   * São dois critérios, nesta ordem, e a ordem importa:
   *
   * 1. **O corpo da letra.** Nenhuma economia de altura vale encolher o texto.
   * 2. **A altura gasta.** Empatado o corpo, vence a que deixa mais peça para a
   *    foto.
   *
   * O segundo critério é o que fazia falta. Medido no banner real da marca de
   * prova: as duas disposições cabiam com o corpo IDEAL, o fator empatava em 1
   * e o critério não decidia nada — a faixa continuava saindo com 52% da peça.
   * O que separa as duas ali não é o encolhimento; é que empilhar gasta a SOMA
   * das partes e a linha gasta a MAIOR delas.
   *
   * Isso responde sem nenhum número escolhido, e continua respondendo certo se
   * as proporções dos formatos mudarem: num story a largura é o recurso escasso,
   * a headline quebra em muitas linhas dentro da coluna e a linha perde já no
   * primeiro critério, antes de o segundo ser consultado.
   */
  const escolherDisposicao = (): DisposicaoDaFaixa => {
    if (arranjo !== 'faixa-inferior') return 'empilhada';
    const kLinha = fatorDe('linha');
    const kPilha = fatorDe('empilhada');
    if (kLinha !== kPilha) return kLinha > kPilha ? 'linha' : 'empilhada';
    return alturaCom(kLinha, 'linha') < alturaCom(kPilha, 'empilhada') ? 'linha' : 'empilhada';
  };
  const disposicao = escolherDisposicao();
  const fator = fatorDe(disposicao);

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
    alturaEstimada: Math.round(alturaCom(fator, disposicao)),
    alturaDisponivel,
    larguraDisponivel: larguraUtil,
    arranjo,
    disposicao,
  };
};

/**
 * O CSS que POSICIONA o bloco de texto, e o que entra atrás dele.
 *
 * Separado do resto porque é a única parte que o arranjo troca: a tipografia, o
 * respiro e as regras de quebra são as mesmas nos quatro, e mantê-las juntas é
 * o que impede um arranjo de virar um segundo compositor.
 */
const cssDoArranjo = (
  arranjo: ArranjoDaPeca,
  d: { largura: number; altura: number },
  s: EscalaDaPeca,
  cores: CoresDaPeca,
  temFoto: boolean,
): { readonly css: string; readonly camadas: string; readonly alinhamento: 'left' | 'center' } => {
  const [r, g, b] = canais(cores.faixa);
  switch (arranjo) {
    case 'faixa-inferior': {
      /**
       * Em LINHA, as margens verticais entre os papéis viram espaço horizontal.
       *
       * Sem zerá-las, o `margin-top` de cada papel empurra os três para baixo
       * dentro da linha e a faixa volta a crescer — o defeito, com outra cara.
       * O espaço entre eles passa a ser o `gap`, que é do eixo certo.
       */
      const emLinha =
        s.disposicao === 'linha'
          ? `.faixa{display:flex;flex-direction:row;align-items:center;gap:${Math.round(s.padX * 0.6)}px}
  .faixa>*{margin-top:0}
  .headline{flex:1 1 auto}
  .marca,.cta,.logotipo,.assinatura{flex:0 0 auto}
  .logotipo{max-width:16%}`
          : '';
      return {
        alinhamento: 'left',
        camadas: '',
        css: `.faixa{position:absolute;left:0;right:0;bottom:0;padding:${s.padY}px ${s.padX}px;
    background:${cores.faixa}}
  /* O véu vive ACIMA da faixa, fora da caixa de texto: ele amacia a emenda com
     a foto sem pôr uma letra sequer sobre pixel semitransparente. */
  .faixa::before{content:'';position:absolute;left:0;right:0;bottom:100%;height:${s.veu}px;
    background:linear-gradient(to top, ${cores.faixa} 0%, transparent 100%)}
  ${emLinha}`,
      };
    }
    case 'tela-dividida': {
      // A foto ocupa a metade dela, e não o quadro inteiro sob a cor: com
      // `cover` no quadro inteiro, o assunto da foto ficaria centrado atrás da
      // metade sólida — a peça mostraria a borda da imagem e esconderia o meio.
      const metadeDaFoto = ehLargo(d)
        ? 'right:0;top:0;bottom:0;width:50%'
        : 'left:0;right:0;top:0;height:50%';
      const metadeDoTexto = ehLargo(d)
        ? 'left:0;top:0;bottom:0;width:50%'
        : 'left:0;right:0;bottom:0;height:50%';
      return {
        alinhamento: 'left',
        camadas: temFoto ? '<div class="foto"></div>' : '',
        css: `.foto{position:absolute;${metadeDaFoto}}
  .faixa{position:absolute;${metadeDoTexto};padding:${s.padY}px ${s.padX}px;
    display:flex;flex-direction:column;justify-content:center;align-items:flex-start}`,
      };
    }
    case 'veu-cheio': {
      // O alfa é derivado, não escolhido: é o menor que ainda faz o PIOR pixel
      // possível vencer o piso de contraste. Ver `alfaDoVeu`.
      const alfa = alfaDoVeu(cores);
      return {
        alinhamento: 'center',
        camadas: temFoto ? '<div class="veu"></div>' : '',
        css: `.veu{position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(${r},${g},${b},${alfa})}
  .faixa{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${Math.round(LARGURA_DO_CENTRO * 100)}%;
    display:flex;flex-direction:column;align-items:center;text-align:center}`,
      };
    }
    case 'texto-sobre-imagem': {
      // Nenhum véu, nenhuma faixa: é o arranjo que deixa a foto limpa. Quem
      // decide se ele serve é a amostragem do pixel, não esta função.
      const comum = 'position:absolute;display:flex;flex-direction:column;align-items:flex-start';
      return {
        alinhamento: 'left',
        camadas: '',
        css: ehLargo(d)
          ? `.faixa{${comum};width:${Math.round(LARGURA_DO_TERCO * 100)}%}
  .peca[data-terco="inicio"] .faixa{left:${s.padX}px;top:50%;transform:translateY(-50%)}
  .peca[data-terco="meio"] .faixa{left:50%;top:50%;transform:translate(-50%,-50%)}
  .peca[data-terco="fim"] .faixa{right:${s.padX}px;top:50%;transform:translateY(-50%)}`
          : `.faixa{${comum};left:${s.padX}px;right:${s.padX}px}
  .peca[data-terco="inicio"] .faixa{top:${s.padY}px}
  .peca[data-terco="meio"] .faixa{top:50%;transform:translateY(-50%)}
  .peca[data-terco="fim"] .faixa{bottom:${s.padY}px}`,
      };
    }
  }
};

/**
 * O HTML da peça. Separado da execução do navegador para poder ser conferido
 * sem subir Chromium — e para a decisão de layout ficar legível.
 */
export const htmlDaPeca = (e: EntradaDaComposicao): string => {
  const d = DIMENSAO_DO_FORMATO[e.formato];
  const arranjo = e.arranjo ?? ARRANJO_PADRAO;
  const s = escalaDaPeca({ ...e, arranjo });
  // A família da marca vem PRIMEIRO e a da casa fica de rede: se o arquivo
  // embutido falhar, a peça ainda sai legível — e a medição no navegador diz
  // qual das duas realmente aplicou.
  const familia =
    e.fonte === null || e.fonte === undefined
      ? 'system-ui,sans-serif'
      : `'${e.fonte.familia.replace(/'/g, '')}',system-ui,sans-serif`;
  const faceDaFonte = e.fonte === null || e.fonte === undefined ? '' : e.fonte.css;
  const temFoto = e.fundo !== null;
  const imagem = temFoto ? fundoEmbutido(e.fundo as string) : null;
  const arte = cssDoArranjo(arranjo, d, s, e.cores, temFoto);

  /**
   * Onde a foto pousa: no quadro inteiro, ou só na metade da tela dividida.
   *
   * Sem foto, TODO arranjo cai na cor da faixa — e é por isso que uma peça sem
   * imagem tem contraste exato em qualquer arranjo: o substrato volta a ser
   * uma cor que nós escolhemos.
   */
  const pintura = (seletor: string): string =>
    imagem === null
      ? `${seletor}{background:${e.cores.faixa}}`
      : `${seletor}{background-image:url('${imagem}');background-size:cover;background-position:center}`;
  const fundoDaPeca =
    arranjo === 'tela-dividida'
      ? `.peca{background:${e.cores.faixa}}\n  ${temFoto ? pintura('.foto') : ''}`
      : pintura('.peca');

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
  .peca{position:relative;width:${d.largura}px;height:${d.altura}px}
  ${fundoDaPeca}
  ${arte.css}
  .marca,.headline,.cta,.assinatura{overflow-wrap:anywhere}
  .marca{font:600 ${s.marca}px/1.2 ${familia};
    letter-spacing:.08em;color:${e.cores.texto}}
  /* Altura fixa e largura AUTO: é o que garante a proporção do arquivo. O
     \`contain\` é o cinto do suspensório — com os dois, esticar exigiria alguém
     escrever \`width\` em pixel, e aí a régua mede e reprova. */
  .logotipo{display:block;height:${s.logotipo}px;width:auto;
    max-width:45%;object-fit:contain;object-position:${arte.alinhamento} center}
  .headline{margin-top:.4em;font:700 ${s.headline}px/1.12 ${familia};
    color:${e.cores.texto}}
  .cta{display:inline-block;margin-top:.9em;padding:.55em 1.1em;
    font:600 ${s.cta}px/1 ${familia};
    color:${e.cores.tintaDoAcento};background:${e.cores.acento}}
  .assinatura{margin-top:.6em;font:500 ${s.assinatura}px/1.2 ${familia};
    letter-spacing:.04em;color:${e.cores.texto}}
</style></head><body><div class="peca" data-arranjo="${arranjo}" data-terco="${e.terco ?? 'inicio'}">
  ${arte.camadas}<div class="faixa">
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
 * O código que AMOSTRA o pixel sob o texto, como string.
 *
 * ## Por que ele redesenha a foto num canvas em vez de fotografar a página
 *
 * O que está sob o texto na tela já está COBERTO pelo texto: fotografar a
 * página devolveria as letras, não o que há embaixo delas. Redesenhando a mesma
 * imagem com o mesmo mapeamento do `cover`, o que se lê é exatamente o pixel
 * que o navegador pintou — antes de a letra pousar em cima.
 *
 * O mapeamento é aritmética, não estimativa: `cover` escolhe a MAIOR das duas
 * escalas e centra o excedente, e é isso que as três linhas de `escala`/`ox`/
 * `oy` reproduzem.
 *
 * ## Por que o véu entra por conta e não por leitura
 *
 * O alfa vem declarado de fora porque ele é derivado lá fora (`alfaDoVeu`), e
 * porque ler `rgba()` de volta do estilo computado seria confiar numa string
 * para reconstruir um número que já temos exato. A composição em sRGB é a mesma
 * que o navegador faz.
 *
 * ## Por que o PIOR pixel, e não a média
 *
 * Média esconde exatamente o caso que importa. Um estouro de luz sob uma linha
 * de headline continua ilegível depois de diluído na média do retângulo, e é
 * ele que faz o cliente dizer "não dá para ler" olhando uma peça cujo número
 * dizia 8:1.
 */
const PREPARAR_SUBSTRATO = `(async () => {
  const peca = document.querySelector('.peca');
  if (!peca) return { pronto: false, porque: 'não achei a peça' };
  const alvo = peca.querySelector('.foto') || peca;
  const cru = getComputedStyle(alvo).backgroundImage || '';
  const casou = cru.match(/url\\(["']?([^"')]+)["']?\\)/);
  if (!casou) return { pronto: false, porque: 'a peça não tem imagem de fundo' };

  const img = new Image();
  img.src = casou[1];
  try { await img.decode(); } catch (e) { return { pronto: false, porque: 'a imagem não decodificou' }; }

  const cx = alvo.getBoundingClientRect();
  const L = Math.round(cx.width);
  const A = Math.round(cx.height);
  if (!L || !A || !img.naturalWidth) return { pronto: false, porque: 'a imagem veio vazia' };

  // O mesmo que \`background-size: cover; background-position: center\` faz.
  const escala = Math.max(L / img.naturalWidth, A / img.naturalHeight);
  const dl = img.naturalWidth * escala;
  const da = img.naturalHeight * escala;

  const c = document.createElement('canvas');
  c.width = L; c.height = A;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { pronto: false, porque: 'o canvas não abriu' };
  ctx.drawImage(img, (L - dl) / 2, (A - da) / 2, dl, da);

  globalThis.__substrato = {
    dados: ctx.getImageData(0, 0, L, A).data,
    L: L,
    A: A,
    // Onde a foto começa dentro da PEÇA. Na tela dividida ela é só uma metade,
    // e sem isto as coordenadas das caixas cairiam no lugar errado da imagem.
    dx: Math.round(cx.left),
    dy: Math.round(cx.top),
  };
  return { pronto: true, porque: '' };
})()`;

/**
 * As funções de cor e de pior-caso, compartilhadas pelos dois passos que rodam
 * na página. Vão como texto porque `evaluate` avalia uma EXPRESSÃO e não tem
 * como carregar um módulo daqui para lá.
 */
const FERRAMENTAS_DO_PIXEL = `
  const lumDe = (r, g, b) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const razaoDe = (l1, l2) => {
    const claro = l1 >= l2 ? l1 : l2;
    const escuro = l1 >= l2 ? l2 : l1;
    return (claro + 0.05) / (escuro + 0.05);
  };
  const emHex = (r, g, b) => '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  /**
   * O pior pixel de um retângulo: o que menos separa da tinta.
   *
   * As coordenadas chegam na origem da PEÇA e são trazidas para a origem da
   * imagem por \`dx\`/\`dy\`. Retângulo que cai todo fora da foto devolve null —
   * não há pixel de foto ali, e inventar um seria dar um número que a régua
   * usaria para aprovar.
   */
  const piorNoRetangulo = (S, veu, tinta, esq, topo, dir, base) => {
    const x0 = Math.max(0, Math.round(esq) - S.dx);
    const y0 = Math.max(0, Math.round(topo) - S.dy);
    const x1 = Math.min(S.L, Math.round(dir) - S.dx);
    const y1 = Math.min(S.A, Math.round(base) - S.dy);
    if (x1 <= x0 || y1 <= y0) return null;
    const lt = lumDe(tinta[0], tinta[1], tinta[2]);
    let pior = Infinity; let onde = null;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * S.L + x) * 4;
        let r = S.dados[i]; let g = S.dados[i + 1]; let b = S.dados[i + 2];
        if (veu) {
          r = r * (1 - veu.alfa) + veu.r * veu.alfa;
          g = g * (1 - veu.alfa) + veu.g * veu.alfa;
          b = b * (1 - veu.alfa) + veu.b * veu.alfa;
        }
        const razao = razaoDe(lt, lumDe(r, g, b));
        if (razao < pior) { pior = razao; onde = [r, g, b]; }
      }
    }
    return onde === null ? null : { razao: pior, cor: emHex(onde[0], onde[1], onde[2]) };
  };
  /**
   * Os pixels EXTREMOS de um retângulo: o mais claro e o mais escuro.
   *
   * O pior contraste não serve para dimensionar véu, e a razão é que a razão de
   * contraste não é monótona na luminância — ela é MÍNIMA quando o fundo tem a
   * mesma luminância da tinta, e volta a subir dos dois lados. Medido no banner
   * do corredor: o pior pixel sob a headline tinha razão 1,00 porque era da cor
   * da própria tinta, enquanto o pixel que exigia mais véu era um branco de
   * janela com razão 1,16 — mais alta, e por isso invisível para quem procura o
   * mínimo.
   *
   * Quem precisa de mais véu é o extremo do lado OPOSTO à tinta: o mais claro
   * quando a tinta é clara, o mais escuro quando ela é escura.
   */
  const extremosNoRetangulo = (S, esq, topo, dir, base) => {
    const x0 = Math.max(0, Math.round(esq) - S.dx);
    const y0 = Math.max(0, Math.round(topo) - S.dy);
    const x1 = Math.min(S.L, Math.round(dir) - S.dx);
    const y1 = Math.min(S.A, Math.round(base) - S.dy);
    if (x1 <= x0 || y1 <= y0) return null;
    let lClaro = -1; let claro = null;
    let lEscuro = 2; let escuro = null;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * S.L + x) * 4;
        const l = lumDe(S.dados[i], S.dados[i + 1], S.dados[i + 2]);
        if (l > lClaro) { lClaro = l; claro = [S.dados[i], S.dados[i + 1], S.dados[i + 2]]; }
        if (l < lEscuro) { lEscuro = l; escuro = [S.dados[i], S.dados[i + 1], S.dados[i + 2]]; }
      }
    }
    if (claro === null || escuro === null) return null;
    return {
      claro: emHex(claro[0], claro[1], claro[2]),
      escuro: emHex(escuro[0], escuro[1], escuro[2]),
    };
  };
`;

/**
 * Escolhe o terço, MEDINDO — e medindo o BLOCO, não a banda.
 *
 * "O terço vazio" não é uma posição fixa: depende da foto. Medir qual dos três
 * carrega melhor a tinta é a mesma decisão que um diagramador toma olhando, com
 * a diferença de que esta se repete igual em mil peças e sai escrita no
 * resultado.
 *
 * A primeira versão media a BANDA de um terço do quadro, e ela mentia por
 * construção: o bloco ocupa 42% da largura e a banda 33%, então um bloco
 * alinhado ao terço bom sempre invade o vizinho. Medido no caso extremo — dois
 * terços estourados e um escuro —, a banda escolhida dava 1,13:1 no pixel que o
 * texto realmente pegava.
 *
 * Hoje ele põe o bloco em cada uma das três posições e mede o que o TEXTO pega
 * ali. É mais caro (três passadas de layout, todas de graça) e é a única
 * pergunta que corresponde à peça.
 */
const escolherTerco = (dados: string): string => `(() => {
  const S = globalThis.__substrato;
  const peca = document.querySelector('.peca');
  if (!S || !peca) return null;
  const cfg = ${dados};
  ${FERRAMENTAS_DO_PIXEL}
  const nomes = ['inicio', 'meio', 'fim'];
  const razoes = [];
  for (const nome of nomes) {
    peca.setAttribute('data-terco', nome);
    let pior = Infinity;
    for (const el of Array.from(document.querySelectorAll('[data-papel]'))) {
      const r = el.getBoundingClientRect();
      const tinta = el.getAttribute('data-papel') === 'cta' ? cfg.acento : cfg.tinta;
      const achado = piorNoRetangulo(S, cfg.veu, tinta, r.left, r.top, r.right, r.bottom);
      if (achado !== null && achado.razao < pior) pior = achado.razao;
    }
    razoes.push(pior === Infinity ? 0 : pior);
  }
  let melhor = 0;
  for (let t = 1; t < 3; t += 1) { if (razoes[t] > razoes[melhor]) melhor = t; }
  peca.setAttribute('data-terco', nomes[melhor]);
  return { terco: nomes[melhor], razoes: razoes };
})()`;

/**
 * O pior contraste sob CADA papel.
 *
 * O papel do botão é medido contra a cor do BOTÃO, e não contra a tinta: o que
 * precisa se separar da foto ali é o retângulo do acento. A tinta de dentro do
 * botão pousa no acento sólido, e esse par já é exato sem amostrar nada.
 */
const medirSubstrato = (dados: string): string => `(() => {
  const S = globalThis.__substrato;
  if (!S) return null;
  const cfg = ${dados};
  ${FERRAMENTAS_DO_PIXEL}
  return Array.from(document.querySelectorAll('[data-papel]')).map((el) => {
    const r = el.getBoundingClientRect();
    const papel = el.getAttribute('data-papel') || '';
    const tinta = papel === 'cta' ? cfg.acento : cfg.tinta;
    const achado = piorNoRetangulo(S, cfg.veu, tinta, r.left, r.top, r.right, r.bottom);
    const ext = extremosNoRetangulo(S, r.left, r.top, r.right, r.bottom);
    return {
      papel: papel,
      razao: achado === null ? null : achado.razao,
      cor: achado === null ? null : achado.cor,
      maisClaro: ext === null ? null : ext.claro,
      maisEscuro: ext === null ? null : ext.escuro,
    };
  });
})()`;

/**
 * Quanto da peça a foto ainda ocupa, medido na GEOMETRIA.
 *
 * A camada da foto é `.foto` quando ela existe (tela dividida) e a própria peça
 * quando a foto é cheia. Dela sai o que as superfícies OPACAS cobrem — hoje só
 * a faixa de leitura, e só quando o fundo dela é opaco de verdade: num arranjo
 * em que a faixa é transparente, ela não esconde nada.
 *
 * O véu NÃO conta como cobertura. Ele escurece a foto e continua mostrando-a, e
 * é essa a diferença entre uma foto sob véu e uma tira de foto acima de um
 * painel de texto.
 */
const MEDIR_FRACAO_DA_FOTO = `(() => {
  const peca = document.querySelector('.peca');
  if (!peca) return null;
  const camada = peca.querySelector('.foto') || peca;
  const temImagem = (getComputedStyle(camada).backgroundImage || 'none') !== 'none';
  if (!temImagem) return null;

  const q = peca.getBoundingClientRect();
  const area = q.width * q.height;
  if (!area) return null;
  const f = camada.getBoundingClientRect();

  /** O alfa do fundo de um elemento: 0 quando ele não esconde nada. */
  const alfaDoFundo = (el) => {
    const n = (getComputedStyle(el).backgroundColor || '').match(/[0-9]+([.][0-9]+)?/g);
    if (!n || n.length < 3) return 0;
    return n.length > 3 ? Number(n[3]) : 1;
  };

  let coberta = 0;
  for (const el of Array.from(peca.querySelectorAll('.faixa'))) {
    if (alfaDoFundo(el) < 1) continue;
    const r = el.getBoundingClientRect();
    const larg = Math.max(0, Math.min(f.right, r.right) - Math.max(f.left, r.left));
    const alt = Math.max(0, Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top));
    coberta += larg * alt;
  }
  return Math.max(0, (f.width * f.height - coberta) / area);
})()`;

/** O que o navegador devolve sobre o pixel sob um papel. */
type AmostraDoPapel = {
  readonly papel: string;
  readonly razao: number | null;
  readonly cor: string | null;
  /** Os pixels extremos do retângulo, para dimensionar o véu. */
  readonly maisClaro?: string | null;
  readonly maisEscuro?: string | null;
};

type PaginaDoNavegador = {
  setContent(html: string, opts?: { waitUntil?: 'load' }): Promise<void>;
  screenshot(opts: { type: 'png' }): Promise<Buffer>;
  evaluate<T>(expressao: string): Promise<T>;
  close(): Promise<void>;
};

/**
 * Compõe e fotografa, na dimensão exata.
 *
 * O navegador entra por parâmetro para o chamador decidir o ciclo de vida: numa
 * rodada de oito variações, subir e derrubar o Chromium oito vezes é o tipo de
 * desperdício que faz o processo parecer travado.
 */
export const comporPeca = async (
  navegador: {
    newPage(opts: { viewport: { width: number; height: number } }): Promise<PaginaDoNavegador>;
  },
  entrada: EntradaDaComposicao,
): Promise<PecaComposta> => {
  const d = DIMENSAO_DO_FORMATO[entrada.formato];
  const arranjo = entrada.arranjo ?? ARRANJO_PADRAO;
  const substrato = ARRANJO[arranjo].substrato;
  /**
   * Sem foto, TODO arranjo pousa em cor sólida.
   *
   * A peça sem imagem cai na cor da faixa em qualquer arranjo, e ali o
   * contraste volta a ser o par entre duas cores que nós escolhemos. Amostrar
   * seria trocar uma certeza por uma leitura de canvas.
   */
  const amostrar = entrada.fundo !== null && substrato !== 'cor-solida';
  let veu: { r: number; g: number; b: number; alfa: number } | null =
    substrato === 'foto-com-veu'
      ? (() => {
          const [r, g, b] = canais(entrada.cores.faixa);
          return { r, g, b, alfa: alfaDoVeu(entrada.cores) };
        })()
      : null;

  const pagina = await navegador.newPage({
    viewport: { width: d.largura, height: d.altura },
  });
  try {
    await pagina.setContent(htmlDaPeca({ ...entrada, arranjo }), { waitUntil: 'load' });

    /**
     * O terço COMEÇA no valor que o HTML pôs, e não em `null`.
     *
     * `null` neste campo quer dizer "este arranjo não alinha a terço". Se a
     * amostragem falhar (imagem que não decodifica, canvas que não abre), a
     * peça ainda saiu alinhada a ALGUM terço — o padrão —, e devolver `null` ali
     * diria que ela não tem terço nenhum. O campo passa a responder sempre onde
     * o bloco pousou.
     */
    let terco: TercoDaPeca | null =
      arranjo === 'texto-sobre-imagem' ? (entrada.terco ?? 'inicio') : null;
    let amostras: readonly AmostraDoPapel[] | null = null;
    if (amostrar) {
      const pronto = await pagina.evaluate<{ pronto: boolean; porque: string }>(PREPARAR_SUBSTRATO);
      if (pronto.pronto) {
        const semVeu = JSON.stringify({
          veu: null,
          tinta: canais(entrada.cores.texto),
          acento: canais(entrada.cores.acento),
        });
        if (arranjo === 'texto-sobre-imagem') {
          const escolha = await pagina.evaluate<{ terco: TercoDaPeca } | null>(
            escolherTerco(semVeu),
          );
          if (escolha !== null) terco = escolha.terco;
        }

        /**
         * O véu encolhe até o que ESTA foto precisa, e não além.
         *
         * `alfaDoVeu` derivou o alfa do pior pixel POSSÍVEL — branco puro, para
         * tinta clara —, e isso é o certo enquanto ninguém viu a foto. Depois de
         * vê-la, o pior caso teórico sai caro em pixel: medido no banner do
         * corredor, ele deu 0,66 para domar uma janela estourada que o texto nem
         * toca, enquanto o piso do corredor sob a headline precisava de 0,45.
         * Vinte pontos de véu a menos é a diferença entre a foto aparecer e a
         * foto virar uma mancha da cor da marca.
         *
         * A primeira passada mede o pixel CRU sob cada papel, a conta responde
         * de quanto véu aquele pixel precisa, e a segunda confere o resultado já
         * com o véu aplicado. A garantia não afrouxa: o número que sai é medido
         * depois, não prometido antes.
         */
        if (veu !== null) {
          const seguro = veu.alfa;
          const cruas = await pagina.evaluate<readonly AmostraDoPapel[] | null>(
            medirSubstrato(semVeu),
          );
          /**
           * O extremo do lado OPOSTO à tinta é quem dimensiona o véu.
           *
           * Não o pior contraste: ele é mínimo quando o fundo tem a luminância
           * da própria tinta, e ali o véu quase não faz falta. Medido no banner
           * do corredor, derivar do pior contraste deu 0,60 e a medição depois
           * devolveu 2,90:1 — abaixo do piso, com a conta jurando que dava.
           */
          const tintaEhClara =
            contrasteRatio(entrada.cores.texto, '#ffffff') <
            contrasteRatio(entrada.cores.texto, '#000000');
          const preciso = (cruas ?? []).reduce((maior, a) => {
            const extremo = tintaEhClara ? a.maisClaro : a.maisEscuro;
            if (extremo === null || extremo === undefined) return maior;
            const tinta = a.papel === 'cta' ? entrada.cores.acento : entrada.cores.texto;
            return Math.max(maior, alfaDoVeuSobre(entrada.cores, extremo, tinta, PISO_DO_BOTAO));
          }, 0);

          const aplicar = async (alfa: number): Promise<void> => {
            veu = { ...(veu as NonNullable<typeof veu>), alfa };
            await pagina.evaluate<void>(
              `(() => { const v = document.querySelector('.veu'); if (v) v.style.background = 'rgba(${(veu as NonNullable<typeof veu>).r},${(veu as NonNullable<typeof veu>).g},${(veu as NonNullable<typeof veu>).b},${alfa})'; })()`,
            );
          };
          const medir = async (): Promise<readonly AmostraDoPapel[] | null> =>
            await pagina.evaluate<readonly AmostraDoPapel[] | null>(
              medirSubstrato(
                JSON.stringify({
                  veu,
                  tinta: canais(entrada.cores.texto),
                  acento: canais(entrada.cores.acento),
                }),
              ),
            );

          if (preciso > 0 && preciso < seguro) await aplicar(preciso);
          amostras = await medir();

          /**
           * E se o véu encolhido não entregar, ele VOLTA.
           *
           * A conta que dimensiona é uma estimativa sobre um pixel; a medição é
           * sobre todos. Em vez de confiar na estimativa, o motor mede e desfaz
           * — o alfa do pior caso é garantido por construção, e recompor aqui
           * não custa nem crédito nem uma segunda página.
           */
          const pior = (amostras ?? [])
            .map((a) => a.razao)
            .filter((n): n is number => n !== null && Number.isFinite(n));
          if (veu.alfa < seguro && (pior.length === 0 || Math.min(...pior) < PISO_DO_BOTAO)) {
            await aplicar(seguro);
            amostras = await medir();
          }
        }

        if (amostras === null) {
          amostras = await pagina.evaluate<readonly AmostraDoPapel[] | null>(
            medirSubstrato(
              JSON.stringify({
                veu,
                tinta: canais(entrada.cores.texto),
                acento: canais(entrada.cores.acento),
              }),
            ),
          );
        }
      }
    }

    // Texto passado ao `evaluate` é avaliado como EXPRESSÃO: sem os parênteses
    // de chamada, o que volta é a própria função e o resultado chega
    // `undefined`. A mesma armadilha está anotada em `conferir-site.ts:1120`.
    const cruas = await pagina.evaluate<(CaixaDoPapel & { texto: string })[]>(`(${LER_PAPEIS})()`);

    /**
     * O fundo do LOGOTIPO passa a ser o pixel amostrado.
     *
     * `fundoAtrasDe` sobe pelos ancestrais procurando uma cor de fundo opaca, e
     * sobre uma foto não existe nenhuma: C3 saía pendente para sempre em três
     * dos quatro arranjos. O pixel medido responde a mesma pergunta de verdade
     * — a marca SE VÊ onde ela pousou?
     */
    const porPapel = new Map((amostras ?? []).map((a) => [a.papel, a]));
    const caixas: CaixaDoPapel[] = cruas.map((c) => {
      const amostra = porPapel.get(c.papel);
      if (c.imagem === null || c.imagem === undefined || amostra?.cor == null) return c;
      return { ...c, imagem: { ...c.imagem, fundoAtras: amostra.cor } };
    });

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

    const fracaoDaFoto = await pagina.evaluate<number | null>(MEDIR_FRACAO_DA_FOTO);

    const png = await pagina.screenshot({ type: 'png' });

    /**
     * O contraste da peça, e de onde ele vem.
     *
     * Em substrato sólido, o declarado — exato, porque nós escolhemos as duas
     * cores do par. Sobre a foto, o par do texto deixa de existir e o que resta
     * de exato é só o de DENTRO do botão (tinta sobre acento, os dois nossos):
     * ele continua entrando na conta, e o resto sai do pixel.
     *
     * Amostragem que não veio (imagem que não decodificou, canvas que não abriu)
     * deixa o número em `null`. Cair no declarado ali seria publicar o número
     * que a régua usaria para aprovar aquilo que ninguém mediu.
     */
    const amostrados = (amostras ?? [])
      .map((a) => a.razao)
      .filter((n): n is number => n !== null && Number.isFinite(n));
    const menorAmostrado = amostrados.length === 0 ? null : Math.min(...amostrados);
    const doBotao =
      entrada.cta === null
        ? null
        : contrasteRatio(entrada.cores.tintaDoAcento, entrada.cores.acento);
    const menorContraste = !amostrar
      ? contrasteDaPeca(entrada.cores, entrada.cta !== null)
      : menorAmostrado === null
        ? null
        : Math.min(menorAmostrado, doBotao ?? Number.POSITIVE_INFINITY);

    return {
      png: new Uint8Array(png),
      largura: d.largura,
      altura: d.altura,
      textos: caixas.map((c) => c.texto),
      caixas,
      menorContraste,
      arranjo,
      contrasteAmostrado: menorAmostrado,
      terco,
      alfaDoVeuAplicado: veu === null ? null : veu.alfa,
      fracaoDaFoto,
      fonteAplicada,
    };
  } finally {
    await pagina.close();
  }
};
