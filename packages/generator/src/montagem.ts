/**
 * Montagem PURA de uma seção do site a partir do bundle de um componente.
 *
 * O bundle V2 é um documento completo (doctype/head/body) com CSS em
 * `assets/css/*.css`, JS em `assets/js/*.js` e arquivos em `assets/...`;
 * o legado é um fragmento com `styles.css`. Aqui vive tudo que dá para
 * testar sem disco: extrair o corpo, tirar avisos internos do bundle,
 * reescrever referências de asset para o namespace do componente.
 */

/** Extrai o conteúdo do <body> quando o HTML é um documento completo. */
export const extrairCorpo = (html: string): string => {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m?.[1] ?? html).trim();
};

/**
 * Os atributos crus de `<html>` e `<body>` do documento do bundle.
 *
 * O corpo da peça sai do `<body>`, e os atributos ficam para trás — mas é neles
 * que moram o tema (`class="dark"`), o fundo (`class="bg-[#03020A]"`) e a
 * tipografia base de qualquer site feito com utilitários. Sem eles, `html.dark
 * .card` e `body.bg-black .x` viram regras mortas: íntegras no arquivo, sem
 * casar com nada na tela. Os proxies do compositor os vestem de volta.
 */
export const atributosDoDocumentoDaPeca = (html: string): { html?: string; body?: string } => {
  const pegar = (tag: 'html' | 'body'): string | undefined => {
    const m = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(html);
    const bruto = m?.[1]?.trim();
    return bruto === undefined || bruto === '' ? undefined : bruto;
  };
  const saida: { html?: string; body?: string } = {};
  const h = pegar('html');
  const b = pegar('body');
  if (h !== undefined) saida.html = h;
  if (b !== undefined) saida.body = b;
  return saida;
};

/**
 * Remove um elemento inteiro pelo atributo, contando abertura e fechamento.
 *
 * Regex não serve aqui: o bloco a remover tem `<div>` dentro, e um `[\s\S]*?`
 * pararia no primeiro `</div>`, deixando órfãos que quebram o resto da página.
 * Este varredor conta profundidade e corta no fechamento certo.
 */
const removerElementoPorAtributo = (html: string, atributo: string, tag = 'div'): string => {
  const abertura = new RegExp(`<${tag}\\b[^>]*\\b${atributo}\\b[^>]*>`, 'i');
  let saida = html;
  for (;;) {
    const inicio = abertura.exec(saida);
    if (inicio === null) return saida;
    const corpoComeca = inicio.index + inicio[0].length;
    const passo = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    passo.lastIndex = corpoComeca;
    let profundidade = 1;
    let fim = -1;
    for (;;) {
      const m = passo.exec(saida);
      if (m === null) break;
      profundidade += m[0].startsWith('</') ? -1 : 1;
      if (profundidade === 0) {
        fim = m.index + m[0].length;
        break;
      }
    }
    // Sem fechamento à vista, o honesto é não mexer: cortar até o fim do
    // documento faria sumir conteúdo que nada tem a ver com o bloco.
    if (fim === -1) return saida;
    saida = saida.slice(0, inicio.index) + saida.slice(fim);
  }
};

/**
 * Prepara o corpo do bundle para virar parte de uma página.
 *
 * Três coisas saem:
 *
 * 1. `<aside data-ds-aviso>` — conversa da Galeria com o usuário, não conteúdo
 *    do site gerado.
 * 2. `<link rel=stylesheet>` — o CSS entra concatenado.
 * 3. `<div data-ds-camadas-de-fundo>` — e este é o que mais importa. O motor
 *    embute nele as camadas `position:fixed` que passavam atrás daquela dobra,
 *    para a peça, vista SOZINHA na Galeria, aparecer com o fundo que ela tinha
 *    no site. Numa página montada isso vira duplicata: cada peça arrasta uma
 *    cópia do fundo da própria origem. O sintoma mais feio era a navegação, que
 *    tem poucos pixels de altura e chegava carregando um canvas de tela cheia
 *    junto: o que devia ser uma barra virava uma dobra inteira. Numa página, o
 *    fundo é da PÁGINA, e quem o coloca uma vez só é `envolverCamadaDePagina`.
 */
export const limparParaComposicao = (corpo: string): string =>
  removerElementoPorAtributo(
    corpo
      .replace(/<aside[^>]*data-ds-aviso[\s\S]*?<\/aside>/gi, '')
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, ''),
    'data-ds-camadas-de-fundo',
  ).trim();

/**
 * Reescreve referências de asset do HTML para o namespace do componente:
 * `assets/x` vira `assets/<cmpId>/x` — cada componente leva os próprios
 * arquivos sem colidir com os dos outros.
 */
