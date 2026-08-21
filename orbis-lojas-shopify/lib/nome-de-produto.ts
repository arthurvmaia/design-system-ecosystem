/**
 * O NOME DE VITRINE de um produto, a partir do anúncio do fornecedor.
 *
 * O catálogo (`catalogo-nichos.ts`) traz o título como ele sai da AliExpress, e
 * ali um título não é um nome: é uma lista de palavras-chave escrita para o
 * buscador do marketplace, traduzida por máquina e — medido no arquivo — com
 * **88 dos 100 títulos cortados em exatamente 120 caracteres**, no meio da
 * palavra. Na loja isso aparecia assim:
 *
 *     "Cão dormindo com um cachorro abraço pato brinquedos para aliviar o
 *      tédio do pequeno pato amarelo animal de estimação bon"
 *
 * Quatro linhas de cartão para dizer "pato de pelúcia", terminando num "bon"
 * que não é palavra nenhuma. É o que faz uma loja parecer revenda apressada.
 *
 * ## O que este módulo faz, e o que ele não faz
 *
 * Ele ENCURTA e ARRUMA o que o fornecedor escreveu. Não inventa nome, não
 * inventa característica, não promete material, medida, prazo nem desconto: as
 * palavras que saem daqui são todas palavras que entraram. É a regra da casa —
 * nada inventado —, e é também o que mantém a loja honesta com o produto que
 * ela de fato vende.
 *
 * O que sobra do título não é jogado fora: vira a lista de características da
 * descrição, que é onde uma lista de atributos faz sentido.
 */

import { NOMES_CURADOS } from "./nomes-curados";

/**
 * Onde o anúncio deixa de falar do produto e passa a falar da operação.
 *
 * "dropshipping" e "atacado" num nome de produto denunciam de onde a loja tirou
 * a mercadoria; "frete grátis" e "promoção" são promessas que só quem vende
 * pode fazer, e este app não inventa promessa. Onde uma delas começa, o nome
 * acaba.
 */
const RUIDO_DO_FORNECEDOR = /\b(dropshipping|drop\s?shipping|atacado|revenda|frete\s+gr[áa]tis|hot\s?sale|em\s+promo[çc][ãa]o|super\s+oferta)\b/i;

/**
 * Nome não termina em palavra de ligação.
 *
 * Cortar em "de", "para" ou "com" é o que faz o corte PARECER defeito, mesmo
 * quando a palavra ficou inteira: "Bola de brinquedo para" lê-se como frase
 * interrompida, "Bola de brinquedo" lê-se como nome.
 */
const LIGACAO_FINAL = /[\s,;:-]+(de|do|da|dos|das|para|com|sem|em|no|na|nos|nas|e|ou|a|o|as|os|por|que|ao|à|à s|tipo|estilo)$/i;

/**
 * Nome também não COMEÇA em ligação.
 *
 * É o mesmo defeito do fim, do outro lado: o anúncio traduzido abre em "De
 * remendos de acne estrela multicoloridos", e a vitrine mostra um produto que
 * parece continuação de uma frase que ninguém leu.
 */
const LIGACAO_INICIAL = /^(de|do|da|dos|das|para|com|sem|em|no|na|e|ou|por|the|of)\s+/i;

/** Os separadores que o anúncio usa para empilhar palavra-chave. */
/* os traços vão escapados: escritos por extenso, o guarda de voz os lê como
   travessão de fala e reprova a linha, que é regra de TEXTO DE TELA */
const SEPARADOR = /[,;|·\u2014\u2013\/]+/;

/**
 * O marcador de QUANTIDADE que o fornecedor põe na frente.
 *
 * "1pc", "2 peças", "1/2 peças" descrevem o LOTE do anúncio, não o produto —
 * e abrindo o nome eles fazem a vitrine parecer uma planilha de pedido. O
 * número de unidades que a loja vende é decisão de quem vende, e ela é tomada
 * na Shopify, não herdada do fornecedor.
 *
 * A abreviação entra com o cedilha DENTRO da alternativa (`p[çc]?s?`), e não
 * apoiada no ``: para o JavaScript "ç" não é letra, então "1/2/3 pçs" casava
 * só até o "p" e a vitrine abria com um produto chamado "Çs rolo de gelo".
 */
const QUANTIDADE_NA_FRENTE = /^(\d+([\/-]\d+)*)\s*(p[çc]?s?|pe[çc]as?|un(idades?)?|kits?)\b[\s,.-]*/i;

/**
 * O comprimento em que o título do fornecedor foi CORTADO na coleta.
 *
 * Não é escolha nossa: quem extraiu o catálogo parou em 120 caracteres, e por
 * isso o último trecho de quase todo título termina no meio de uma palavra.
 * Saber disso é o que permite descartar esse trecho em vez de exibi-lo.
 */
const CORTE_DA_COLETA = 118;

function limpar(texto: string): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

/** Tira a ligação do fim, quantas vezes for preciso ("para o" vira ""). */
function semLigacaoFinal(texto: string): string {
  let anterior = "";
  let atual = texto.trim();
  while (anterior !== atual) {
    anterior = atual;
    atual = atual.replace(LIGACAO_FINAL, "").replace(/[\s,;:.\-]+$/, "").trim();
  }
  return atual;
}

/** Corta no limite sem partir palavra: a última que couber inteira. */
function ateOLimite(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite + 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > 12 ? corte.slice(0, espaco) : corte.slice(0, limite)).trim();
}

