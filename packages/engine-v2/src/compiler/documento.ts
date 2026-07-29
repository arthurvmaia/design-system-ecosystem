/**
 * O que o segmento perde quando é recortado da página.
 *
 * Um recorte carrega o próprio HTML e o CSS, mas deixa para trás o DOCUMENTO em
 * que vivia: os atributos de `<html>` e `<body>` e os scripts que a página
 * carregava. Isso não é enfeite — é onde moram o tema (`class="dark"`), o fundo,
 * a tipografia base e o runtime que desenha os ícones.
 *
 * O sintoma era enganoso: a prévia da Galeria montava o head da página original
 * por fora do bundle, então na tela tudo aparecia certo. O defeito só nascia no
 * site entregue, onde essa muleta não existe.
 */

/** Os atributos crus de `<html>` e `<body>`, do jeito que estão no documento. */
export type AtributosDoDocumento = { html?: string; body?: string };

const capturarAtributos = (html: string, tag: 'html' | 'body'): string | undefined => {
  // Primeira ocorrência da tag de abertura. `[^>]*` basta porque atributo com
  // `>` dentro de valor é inválido em HTML e o parser do navegador já normalizou
  // o que veio do `page.content()`.
  const m = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(html);
  const bruto = m?.[1]?.trim();
  return bruto === undefined || bruto === '' ? undefined : bruto;
};

export const atributosDoDocumento = (html: string): AtributosDoDocumento => {
  const saida: AtributosDoDocumento = {};
  const h = capturarAtributos(html, 'html');
  const b = capturarAtributos(html, 'body');
  if (h !== undefined) saida.html = h;
  if (b !== undefined) saida.body = b;
  return saida;
};

/**
 * Os `<script src>` da página, na ordem do documento.
 *
 * Só as URLs: quem decide se elas viajam é o compilador. Scripts de dado
 * (`application/ld+json`, `importmap`) ficam de fora porque não são runtime —
 * eles já têm caminho próprio no bundle, inline no head.
 */
export const scriptsExternosDoDocumento = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1] ?? '';
    const tipo = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
    if (tipo !== undefined && tipo !== 'text/javascript' && tipo !== 'module') continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (src !== undefined && src.trim() !== '' && !out.includes(src)) out.push(src);
  }
  return out;
};
