/**
 * Aplica uma marca gerada sobre um tema Shopify importado — qualquer um.
 *
 * O estúdio aceita ZIP de tema arbitrário, então isto não pode conhecer nomes
 * de setting de nenhum tema específico. O que existe em todo tema é o SCHEMA:
 * `settings_schema.json` diz o tipo de cada campo (`color`, `color_background`,
 * `font_picker`, `text`…) e o rótulo diz o papel. É daí que sai a decisão.
 *
 * ## As regras, e por que elas
 *
 * 1. **Esquemas de cor primeiro.** Temas Dawn e derivados pintam a loja inteira
 *    pelos `color_schemes`; mexer só nas cores soltas deixa a loja igual. Cada
 *    esquema mantém seu caráter (claro continua claro, escuro continua escuro) e
 *    é reconstruído a partir da marca.
 * 2. **Cor solta pelo papel.** `background`, `text`, `button`/`accent`, `border`
 *    aparecem no id ou no rótulo em praticamente todo tema, em inglês ou não.
 * 3. **Fonte por papel.** `heading`/`title`/`header` recebe a fonte de título; o
 *    resto recebe a de corpo.
 * 4. **Texto só quando é seguro.** O nome da marca entra em campos de marca/logo
 *    sempre. Título e texto de seção só são trocados quando ainda estão vazios
 *    ou iguais ao padrão do schema — o texto que o tema trouxe pronto é bom, e
 *    sobrescrevê-lo cegamente piora a loja.
 *
 * O tema de origem não é tocado: a função devolve uma cópia. Puro e testável.
 */
import { misturar, textoSobre } from "./marca-generator.mjs";
import type { ShopifySettingDefinition, ShopifyThemeImport, ShopifyValue } from "./shopify-theme";
import { sortearVitrine } from "./sorteio-de-vitrine";

export type MarcaAplicavel = {
  name: string;
  /**
   * A semente desta marca — a mesma que desenhou a logo e sorteou a paleta.
   *
   * Aqui ela decide também a ORDEM da home: duas lojas do mesmo tema deixam de
   * ser a mesma loja. Ver `sorteio-de-vitrine.ts`. Faltando, o nome da marca
   * serve de semente: toda loja tem nome, e ele já distingue um cliente do
   * outro.
   */
  semente?: string;
  slogan?: string;
  description?: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  collections?: string[];
  announcement?: string;
  /**
   * URL de cada peça de imagem, por chave (`logo`, `banner-desktop`,
   * `banner-mobile`, `colecao-1`…). Vem do provedor de IA quando o cliente
   * pediu, ou do desenho local quando não.
   */
  imagens?: Record<string, string>;
  /**
   * Quais chaves de `imagens` a Orbis GEROU (em oposição às que o cliente
   * enviou).
   *
   * Existe por causa do logo: arte gerada não pode ocupar o campo de logo do
   * tema, porque vem com fundo quadrado próprio e o cabeçalho fica com um
   * retângulo colado sobre a página. O logo do CLIENTE, esse sim, entra. Sem
   * esta lista as duas coisas chegam iguais aqui e não há como escolher.
   *
   * Ausente = nada foi gerado, que é o caso de quem trouxe a própria marca.
   */
  imagensGeradas?: string[];
};

export type ResultadoDaMarca = {
  theme: ShopifyThemeImport;
  /** Ids de setting alterados, para a tela de revisão dizer o que mudou. */
  alterados: string[];
  /** O que a Shopify recusaria; vazio é o esperado. Ver `violacoesDoTema`. */
  violacoes: string[];
};

const PAPEL_FUNDO = /(background|bg|fundo|canvas|surface|page.?color)/i;
const PAPEL_TEXTO = /(text|foreground|heading.?color|title.?color|body.?color|texto|label.?color)/i;
const PAPEL_DESTAQUE = /(accent|button|primary|brand|cta|highlight|link|destaque|solid)/i;
const PAPEL_BORDA = /(border|divider|stroke|linha)/i;
/* "solid_button_labels" é o texto EM CIMA do botão, não o botão: pintar de
   destaque some com a legenda. Rótulo vem antes de qualquer outra regra. */
const PAPEL_ROTULO = /label/i;
const BOTAO_VAZADO = /(outline|secondary|ghost|vazado)/i;
const PAPEL_TITULO = /(head(ing|er)|title|display|logo|titulo)/i;
const IMAGEM_DE_LOGO = /(logo|favicon|brand.?image|marca)/i;
const IMAGEM_DE_CELULAR = /(mobile|celular|small|portrait|phone)/i;
const CAMPO_DE_MARCA = /(shop.?name|store.?name|brand|logo.?text|site.?title|nome.?da.?loja|marca)/i;
const CAMPO_DE_AVISO = /(announce|aviso|bar.?text|topbar)/i;
/**
 * Subtítulo NÃO é título.
 *
 * `PAPEL_TITULO` casa `head(ing|er)`, e `subheading` contém "heading" — então o
 * subtítulo recebia o mesmo slogan do título e o banner saía com a frase
 * escrita duas vezes, uma grande e outra miúda logo abaixo. Precisa ser testado
 * ANTES do título, senão perde para ele de novo.
 */
const CAMPO_DE_SUBTITULO = /(sub.?(heading|title)|subtitulo|caption|legenda|tagline)/i;
/**
 * Rótulo de botão é RÓTULO: duas ou três palavras.
 *
 * A regra de sobra enfiava a descrição da marca em todo campo de texto que
 * restasse, e `button_label` é um deles — o banner saía com um botão contendo
 * um parágrafo inteiro dentro da borda. Precisa ser pego antes da sobra.
 */
