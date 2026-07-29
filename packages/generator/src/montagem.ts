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
 * Remove os avisos internos do bundle (`<aside data-ds-aviso>`) e os links de
 * stylesheet — o CSS entra concatenado, e o aviso é conversa da Galeria com o
 * usuário, não conteúdo do site gerado.
 */
export const limparParaComposicao = (corpo: string): string =>
  corpo
    .replace(/<aside[^>]*data-ds-aviso[\s\S]*?<\/aside>/gi, '')
    .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
    .trim();

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
