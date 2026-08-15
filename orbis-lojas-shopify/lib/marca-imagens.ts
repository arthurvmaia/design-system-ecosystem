/**
 * As imagens da loja gerada: logo, banners e capas de coleção.
 *
 * Uma peça é o pedido inteiro de uma imagem: onde ela entra no tema, em que
 * enquadramento, com que texto para o modelo, e qual o desenho local que ocupa
 * o lugar enquanto não há provedor de IA configurado. Ficar num arquivo só
 * evita a pior falha desse tipo de recurso: o banner de celular sair no
 * enquadramento do banner de desktop porque a proporção foi decidida na tela.
 *
 * ## Por que a logo não sai escrita pelo modelo
 *
 * Modelo de imagem erra letra. Pedir "logo da Aurora Atelier" devolve um
 * símbolo bonito com o nome escrito errado, e não dá para consertar. Então o
 * modelo desenha só o SÍMBOLO, sem nenhuma letra, e o nome entra por cima em
 * tipografia de verdade — que é como se faz uma logo profissional.
 */
import { ilustracaoDoNicho, logoDataUri, misturar, nichoPorId, textoSobre } from "./marca-generator.mjs";
import { extensoEmFundo, faviconSvg, logoExtensoSvg } from "./kit-de-logo";

export type PapelDaPeca = "logo" | "banner-desktop" | "banner-mobile" | "colecao" | "cena";

export type PecaDeImagem = {
  /** Identificador estável: vira nome do asset e chave do resultado. */
  chave: string;
  papel: PapelDaPeca;
  titulo: string;
  /** Enquadramento no vocabulário da Magnific (aspect_ratio). */
  aspecto: string;
  prompt: string;
  /** Desenho local usado enquanto não há provedor de IA. */
  fallbackSvg: string;
  /**
   * De onde a peça VEM.
   *
   * `desenhada` é resolvida aqui, por geometria e tipografia: o nome por
   * extenso e o favicon são letra e forma, e letra pedida a um gerador de
   * imagem volta torta, com caractere inventado. Estas não custam crédito, não
   * entram na fila e ficam prontas na hora.
   *
   * `gerada` é o que só existe fotografando ou ilustrando: o símbolo, os
   * banners e as cenas da marca.
   */
  origem: "gerada" | "desenhada";
};

export type MarcaDeImagem = {
  name: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor?: string;
  nicheId?: string;
  collections?: string[];
};

/**
 * Enquadramentos, por papel.
 *
 * `widescreen_16_9` para desktop e `social_post_4_5` para celular: o 4:5 é o
 * que os temas Shopify usam no banner móvel, e pedir 9:16 devolveria uma faixa
 * alta demais, que o tema corta no meio do assunto.
 */
/**
 * O que separa uma foto de catálogo de uma foto de banco de imagem ruim.
 *
 * Vai em toda peça fotográfica: sem isso o modelo devolve imagem correta e sem
 * graça, e a loja gerada parece template.
 */
const QUALIDADE = "Fotografia comercial de alta qualidade, iluminação de estúdio suave com luz de preenchimento, foco nítido, profundidade de campo rasa, cores fiéis, sem ruído, sem distorção, sem texto na imagem.";

/**
 * O enquadramento de cada peça.
 *
 * O banner de desktop pedia `widescreen_16_9` — 1,78:1, que é formato de VÍDEO,
 * não de banner de loja. A Shopify recomenda 3:1 (3000×1000 ou 1800×600), e a
 * arte saía com quase o dobro da altura: medido, 2752×1536. Num tema com
 * `slide_height: adapt_image` isso vira uma dobra gigante, que é exatamente o
 * "está muito grande" de quem abre a loja.
 *
 * 3:1 não está na lista fechada do provedor; o mais largo que ele aceita é
 * `smartphone_horizontal_20_9` (2,22:1). Fica ele, que é o mais perto do
 * banner, e a altura final quem decide é o TEMA — ver `alturaDeBanner` em
 * `shopify-brand.ts`. Pedir proporção ao gerador e ainda deixar a seção adotar
 * a proporção do arquivo era confiar duas vezes no mesmo palpite.
 *
 * O celular já estava certo: `social_post_4_5` é 1080×1350.
 */
const ASPECTO: Record<PapelDaPeca, string> = {
  logo: "square_1_1",
  "banner-desktop": "smartphone_horizontal_20_9",
  "banner-mobile": "social_post_4_5",
  colecao: "square_1_1",
  cena: "square_1_1",
};