const CAMPO_DE_BOTAO = /(button.?(label|text)|cta|botao|call.?to.?action|link.?label)/i;
/**
 * Campos que pedem texto FUNCIONAL, não o slogan da marca.
 *
 * "Assine nossa newsletter" e "Links rápidos" são rótulos de função: o tema já
 * traz a frase certa e ela serve a qualquer loja. Escrever o slogan ali fazia o
 * rodapé abrir com a mesma frase da marca duas vezes, uma como título de lista
 * e outra como chamada de e-mail — repetição que parece defeito porque é.
 */
const CAMPO_FUNCIONAL = /(newsletter|link.?list|menu|quick.?links|social|assinar|inscri)/i;
/**
 * A chamada, curta, em português.
 *
 * O padrão do Dawn é "Button label", que sai em inglês na loja publicada. Não é
 * conteúdo inventado: é rótulo de interface, e botão sem rótulo é pior que
 * botão com rótulo genérico. Quem tiver coleção vai para ela; o resto convida a
 * ver a loja.
 */
function rotuloDeBotao(destino: unknown): string {
  return typeof destino === "string" && /collection/i.test(destino) ? "Ver a coleção" : "Ver a loja";
}
const CAMPO_DE_LISTA = /(collection_list|link_list|menu)/i;
/**
 * As artes de banner, em ordem: `banner-1`, `banner-2`, …
 *
 * Uma lista, e não uma chave só, porque um tema pode ter mais de uma dobra de
 * banner, e repetir a mesma foto em todas faz a loja parecer quebrada.
 *
 * A MESMA lista serve o desktop e o celular, de propósito: cada dobra tem UMA
 * arte, e o que muda entre os dois é o corte, que quem faz é o tema. Quando
 * eram duas gerações separadas, o computador abria uma campanha e o telefone
 * abria outra — outra pessoa, outra roupa, outro fundo.
 *
 * As chaves antigas (`banner-desktop`, `banner-mobile-2`) continuam sendo
 * lidas: elas estão nas lojas que já foram entregues.
 */
function pecasDeBanner(imagens: Record<string, string>, papel: string): string[] {
  /**
   * O banner do celular é o ARQUIVO do celular, quando ele existe.
   *
   * A arte de cada dobra é composta duas vezes, uma por formato: 3000×1000 e
   * 1080×1350, da mesma foto. O corte e a escrita são decididos na composição,
   * então mandar o arquivo largo para o campo do celular jogaria fora
   * exatamente o trabalho que faz o texto caber lá.
   */
  const doCelular = /mobile|celular/i.test(papel);
  const compostas = Object.keys(imagens)
    .filter((chave) => (doCelular ? /^banner-\d+-mobile$/ : /^banner-\d+$/).test(chave))
    .sort();
  if (compostas.length) return compostas.map((chave) => imagens[chave]);
  const daArte = Object.keys(imagens).filter((chave) => /^banner-\d+$/.test(chave)).sort();
  if (daArte.length) return daArte.map((chave) => imagens[chave]);
  const numeradas = Object.keys(imagens)
    .filter((chave) => chave === papel || chave.startsWith(`${papel}-`))
    .sort();
  return numeradas.map((chave) => imagens[chave]);
}

/** O select que decide a altura da dobra: `slide_height` no slideshow, `image_height` no banner. */
const ALTURA_DE_BANNER = /^(slide_height|image_height|banner_height|height)$/i;
/** Só em seção de dobra do topo: em cartão ou galeria a altura adaptativa é o certo. */
const SECAO_DE_BANNER = /(slideshow|image.?banner|hero|banner)/i;
/**
 * A dobra que RECEBE a frase, contada como as fotos são contadas: 0 é a
 * primeira, 1 é a segunda.
 *
 * A primeira dobra é a foto e mais nada — é a regra do dono. A segunda é a que
 * ele pediu com frase, e é a mesma dobra que recebe a arte `banner-2`, porque
 * o índice que escolhe a foto é este. Texto e foto casam por construção.
 */
const DOBRA_COM_FRASE = 1;

/**
 * A ARTE daquela dobra, pelo mesmo índice.
 *
 * Quem compõe a arte (o fluxo do cliente) e quem cala o tema (aqui) precisam
 * concordar sobre QUAL dobra leva a frase. Duas constantes separadas
 * concordam até alguém mexer numa delas, e aí o texto sai assado numa foto e
 * digitado sobre outra.
 */
export const ARTE_DA_DOBRA_COM_FRASE = `banner-${DOBRA_COM_FRASE + 1}`;

/**
 * As famílias que o `font_picker` da Shopify aceita.
 *
 * A lista existe porque o campo NÃO é uma caixa de texto: ele só conhece a
 * biblioteca da Shopify. Uma família de fora (Google Fonts qualquer) é gravada
 * no settings_data e depois ignorada na loja — a tipografia da marca some sem
 * nenhum aviso, que foi exatamente o que aconteceu com "Cormorant Garamond" e
 * "Baloo 2". Aqui ficam só as que existem lá, com o substituto mais próximo
 * para o que a pessoa digitar à mão.
 */
