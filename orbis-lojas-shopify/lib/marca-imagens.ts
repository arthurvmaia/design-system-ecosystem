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
 * A PALETA veste o cenário, nunca o produto.
 *
 * Pedir a paleta como a cor QUE DOMINA a imagem fazia o modelo pintar tudo:
 * medido numa loja de fitness, voltou uma bancada com halteres verdes, garrafa
 * verde e caixa verde — produto que não existe, numa foto que parece filtro.
 * A cor da marca é do fundo, do apoio e da luz; o produto mantém a cor real
 * dele, senão a loja mostra uma mercadoria que ninguém vai receber.
 */
const PALETA_NO_CENARIO = "As cores da marca ficam no fundo, nos apoios e na luz; cada produto mantém as cores reais dele.";

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

/**
 * NOMES DE PRATELEIRA: dizem quando o produto chegou ou por quanto ele sai —
 * nunca o que ele é.
 *
 * O pedido da capa usa o nome da coleção como ASSUNTO da foto, e isso funciona
 * enquanto o nome for uma coisa fotografável: "Smartwatches", "Colares",
 * "Cozinha". Para "Lançamentos" e "Ofertas" não existe objeto, então o modelo
 * fotografa o que a palavra sugere — a LOJA. Medido numa loja de relógios:
 * "Lançamentos" voltou como uma vitrine iluminada e "Ofertas" como uma fachada
 * com uma placa escrita "Offetas", letreiro inventado apesar do "sem letras"
 * no pedido. As outras quatro coleções, todas com nome de produto, vieram
 * certas — o defeito é do nome, não do gerador.
 *
 * E não é caso isolado: TODOS os dez nichos do catálogo terminam em nomes
 * assim, e as coleções neutras são quatro deles. Sem isto, toda loja criada
 * pelo app ganha uma ou duas capas de fachada no meio das capas de produto.
 */
const NOMES_DE_PRATELEIRA = new Set([
  "novidades", "novidade", "lancamentos", "lancamento", "ofertas", "oferta",
  "promocoes", "promocao", "mais vendidos", "queridinhos", "destaques", "destaque",
  "ultimas pecas", "ultimas unidades", "todos os produtos", "outlet",
  "liquidacao", "black friday", "saldao", "super ofertas", "achados",
]);

/** O critério, exportado: quem verifica pergunta à mesma fonte que decide. */
export function nomeDePrateleira(nome: string): boolean {
  return NOMES_DE_PRATELEIRA.has(semAcento(nome));
}

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * O ASSUNTO da capa: o nome quando ele é produto, o produto quando ele é
 * prateleira.
 *
 * A prateleira não desaparece do resultado — ela continua mandando no
 * ENQUADRAMENTO, que é escolhido pelo índice. O que muda é o objeto: a capa de
 * "Ofertas" de uma relojoaria passa a mostrar relógios, como as vizinhas.
 *
 * Sem nicho escolhido (marca própria) o app não sabe o que a loja vende, e aí
 * o assunto é emprestado de uma coleção IRMÃ que tenha nome de produto. Não
 * havendo nenhuma, o nome fica — inventar um produto que a loja talvez não
 * venda é pior que uma foto genérica, e para esse caso resta a linha que
 * proíbe fachada e letreiro.
 */
function assuntoDaCapa(nome: string, colecoes: readonly string[], produto: string, temNicho: boolean): string {
  if (!nomeDePrateleira(nome)) return nome;
  if (temNicho) return produto;
  const irma = colecoes.find((outra) => outra.trim() && !nomeDePrateleira(outra));
  return irma?.trim() ?? nome;
}

/**
 * A capa é do PRODUTO, não do ponto de venda.
 *
 * Vale para todas, e não só para as de prateleira: qualquer enquadramento de
 * plano aberto pode escorregar para uma fachada. Proíbe a vitrine e o
 * letreiro, e não a pessoa comprando — essa cena é legítima e é a que o
 * enquadramento de "situação cotidiana" pede.
 */
