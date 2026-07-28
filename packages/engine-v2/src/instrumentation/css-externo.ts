import type { AssetRef } from '@ds/explorer';

/**
 * Quem é folha de estilo, para efeito de localização.
 *
 * O `extractAssetRefs` deduz a categoria pela EXTENSÃO da URL, e stylesheet sem
 * `.css` no caminho existe e é comum: o embed padrão do Google Fonts é
 * `https://fonts.googleapis.com/css2?family=…`. Classificada como "outro", a
 * folha era baixada crua — sem reescrita de `@import`/`@font-face` e sem entrar
 * no `cssMap` —, o bundle saía sem as fontes e, pior, a folha entrava em
 * "sem cópia local": todo componente portátil era rebaixado a "parcial".
 *
 * O coletor, esse, SABE o que é folha: leu `document.styleSheets`. Estas funções
 * usam essa lista como fonte da verdade e deixam a extensão só para o resto.
 */

/** Uma folha coletada, no que importa aqui. */
export type FolhaColetada = { inline: boolean; href: string | null };

/** URL absoluta de uma folha, resolvida contra a página. Inválida segue como veio. */
export const urlDaFolha = (href: string, baseUrl: string): string => {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
};

/** As URLs absolutas das folhas `<link>` do documento (as inline não têm URL). */
export const hrefsDasFolhas = (folhas: FolhaColetada[], baseUrl: string): Set<string> =>
  new Set(
    folhas
      .filter((f): f is FolhaColetada & { href: string } => !f.inline && f.href !== null)
      .map((f) => urlDaFolha(f.href, baseUrl)),
  );

/**
 * Separa o que vai para o `localizeCss` (folhas) do que vai para o
 * `localizeAssets` (o resto). Uma folha nunca cai nos dois: baixá-la crua ao
 * lado da versão reescrita só gastaria rede e confundiria o mapa de reescrita.
 */
export const particionarCss = (
  refs: AssetRef[],
  hrefsDeFolhas: ReadonlySet<string>,
): { cssUrls: string[]; outros: AssetRef[] } => {
  const ehFolha = (r: AssetRef): boolean => r.absolute !== null && hrefsDeFolhas.has(r.absolute);
  const cssUrls = new Set([
    ...refs.filter((r) => r.kind === 'css' && r.absolute !== null).map((r) => r.absolute as string),
    // Folha que o HTML não declarou (injetada por JS) entra pela coleta.
    ...hrefsDeFolhas,
  ]);
  return {
    cssUrls: [...cssUrls],
    outros: refs.filter((r) => r.kind !== 'css' && !ehFolha(r)),
  };
};