export const FONTES_SHOPIFY = Object.freeze([
  "Abel", "Alegreya", "Alegreya Sans", "Anton", "Archivo", "Archivo Black", "Archivo Narrow",
  "Arvo", "Asap", "Assistant", "Barlow", "Barlow Condensed", "Bebas Neue", "Bitter", "Cabin",
  "Cardo", "Catamaran", "Chakra Petch", "Chivo", "Comfortaa", "Cormorant", "Crimson Text",
  "DM Sans", "DM Serif Display", "DM Serif Text", "Domine", "EB Garamond", "Epilogue", "Figtree",
  "Fira Sans", "Fraunces", "Fredoka", "Geist", "IBM Plex Sans", "IBM Plex Serif", "Inter",
  "Josefin Sans", "Jost", "Karla", "Lato", "Libre Baskerville", "Lora", "Manrope", "Marcellus",
  "Merriweather", "Montserrat", "Noto Sans", "Noto Serif", "Nunito", "Nunito Sans", "Open Sans",
  "Oswald", "Outfit", "PT Sans", "PT Serif", "Playfair Display", "Plus Jakarta Sans", "Poppins",
  "Questrial", "Quicksand", "Rajdhani", "Raleway", "Red Hat Display", "Roboto", "Roboto Condensed",
  "Roboto Slab", "Rubik", "Saira", "Source Sans Pro", "Source Serif 4", "Space Grotesk", "Syne",
  "Tenor Sans", "Titillium Web", "Ubuntu", "Urbanist", "Work Sans", "Young Serif", "Zilla Slab",
]);

const FONTES_POR_NOME = new Map(FONTES_SHOPIFY.map((familia) => [familia.toLowerCase(), familia]));
const PARECE_SERIF = /(serif|garamond|baskerville|playfair|lora|cormorant|georgia|times|didot|bodoni)/i;

/**
 * A família mais próxima que existe na Shopify.
 *
 * Casa pelo nome; não achando, tenta a primeira palavra ("Cormorant Garamond"
 * vira "Cormorant"); e em último caso devolve uma da mesma natureza, para o
 * texto não voltar à fonte de fábrica do tema.
 */
export function familiaSuportada(familia: string): string {
  const nome = String(familia ?? "").trim();
  if (!nome) return "Inter";
  const exata = FONTES_POR_NOME.get(nome.toLowerCase());
  if (exata) return exata;
  const primeira = FONTES_POR_NOME.get(nome.split(/\s+/)[0].toLowerCase());
  if (primeira) return primeira;
  return PARECE_SERIF.test(nome) ? "Lora" : "Inter";
}

