import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { consolidarDesignSystemDoKit } from './design-system-do-kit.js';

/**
 * A consolidação lê os bundles COMO ESTÃO no disco: é o que faz o acervo
 * existente ganhar design system sem re-extração. Os bundles de teste imitam a
 * forma real (index.html com <link> + assets/css/).
 */

const bundleSintetico = (raiz: string, nome: string, css: string): string => {
  const dir = join(raiz, nome);
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="assets/css/tokens.css"></head><body><section>x</section></body></html>',
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), css, 'utf8');
  return dir;
};

test('duas peças da mesma origem consolidam UMA vez; origens diferentes separam', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'dsk-'));
  try {
    const claro = bundleSintetico(
      raiz,
      'claro',
      '.a{background:#faf9f6}.b{color:#272727}.c{background:#0d3c1f}.c2{background:#0d3c1f}.c3{background:#0d3c1f}',
    );
    const escuro = bundleSintetico(raiz, 'escuro', '.x{background:#0a0a1a}.y{color:#f5f5f5}');
    const ds = consolidarDesignSystemDoKit(
      [
        { id: 'cmp_a', bundlePath: claro, designSystemId: 'ds_claro' },
        { id: 'cmp_b', bundlePath: claro, designSystemId: 'ds_claro' },
        { id: 'cmp_c', bundlePath: escuro, designSystemId: 'ds_escuro' },
      ],
      1_700_000_000_000,
    );
    assert.equal(ds.origens.length, 2, 'mesma origem não consolida em dobro');
    assert.equal(ds.tema, 'misto');
    assert.ok(ds.limitacoes.some((l) => l.includes('divergem de tema')));

    const claroDs = ds.origens.find((o) => o.designSystemId === 'ds_claro');
    assert.equal(claroDs?.tema, 'claro');
    const verde = claroDs?.clusters.find((c) => c.corCanonica === '#0d3c1f');
    assert.equal(verde?.papel, 'primary');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('bundle sem CSS entra com clusters vazios e limitação, sem derrubar', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'dsk-'));
  try {
    mkdirSync(join(raiz, 'seco'), { recursive: true });
    writeFileSync(join(raiz, 'seco', 'index.html'), '<html><body>x</body></html>', 'utf8');
    const ds = consolidarDesignSystemDoKit(
      [{ id: 'cmp_x', bundlePath: join(raiz, 'seco'), designSystemId: 'ds_x' }],
      1,
    );
    assert.equal(ds.origens[0]?.clusters.length, 0);
    assert.ok(ds.limitacoes.some((l) => l.includes('não tem CSS')));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o timestamp vem de fora: a consolidação é determinística', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'dsk-'));
  try {
    const b = bundleSintetico(raiz, 'b', '.a{color:#123456}');
    const p = [{ id: 'cmp_a', bundlePath: b, designSystemId: 'ds_a' }];
    assert.deepEqual(consolidarDesignSystemDoKit(p, 42), consolidarDesignSystemDoKit(p, 42));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a escala da origem vem da CAPTURA; sem manifesto, ela não é inventada', () => {
  // A ausência precisa ser distinguível de uma escala vazia: "ninguém mediu"
  // e "este site não tem escala" são respostas diferentes.
  const raiz = mkdtempSync(join(tmpdir(), 'ds-escala-'));
  const bundle = join(raiz, 'b');
  mkdirSync(join(bundle, 'assets', 'css'), { recursive: true });
  writeFileSync(join(bundle, 'assets', 'css', 'x.css'), 'body{color:#111;background:#fff}');
  writeFileSync(
    join(bundle, 'index.html'),
    '<html><head><link rel="stylesheet" href="assets/css/x.css"></head><body>oi</body></html>',
  );

  const ds = consolidarDesignSystemDoKit([{ id: 'cmp_a', bundlePath: bundle }], 1);
  assert.equal(ds.origens[0]?.escala, undefined, 'sem captura, sem escala');
});