const SEM_PONTO_DE_VENDA = "A imagem é do produto, não do ponto de venda: sem fachada de loja, sem vitrine e sem letreiro.";

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
  /* o assunto CONCRETO das duas cenas de campanha: "artigos de treino" não é
     objeto, e pedir foto dele devolveu um retângulo verde. Ver `cenas` em
     `marca-generator.mjs`. */
  const cenaComPessoa = nicho.cenas?.pessoa || `uma pessoa usando ${produto}`;
  const cenaDeProduto = nicho.cenas?.produto || produto;
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
        `${cenaComPessoa}, em atitude natural.`,
        /* o nicho entra CURTO, como contexto: a descrição larga ("equipamentos,
           acessórios e roupa de treino") disputa com o assunto e já roubou uma
           capa uma vez — ver `produtoDoNicho` */
        `Fotografia editorial de campanha de uma loja de ${produto}.`,
        `Fundo de papel texturizado em tom quente, na paleta ${cores}, com bastante ar em volta.`,
        "Pessoa CENTRALIZADA no quadro, com margem larga dos dois lados e em cima: a mesma foto vai ser cortada larga no computador e alta no celular.",
        QUALIDADE,
        PALETA_NO_CENARIO,
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
        `${cenaDeProduto}, em close.`,
        `Segunda cena da campanha de uma loja de ${produto}: só o produto, sem pessoas.`,
        "O produto OCUPA a maior parte do quadro, centralizado, com uma margem que sobre para o corte: a mesma foto vai ser cortada larga no computador e alta no celular.",
        `Fundo liso na paleta ${cores}, discreto atrás do produto.`,
        QUALIDADE,
        PALETA_NO_CENARIO,
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
  /**
   * ## E a capa não repete o banner
   *
   * O dono abriu a loja e disse: as capas de coleção estão saindo iguais ao
   * banner. Estavam mesmo, e o motivo estava escrito aqui — três dos seis
   * enquadramentos eram os do banner: "close no detalhe" é o banner 2, "uma
   * pessoa real usando a peça" é o banner 1, e "peça única em fundo de cor
   * sólida" é o banner 2 de novo. Mesma linguagem, mesma cara, e a página
   * inteira parecendo uma campanha repetida seis vezes.
   *
   * Agora as duas famílias falam línguas diferentes de propósito:
   *
   * - **banner é CENA**: gente, ar em volta, clima, plano aberto.
   * - **capa é CATÁLOGO**: bancada, vista de cima, sem gente, produto inteiro.
   *
   * O que as mantém da mesma casa é a luz e a paleta, não a composição — é
   * assim que uma loja de verdade combina a campanha com a grade de coleções
   * sem repetir a foto.
   */
  const ENQUADRAMENTOS = [
    "vista de cima sobre bancada lisa, peças alinhadas com respiro entre elas, sombra curta",
    "peça única sobre um pedestal baixo, luz lateral suave, fundo liso",
    "três peças escalonadas em profundidade, a da frente nítida e as de trás desfocadas",
    "peças arrumadas numa prateleira de madeira clara, plano frontal e reto",
    "peça apoiada sobre tecido dobrado, câmera um pouco acima, luz de janela",
    "conjunto visto de cima em fundo de cor sólida da marca, peças em leque",
  ];

  colecoes.forEach((colecao, indice) => {
    const nome = colecao.trim();
    if (!nome) return;
    const assunto = assuntoDaCapa(nome, colecoes, produto, Boolean(marca.nicheId));
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
        `${assunto}.`,
        /* "catálogo" e não "campanha": é a palavra que separa esta família da
           do banner, e ela vale mais que qualquer lista de proibições */
        `Fotografia de catálogo mostrando ${assunto} de uma loja de ${produto}.`,
        `O que aparece na imagem é ${assunto}, e nenhum outro tipo de produto.`,
        `Enquadramento: ${ENQUADRAMENTOS[indice % ENQUADRAMENTOS.length]}.`,
        "Sem pessoas no quadro.",
        /* "do cenário" e não "dominante": dominante é a palavra que mandava o
           modelo pintar o produto inteiro na cor da marca */
        `Paleta do cenário: ${cores}.`,
        QUALIDADE,
        PALETA_NO_CENARIO,
        "Sem letras, sem logotipos e sem marca d'água.",
        SEM_PONTO_DE_VENDA,
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
