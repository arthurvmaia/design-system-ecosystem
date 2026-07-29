import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { comporPecasDoKit, lerPecaDoBundle } from './pecas.js';

/** Monta um bundle mínimo em disco, com o formato real do compilador V2. */
const bundleFake = (opts: {
  css: string;
  corpo: string;
  attrsHtml?: string;
  attrsBody?: string;
  scripts?: string[];
}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'css', 'components.css'), opts.css, 'utf8');
  writeFileSync(
    join(dir, 'index.html'),
    [
      '<!doctype html>',
      `<html lang="pt-BR"${opts.attrsHtml === undefined ? '' : ` ${opts.attrsHtml}`}>`,
      '<head><link rel="stylesheet" href="assets/css/components.css"></head>',
      `<body${opts.attrsBody === undefined ? '' : ` ${opts.attrsBody}`}>`,
      '<aside data-ds-aviso="referencia-visual">aviso interno da Galeria</aside>',
      opts.corpo,
      ...(opts.scripts ?? []).map((s) => `<script src="${s}"></script>`),
      '</body></html>',
    ].join('\n'),
    'utf8',
  );
  return dir;
};

test('a peça sai com corpo, CSS e atributos de documento', () => {
  const dir = bundleFake({
    css: '.card{color:red}',
    corpo: '<div class="card">oi</div>',
    attrsHtml: 'class="dark"',
    attrsBody: 'class="bg-black"',
  });
  const p = lerPecaDoBundle({ id: 'cmp_a', bundlePath: dir, designSystemId: 'ds_x' });
  assert.ok(p !== null);
  assert.equal(p.origem, 'ds_x');
  assert.ok(p.html.includes('<div class="card">oi</div>'));
  assert.ok(p.css.includes('.card{color:red}'));
  assert.equal(p.documentoAttrs?.body, 'class="bg-black"');
});

test('o aviso interno da Galeria NÃO vai para o site do usuário', () => {
  // Ele é conversa do app com quem cura, não conteúdo da página entregue.
  const dir = bundleFake({ css: '', corpo: '<div>oi</div>' });
  const p = lerPecaDoBundle({ id: 'cmp_a', bundlePath: dir });
  assert.ok(!p?.html.includes('data-ds-aviso'));
});

test('os <link> de estilo saem do corpo: o CSS entra pela composição', () => {
  const dir = bundleFake({ css: '.x{color:red}', corpo: '<div>oi</div>' });
  const p = lerPecaDoBundle({ id: 'cmp_a', bundlePath: dir });
  assert.ok(!p?.html.includes('<link'));
});

test('sem design system declarado, a peça responde por si', () => {
  // Isola do mesmo jeito (só com mais CSS repetido), o que é melhor que
  // arriscar duas origens dividindo a mesma âncora.
  const dir = bundleFake({ css: '', corpo: '<div>oi</div>' });
  assert.equal(lerPecaDoBundle({ id: 'cmp_a', bundlePath: dir })?.origem, 'cmp_a');
});

test('bundle sem index.html devolve null em vez de lançar', () => {
  assert.equal(
    lerPecaDoBundle({ id: 'cmp_a', bundlePath: mkdtempSync(join(tmpdir(), 'v-')) }),
    null,
  );
});

test('só os scripts REMOTOS viajam: os locais já são copiados para assets/', () => {
  const dir = bundleFake({
    css: '',
    corpo: '<div>oi</div>',
    scripts: ['https://cdn.iconify.design/x.js', 'assets/js/local.js'],
  });
  assert.deepEqual(lerPecaDoBundle({ id: 'cmp_a', bundlePath: dir })?.scripts, [
    'https://cdn.iconify.design/x.js',
  ]);
});

// ── A composição completa, que é o que o modo fila chama ────────────────────

test('duas origens com a mesma classe saem escopadas, sem uma apagar a outra', () => {
  // O caso que a remoção da poda criou: enquanto o CSS era podado, juntar dois
  // bundles era seguro. Com a página inteira viajando, não é mais.
  const a = bundleFake({
    css: '.container{max-width:1200px}',
    corpo: '<div class="container">A</div>',
  });
  const b = bundleFake({
    css: '.container{max-width:640px}',
    corpo: '<div class="container">B</div>',
  });
  const r = comporPecasDoKit([
    { id: 'cmp_a', bundlePath: a, designSystemId: 'ds_a' },
    { id: 'cmp_b', bundlePath: b, designSystemId: 'ds_b' },
  ]);
  assert.ok(r.css.includes(':where([data-ds-corpo="ds_a"]) .container'));
  assert.ok(r.css.includes(':where([data-ds-corpo="ds_b"]) .container'));
  assert.equal(r.pecas.length, 2);
  assert.ok(r.pecas[0]?.includes('data-ds-raiz="ds_a"'));
  assert.ok(r.pecas[1]?.includes('data-ds-raiz="ds_b"'));
});

test('o escopo tem especificidade ZERO: a marca do usuário continua vencendo', () => {
  // Se a âncora ficasse fora do :where(), todo o CSS das origens subiria um
  // degrau e o marca.css perderia a cascata em todo lugar, sem erro nenhum.
  const a = bundleFake({ css: '.card{color:red}', corpo: '<div class="card">A</div>' });
  const r = comporPecasDoKit([{ id: 'cmp_a', bundlePath: a, designSystemId: 'ds_a' }]);
  assert.ok(r.css.includes(':where('));
  assert.ok(!/\[data-ds-corpo="ds_a"\]\s+\.card/.test(r.css.replace(/:where\([^)]*\)/g, '')));
});

test('peça sem bundle entra em faltando, e o resto do site é gerado', () => {
  const a = bundleFake({ css: '.x{color:red}', corpo: '<div>A</div>' });
  const r = comporPecasDoKit([
    { id: 'cmp_a', bundlePath: a, designSystemId: 'ds_a' },
    { id: 'cmp_sumiu', bundlePath: join(tmpdir(), 'nao-existe-mesmo') },
  ]);
  assert.deepEqual(r.faltando, ['cmp_sumiu']);
  assert.equal(r.pecas.length, 1, 'o site sai com uma seção a menos, não com um erro');
});

test('duas peças da MESMA origem compartilham a âncora e o CSS entra uma vez', () => {
  const a = bundleFake({ css: '.x{color:red}', corpo: '<div>A</div>' });
  const b = bundleFake({ css: '.x{color:red}', corpo: '<div>B</div>' });
  const r = comporPecasDoKit([
    { id: 'cmp_a', bundlePath: a, designSystemId: 'ds_mesmo' },
    { id: 'cmp_b', bundlePath: b, designSystemId: 'ds_mesmo' },
  ]);
  assert.equal(r.css.split('/* origem: ds_mesmo */').length - 1, 1);
  assert.equal(r.pecas.length, 2);
});

test('kit vazio não quebra a composição', () => {
  const r = comporPecasDoKit([]);
  assert.deepEqual(r.pecas, []);
  assert.deepEqual(r.faltando, []);
  assert.equal(r.css, '');
});
