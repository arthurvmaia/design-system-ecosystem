import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isolateComponent } from './index.js';

/**
 * Prova as melhorias do isolador: um componente que usa uma animação, uma fonte
 * `@font-face` e variáveis `:root` mantém essas definições no CSS isolado (antes
 * sumiam por não terem seletor casável), e não traz o que não usa. E não gera
 * nenhuma paleta de identidade — só o CSS fiel.
 */

const CSS = `
.hero { animation: float 2s infinite; font-family: "Brand", sans-serif; color: var(--brand) }
.text-brand { color: var(--brand) }
.unused-elsewhere { color: blue }
@keyframes float { from { opacity: 0 } to { opacity: 1 } }
@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
@font-face { font-family: "Brand"; src: url(/fonts/brand.woff2) format("woff2") }
@font-face { font-family: "Naousada"; src: url(/fonts/x.woff2) }
:root { --brand: #c62828; --naoUsada: #000 }
`;

const withCss = (): { dir: string; cssDir: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-iso-'));
  const cssDir = join(dir, 'assets', 'css');
  mkdirSync(cssDir, { recursive: true });
  writeFileSync(join(cssDir, 'main.css'), CSS, 'utf8');
  return { dir, cssDir };
};

const HTML = '<div class="hero"><span class="text-brand">Alche</span></div>';

test('preserva @keyframes referenciado e descarta o não usado', () => {
  const { dir, cssDir } = withCss();
  try {
    const r = isolateComponent({ html: HTML, cssDir });
    assert.match(r.css, /@keyframes float/);
    assert.doesNotMatch(r.css, /@keyframes spin/);
    // O @keyframes reintroduzido tem corpo (não é oco).
    assert.match(r.css, /@keyframes float\s*\{[\s\S]*opacity/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preserva @font-face da fonte usada e a variável :root usada', () => {
  const { dir, cssDir } = withCss();
  try {
    const r = isolateComponent({ html: HTML, cssDir });
    assert.match(r.css, /@font-face/);
    assert.match(r.css, /Brand/);
    assert.doesNotMatch(r.css, /Naousada/i);
    assert.match(r.css, /--brand:/);
    assert.doesNotMatch(r.css, /--naoUsada/);
    assert.ok(r.stats.depsPreserved >= 3, `depsPreserved=${r.stats.depsPreserved}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('descarta regra que não casa com o componente', () => {
  const { dir, cssDir } = withCss();
  try {
    const r = isolateComponent({ html: HTML, cssDir });
    assert.doesNotMatch(r.css, /unused-elsewhere/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('anexa avaliação de fidelidade; componente estático é completo', () => {
  const { dir, cssDir } = withCss();
  try {
    const r = isolateComponent({ html: HTML, cssDir });
    assert.equal(r.fidelity.support, 'completo');
    assert.equal(r.fidelity.renderMode, 'html');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('não emite nenhuma paleta de identidade (--primary / --color-N)', () => {
  const { dir, cssDir } = withCss();
  try {
    const r = isolateComponent({ html: HTML, cssDir });
    // A cor original é preservada para o preview, mas nada de tokens de marca.
    assert.doesNotMatch(r.css, /--primary\b/);
    assert.doesNotMatch(r.css, /--color-\d/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