/** A primeira letra em maiúscula, e só ela: baixar o resto apagaria "UGREEN". */
function comInicialMaiuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * Os trechos do anúncio, do jeito que o fornecedor os empilhou.
 *
 * O último sai fora quando o título veio cortado pela coleta — é ele que
 * carrega o pedaço de palavra.
 */
function trechos(bruto: string): string[] {
  const texto = limpar(bruto);
  const partes = texto.split(SEPARADOR).map((parte) => parte.trim()).filter(Boolean);
  if (texto.length < CORTE_DA_COLETA || !partes.length) return partes;
  /* veio cortado pela coleta: o pedaço de palavra está no fim. Havendo vários
     trechos, o último inteiro sai fora; havendo um só, sai a última PALAVRA —
     senão o anúncio inteiro chegaria à descrição terminando em "bon" */
  if (partes.length > 1) partes.pop();
  else partes[0] = partes[0].split(" ").slice(0, -1).join(" ").trim();
  return partes.filter(Boolean);
}

/**
 * O nome curto, para o cartão e para o título da página.
 *
 * 48 caracteres é o que cabe em duas linhas no cartão de produto dos temas
 * (medido no Dawn, coluna de 240px): mais que isso vira o bloco de quatro
 * linhas que empurra o preço para fora do cartão.
 */
export function nomeDeProduto(bruto: string, limite = 48): string {
  let texto = limpar(bruto).replace(QUANTIDADE_NA_FRENTE, "");
  if (!texto) return "";
  const ruido = texto.search(RUIDO_DO_FORNECEDOR);
  /* o ruído só corta se já houver nome antes dele: título que ABRE em
     "Atacado ..." ficaria vazio, e produto sem nome é pior que produto com
     nome feio */
  if (ruido > 12) texto = texto.slice(0, ruido);
  const primeiro = trechos(texto)[0] ?? texto;
  /* trecho curto demais não é o nome, é um prefixo solto ("1pc", "Novo"):
     nesse caso vale a frase inteira, que o limite corta adiante */
  if (primeiro.length >= 12) texto = primeiro;
  return comInicialMaiuscula(semLigacaoFinal(ateOLimite(texto.replace(LIGACAO_INICIAL, ""), limite)));
}

/**
 * As características, que é o que sobra do anúncio depois do nome.
 *
 * Elas não são invenção: são as mesmas palavras do fornecedor, tiradas da linha
 * corrida e postas em lista, que é a forma em que uma lista de atributos se lê.
 * Cada uma é encurtada e nenhuma termina em ligação, pelo mesmo motivo do nome.
 */
export function caracteristicasDoProduto(bruto: string, limite = 60): string[] {
  const partes = trechos(bruto);
  const nome = nomeDeProduto(bruto);
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const parte of partes) {
    const texto = comInicialMaiuscula(semLigacaoFinal(ateOLimite(parte, limite)));
    /* trecho de uma palavra não descreve nada, e o que repete o nome só ocupa
       espaço na página */
    if (texto.length < 8 || !texto.includes(" ")) continue;
    const chave = texto.toLowerCase();
    /* por PREFIXO, e não por igualdade: quando o anúncio não tem vírgula até
       tarde, o primeiro trecho É o nome com um pedaço a mais, e a comparação
       exata deixava a mesma frase aparecer duas vezes na página */
    const inicioDoNome = nome.toLowerCase();
    const repete = chave.startsWith(inicioDoNome) || inicioDoNome.startsWith(chave);
    if (repete || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(texto);
  }
  return saida.slice(0, 6);
}

/**
 * O NOME que a loja mostra: o curado quando existe, o automático quando não.
 *
 * A regra automática encurta bem, mas não reordena — e é a ordem das palavras
 * que denuncia o anúncio de marketplace. Onde alguém já escreveu o nome à mão
 * (`nomes-curados.ts`), é ele que vale; produto novo, que o extrator traga
 * amanhã, continua saindo pela regra em vez de sair sem nome.
 */
export function nomeDeVitrine(produto: { handle?: string; title: string }): string {
  const curado = produto.handle ? NOMES_CURADOS[produto.handle] : undefined;
  return curado ?? nomeDeProduto(produto.title);
}

/** Escapa o que vai para dentro do HTML da descrição. */
function seguro(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A DESCRIÇÃO do produto, montada do mesmo material.
 *
 * Antes era o título cru dentro de um `<p>` — a mesma linha de palavras-chave
 * que já estava no topo da página, repetida embaixo dela, cortada no meio da
 * palavra. Agora o anúncio vira uma lista de características, e a nota da
 * origem continua declarada como o que é: da ORIGEM, não uma avaliação que
 * esta loja recebeu.
 */
export function descricaoDoProduto(fonte: { title: string; rating?: number | null; sold?: string }): string {
  const caracteristicas = caracteristicasDoProduto(fonte.title);
  const corpo = caracteristicas.length
    ? `<ul>${caracteristicas.map((item) => `<li>${seguro(item)}</li>`).join("")}</ul>`
    : `<p>${seguro(comInicialMaiuscula(semLigacaoFinal(trechos(fonte.title).join(", "))))}</p>`;
  const nota = fonte.rating
    ? `<p>Nota ${fonte.rating} na origem${fonte.sold ? `, ${seguro(limpar(fonte.sold))}` : ""}.</p>`
    : "";
  return `${corpo}${nota}`;
}
