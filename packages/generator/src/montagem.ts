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

/** Envelopa a seção com a proveniência explícita que o produto exige. */
export const envolverSecao = (
  corpo: string,
  dados: { role: string; componentId: string | null },
): string => {
  const origem = dados.componentId !== null ? 'biblioteca' : 'gerado';
  const cmp = dados.componentId !== null ? ` data-componente="${dados.componentId}"` : '';
  return `<section data-secao="${dados.role}" data-origem="${origem}"${cmp}>\n${corpo}\n</section>`;
};
