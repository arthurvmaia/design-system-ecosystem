import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cssResponsivoBase } from './responsivo.js';

test('camada responsiva: os invariantes de mobile de verdade', () => {
  const css = cssResponsivoBase();
  // Sem rolagem horizontal em largura nenhuma.
  assert.match(css, /overflow-x:\s*hidden/);
  // Mídia proporcional sempre.
  assert.match(css, /img, video, iframe, canvas, svg, picture\s*\{\s*max-width:\s*100%/);
  // Colunas empilham no celular.
  assert.match(css, /grid-template-columns:\s*1fr\s*!important/);
  // Texto confortável e alvo de toque digno.
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /min-height:\s*44px/);
  // Só age no breakpoint móvel — desktop fica intacto.
  assert.match(css, /@media \(max-width: 768px\)/);
  // Respeita a preferência de menos movimento.
  assert.match(css, /prefers-reduced-motion/);
  // NÃO toca identidade: nenhuma cor ou família de fonte imposta.
  assert.ok(!/color\s*:/.test(css), 'a camada não impõe cor');
  assert.ok(!/font-family/.test(css), 'a camada não impõe fonte');
});
