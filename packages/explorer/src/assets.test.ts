import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AssetFetcher,
  absolutizeRefs,
  classifyByUrl,
  extPara,
  extractAssetRefs,
  localizeAssets,
  parseSrcset,
  resolveRef,
  rewriteReferences,
} from './assets.js';

test('parseSrcset: descarta descritores 1x/640w', () => {
  assert.deepEqual(parseSrcset('a.jpg 1x, b.jpg 2x'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(parseSrcset('/x/p.png 640w, /x/g.png 1280w'), ['/x/p.png', '/x/g.png']);
});

test('resolveRef: resolve relativa, ignora data/blob/#', () => {
  assert.equal(resolveRef('/a.png', 'https://s.com/p/'), 'https://s.com/a.png');
  assert.equal(resolveRef('img.png', 'https://s.com/p/'), 'https://s.com/p/img.png');
  assert.equal(resolveRef('data:image/png;base64,xxx', 'https://s.com/'), null);
  assert.equal(resolveRef('#top', 'https://s.com/'), null);
});

test('classifyByUrl: extensões viram categorias', () => {
  assert.equal(classifyByUrl('/x/a.woff2'), 'font');
  assert.equal(classifyByUrl('/x/a.css?v=2'), 'css');
  assert.equal(classifyByUrl('/x/a.svg'), 'svg');
  assert.equal(classifyByUrl('/x/anim.json'), 'json');
  assert.equal(classifyByUrl('/x/v.mp4'), 'video');
});

test('extractAssetRefs: html (src/srcset/poster), css url() e @import', () => {
  const html = `
    <img src="/img/a.png" srcset="/img/a.png 1x, /img/a@2x.png 2x">
    <video poster="/img/poster.jpg"></video>
    <link href="https://cdn.com/f.css">
    <a href="https://x.com/perfil">rede social</a>`;
  const css = `.x{background:url('/img/bg.webp')} @import "/css/more.css";`;
  const refs = extractAssetRefs(html, css, 'https://s.com/');
  const raws = refs.map((r) => r.raw).sort();
  assert.ok(raws.includes('/img/a.png'));
  assert.ok(raws.includes('/img/a@2x.png'));
  assert.ok(raws.includes('/img/poster.jpg'));
  assert.ok(raws.includes('/img/bg.webp'));
  assert.ok(raws.includes('/css/more.css'));
  assert.ok(raws.includes('https://cdn.com/f.css'));
  // O href de <a> (navegação) NÃO é asset — não pode ser capturado.
  assert.ok(!raws.includes('https://x.com/perfil'), 'href de âncora não é asset');
  // Deduplica: /img/a.png aparece em src e srcset, mas é uma referência só.
  assert.equal(refs.filter((r) => r.raw === '/img/a.png').length, 1);
});

test('rewriteReferences: troca só dentro de delimitadores, com prefixo', () => {
  const html = `<img src="/img/a.png"><div data-x="/img/a.png.bak">`;
  const map = new Map([['/img/a.png', 'image/deadbeef.png']]);
  const out = rewriteReferences(html, map, 'assets/');
  assert.ok(out.includes('src="assets/image/deadbeef.png"'));
  // Não acerta a substring dentro de /img/a.png.bak (tem .bak depois).
  assert.ok(out.includes('/img/a.png.bak'));
});

test('absolutizeRefs: relativas viram absolutas; absolutas/âncora/data ficam', () => {
  const html = `
    <link href="/assets/app.css">
    <script src="js/app.js"></script>
    <img src="img/a.png">
    <a href="/sobre">sobre</a>
    <a href="#topo">topo</a>
    <a href="https://x.com/p">externo</a>
    <img src="data:image/png;base64,AAA">
    <div style="background:url('bg/hero.webp')"></div>`;
  const out = absolutizeRefs(html, 'https://alche.studio/pt/');
  // Relativas → absolutas (resolvidas contra a base).
  assert.ok(out.includes('href="https://alche.studio/assets/app.css"'));
  assert.ok(out.includes('src="https://alche.studio/pt/js/app.js"'));
  assert.ok(out.includes('src="https://alche.studio/pt/img/a.png"'));
  assert.ok(
    out.includes('href="https://alche.studio/sobre"'),
    'href de âncora também vira absoluto',
  );
  assert.ok(out.includes("url('https://alche.studio/pt/bg/hero.webp')"));
  // Não mexe no que já é absoluto/âncora-de-fragmento/data.
  assert.ok(out.includes('href="#topo"'));
  assert.ok(out.includes('href="https://x.com/p"'));
  assert.ok(out.includes('src="data:image/png;base64,AAA"'));
});

const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);

test('localizeAssets: baixa, deduplica por conteúdo e monta o mapa de reescrita', async () => {
  // Duas URLs com o MESMO conteúdo, uma URL com conteúdo diferente.
  const fetcher: AssetFetcher = async (url) => {
    if (url.endsWith('dup1.png') || url.endsWith('dup2.png')) {
      return { status: 200, mimeType: 'image/png', bytes: bytesOf('MESMO') };
    }
    if (url.endsWith('outro.css')) {
      return { status: 200, mimeType: 'text/css', bytes: bytesOf('.a{color:red}') };
    }
    return null;
  };
  const refs = extractAssetRefs(
    `<img src="https://s.com/dup1.png"><img src="https://s.com/dup2.png"><link href="https://s.com/outro.css">`,
    '',
    'https://s.com/',
  );
  const escritos = new Map<string, Uint8Array>();
  const res = await localizeAssets(refs, fetcher, (p, b) => escritos.set(p, b), {
    assetConcurrency: 3,
    maxAssetBytes: 1_000_000,
  });
  // Conteúdo duplicado ⇒ um único asset salvo em disco.
  assert.equal(res.assets.filter((a) => a.kind === 'image').length, 1);
  assert.equal(res.stats.saved, 2, 'salvou o png e o css');
  // Ambas as URLs de imagem apontam para o mesmo arquivo local.
  const p1 = res.rewriteMap.get('https://s.com/dup1.png');
  const p2 = res.rewriteMap.get('https://s.com/dup2.png');
  assert.equal(p1, p2);
  assert.equal(escritos.size, 2, 'dois arquivos em disco (png dedup + css)');
});

test('localizeAssets: pula o que passa do teto de tamanho', async () => {
  const fetcher: AssetFetcher = async () => ({
    status: 200,
    mimeType: 'image/png',
    bytes: bytesOf('X'.repeat(500)),
  });
  const refs = extractAssetRefs(`<img src="https://s.com/big.png">`, '', 'https://s.com/');
  const res = await localizeAssets(refs, fetcher, () => {}, {
    assetConcurrency: 1,
    maxAssetBytes: 100,
  });
  assert.equal(res.stats.saved, 0);
  assert.equal(res.stats.skipped, 1);
});

// ── Fase 2: extensão que o navegador aceita executar ────────────────────────

test('URL terminando em VERSÃO não vira extensão: o conteúdo decide', () => {
  // O runtime do Tailwind (`…/3.4.17`) chegava com octet-stream, ganhava ext
  // "17" e era servido com nosniff: o navegador RECUSAVA executar o bundle
  // principal do site em 23 bundles do acervo.
  const js = new TextEncoder().encode('(()=>{var a=Object.create(null)})()');
  assert.equal(
    extPara('https://cdn.jsdelivr.net/npm/tailwindcss/3.4.17', 'application/octet-stream', js),
    'js',
  );
  // Binário desconhecido continua honesto: bin, nunca um palpite executável.
  assert.equal(
    extPara('https://cdn.test/coisa/9.9.9', 'application/octet-stream', new Uint8Array([0, 1, 2])),
    'bin',
  );
});

test('extensão CONHECIDA na URL continua valendo; MIME continua mandando', () => {
  assert.equal(extPara('https://f/x.woff2', 'application/octet-stream'), 'woff2');
  assert.equal(extPara('https://f/x.17', 'text/css'), 'css');
});

test('url() com aspa HTML-escapada nao carrega a entidade para o endereco', () => {
  // Num style="..." a aspa interna E OBRIGATORIAMENTE escapada, e o padrao de
  // extracao aceitava qualquer coisa que nao fosse ' " ou ) — e &quot; nao e
  // nenhum dos tres. A entidade ia parar no caminho do arquivo e a referencia
  // nunca resolvia. Medido: 28 bundles da Biblioteca e 12 ocorrencias nos 20
  // sites de prova, uma delas o fundo de uma secao inteira.
  const html =
    '<section style="background: url(&quot;assets/bg.jpg&quot;) center / cover"></section>';
  const refs = extractAssetRefs(html, '', 'https://exemplo.com/pagina');
  const bg = refs.find((r) => r.raw.includes('bg.jpg'));
  assert.ok(bg, 'a referencia foi encontrada');
  assert.equal(bg?.raw, 'assets/bg.jpg', 'sem a entidade grudada');
  assert.equal(bg?.absolute, 'https://exemplo.com/assets/bg.jpg');
});

test('url() com aspa normal continua funcionando', () => {
  const refs = extractAssetRefs('<div style="background:url(\'bg/hero.webp\')"></div>', '', null);
  assert.ok(refs.some((r) => r.raw === 'bg/hero.webp'));
});
