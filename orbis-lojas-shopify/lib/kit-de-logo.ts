/**
 * O KIT DE LOGO da marca: extenso, monograma, favicon, fundos e rede social.
 *
 * Por que DESENHADO e não gerado por IA
 * -------------------------------------
 * A peça "logo" pedida ao gerador voltava foto de produto — um frasco, uma
 * bolsa — porque é o que um modelo de imagem faz bem. E mesmo quando acertava o
 * símbolo, vinha num PNG quadrado com fundo pintado dentro do arquivo, que no
 * cabeçalho vira um retângulo colado sobre a página.
 *
 * Logo é geometria e cor, e o `CLAUDE.md` é explícito: "cor, geometria,
 * recorte, máscara, escala e exportação são calculados, nunca gerados". Aqui
 * todas as peças saem de vetor, do nome e da paleta da marca. O resultado é
 * exato, reproduzível, com fundo transparente de verdade e do tamanho que se
 * pedir.
 *
 * Os nomes de arquivo são estáveis de propósito: é o que permite automatizar a
 * subida depois sem adivinhar nada.
 */

export type MarcaDoKit = {
  name: string;
  primaryColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  headingFont?: string;
};

export type PecaDoKit = {
  /** Nome do arquivo SEM extensão: estável, para automação. */
  arquivo: string;
  titulo: string;
  /** Para que serve, em uma linha — vai no leia-me do pacote. */
  uso: string;
  largura: number;
  altura: number;
  svg: string;
};

const CLARO = "#ffffff";
const ESCURO = "#101010";

/** As seis formas do monograma, na ordem em que aparecem no kit. */
export const FORMAS_DE_MONOGRAMA = ["circulo", "hexagono", "escudo", "losango", "arco", "moldura"] as const;
export type FormaDeMonograma = (typeof FORMAS_DE_MONOGRAMA)[number];

function escapar(valor: string): string {
  return String(valor ?? "").replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string,
  );
}

/**
 * Iniciais: DUAS letras, que é o que cabe num monograma legível.
 *
 * Marca de uma palavra só ("Volare") dava uma letra sozinha, e uma letra
 * sozinha num círculo não é monograma, é inicial de caderno. Nesse caso valem
 * as duas primeiras letras da palavra.
 */
export function iniciaisDe(nome: string): string {
  const partes = String(nome ?? "").split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "O";
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes.slice(0, 2).map((p) => p[0]).join("");
  return (letras || "O").toUpperCase();
}