/** `Playfair Display` → `playfair_display_n4`, o formato que o tema guarda. */
export function handleDeFonte(familia: string, peso = 4, italico = false): string {
  const base = familiaSuportada(familia)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "assistant"}_${italico ? "i" : "n"}${peso}`;
}

function ehEscuro(cor: string): boolean {
  return textoSobre(cor) === "#ffffff";
}

/** As quatro cores de um esquema, derivadas da marca e do caráter do esquema. */
function esquemaDaMarca(marca: MarcaAplicavel, escuro: boolean) {
  const destaque = marca.accentColor || marca.primaryColor;
  const fundo = escuro ? misturar(marca.primaryColor, "#000000", 0.82) : marca.backgroundColor;
  const texto = textoSobre(fundo);
  return {
    background: fundo,
    text: texto,
    button: destaque,
    button_label: textoSobre(destaque),
    secondary_button_label: destaque,
    shadow: misturar(marca.primaryColor, "#000000", 0.7),
    border: misturar(fundo, texto, 0.18),
  };
}

type PapelDeCor = "fundo" | "texto" | "destaque" | "borda" | "rotulo-solido" | "rotulo-vazado";

function papelDaCor(definicao: ShopifySettingDefinition): PapelDeCor | null {
  const pista = `${definicao.id} ${definicao.label ?? ""}`;
  if (PAPEL_ROTULO.test(pista) && PAPEL_DESTAQUE.test(pista)) {
    return BOTAO_VAZADO.test(pista) ? "rotulo-vazado" : "rotulo-solido";
  }
  /* borda antes de fundo: "border_background" existe e é borda */
  if (PAPEL_BORDA.test(pista)) return "borda";
  if (PAPEL_TEXTO.test(pista)) return "texto";
  if (PAPEL_DESTAQUE.test(pista)) return "destaque";
  if (PAPEL_FUNDO.test(pista)) return "fundo";
  return null;
}

function corParaPapel(marca: MarcaAplicavel, papel: PapelDeCor): string {
  const destaque = marca.accentColor || marca.primaryColor;
  if (papel === "fundo") return marca.backgroundColor;
  if (papel === "texto") return textoSobre(marca.backgroundColor);
  if (papel === "destaque") return destaque;
  if (papel === "rotulo-solido") return textoSobre(destaque);
  if (papel === "rotulo-vazado") return destaque;
  return misturar(marca.backgroundColor, textoSobre(marca.backgroundColor), 0.16);
}

/** Percorre as definições de um schema achatando os grupos com `children`. */
function achatar(definicoes: ShopifySettingDefinition[]): ShopifySettingDefinition[] {
  const saida: ShopifySettingDefinition[] = [];
  for (const definicao of definicoes) {
    saida.push(definicao);
    if (definicao.children?.length) saida.push(...achatar(definicao.children));
  }
  return saida;
}

function ehRecord(valor: unknown): valor is Record<string, ShopifyValue> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * Devolve o tema com a marca aplicada e a lista do que mudou.
 *
 * `handleDeColecao` existe porque a coleção do cliente ainda não tem handle
 * real: o nome vira handle, e é isso que o tema usa nos menus e nas listas.
 */
export function aplicarMarcaNoTema(original: ShopifyThemeImport, marca: MarcaAplicavel): ResultadoDaMarca {
  const theme = JSON.parse(JSON.stringify(original)) as ShopifyThemeImport;
  const alterados: string[] = [];
  const marcou = (id: string) => { if (!alterados.includes(id)) alterados.push(id); };

  const definicoes = achatar(theme.globalGroups.flatMap((grupo) => grupo.settings));
  const valores = theme.globalValues;
  /**
   * Só imagem de verdade entra em setting de tema.
   *
   * O `image_picker` da Shopify espera uma referência de arquivo. Gravar um
   * data URI ali derruba o template inteiro: foi assim que a home de uma loja
   * publicada virou 404, porque a arte local (SVG) foi escrita crua no
   * `templates/index.json`. A arte da Orbis serve à prévia; o tema recebe só o
   * que o cliente enviou ou o provedor gerou.
   */
  const ehImagemDeVerdade = (valor: string) => /^(\/api\/media\/[0-9a-fA-F-]{16,64}|shopify:\/\/)/.test(valor);
  const imagens: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(marca.imagens ?? {})) {
    if (typeof valor === "string" && ehImagemDeVerdade(valor)) imagens[chave] = valor;
  }
  const geradasPelaOrbis = new Set(marca.imagensGeradas ?? []);
  /**
   * O SÍMBOLO GERADO pode ocupar o campo de logo do tema — desde que já venha
   * recortado. E hoje ele vem.
   *
   * O campo era zerado sempre que a arte fosse nossa, e a razão era boa na
   * época: o símbolo saía do modelo com fundo quadrado próprio, e o cabeçalho
   * ficava com um retângulo colado sobre a página. Só que `derivarLogos` passou
   * a recortar esse fundo, e `ClientFlow` troca `logo` pela versão
   * TRANSPARENTE antes de guardar. O guarda sobreviveu ao motivo dele — e o
   * resultado era a loja abrir e FECHAR sem logo, com o rodapé mostrando a
   * moldura vazia do editor.
   *
   * A prova de que o recorte aconteceu é a versão derivada estar ali: as três
   * nascem juntas, no mesmo bloco, e o recorte que falha não grava nenhuma. Sem
   * ela, o campo continua vazio — é melhor o rodapé escrever o nome do que
   * pendurar um quadrado.
   */
  const logoRecortada = Boolean(imagens["logo-fundo-branco"]);
  const logoDoTema = imagens.logo && (!geradasPelaOrbis.has("logo") || logoRecortada) ? imagens.logo : "";
  /**
   * As capas de coleção entram na ordem em que as seções as pedem.
   *
   * Aceita as duas famílias porque o conjunto de peças mudou: eram seis capas
   * `colecao-N`, uma por coleção, e passaram a ser três CENAS da marca, que
   * rendem mais e custam menos. Ler as duas mantém de pé a loja gerada antes da
   * troca, que já está no computador de quem a recebeu.
   */
  const capas = Object.keys(imagens)
    .filter((chave) => chave.startsWith("colecao-") || chave.startsWith("cena-"))
    .sort()
    .map((chave) => imagens[chave]);
  let proximaCapa = 0;
  let proximaColecao = 0;
  /* os cartões de coleção que ficaram sem coleção: some com eles no fim, em vez
     de repetir uma que já apareceu */
  const vagasSobrando: Array<{ secao: { blocks: Array<unknown> }; alvo: unknown }> = [];

  /* 1. esquemas de cor: a loja inteira se pinta por aqui */
  const esquemas = valores.color_schemes;
  if (ehRecord(esquemas)) {
    for (const [idDoEsquema, bruto] of Object.entries(esquemas)) {
      if (!ehRecord(bruto)) continue;
      const settings = ehRecord(bruto.settings) ? bruto.settings : bruto;
      const fundoAtual = typeof settings.background === "string" ? settings.background : marca.backgroundColor;
      const novo = esquemaDaMarca(marca, ehEscuro(fundoAtual));
      for (const [chave, valor] of Object.entries(novo)) {
        if (chave in settings) settings[chave] = valor;
      }
      /* o esquema pode não ter `button`; o campo de destaque dele, então, é o que houver */
      if (!("button" in settings) && "solid_button_background" in settings) settings.solid_button_background = novo.button;
      marcou(`color_schemes.${idDoEsquema}`);
    }
  }

  /* 2 e 3. cores soltas e fontes, pelo tipo declarado no schema */
  for (const definicao of definicoes) {
    if (definicao.type === "color") {
      const papel = papelDaCor(definicao);
      if (!papel) continue;
      valores[definicao.id] = corParaPapel(marca, papel);
      marcou(definicao.id);
      continue;
    }
    if (definicao.type === "font_picker") {
      const titulo = PAPEL_TITULO.test(`${definicao.id} ${definicao.label ?? ""}`);
      const familia = titulo ? marca.headingFont : marca.bodyFont;
      if (!familia) continue;
      valores[definicao.id] = handleDeFonte(familia, titulo ? 7 : 4);
      marcou(definicao.id);
      continue;
    }
    /**
     * O LOGO É O NOME DA LOJA ESCRITO, a menos que o cliente tenha enviado o
     * dele.
     *
     * A arte de logo que a IA devolve é um PNG quadrado com fundo próprio. No
     * cabeçalho isso vira um quadrado cinza colado sobre a cor da página — não
     * combina com nada, e nenhum recorte conserta, porque o fundo está pintado
     * dentro do arquivo. Deixando o campo VAZIO, o tema escreve o nome da loja
     * na tipografia que a marca acabou de definir, que é o que uma loja nova
     * quer: nome legível, na cor certa, sem arquivo para subir.
     *
     * O valor que veio do tema importado também é limpo: ele aponta para um
     * arquivo da loja de ORIGEM, que não existe na loja do cliente — ficaria um
     * espaço em branco em vez do nome.
     *
     * Logo enviado pelo cliente vence sempre: quem já tem marca tem logo.
     */
    if (definicao.type === "image_picker" && IMAGEM_DE_LOGO.test(`${definicao.id} ${definicao.label ?? ""}`)) {
      if (valores[definicao.id] !== logoDoTema) {
        valores[definicao.id] = logoDoTema;
        marcou(definicao.id);
      }
      continue;
    }
    if ((definicao.type === "text" || definicao.type === "richtext") && CAMPO_DE_MARCA.test(`${definicao.id} ${definicao.label ?? ""}`)) {
      valores[definicao.id] = valorDeTexto(definicao, marca.name);
      marcou(definicao.id);
    }
  }

  /* 4. conteúdo das seções: marca sempre, texto do tema só se estiver no padrão */
  const schemaPorTipo = new Map(theme.sectionSchemas.map((schema) => [schema.type, schema]));
  const colecoes = (marca.collections ?? []).map(handleDeColecao).filter(Boolean);
  /* e o NOME fica guardado junto: é aqui que o acento se perde, e é o único
     ponto do caminho em que ele ainda existe para ser salvo */
  const nomesDeColecao = (marca.collections ?? []).map((nome) => String(nome ?? "").trim()).filter(Boolean);
  if (nomesDeColecao.length) theme.orbisColecoes = nomesDeColecao;

  /* qual dobra de banner é esta: decide QUAL foto ela recebe */
  let indiceDaDobra = 0;
  /* o texto que cada seção já recebeu, atravessando as páginas do tema */
  const escritosPorSecao = new Map<string, Set<string>>();

  for (const page of theme.pages) {
    for (const secao of page.sections) {
      const schema = schemaPorTipo.get(secao.type);
      const definicoesDaSecao = achatar(schema?.settings ?? []);
      const alvos = [secao, ...secao.blocks];
      /* conta ANTES de aplicar: a primeira dobra é a 0, a segunda a 1, e com
         duas fotos elas saem diferentes */
      const dobraDeBanner = SECAO_DE_BANNER.test(secao.type);
      /**
       * O que esta seção já recebeu de texto nosso.
       *
       * Sem isto, a mesma frase preenchia dois campos da MESMA seção: o rodapé
       * saía com o slogan como título e, logo abaixo, o slogan de novo como
       * chamada da newsletter. Repetição não é ênfase, é descuido visível.
       *
       * A memória é POR SEÇÃO e vive fora do laço de páginas: um grupo como o
       * rodapé aparece em todas as páginas do tema, e um controle recriado a
       * cada página chegava vazio na segunda volta — o campo que tinha sido
       * poupado na primeira era preenchido ali, com a mesma frase.
       */
      const jaEscrito = escritosPorSecao.get(secao.id) ?? new Set<string>();
      escritosPorSecao.set(secao.id, jaEscrito);
      for (const alvo of alvos) {
        const definicoesDoAlvo = alvo === secao
          ? definicoesDaSecao
          : achatar(schema?.blocks?.find((bloco) => bloco.type === alvo.type)?.settings ?? []);
        for (const definicao of definicoesDoAlvo) {
          const pista = `${definicao.id} ${definicao.label ?? ""}`;
          const atual = alvo.settings[definicao.id];
          if (definicao.type === "color") {
            const papel = papelDaCor(definicao);
            if (papel) { alvo.settings[definicao.id] = corParaPapel(marca, papel); marcou(`${secao.type}.${definicao.id}`); }
            continue;
          }
          if (definicao.type === "font_picker") {
            const titulo = PAPEL_TITULO.test(pista);
            const familia = titulo ? marca.headingFont : marca.bodyFont;
            if (familia) { alvo.settings[definicao.id] = handleDeFonte(familia, titulo ? 7 : 4); marcou(`${secao.type}.${definicao.id}`); }
            continue;
          }
          if (definicao.type === "image_picker") {
            /* banner do topo, capa de coleção e logo, cada um no seu lugar:
               o campo de celular recebe o corte vertical, e não o de desktop */
            const pista2 = `${secao.type} ${pista}`;
            /**
             * Cada dobra de banner recebe uma FOTO DIFERENTE.
             *
             * Havia uma chave só (`banner-desktop`) para todo slot de banner, e
             * um tema com duas dobras abria a loja com a mesma foto duas vezes
             * — parecia defeito de carregamento. As peças de banner são
             * numeradas e distribuídas em rodízio; com uma peça só, o
             * comportamento é o de antes.
             */
            const bannersDesktop = pecasDeBanner(imagens, "banner-desktop");
            const bannersCelular = pecasDeBanner(imagens, "banner-mobile");
            const ehBanner = /slide|banner|hero|image.?banner|rich.?text/i.test(pista2);
            /**
             * No RODAPÉ, imagem é marca — nunca capa de coleção.
             *
             * O rodapé do Dawn tem um `image_picker` que não diz "logo" no id,
             * então ele caía na sobra e recebia uma FOTO DE PRODUTO: a loja
             * fechava com um frasco onde deveria estar a marca. Aqui ele recebe
             * a MARCA — a mesma regra do campo de logo do tema, e pelo mesmo
             * motivo: o símbolo já vem recortado (ver `logoDoTema`). Sem marca
             * para pôr, fica vazio e o rodapé escreve o nome da loja.
             */
            if (/footer|rodape/i.test(secao.type)) {
              if (alvo.settings[definicao.id] !== logoDoTema) {
                alvo.settings[definicao.id] = logoDoTema;
                marcou(`${secao.type}.${definicao.id}`);
              }
              continue;
            }
            const escolhida = IMAGEM_DE_LOGO.test(pista) ? logoDoTema || imagens.logo
              : IMAGEM_DE_CELULAR.test(pista2)
                ? bannersCelular[indiceDaDobra % Math.max(bannersCelular.length, 1)]
              : ehBanner
                ? bannersDesktop[indiceDaDobra % Math.max(bannersDesktop.length, 1)]
              : capas.length ? capas[proximaCapa++ % capas.length]
              : undefined;
            if (escolhida) { alvo.settings[definicao.id] = escolhida; marcou(`${secao.type}.${definicao.id}`); }
            continue;
          }
          /**
           * A ALTURA do banner é do tema, não do arquivo.
           *
           * `adapt_image` faz a seção adotar a proporção da imagem. Com a arte
           * saindo em formato de vídeo, o banner abria com quase o dobro da
           * altura de um banner de loja — e mesmo com a arte no formato certo,
           * deixar a dobra depender do arquivo significa que trocar a foto
           * muda o layout do site. O tema já traz `medium` como padrão dele;
           * voltamos a esse padrão só quando a Orbis é quem pôs a arte ali.
           */
          if (definicao.type === "select" && ALTURA_DE_BANNER.test(definicao.id) && SECAO_DE_BANNER.test(secao.type)) {
            const adaptativo = typeof atual === "string" && /^adapt/.test(atual);
            const temMedium = (definicao.options ?? []).some((opcao) => opcao.value === "medium");
            if (adaptativo && temMedium) {
              alvo.settings[definicao.id] = "medium";
              marcou(`${secao.type}.${definicao.id}`);
            }
            continue;
          }
          if (CAMPO_DE_LISTA.test(definicao.type) && colecoes.length) {
            alvo.settings[definicao.id] = definicao.type === "collection_list" ? colecoes : colecoes[0];
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (definicao.type === "collection" && colecoes.length) {
            /**
             * A coleção passa a ser a do NICHO, mesmo por cima da que o tema
             * trazia.
             *
             * A regra antiga preservava o que o tema apontava, e tinha um
             * motivo bom: handle só resolve na loja onde a coleção existe, e
             * apontar para uma coleção que ninguém criou deixa a vitrine vazia.
             * Só que o resultado prático era pior — a loja gerada abria com
             * "Moda Masculina", "Pet Shop", as coleções da loja de ORIGEM do
             * tema, que não têm nada a ver com o nicho escolhido e também não
             * existem na loja do cliente.
             *
             * O que mudou o fato: o pacote entregue agora leva o CSV de
             * produtos com a coluna `Collection`, e a Shopify CRIA essas
             * coleções na importação. Elas passam a existir, com produto
             * dentro. Apontar para elas deixou de ser chute.
             */
            /**
             * SEM dar a volta na lista.
             *
             * Era `% colecoes.length`, e o resto da divisão fazia a sétima vaga
             * receber a primeira coleção de novo. Medido na tela: o Dawn tem
             * sete cartões em "Nossas Coleções", a loja tinha seis coleções, e
             * "Novidades" aparecia duas vezes na mesma vitrine — com fotos
             * diferentes, o que é pior, porque parece duas coleções.
             *
             * Acabaram as coleções, acabou o preenchimento: a vaga sobrando é
             * apagada logo abaixo, e a vitrine mostra o que a loja tem.
             */
            if (proximaColecao >= colecoes.length) { vagasSobrando.push({ secao, alvo }); continue; }
            alvo.settings[definicao.id] = colecoes[proximaColecao++];
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (definicao.type !== "text" && definicao.type !== "richtext" && definicao.type !== "inline_richtext") continue;
          if (CAMPO_DE_MARCA.test(pista)) {
            alvo.settings[definicao.id] = valorDeTexto(definicao, marca.name);
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (marca.announcement && CAMPO_DE_AVISO.test(`${secao.type} ${pista}`)) {
            alvo.settings[definicao.id] = valorDeTexto(definicao, marca.announcement);
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          /* só entra onde o tema não escreveu nada de próprio */
          /**
           * O rótulo de botão é conferido ANTES do guarda "o tema já escreveu
           * algo de próprio", porque um rótulo com um parágrafo dentro não é
           * "algo de próprio", é estrago — e uma vez gravado, o guarda o
           * protegia para sempre. Rótulo curto que o tema (ou o lojista)
           * escreveu continua intocado; só entra aqui o vazio, o placeholder
           * em inglês e o que é comprido demais para caber num botão.
           */
          /**
           * NA DOBRA DE BANNER não entra texto — com UMA exceção, e ela é
           * pedida: a SEGUNDA dobra escreve uma frase.
           *
           * A regra do dono continua valendo na primeira: "não quero o texto",
           * o banner é a foto, e quem quiser escrever ali escreve no editor da
           * Shopify. Na segunda ele pediu o contrário, e a frase é o SLOGAN da
           * marca — que nasce das manchetes do nicho escolhido
           * (`marca-generator.mjs`) e por isso combina com o que a loja vende.
           * Não é frase inventada aqui: é a mesma que a pessoa viu e aprovou na
           * etapa da marca, e que ela pode trocar por lá.
           *
           * Só o TÍTULO, e só nessa dobra. Subtítulo e botão continuam vazios:
           * três textos empilhados sobre a foto foi o que poluiu a dobra da
           * primeira vez. E o subtítulo é conferido ANTES do título, senão
           * `subheading` casaria com `heading` e ganharia a frase também.
           *
           * O resto limpa o que estiver escrito, inclusive o que o tema trouxe:
           * deixar a frase antiga era o "Brilho no detalhe" reaparecendo por
           * cima da foto nova. Vale no desktop E no celular, porque o campo é o
           * mesmo — o texto do bloco serve os dois cortes.
           */
          if (dobraDeBanner && (PAPEL_TITULO.test(pista) || CAMPO_DE_SUBTITULO.test(pista) || CAMPO_DE_BOTAO.test(pista))) {
            const ehTituloDaDobra = !CAMPO_DE_SUBTITULO.test(pista) && !CAMPO_DE_BOTAO.test(pista) && PAPEL_TITULO.test(pista);
            /**
             * E o tema fica CALADO quando a frase já está na arte.
             *
             * O dono viu a frase saindo como texto do tema por cima da foto e
             * pediu o contrário: "o texto seja na imagem, não digitado". A
             * composição assa a frase na arte (`comporBanner`), com véu medido
             * e tipografia de verdade — o tema escrever de novo poria a mesma
             * frase duas vezes na mesma foto, uma delas escorregando em tela
             * estreita, que é o defeito que a composição existe para acabar.
             *
             * O sinal é o ARQUIVO DO CELULAR daquela dobra: ele só existe
             * quando a composição rodou, porque é ela que corta os dois
             * formatos. Sem composição — ela falhou, o cliente trouxe o
             * próprio banner, ou a arte ainda não foi aprovada — o tema volta
             * a escrever, senão a dobra fica muda.
             *
             * Fica UM caso torto, e ele é transitório: arte composta pelo
             * código anterior a esta mudança tem o arquivo do celular mas não
             * tem a frase assada, então aquela dobra sai sem frase nenhuma. Não
             * há como distinguir isso pela chave — a diferença está nos pixels
             * — e gerar as artes de novo resolve, que é o gesto que a pessoa já
             * faz quando troca qualquer peça. Um campo persistido só para essa
             * janela custaria mais que ela.
             */
            const arteLevaAFrase = Boolean(imagens[`${ARTE_DA_DOBRA_COM_FRASE}-mobile`]);
            const frase = ehTituloDaDobra && indiceDaDobra === DOBRA_COM_FRASE && !arteLevaAFrase
              ? (marca.slogan ?? "").trim()
              : "";
            /* vazio EXPLÍCITO, não ausente: campo ausente faz o Liquid cair no
               padrão do schema, e o padrão do Dawn é "Image slide" e "Button
               label" — a loja abriria com placeholder em inglês sobre a foto */
            const valor = frase ? valorDeTexto(definicao, frase) : "";
            if (alvo.settings[definicao.id] !== valor) {
              alvo.settings[definicao.id] = valor;
              marcou(`${secao.type}.${definicao.id}`);
            }
            continue;
          }
          if (CAMPO_DE_BOTAO.test(pista)) {
            const texto = typeof atual === "string" ? atual : "";
            const rotuloDeVerdade = texto.trim() !== "" && texto.length <= 28 && texto !== definicao.default;
            if (!rotuloDeVerdade) {
              alvo.settings[definicao.id] = rotuloDeBotao(alvo.settings.link ?? alvo.settings.button_link);
              marcou(`${secao.type}.${definicao.id}`);
            }
            continue;
          }
          /* só entra onde o tema não escreveu nada de próprio */
          const noPadrao = atual === undefined || atual === "" || atual === definicao.default;
          if (!noPadrao) continue;
          /* a mesma frase não entra duas vezes na mesma seção */
          const escrever = (texto: string) => {
            if (!texto || jaEscrito.has(texto)) return;
            jaEscrito.add(texto);
            alvo.settings[definicao.id] = valorDeTexto(definicao, texto);
            marcou(`${secao.type}.${definicao.id}`);
          };
          /* rótulo de função fica com o texto do tema: ele já é o certo */
          if (CAMPO_FUNCIONAL.test(`${alvo === secao ? "" : alvo.type} ${pista}`)) continue;
          if (CAMPO_DE_SUBTITULO.test(pista) && marca.description) {
            /* o subtítulo diz o que o título não disse; repetir o slogan aqui
               era o "O básico bem-feito" aparecendo duas vezes no banner */
            escrever(marca.description);
          } else if (PAPEL_TITULO.test(pista) && marca.slogan) {
            escrever(marca.slogan);
          } else if (marca.description) {
            escrever(marca.description);
          }
        }

        /**
         * O TEXTO VAI NA IMAGEM, não numa caixa branca por cima dela.
         *
         * O Dawn traz `show_text_box: true`, que encaixota a frase num retângulo
         * branco sobre a foto — fica um adesivo, e some a paleta da marca. Com a
         * caixa desligada o texto pousa na imagem; para ele continuar legível
         * sobre foto, entra um véu leve (`image_overlay_opacity`) e o esquema
         * `inverse`, que é o par claro/escuro que a própria marca já pintou.
         *
         * Só onde a Orbis pôs a arte, e só onde o tema oferece o controle: em
         * tema que não tem esses campos, nada muda.
         */
        if (dobraDeBanner) {
          const definicoesDoAlvo2 = alvo === secao
            ? definicoesDaSecao
            : achatar(schema?.blocks?.find((bloco) => bloco.type === alvo.type)?.settings ?? []);
          const porId = new Map(definicoesDoAlvo2.map((d) => [d.id, d]));
          /**
           * O texto fica NA imagem, inclusive no celular.
           *
           * O Dawn traz `show_text_below: true`, e no celular isso tira a frase
           * de cima da foto e a joga para BAIXO dela: a dobra vira uma imagem
           * e, solto embaixo, um bloco de texto na cor de fundo. Some a
           * composição inteira — a foto é enquadrada com metade limpa
           * justamente para o texto pousar ali.
           */
          if (porId.get("show_text_below")?.type === "checkbox" && alvo.settings.show_text_below !== false) {
            alvo.settings.show_text_below = false;
            marcou(`${secao.type}.show_text_below`);
          }
          if (porId.get("show_text_box")?.type === "checkbox" && alvo.settings.show_text_box !== false) {
            alvo.settings.show_text_box = false;
            marcou(`${secao.type}.show_text_box`);
          }
          const veu = porId.get("image_overlay_opacity");
          if (veu?.type === "range" && (alvo.settings.image_overlay_opacity ?? 0) === 0) {
            alvo.settings.image_overlay_opacity = 20;
            marcou(`${secao.type}.image_overlay_opacity`);
          }
          const esquema = porId.get("color_scheme");
          if (esquema?.type === "select" && (esquema.options ?? []).some((o) => o.value === "inverse")) {
            alvo.settings.color_scheme = "inverse";
            marcou(`${secao.type}.color_scheme`);
          }
        }
      }
      if (dobraDeBanner) indiceDaDobra++;
    }
  }

  /**
   * O CARTÃO SEM COLEÇÃO é apagado, não preenchido de novo.
   *
   * O tema traz um número fixo de cartões — o Dawn traz sete —, e a loja tem as
   * coleções que a pessoa escreveu. Quando sobra vaga, repetir uma coleção que
   * já apareceu é o pior dos três caminhos: parece duas coleções diferentes,
   * ainda mais porque cada cartão recebe a foto da sua vez. Deixar o cartão
   * apontando para a coleção que o tema trazia é igualmente ruim, porque aquela
   * coleção não existe na loja do cliente e o cartão abre vazio.
   *
   * Some com ele. A vitrine passa a mostrar exatamente o que a loja tem, que é
   * a única das três respostas que é verdade.
   */
  for (const { secao, alvo } of vagasSobrando) {
    const indice = secao.blocks.indexOf(alvo as never);
    if (indice >= 0) secao.blocks.splice(indice, 1);
  }

  /* último passo: nada sai daqui num formato que a Shopify recusaria */
  /**
   * A ORDEM da home sai da semente, e sai por ÚLTIMO.
   *
   * Por último porque é aqui que cada vaga já carrega o conteúdo dela: a
   * permutação leva junto a coleção, a capa e a arte. Sorteando antes — como a
   * primeira versão fazia — só as caixas se moviam, e caixas do mesmo tipo são
   * quase idênticas: medido no Dawn, quatro clientes viam duas páginas.
   *
   * As dobras de banner ficam FORA. A primeira é calada e a segunda leva a
   * frase, por pedido do dono, e a arte de cada uma foi composta para aquela
   * vaga — mover isso seria passar por cima de uma decisão que tem autor.
   */
  const sorteada = sortearVitrine(theme, marca.semente?.trim() || marca.name, { naoMover: SECAO_DE_BANNER });
  return { theme: sorteada.theme, alterados, violacoes: violacoesDoTema(sorteada.theme) };
}

/**
 * Texto pronto para um setting `richtext`.
 *
 * A Shopify não aceita texto solto em `richtext`: o valor precisa vir dentro de
 * uma tag de bloco. Texto puro ali faz o importador REJEITAR o arquivo inteiro,
 * e a página some da loja — foi assim que `templates/cart.json` e a home não
 * chegaram na Shopify, e o site respondeu 404.
 */
export function paraRichtext(texto: string): string {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return "";
  if (/^\s*<(p|ul|ol|h[1-6]|blockquote|div)\b/i.test(limpo)) return limpo;
  const escapado = limpo.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return `<p>${escapado}</p>`;
}

/**
 * Todo valor que a marca grava, no formato que o tipo do setting exige.
 *
 * É o único ponto por onde texto da marca entra num setting, de propósito: a
 * regra do `richtext` estava espalhada e escapou uma vez, o que basta para
 * derrubar uma loja.
 */
function valorDeTexto(definicao: ShopifySettingDefinition, texto: string): string {
  return definicao.type === "richtext" ? paraRichtext(texto) : texto;
}

/**
 * Aponta o que a Shopify recusaria neste tema.
 *
 * Roda no fim da aplicação da marca e é o que impede a classe inteira de erro
 * de voltar: um valor invàlido não dá erro no editor do Orbis, só some da loja
 * publicada, e aí o rastro já se perdeu.
 */
export function violacoesDoTema(theme: ShopifyThemeImport): string[] {
  const problemas: string[] = [];
  const schemaPorTipo = new Map(theme.sectionSchemas.map((schema) => [schema.type, schema]));
  const conferir = (onde: string, definicoes: ShopifySettingDefinition[], valores: Record<string, ShopifyValue>) => {
    for (const definicao of achatar(definicoes)) {
      const valor = valores[definicao.id];
      if (typeof valor !== "string" || !valor) continue;
      if (definicao.type === "image_picker" && /^data:/i.test(valor)) {
        problemas.push(`${onde}.${definicao.id}: data URI em image_picker`);
      }
      if (definicao.type === "richtext" && !/^\s*</.test(valor)) {
        problemas.push(`${onde}.${definicao.id}: richtext sem tag de bloco`);
      }
    }
  };
  conferir("settings", theme.globalGroups.flatMap((grupo) => grupo.settings), theme.globalValues);
  for (const page of theme.pages) {
    for (const secao of page.sections) {
      const schema = schemaPorTipo.get(secao.type);
      conferir(`${page.id}/${secao.type}`, schema?.settings ?? [], secao.settings);
      for (const bloco of secao.blocks) {
        const doBloco = schema?.blocks?.find((item) => item.type === bloco.type)?.settings ?? [];
        conferir(`${page.id}/${secao.type}/${bloco.type}`, doBloco, bloco.settings);
      }
    }
  }
  return problemas;
}

/** "Óculos de sol" → "oculos-de-sol": o handle que o tema usa em menus e listas. */
export function handleDeColecao(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
