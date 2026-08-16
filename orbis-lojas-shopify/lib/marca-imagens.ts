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
import { faviconSvg, logoExtensoSvg } from "./kit-de-logo";

export type PapelDaPeca = "logo" | "banner-desktop" | "banner-mobile" | "colecao" | "cena";

export type PecaDeImagem = {
  /** Identificador estável: vira nome do asset e chave do resultado. */
  chave: string;
  papel: PapelDaPeca;
  titulo: string;
  /** Enquadramento no vocabulário da Magnific (aspect_ratio). */
  aspecto: string;
  /** Resolução pedida ao provedor: sai do DESTINO da peça (ver `RESOLUCAO`). */
  resolucao: string;
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
   *
   * `derivada` sai de uma peça gerada, por cálculo: as versões do símbolo em
   * fundo claro e escuro são o MESMO símbolo recortado e recomposto, e é por
   * isso que elas não podem ser outro pedido ao modelo.
   */
  origem: "gerada" | "desenhada" | "derivada";
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
/**
 * A RESOLUÇÃO que cada peça precisa, e nem uma a mais.
 *
 * Pedir 4k para tudo custava caro em dois lugares que não apareciam na conta:
 * o arquivo e o relógio. Medido numa geração real deste computador, tudo em 4k:
 * símbolo 3,5 MB, banner 12,4 MB, cenas 17,9 e 19,8 MB. Cada um desses é
 * baixado do provedor e regravado antes de virar imagem da loja, e a rodada
 * inteira arrastava por isso.
 *
 * Pior: com peças roçando os 20 MB, as que passavam do teto eram DESCARTADAS
 * depois de geradas e pagas. Foi assim que uma rodada de seis terminou com
 * quatro.
 *
 * O número certo sai do DESTINO de cada peça, não de um gosto por nitidez:
 *
 * - **banner: 4k, e continua 4k.** Ele é recomposto em 3000×1000 por
 *   `comporBanner`. De uma fonte 2k (2048 px de lado) isso é AMPLIAR, e aí a
 *   pixelização é real, não teórica. Abaixar aqui estragaria a peça mais
 *   visível da loja.
 * - **cena: 2k.** Ela entra como imagem de seção, no tamanho que o tema der.
 *   2048 px cobre qualquer seção com folga, e o arquivo cai para perto de um
 *   quarto: sai da faixa onde as peças estavam sendo perdidas.
 * - **símbolo: 2k.** Ele é recortado e recentrado por `derivarLogos`, e sai de
 *   lá com 0,13 a 0,18 MB. Baixar 3,5 MB para produzir 180 KB é pagar banda e
 *   tempo por pixel que é jogado fora no passo seguinte.
 */
const RESOLUCAO: Record<PapelDaPeca, string> = {
  logo: "2k",
  "banner-desktop": "4k",
  "banner-mobile": "4k",
  colecao: "2k",
  cena: "2k",
};

/** A resolução pedida ao provedor para uma peça daquele papel. */
export function resolucaoDaPeca(papel: PapelDaPeca): string {
  return RESOLUCAO[papel] ?? "2k";
}

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

/**
 * O que a loja vende, em DUAS palavras. É esta que vai no pedido de imagem.
 *
 * `assunto` devolve o resumo de vitrine — "semijoias, bijuterias e acessórios
 * de uso diário" —, e num pedido a um gerador ele COMPETE com o assunto da
 * peça. Medido numa loja real de joias: a capa de "Pulseiras" voltou com duas
 * BOLSAS, porque "acessórios" estava escrito no pedido e "Pulseiras" era uma
 * palavra só no meio de quinhentos caracteres. Ganhou a que se repetia.
 */
function produtoDoNicho(nicheId: string | undefined) {
  return nichoPorId(nicheId).produto || assunto(nicheId);
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
  /* o assunto ESTREITO, para os pedidos em que a peça tem um produto certo
     para mostrar: capa de coleção e a dobra de close. Ver `produtoDoNicho`. */
  const produto = produtoDoNicho(marca.nicheId);
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
      resolucao: resolucaoDaPeca("logo"),
      origem: "gerada",
      /* sem letra nenhuma: o nome entra depois, em tipografia de verdade */
      prompt: `${simbolo} Fundo liso de cor única, bem separado do símbolo. Paleta: ${cores}.`,
      fallbackSvg: ilustracaoDoNicho(nicho.id),
    },
    /**
     * As duas versões do símbolo são DERIVADAS, não pedidas de novo.
     *
     * Era a queixa do dono, e não se conserta caprichando no texto: pedir "o
     * mesmo símbolo em fundo branco" abre um pedido NOVO, e o modelo desenha
     * outro símbolo. A marca chegava em três modelos diferentes.
     *
     * Elas saem do arquivo gerado, por cálculo, em `logo-derivar.ts`: recorta o
     * fundo liso (que o pedido já manda vir liso), apara, centraliza com
     * respiro e recompõe. Mesmo desenho, sempre, e sem custar crédito.
     */
    {
      chave: "logo-fundo-branco",
      papel: "logo",
      titulo: "Símbolo em fundo branco",
      aspecto: ASPECTO.logo,
      resolucao: resolucaoDaPeca("logo"),
      origem: "derivada",
      prompt: "",
      fallbackSvg: ilustracaoDoNicho(nicho.id),
    },
    {
      chave: "logo-fundo-preto",
      papel: "logo",
      titulo: "Símbolo monocromático em fundo preto",
      aspecto: ASPECTO.logo,
      resolucao: resolucaoDaPeca("logo"),
      origem: "derivada",
      prompt: "",
      fallbackSvg: ilustracaoDoNicho(nicho.id),
    },
    /* o nome por extenso: é a que cabe na barra do menu, onde o símbolo sozinho
       não diz o nome de ninguém. Letra é desenhada, nunca gerada. */
    {
      chave: "logo-escrita",
      papel: "logo",
      titulo: "Nome por extenso",
      aspecto: ASPECTO.logo,
      resolucao: resolucaoDaPeca("logo"),
      origem: "desenhada",
      prompt: "",
      fallbackSvg: logoExtensoSvg(marca),
    },
    {
      chave: "favicon",
      papel: "logo",
      titulo: "Favicon",
      aspecto: ASPECTO.logo,
      resolucao: resolucaoDaPeca("logo"),
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
      resolucao: resolucaoDaPeca("banner-desktop"),
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
      resolucao: resolucaoDaPeca("banner-desktop"),
      origem: "gerada",
      /**
       * O PRODUTO primeiro, e o fundo depois — nesta ordem, e não por gosto.
       *
       * O pedido antigo abria com "o produto em close, com a textura do
       * material bem visível" e terminava em "fundo de papel envelhecido com
       * grão". Voltou uma foto de PAPEL: nenhum produto no quadro. Duas
       * menções a textura contra uma ao produto, e o modelo somou os votos.
       */
      prompt: [
        `${produto} em close, ocupando o centro do quadro.`,
        `Segunda cena da campanha de uma loja de ${produto}: só o produto, sem pessoas.`,
        "Produto CENTRALIZADO no quadro, com margem larga em volta: a mesma foto vai ser cortada larga no computador e alta no celular.",
        `Fundo liso e discreto na paleta ${cores}, sem textura que dispute com o produto.`,
        QUALIDADE,
        "Sem letras, sem logotipos, sem marca d'água.",
      ].join(" "),
      fallbackSvg: bannerSvg(marca, false),
    },
  ];

  /**
   * UMA CAPA POR COLEÇÃO, com o assunto da coleção dentro.
   *
   * A versão anterior gerava três cenas genéricas da marca e as fazia RODAR
   * entre as coleções. Com sete coleções e três fotos, a terceira volta a
   * aparecer na quarta vaga: a vitrine mostrava a mesma imagem duas vezes, e
   * "Alfaiataria" e "Promoções" ganhavam a mesma foto sem nenhuma relação com o
   * que cada uma vende.
   *
   * Agora o assunto sai do NOME que a pessoa escreveu. "Moda Fitness" pede uma
   * foto de moda fitness; "Bolsas" pede bolsa. É a única fonte que sabe o que
   * aquela coleção é, porque foi ela que a inventou.
   *
   * ## A variedade é calculada, não pedida
   *
   * Pedir "faça diferente" ao modelo devolve o mesmo enquadramento com outra
   * cor. Então o enquadramento é escolhido AQUI, por índice: a primeira capa é
   * um plano de conjunto, a segunda um close, a terceira uma cena com pessoa, e
   * assim por diante. Duas capas vizinhas nunca caem no mesmo tratamento, e o
   * resultado é estável — a mesma loja gerada de novo dá as mesmas escolhas.
   */
  const ENQUADRAMENTOS = [
    "plano de conjunto sobre superfície lisa, peças organizadas com respiro entre elas, luz difusa de estúdio",
    "close no detalhe e no acabamento, profundidade de campo curta, textura evidente",
    "uma pessoa real usando a peça em situação cotidiana, luz natural, fundo com pouca informação",
    "composição vista de cima, poucas peças bem espaçadas, sombra suave",
    "a peça no ambiente onde ela é usada, plano aberto, clima de fim de tarde",
    "peça única centralizada em fundo de cor sólida da marca, iluminação lateral marcada",
  ];

  colecoes.forEach((colecao, indice) => {
    const nome = colecao.trim();
    if (!nome) return;
    pecas.push({
      chave: `colecao-${indice + 1}`,
      papel: "colecao",
      titulo: `Capa da coleção: ${nome}`,
      aspecto: ASPECTO.colecao,
      resolucao: resolucaoDaPeca("colecao"),
      origem: "gerada",
      /**
       * O NOME DA COLEÇÃO abre o pedido, sozinho, e volta logo depois.
       *
       * Ele já estava no pedido antes, e mesmo assim a capa de "Colares" veio
       * com anéis e a de "Pulseiras" com bolsas. Não era falta de menção: era
       * peso. O pedido começava por "uma loja de semijoias, bijuterias e
       * acessórios de uso diário", e o modelo obedeceu ao que se repetia — a
       * loja — em vez da palavra que aparecia uma vez só.
       *
       * Agora o nicho entra CURTO (`produtoDoNicho`) e como contexto, depois
       * do assunto. Duas menções ao nome contra uma ao nicho.
       */
      prompt: [
        `${nome}.`,
        `Fotografia de campanha mostrando ${nome} de uma loja de ${produto}.`,
        `O que aparece na imagem é ${nome}, e nenhum outro tipo de produto.`,
        `Enquadramento: ${ENQUADRAMENTOS[indice % ENQUADRAMENTOS.length]}.`,
        `Paleta dominante: ${cores}.`,
        QUALIDADE,
        "Sem letras, sem logotipos e sem marca d'água.",
      ].join(" "),
      fallbackSvg: colecaoSvg(marca, nome, indice),
    });
  });

  return pecas;
}

/** O desenho local de uma peça, pronto para virar `<img src>` ou asset. */
export function fallbackDataUri(peca: PecaDeImagem): string {
  return logoDataUri(peca.fallbackSvg);
}
