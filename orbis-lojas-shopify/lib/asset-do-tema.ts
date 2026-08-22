/**
 * O ENDEREÇO com que este app serve um arquivo que veio dentro de um tema.
 *
 * Mora sozinho porque é um contrato entre partes que não se conhecem: a
 * importação e o render GRAVAM esse endereço; o render, o editor e a exportação
 * o LEEM. Enquanto cada lado escrevia e reconhecia o formato à mão, ele foi
 * gravado por dois e reconhecido por nenhum.
 *
 * O estrago foi exatamente esse. Uma loja reimportada volta com a arte apontando
 * para cá — e os três leitores tratavam a URL como nome de arquivo, tirando o
 * "basename" de `/api/theme-assets?fp=…&path=…`, que dá `theme-assets`, sem
 * extensão e sem casar com nada:
 *
 *     render   o banner caía no `placeholder_svg_tag` — o quadro cinza
 *     editor   a miniatura da imagem ficava vazia
 *     export   o tema saía com uma URL local dentro, morta na Shopify
 *
 * Uma loja com logo, dois banners e três capas voltava sem nenhum deles, e o
 * arquivo estava no pacote o tempo todo. Por isso o formato passa a ter dono:
 * quem grava chama `urlDeAssetDoTema`, quem lê chama `ehUrlDeAssetDoTema`, e
 * quem precisa do arquivo de volta chama `nomeDoAssetNaUrl`.
 */

/** A rota que serve o arquivo. Ver `app/api/theme-assets/route.ts`. */
export const ROTA_DE_ASSET_DO_TEMA = "/api/theme-assets";

/** O endereço servido de um arquivo do tema (`assets/logo.png`, por exemplo). */
export function urlDeAssetDoTema(fingerprint: string, caminho: string): string {
  return `${ROTA_DE_ASSET_DO_TEMA}?fp=${fingerprint}&path=${encodeURIComponent(caminho)}`;
}

/** Este valor é um arquivo que ESTE app serve? */
export function ehUrlDeAssetDoTema(valor: unknown): boolean {
  return typeof valor === "string" && valor.startsWith(`${ROTA_DE_ASSET_DO_TEMA}?`);
}

/**
 * O NOME do arquivo dentro do endereço — `…path=assets%2Flogo.png` → `logo.png`.
 *
 * É o que devolve a referência à forma canônica da Shopify na exportação. Sem
 * isto, o tema exportado levaria para dentro da loja do cliente um endereço que
 * só existe nesta máquina, e apontando para um `fp` que morre na próxima
 * importação.
 */
export function nomeDoAssetNaUrl(valor: string): string {
  if (!ehUrlDeAssetDoTema(valor)) return "";
  const bruto = /[?&]path=([^&]*)/.exec(valor)?.[1] ?? "";
  /* caminho do cliente: `decodeURIComponent` estoura com `%` solto, e um nome
     que não decodifica ainda vale mais que uma exceção no meio da exportação */
  let caminho = bruto;
  try {
    caminho = decodeURIComponent(bruto);
  } catch {
    caminho = bruto;
  }
  return caminho.split("/").at(-1) ?? "";
}