/**
 * O JEITO da marca, dito uma vez e usado em toda peça ilustrada.
 *
 * Um símbolo, três variações dele e quatro banners saem do mesmo pedido sem
 * nenhuma frase em comum: o resultado eram oito peças que não pareciam da
 * mesma casa. Esta linha é o que costura, e ela descreve o padrão que o dono
 * apontou como referência: emblema cheio, contorno forte, poucas cores, com
 * cara de marca desenhada à mão e não de ícone de sistema.
 */
const JEITO_DO_SIMBOLO = [
  "Emblema de marca ilustrado, vetorial, formas cheias e sólidas, silhueta forte que se reconhece pequena,",
  "contorno grosso, poucas cores chapadas com um degradê discreto no volume, composição centralizada e simétrica.",
  "Sem letras, sem palavras, sem números, sem marca d'água, sem sombra projetada, sem moldura de app.",
].join(" ");

/** Coleções que servem a qualquer loja, para quem trouxe a própria marca. */
const COLECOES_NEUTRAS = ["Novidades", "Mais vendidos", "Ofertas", "Todos os produtos"];

function paleta(marca: MarcaDeImagem) {
  const destaque = marca.accentColor || marca.primaryColor;
  return { primaria: marca.primaryColor, fundo: marca.backgroundColor, destaque };
}

/** As cores que vão no `styling.colors` do modelo, para a imagem casar com a marca. */
export function coresDaMarca(marca: MarcaDeImagem): string[] {
  const { primaria, fundo, destaque } = paleta(marca);
  return [...new Set([primaria, destaque, fundo])];
}

function assunto(nicheId: string | undefined) {
  return nichoPorId(nicheId).resumo.replace(/\.$/, "").toLowerCase();
}

/* ------------------------------------------------------- desenhos locais */

function moldura(largura: number, altura: number, corpo: string, fundo: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img">`,
    `<rect width="${largura}" height="${altura}" fill="${fundo}"/>`,
    corpo,
    "</svg>",
  ].join("");
}

/**
 * Banner local: faixa na cor da marca com a área de texto livre.
 *
 * A área livre não é enfeite. O tema escreve o título por cima do banner, e um
 * fundo ocupado no lugar errado deixa o texto ilegível — por isso o assunto
 * fica à direita no desktop e embaixo no celular.
 */
function bannerSvg(marca: MarcaDeImagem, vertical: boolean) {
  const { primaria, fundo, destaque } = paleta(marca);
  const largura = vertical ? 1080 : 1920;
  const altura = vertical ? 1350 : 1080;
  const claro = misturar(fundo, primaria, 0.12);
  const corpo = vertical
    ? [
        `<rect y="${altura * 0.55}" width="${largura}" height="${altura * 0.45}" fill="${claro}"/>`,
        `<circle cx="${largura * 0.5}" cy="${altura * 0.32}" r="${largura * 0.26}" fill="${primaria}"/>`,
        `<circle cx="${largura * 0.5}" cy="${altura * 0.32}" r="${largura * 0.17}" fill="${destaque}"/>`,
      ].join("")
    : [
        `<rect x="${largura * 0.52}" width="${largura * 0.48}" height="${altura}" fill="${claro}"/>`,
        `<circle cx="${largura * 0.74}" cy="${altura * 0.5}" r="${altura * 0.3}" fill="${primaria}"/>`,
        `<circle cx="${largura * 0.74}" cy="${altura * 0.5}" r="${altura * 0.19}" fill="${destaque}"/>`,
      ].join("");
  return moldura(largura, altura, corpo, fundo);
}

/** Capa local de coleção: a inicial da coleção sobre a cor da marca. */
function colecaoSvg(marca: MarcaDeImagem, nome: string, indice: number) {
  const { primaria, fundo, destaque } = paleta(marca);
  const tom = misturar(primaria, fundo, 0.12 + (indice % 4) * 0.18);
  const letra = nome.trim().charAt(0).toUpperCase() || "C";
  const corpo = [
    `<rect width="800" height="800" fill="${tom}"/>`,
    `<circle cx="400" cy="400" r="250" fill="none" stroke="${destaque}" stroke-width="14" opacity="0.75"/>`,
    `<text x="400" y="400" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="240" font-weight="700" fill="${textoSobre(tom)}">${letra}</text>`,
  ].join("");
  return moldura(800, 800, corpo, fundo);
}

