import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAssetRefs } from '@ds/explorer';
import { hrefsDasFolhas, particionarCss, urlDaFolha } from './css-externo.js';

const PAGINA = 'https://exemplo.com/precos';

/** O que o coletor lê de `document.styleSheets` é o `href` já resolvido. */
const FONTES = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';

test('folha sem .css na URL (Google Fonts) vai para o localizeCss, não para os assets crus', () => {
  const html = `
<link rel="stylesheet" href="${FONTES}">
<link rel="stylesheet" href="/_next/static/css/a1b2.css">
<img src="/img/logo.png">`;
  const refs = extractAssetRefs(html, '', PAGINA);
  const folhas = hrefsDasFolhas(
    [
      { inline: false, href: FONTES },
      { inline: false, href: '/_next/static/css/a1b2.css' },
      { inline: true, href: null },
    ],
    PAGINA,
  );

  const { cssUrls, outros } = particionarCss(refs, folhas);

  assert.ok(
    cssUrls.includes(FONTES),
    `a folha das fontes precisa ser localizada como CSS: ${cssUrls.join(' | ')}`,
  );
  assert.ok(cssUrls.includes('https://exemplo.com/_next/static/css/a1b2.css'));
  assert.ok(
    !outros.some((r) => r.raw.includes('fonts.googleapis.com')),
    'e não pode ser baixada crua também — seria download duplicado sem reescrita',
  );
  // O que não é folha continua no caminho normal.
  assert.ok(outros.some((r) => r.raw === '/img/logo.png'));
});

test('folha injetada por JS (ausente do HTML) entra pela coleta', () => {
  const refs = extractAssetRefs('<img src="/a.png">', '', PAGINA);
  const folhas = hrefsDasFolhas([{ inline: false, href: '/tema-escuro.css' }], PAGINA);
  const { cssUrls } = particionarCss(refs, folhas);
  assert.deepEqual(cssUrls, ['https://exemplo.com/tema-escuro.css']);
});

test('href inválido não derruba a resolução — segue como veio', () => {
  // Host malformado: um dos poucos casos em que `new URL(href, base)` lança.
  assert.equal(urlDaFolha('http://[', PAGINA), 'http://[');
  assert.equal(urlDaFolha('/a.css', PAGINA), 'https://exemplo.com/a.css');
});

test('sem folhas externas, a partição é a de sempre (por extensão)', () => {
  const refs = extractAssetRefs(
    '<link rel="stylesheet" href="/e.css"><img src="/b.jpg">',
    '',
    PAGINA,
  );
  const { cssUrls, outros } = particionarCss(refs, new Set());
  assert.deepEqual(cssUrls, ['https://exemplo.com/e.css']);
  assert.deepEqual(
    outros.map((r) => r.raw),
    ['/b.jpg'],
  );
});