/** Luminância relativa, na definição da WCAG. */
function luminancia(cor: string): number {
  const hex = String(cor ?? "").replace("#", "");
  if (hex.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Preto ou branco sobre a cor — o que CONTRASTA mais, medido.
 *
 * Antes era um limiar de brilho ("mais claro que 0,45 recebe preto"), e limiar
 * erra no meio da escala: um amarelo de marca (#c9a227) dá 0,38 e recebia texto
 * BRANCO, que sobre amarelo quase não se lê. Comparar as duas razões de
 * contraste e escolher a maior não tem meio: é sempre a melhor das duas.
 */
export function textoSobre(cor: string): string {
  const l = luminancia(cor);
  const contraste = (outra: number) => (Math.max(l, outra) + 0.05) / (Math.min(l, outra) + 0.05);
  return contraste(luminancia(ESCURO)) >= contraste(luminancia(CLARO)) ? ESCURO : CLARO;
}

/** O desenho da forma, num quadro 120×120. */
function formaSvg(forma: FormaDeMonograma, primaria: string, destaque: string): string {
  return {
    circulo: `<circle cx="60" cy="60" r="42" fill="${primaria}"/><circle cx="60" cy="60" r="42" fill="none" stroke="${destaque}" stroke-width="4"/>`,
    hexagono: `<path d="M60 14 102 38v44L60 106 18 82V38z" fill="${primaria}"/><path d="M60 14 102 38v44L60 106 18 82V38z" fill="none" stroke="${destaque}" stroke-width="4"/>`,
    escudo: `<path d="M60 16 104 34v34c0 22-19 33-44 40C35 101 16 90 16 68V34z" fill="${primaria}"/>`,
    losango: `<rect x="24" y="24" width="72" height="72" rx="10" transform="rotate(45 60 60)" fill="${primaria}"/>`,
    arco: `<path d="M18 96a42 42 0 0 1 84 0z" fill="${primaria}"/><rect x="18" y="96" width="84" height="8" fill="${destaque}"/>`,
    moldura: `<rect x="18" y="18" width="84" height="84" fill="none" stroke="${primaria}" stroke-width="8"/><rect x="34" y="34" width="52" height="52" fill="${destaque}"/>`,
  }[forma];
}

/**
 * A pilha de fontes do texto.
 *
 * A família da marca vai na frente, mas SEMPRE com reserva: um SVG aberto fora
 * do navegador (ou num Shopify que não carregou a fonte) tem de continuar
 * legível em vez de cair numa fonte qualquer do sistema.
 */
function pilhaDeFonte(marca: MarcaDoKit): string {
  const familia = String(marca.headingFont ?? "").trim();
  const reserva = "Georgia, 'Times New Roman', serif";
  return familia ? `'${escapar(familia)}', ${reserva}` : reserva;
}

function moldura(largura: number, altura: number, fundo: string | null, corpo: string, titulo: string): string {
  const pintura = fundo ? `<rect width="${largura}" height="${altura}" fill="${fundo}"/>` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img">`,
    `<title>${escapar(titulo)}</title>`,
    pintura,
    corpo,
    "</svg>",
  ].join("");
}

/**
 * Onde as letras pousam dentro de cada forma.
 *
 * Nem toda forma é centrada no quadro. O `arco` é meia-lua na METADE DE BAIXO
 * (de y=54 a y=96), e com o texto no centro do quadro as letras flutuavam FORA
 * do desenho — parecia defeito. Cada forma diz onde tem massa.
 */
const CENTRO_DA_FORMA: Record<FormaDeMonograma, number> = {
  circulo: 60,
  hexagono: 60,
  escudo: 58,
  losango: 60,
  arco: 78,
  moldura: 60,
};

/** O monograma sozinho, escalado para o quadro pedido. */
function monograma(marca: MarcaDoKit, forma: FormaDeMonograma, lado: number, fundo: string | null): string {
  const primaria = marca.primaryColor || "#1f2937";
  const destaque = marca.accentColor || primaria;
  const escala = lado / 120;
  /* na moldura as letras pousam sobre o quadrado de destaque, não sobre a
     primária: a cor tem de ser a que contrasta com o que está EMBAIXO delas */
  const corDoTexto = forma === "moldura" ? textoSobre(destaque) : textoSobre(primaria);
  const corpo =
    `<g transform="scale(${escala})">${formaSvg(forma, primaria, destaque)}` +
    `<text x="60" y="${CENTRO_DA_FORMA[forma]}" text-anchor="middle" dominant-baseline="central" font-family="${pilhaDeFonte(marca)}" font-size="${forma === "arco" ? 26 : 34}" font-weight="700" fill="${corDoTexto}">${escapar(iniciaisDe(marca.name))}</text></g>`;
  return moldura(lado, lado, fundo, corpo, `${marca.name}: monograma`);
}

/** O nome por extenso, em tipografia. Sem símbolo: é a versão que se lê. */
function extenso(marca: MarcaDoKit, fundo: string | null, corDoTexto: string): string {
  const largura = 1200;
  const altura = 300;
  /* o corpo da letra cai conforme o nome cresce, para o texto não encostar na
     borda — 22 caracteres é onde a fonte de 96 ainda cabe em 1200 */
  const nome = String(marca.name ?? "").trim() || "Minha Marca";
  const corpoDaLetra = Math.max(38, Math.min(96, Math.floor(1040 / Math.max(nome.length, 1) * 2.1)));
  const texto =
    `<text x="${largura / 2}" y="${altura / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${pilhaDeFonte(marca)}" font-size="${corpoDaLetra}" font-weight="700" letter-spacing="1" fill="${corDoTexto}">${escapar(nome)}</text>`;
  return moldura(largura, altura, fundo, texto, `${marca.name}: logo por extenso`);
}

/**
 * O kit inteiro.
 *
 * Transparente é o padrão de toda peça de logo: fundo pintado dentro do arquivo
 * é o defeito que este módulo existe para não repetir. As versões com fundo
 * branco e preto existem porque alguns lugares exigem (anúncio, marketplace,
 * documento), e aí é melhor a gente escolher a cor do que deixar o serviço
 * escolher.
 */
/**
 * O nome por extenso, fundo transparente.
 *
 * Exportado porque a geração de imagens da loja usa exatamente esta peça: letra
 * pedida a um gerador volta torta e com caractere inventado, e o nome da loja
 * de alguém não pode sair escrito errado. Uma definição só, usada nos dois
 * lugares, para o kit entregue e a tela de geração nunca discordarem.
 */
export function logoExtensoSvg(marca: MarcaDoKit): string {
  return extenso(marca, null, marca.primaryColor || "#1f2937");
}

/**
 * O nome por extenso sobre fundo claro ou escuro.
 *
 * As três versões (transparente, clara, escura) saem do MESMO desenho, com a
 * cor do texto escolhida por contraste medido. É o que garante que sejam a
 * mesma marca em três situações, e não três marcas.
 */
export function extensoEmFundo(marca: MarcaDoKit, tom: "claro" | "escuro"): string {
  const fundo = tom === "claro" ? CLARO : ESCURO;
  return extenso(marca, fundo, textoSobre(fundo));
}

/** O favicon do kit: mesma forma e mesma cor que o pacote entrega. */
export function faviconSvg(marca: MarcaDoKit): string {
  const primaria = marca.primaryColor || "#1f2937";
  return monograma(marca, "circulo", 512, primaria === CLARO ? ESCURO : null);
}

/**
 * O kit da marca: QUATRO logos e um favicon. Nem um arquivo a mais.
 *
 * Eram dezessete peças — seis formas de monograma, três lockups horizontais,
 * três por extenso, duas de rede social. A intenção era dar escolha; o efeito
 * era a marca em um monte de modelos, e quem abre a pasta não sabe qual é a
 * logo. Marca não se entrega em catálogo de opções: se entrega decidida.
 *
 * Os cinco arquivos são os da referência que o dono apontou, com os mesmos
 * papéis: a versão principal de fundo transparente, a de fundo claro, a de
 * fundo escuro, o nome por extenso para o cabeçalho e o ícone da aba.
 */
export function kitDeLogo(marca: MarcaDoKit): PecaDoKit[] {
  return [
    { arquivo: "logotipo", titulo: "Logotipo", uso: "A versão principal, fundo transparente. É esta que vai na maioria dos lugares.", largura: 1024, altura: 1024, svg: monograma(marca, "circulo", 1024, null) },
    { arquivo: "logotipo-fundo-branco", titulo: "Fundo branco", uso: "Onde o fundo é claro ou exigem cor sólida atrás.", largura: 1024, altura: 1024, svg: monograma(marca, "circulo", 1024, CLARO) },
    { arquivo: "logotipo-fundo-preto", titulo: "Fundo preto", uso: "Peça escura, modo noturno e impressão em uma cor.", largura: 1024, altura: 1024, svg: monograma(marca, "circulo", 1024, ESCURO) },
    /* o nome por extenso: é a que cabe na barra do menu, onde o símbolo
       sozinho não diz o nome de ninguém */
    { arquivo: "menu", titulo: "Nome por extenso", uso: "O nome da loja escrito, para o cabeçalho e o menu.", largura: 1200, altura: 300, svg: logoExtensoSvg(marca) },
    /* favicon: 512 é o que a Shopify pede, e o mesmo arquivo serve de 16 a 512 */
    { arquivo: "favicon", titulo: "Favicon", uso: "O ícone da aba do navegador. Vai em Tema > Configurações > Favicon.", largura: 512, altura: 512, svg: faviconSvg(marca) },
  ];
}

/** O SVG como data URI, pronto para `<img src>` e para virar arquivo. */
export function comoDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