/* ------------------------------------------------------------- as peças */

/**
 * Todas as imagens que a loja precisa, na ordem em que valem a pena gerar.
 *
 * As coleções vêm do nicho escolhido: quem escolheu óculos recebe capas de
 * "Óculos de sol" e "Armações de grau", não coleções genéricas.
 */
export function pecasDaMarca(marca: MarcaDeImagem): PecaDeImagem[] {
  const nicho = nichoPorId(marca.nicheId);
  const cores = coresDaMarca(marca).join(", ");
  const tema = assunto(marca.nicheId);
  /* sem nicho escolhido (marca própria), as coleções são as de qualquer loja:
     herdar as de "roupas" faria uma loja de ferramentas pedir "Alfaiataria" */
  const colecoes = (marca.collections?.length
    ? marca.collections
    : marca.nicheId ? nicho.colecoes : COLECOES_NEUTRAS
  ).slice(0, 6);

  /**
   * O KIT DA MARCA, no formato em que uma marca de verdade é entregue.
   *
   * Era um símbolo só. Uma marca não vive com um arquivo: ela precisa da versão
   * de fundo transparente, da que vai sobre claro, da monocromática para peça
   * escura, do nome por extenso e do ícone miúdo. Sem isso, a pessoa recebe uma
   * imagem bonita e trava no primeiro lugar em que ela não serve.
   *
   * As três primeiras saem do MESMO símbolo, dito com as mesmas palavras: é o
   * que faz as três parecerem a mesma marca em roupas diferentes, e não três
   * marcas. As duas últimas são desenhadas aqui, porque são letra e forma.
   */
  const simbolo = `${JEITO_DO_SIMBOLO} O símbolo representa uma loja de ${tema}.`;
  const pecas: PecaDeImagem[] = [
    {
      chave: "logo",
      papel: "logo",
      titulo: "Símbolo da marca",
      aspecto: ASPECTO.logo,
      origem: "gerada",
      /* sem letra nenhuma: o nome entra depois, em tipografia de verdade */
      prompt: `${simbolo} Fundo liso de cor única, bem separado do símbolo. Paleta: ${cores}.`,
      fallbackSvg: ilustracaoDoNicho(nicho.id),
    },
    /**
     * As outras três da marca são DESENHADAS, e a razão é a queixa do dono.
     *
     * Pedir "o símbolo sobre branco" e "o símbolo monocromático" ao gerador são
     * duas gerações NOVAS: cada uma inventa o próprio símbolo, e a pasta chega
     * com a marca em três modelos diferentes em vez de uma marca em três
     * roupas. Não é falta de capricho no texto do pedido; é que geração
     * independente não tem como devolver o mesmo desenho.
     *
     * Então o que precisa ser IGUAL entre versões sai de onde dá para garantir:
     * o nome da marca, em tipografia, nas mesmas três situações da referência
     * (transparente, fundo claro, fundo escuro). Mesmo desenho, mesma letra,
     * mesmo espaçamento, sempre.
     */
    {
      chave: "logo-escrita",
      papel: "logo",
      titulo: "Nome por extenso",
      aspecto: ASPECTO.logo,
      origem: "desenhada",
      prompt: "",
      fallbackSvg: logoExtensoSvg(marca),
    },
    {
      chave: "logo-escrita-fundo-branco",
      papel: "logo",
      titulo: "Nome por extenso, fundo branco",
      aspecto: ASPECTO.logo,
      origem: "desenhada",
      prompt: "",
      fallbackSvg: extensoEmFundo(marca, "claro"),
    },
    {
      chave: "logo-escrita-fundo-preto",
      papel: "logo",
      titulo: "Nome por extenso, fundo preto",
      aspecto: ASPECTO.logo,
      origem: "desenhada",
      prompt: "",
      fallbackSvg: extensoEmFundo(marca, "escuro"),
    },
    {
      chave: "favicon",
      papel: "logo",
      titulo: "Favicon",
      aspecto: ASPECTO.logo,
      origem: "desenhada",
      prompt: "",
      fallbackSvg: faviconSvg(marca),
    },
    /**
     * DUAS artes de banner, QUATRO arquivos.
     *
     * O celular era outra geração, com a instrução de repetir a cena do
     * desktop. Não repete: geração independente devolve outra pessoa, outra
     * roupa, outro fundo — e a loja abre com uma campanha no computador e outra
     * no telefone. Era a mesma falha das três logos.
     *
     * Agora cada dobra tem UMA arte, e os dois arquivos saem dela. O que muda
     * entre desktop e celular é o corte, e quem corta é o tema. Por isso o
     * pedido mudou também: o assunto vai CENTRALIZADO com folga em volta, que é
     * o enquadramento que sobrevive tanto ao corte largo quanto ao alto. Um
     * assunto encostado numa borda, como estava, some no outro formato.
     */
    {
      chave: "banner-1",
      papel: "banner-desktop",
      titulo: "Banner 1 (desktop e celular)",
      aspecto: ASPECTO["banner-desktop"],
      origem: "gerada",
      prompt: [
        `Fotografia editorial de campanha de uma loja de ${tema}: uma pessoa real usando o produto, em atitude natural.`,
        `Fundo de papel texturizado em tom quente, na paleta ${cores}, com bastante ar em volta.`,
        "Pessoa CENTRALIZADA no quadro, com margem larga dos dois lados e em cima: a mesma foto vai ser cortada larga no computador e alta no celular.",
        QUALIDADE,
        "Sem letras, sem logotipos, sem marca d'água.",
      ].join(" "),
      fallbackSvg: bannerSvg(marca, false),
    },
    {
      chave: "banner-2",
      papel: "banner-desktop",
      titulo: "Banner 2 (desktop e celular)",
      aspecto: ASPECTO["banner-desktop"],
      origem: "gerada",
      prompt: [
        `Segunda cena da campanha da loja de ${tema}: o produto em close, com a textura do material bem visível, sem pessoas.`,
        `Fundo de papel envelhecido com grão, na paleta ${cores}.`,
        "Produto CENTRALIZADO no quadro, com margem larga em volta: a mesma foto vai ser cortada larga no computador e alta no celular.",
        QUALIDADE,
        "Sem letras, sem logotipos, sem marca d'água.",
      ].join(" "),
      fallbackSvg: bannerSvg(marca, false),
    },
  ];

  /**
   * As TRÊS cenas da marca, no lugar de seis capas de coleção.
   *
   * Eram seis capas, uma por coleção, e elas custavam mais da metade do lote
   * inteiro para entregar seis fotos de produto sobre fundo liso — variações do
   * mesmo enquadramento. Três cenas de MUNDO da marca (quem usa, do que é
   * feito, onde vive) valem mais: aparecem na página inteira, no rodapé, no
   * "sobre" e nas próprias capas de coleção, que passam a rodar entre elas.
   *
   * E o lote encolhe, o que não é detalhe: era com doze pedidos simultâneos que
   * a fila estourava a espera e a loja saía com três imagens.
   */
  const CENAS: Array<{ chave: string; titulo: string; direcao: string }> = [
    { chave: "cena-1", titulo: "Cena da marca: quem usa", direcao: "uma pessoa real em situação cotidiana usando o produto, luz natural, ambiente com pouca informação atrás" },
    { chave: "cena-2", titulo: "Cena da marca: o material", direcao: "close no material e no acabamento do produto, mãos entrando no quadro, textura evidente" },
    { chave: "cena-3", titulo: "Cena da marca: o mundo dela", direcao: "o produto no ambiente onde a marca vive, plano aberto, sem pessoas, clima de fim de tarde" },
  ];
  for (const cena of CENAS) {
    pecas.push({
      chave: cena.chave,
      papel: "cena",
      titulo: cena.titulo,
      aspecto: ASPECTO.cena,
      origem: "gerada",
      prompt: [
        `Fotografia de campanha para uma loja de ${tema}: ${cena.direcao}.`,
        `Paleta dominante: ${cores}, com fundo texturizado em tom quente.`,
        QUALIDADE,
        "Sem letras, sem logotipos e sem marca d'água.",
      ].join(" "),
      fallbackSvg: colecaoSvg(marca, colecoes[0] ?? cena.titulo, CENAS.indexOf(cena)),
    });
  }

  return pecas;
}

/** O desenho local de uma peça, pronto para virar `<img src>` ou asset. */
export function fallbackDataUri(peca: PecaDeImagem): string {
  return logoDataUri(peca.fallbackSvg);
}
