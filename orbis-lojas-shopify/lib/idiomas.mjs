/**
 * OS IDIOMAS EM QUE UMA LOJA PODE NASCER, e tudo o que muda com eles.
 *
 * Fonte única. O idioma toca coisas que moram longe umas das outras — o
 * arquivo de tradução do tema, o formato do dinheiro, o `locale` que o Liquid
 * lê, o texto das seções, o nome dos produtos —, e cada uma delas tinha o
 * português escrito na mão. Enquanto for assim, acrescentar um idioma é caçar
 * literal por literal em dez arquivos; aqui é acrescentar uma linha.
 *
 * ## A moeda troca de SÍMBOLO, e não de valor
 *
 * Decisão do dono, tomada por escrito, e escrita aqui para ninguém depois achar
 * que houve conversão: o catálogo do acervo tem preço em centavos de real, e
 * uma loja em inglês mostra o MESMO número com `$`. `R$ 13,11` vira `$ 13.11`.
 *
 * Não é câmbio — é rótulo. E se sustenta porque o catálogo é DEMONSTRAÇÃO: são
 * dez produtos por nicho para a vitrine não nascer vazia, e quem publica troca
 * pelos produtos e preços dele na Shopify. Converter exigiria uma taxa e uma
 * data que ninguém forneceu, e inventar câmbio é pior que rotular.
 *
 * Se um dia a loja passar a vender com estes preços, isto tem de virar uma
 * pergunta na tela — moeda E taxa — em vez de continuar sendo um símbolo.
 */

export const IDIOMAS = ["pt-BR", "en", "es"];

/** O idioma de quem não escolheu — e o de toda loja gerada antes desta tela. */
export const IDIOMA_PADRAO = "pt-BR";

/**
 * @typedef {"pt-BR" | "en" | "es"} Idioma
 *
 * @typedef {object} DefinicaoDeIdioma
 * @property {Idioma} codigo
  @property {string} rotulo Como a pessoa lê na tela, NO PRÓPRIO idioma: quem procura "English" não procura "Inglês".
 * @property {string} resumo Uma linha dizendo o que muda, para a tela não pedir fé.
  /**
   * Os nomes de arquivo de tradução do tema, em ordem de preferência.
   *
   * Vários porque tema real não segue regra: o mesmo idioma aparece como
   * `pt-BR.default.json`, `pt-BR.json` ou `pt-PT.json` conforme a loja de
   * origem. O primeiro que existir E estiver de fato traduzido vence — ver
   * `traducaoDoTema`, que confere o conteúdo em vez de confiar no nome.
   *
   * @property {string[]} locales
   * @property {string} locale O que o Liquid lê em `shop.locale` e o runtime publica em `Shopify.locale`.
   * @property {{iso: string, nome: string}} pais
   * @property {{iso: string, simbolo: string, decimal: string, milhar: string, simboloAntes: boolean, espaco: string}} moeda
   *   `decimal` e `milhar` são o par de separadores — `1.234,56` no Brasil,
   *   `1,234.56` nos EUA. `simboloAntes` decide `$13.11` contra `13,11 €`.
   */

/** @type {Record<Idioma, DefinicaoDeIdioma>} */
export const DEFINICOES = {
  "pt-BR": {
    codigo: "pt-BR",
    rotulo: "Português",
    resumo: "A loja inteira em português do Brasil.",
    locales: ["pt-BR.default.json", "pt-BR.json", "pt-PT.json"],
    locale: "pt-BR",
    pais: { iso: "BR", nome: "Brasil" },
    moeda: { iso: "BRL", simbolo: "R$", decimal: ",", milhar: ".", simboloAntes: true, espaco: " " },
  },
  en: {
    codigo: "en",
    rotulo: "English",
    resumo: "Textos, produtos e coleções em inglês.",
    locales: ["en.default.json", "en.json", "en-US.json", "en-GB.json"],
    locale: "en",
    pais: { iso: "US", nome: "United States" },
    moeda: { iso: "USD", simbolo: "$", decimal: ".", milhar: ",", simboloAntes: true, espaco: "" },
  },
  es: {
    codigo: "es",
    rotulo: "Español",
    resumo: "Textos, produtos y colecciones en español.",
    locales: ["es.default.json", "es.json", "es-ES.json", "es-MX.json"],
    locale: "es",
    pais: { iso: "ES", nome: "España" },
    moeda: { iso: "EUR", simbolo: "€", decimal: ",", milhar: ".", simboloAntes: false, espaco: " " },
  },
};

/**
 * O idioma de um valor qualquer, sem nunca estourar.
 *
 * Recebe o que vier — payload do cliente, campo do banco, marcador de um tema
 * gravado antes desta tela existir — e devolve um idioma válido. Loja antiga
 * não tem o campo, e ela é português: era o único idioma que havia.
 */
/** @returns {Idioma} */
export function idiomaDe(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return IDIOMA_PADRAO;
  const exato = IDIOMAS.find((codigo) => codigo.toLowerCase() === texto.toLowerCase());
  if (exato) return exato;
  /* `pt`, `pt-PT`, `en-US`, `es-MX`: a família decide, e é o que chega de
     navegador e de tema de outra loja */
  const familia = texto.toLowerCase().split(/[-_]/)[0];
  return IDIOMAS.find((codigo) => codigo.toLowerCase().split("-")[0] === familia) ?? IDIOMA_PADRAO;
}

/** @returns {DefinicaoDeIdioma} */
export function definicaoDoIdioma(valor) {
  return DEFINICOES[idiomaDe(valor)];
}

/**
 * O dinheiro escrito como o idioma escreve.
 *
 * Recebe CENTAVOS, que é como o catálogo guarda. O valor não muda de idioma
 * para idioma — só a pontuação e o símbolo. Ver a nota do topo.
 */
export function formatarDinheiro(centavos, idioma = IDIOMA_PADRAO) {
  const { moeda } = definicaoDoIdioma(idioma);
  const valor = Math.round(Number(centavos) || 0);
  const negativo = valor < 0;
  const inteiro = Math.floor(Math.abs(valor) / 100);
  const centos = String(Math.abs(valor) % 100).padStart(2, "0");
  const comMilhar = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, moeda.milhar);
  const numero = `${comMilhar}${moeda.decimal}${centos}`;
  /* o sinal vem antes de TUDO, inclusive do simbolo: "-$12.50" e como se
     escreve dinheiro negativo, "$-12.50" e como se escreve um erro */
  const sinal = negativo ? "-" : "";
  return moeda.simboloAntes
    ? `${sinal}${moeda.simbolo}${moeda.espaco}${numero}`
    : `${sinal}${numero}${moeda.espaco}${moeda.simbolo}`;
}

/**
 * O formato que o Liquid recebe em `shop.money_format`.
 *
 * O tema o usa em `{{ preco | money }}` quando resolve o formato por conta, e
 * ele precisa casar com o que `formatarDinheiro` escreve — dois formatos
 * diferentes na mesma página é o tipo de coisa que ninguém vê no teste e todo
 * mundo vê na loja.
 */
export function formatoDeDinheiro(idioma = IDIOMA_PADRAO) {
  const { moeda } = definicaoDoIdioma(idioma);
  const corpo = moeda.decimal === "," ? "{{amount_with_comma_separator}}" : "{{amount}}";
  return moeda.simboloAntes ? `${moeda.simbolo}${moeda.espaco}${corpo}` : `${corpo}${moeda.espaco}${moeda.simbolo}`;
}
