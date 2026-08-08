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

export type PapelDaPeca = "logo" | "banner-desktop" | "banner-mobile" | "colecao";

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
const ASPECTO: Record<PapelDaPeca, string> = {
  logo: "square_1_1",
  "banner-desktop": "widescreen_16_9",
  "banner-mobile": "social_post_4_5",
  colecao: "square_1_1",
};

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

  const pecas: PecaDeImagem[] = [
    {
      chave: "logo",
      papel: "logo",
      titulo: "Símbolo da marca",
      aspecto: ASPECTO.logo,
      /* sem letra nenhuma: o nome entra depois, em tipografia de verdade */
      prompt: [
        `Símbolo de marca minimalista para uma loja de ${tema}.`,
        "Forma geométrica simples, cheia, vetorial, centralizada, fundo liso de cor única.",
        `Paleta: ${cores}.`,
        "Sem letras, sem palavras, sem números, sem marca d'água, sem sombra, sem gradiente complexo.",
      ].join(" "),
      fallbackSvg: ilustracaoDoNicho(nicho.id),
    },
    {
      chave: "banner-desktop",
      papel: "banner-desktop",
      titulo: "Banner do desktop",
      aspecto: ASPECTO["banner-desktop"],
      prompt: [
        `Fotografia publicitária de vitrine de ${tema}, para o topo de uma loja.`,
        `Paleta dominante: ${cores}.`,
        "Assunto à direita do quadro, metade esquerda limpa e desocupada para o texto entrar por cima.",
        "Luz natural suave, sem letras, sem logotipos, sem marca d'água.",
      ].join(" "),
      fallbackSvg: bannerSvg(marca, false),
    },
    {
      chave: "banner-mobile",
      papel: "banner-mobile",
      titulo: "Banner do celular",
      aspecto: ASPECTO["banner-mobile"],
      prompt: [
        `Fotografia publicitária de vitrine de ${tema}, em enquadramento vertical para celular.`,
        `Paleta dominante: ${cores}.`,
        "Assunto na metade de cima do quadro, metade de baixo limpa para o texto entrar por cima.",
        "Luz natural suave, sem letras, sem logotipos, sem marca d'água.",
      ].join(" "),
      fallbackSvg: bannerSvg(marca, true),
    },
  ];

  for (const [indice, nome] of colecoes.entries()) {
    pecas.push({
      chave: `colecao-${indice + 1}`,
      papel: "colecao",
      titulo: `Capa da coleção ${nome}`,
      aspecto: ASPECTO.colecao,
      prompt: [
        `Foto de capa para a coleção "${nome}" de uma loja de ${tema}.`,
        `Paleta dominante: ${cores}.`,
        "Produto único centralizado sobre fundo liso, luz de estúdio, sem letras e sem marca d'água.",
      ].join(" "),
      fallbackSvg: colecaoSvg(marca, nome, indice),
    });
  }

  return pecas;
}

/** O desenho local de uma peça, pronto para virar `<img src>` ou asset. */
export function fallbackDataUri(peca: PecaDeImagem): string {
  return logoDataUri(peca.fallbackSvg);
}