export const reescreverRefsHtml = (html: string, cmpId: string): string =>
  html.replace(/(src|href|poster)=(["'])assets\//gi, `$1=$2assets/${cmpId}/`);

/**
 * Reescreve url() do CSS concatenado (que passa a viver na raiz de assets/):
 * `url(../x)` (relativo a assets/css/) e `url(assets/x)` apontam para
 * `assets/<cmpId>/x`.
 */
export const reescreverRefsCss = (css: string, cmpId: string): string =>
  // `assets/` primeiro; `../` depois — a saída do segundo introduz `assets/`
  // já com namespace e não pode ser reprocessada pelo primeiro.
  css
    .replace(/url\(\s*(["']?)assets\//gi, `url($1assets/${cmpId}/`)
    .replace(/url\(\s*(["']?)\.\.\//gi, `url($1assets/${cmpId}/`);

/**
 * Envelopa a seção com a proveniência explícita que o produto exige.
 *
 * Uma seção pode levar VÁRIAS peças agora, então `data-componente` lista os ids
 * separados por espaço e `data-origem` ganhou um terceiro valor: `misto`, para o
 * caso em que parte da seção veio do kit e parte foi criada no estilo. Dizer
 * "biblioteca" numa seção meio inventada seria mentir sobre a procedência, que é
 * justamente o que estes atributos existem para registrar.
 *
 * `data-secao-id` carrega o id da seção do usuário. Sem ele, duas seções do
 * mesmo papel produziriam dois `data-secao="hero"` indistinguíveis, e âncoras e
 * `querySelector` pegariam sempre a primeira.
 */
export const envolverSecao = (
  corpo: string,
  dados: { role: string; secaoId?: string; componentIds: readonly string[]; criouAlgo?: boolean },
): string => {
  const origem =
    dados.componentIds.length === 0 ? 'gerado' : dados.criouAlgo === true ? 'misto' : 'biblioteca';
  const cmp =
    dados.componentIds.length > 0 ? ` data-componente="${dados.componentIds.join(' ')}"` : '';
  const sid = dados.secaoId !== undefined ? ` data-secao-id="${dados.secaoId}"` : '';
  return `<section data-secao="${dados.role}"${sid} data-origem="${origem}"${cmp}>\n${corpo}\n</section>`;
};

/**
 * Embrulha as peças de fundo da página numa camada fixa atrás de tudo.
 *
 * Na origem essas peças (categoria `background`, kind `effect`) eram uma
 * camada que atravessa a página inteira; postas no fluxo como `<section>`,
 * colapsam numa faixa. O engine-v2 já recompõe o conceito DENTRO do bundle
 * (`data-ds-camadas-de-fundo`); este embrulho é o par do lado do site gerado,
 * para a peça que `separarCamadasDePagina` (de `@ds/shared`) promoveu a
 * camada da página.
 *
 * Cada propriedade do estilo tem um porquê:
 * - `position:fixed` + `inset:0`: a camada cobre a viewport inteira e segue
 *   presente durante toda a rolagem — é a limitação que o próprio bundle
 *   declara: o fundo atravessa a página, não uma dobra.
 * - `z-index:-1`: atrás de TODO o conteúdo, sem depender da posição no DOM
 *   nem exigir z-index no resto da página.
 * - `pointer-events:none`: fundo é decoração; ele não pode roubar o clique
 *   de um link ou botão que passa por cima.
 * - `overflow:hidden`: efeito que desenha além da borda (partícula, blob
 *   animado) não pode criar rolagem horizontal — requisito do mobile.
 *
 * `aria-hidden="true"` porque a camada é puramente decorativa: leitor de tela
 * não tem o que anunciar ali.
 *
 * O `corpo` chega aqui JÁ vestido nos dois proxies do compositor
 * (`data-ds-raiz`/`data-ds-corpo`): o CSS de origem precisa casar dentro da
 * camada do mesmo jeito que casa dentro de uma seção — o embrulho não pode
 * despir a peça.
 */
export const envolverCamadaDePagina = (
  corpo: string,
  dados: { componentIds: readonly string[] },
): string =>
  `${ESTILO_QUE_ABRE_PASSAGEM}\n<div data-ds-camadas-de-pagina aria-hidden="true" data-componente="${dados.componentIds.join(' ')}" style="position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden">\n${corpo}\n</div>`;

/**
 * Sem isto, a camada de fundo existe e ninguém a vê.
 *
 * O compositor veste cada peça em dois proxies e copia para o de corpo as
 * classes do `<body>` da origem. Entre elas vem a cor de fundo da página de
 * onde a peça saiu (num dos sites capturados, `bg-[#03020A]`, um preto quase
 * puro). O resultado é que cada peça pinta um retângulo opaco do tamanho dela,
 * e a camada, que está em `z-index:-1`, fica atrás de todos eles. O usuário
 * descreveu exatamente isso: o fundo animado aparece "abaixo da camada dos
 * outros componentes".
 *
 * A regra apaga só o fundo do PROXY DE CORPO, e só dentro de uma seção. O que
 * ela não toca é tão importante quanto o que ela toca:
 *
 * - o fundo próprio de cada seção interna continua, porque ele é da peça e não
 *   da página de origem;
 * - o proxy da camada de fundo fica de fora do seletor (ele não vive dentro de
 *   `[data-secao]`), então um fundo feito só de gradiente no corpo sobrevive.
 *
 * `!important` porque a classe da origem e este seletor têm a mesma força, e
 * quem ganha passa a depender da ordem em que o CSS foi concatenado. Empate
 * decidido por acaso é defeito que volta sozinho.
 */
const ESTILO_QUE_ABRE_PASSAGEM =
  '<style data-ds-camada-passa>[data-secao] [data-ds-corpo]{background-color:transparent!important;background-image:none!important}</style>';
