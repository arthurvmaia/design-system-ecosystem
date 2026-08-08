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

export type MarcaAplicavel = {
  name: string;
  slogan?: string;
  description?: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  collections?: string[];
  announcement?: string;
};

export type ResultadoDaMarca = {
  theme: ShopifyThemeImport;
  /** Ids de setting alterados, para a tela de revisão dizer o que mudou. */
  alterados: string[];
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
const CAMPO_DE_MARCA = /(shop.?name|store.?name|brand|logo.?text|site.?title|nome.?da.?loja|marca)/i;
const CAMPO_DE_AVISO = /(announce|aviso|bar.?text|topbar)/i;
const CAMPO_DE_LISTA = /(collection_list|link_list|menu)/i;

/** `Playfair Display` → `playfair_display_n4`, o formato que o tema guarda. */
export function handleDeFonte(familia: string, peso = 4, italico = false): string {
  const base = String(familia ?? "")
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
    if ((definicao.type === "text" || definicao.type === "richtext") && CAMPO_DE_MARCA.test(`${definicao.id} ${definicao.label ?? ""}`)) {
      valores[definicao.id] = marca.name;
      marcou(definicao.id);
    }
  }

  /* 4. conteúdo das seções: marca sempre, texto do tema só se estiver no padrão */
  const schemaPorTipo = new Map(theme.sectionSchemas.map((schema) => [schema.type, schema]));
  const colecoes = (marca.collections ?? []).map(handleDeColecao).filter(Boolean);

  for (const page of theme.pages) {
    for (const secao of page.sections) {
      const schema = schemaPorTipo.get(secao.type);
      const definicoesDaSecao = achatar(schema?.settings ?? []);
      const alvos = [secao, ...secao.blocks];
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
          if (CAMPO_DE_LISTA.test(definicao.type) && colecoes.length) {
            alvo.settings[definicao.id] = definicao.type === "collection_list" ? colecoes : colecoes[0];
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (definicao.type === "collection" && colecoes.length && !atual) {
            alvo.settings[definicao.id] = colecoes[0];
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (definicao.type !== "text" && definicao.type !== "richtext" && definicao.type !== "inline_richtext") continue;
          if (CAMPO_DE_MARCA.test(pista)) {
            alvo.settings[definicao.id] = marca.name;
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          if (marca.announcement && CAMPO_DE_AVISO.test(`${secao.type} ${pista}`)) {
            alvo.settings[definicao.id] = marca.announcement;
            marcou(`${secao.type}.${definicao.id}`);
            continue;
          }
          /* só entra onde o tema não escreveu nada de próprio */
          const noPadrao = atual === undefined || atual === "" || atual === definicao.default;
          if (!noPadrao) continue;
          if (PAPEL_TITULO.test(pista) && marca.slogan) {
            alvo.settings[definicao.id] = marca.slogan;
            marcou(`${secao.type}.${definicao.id}`);
          } else if (marca.description) {
            alvo.settings[definicao.id] = marca.description;
            marcou(`${secao.type}.${definicao.id}`);
          }
        }
      }
    }
  }

  return { theme, alterados };
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
