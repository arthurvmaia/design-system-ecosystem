import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProjectBranding } from '@ds/shared';
import { buildBrandingCss } from './index.js';

const branding: ProjectBranding = {
  palette: {
    primary: '#c62828',
    background: '#0b0b0e',
    foreground: '#f5f5f4',
    accent: '#e03535',
  },
  typography: { display: 'Playfair Display', body: 'Inter' },
};

test('buildBrandingCss aplica a tipografia escolhida ao site gerado', () => {
  const css = buildBrandingCss(branding);
  // A fonte de títulos vai para os headings; a de corpo, para o body.
  assert.match(css, /h1,h2,h3,h4,h5,h6\{font-family:var\(--font-display\)\}/);
  assert.match(css, /body\{font-family:var\(--font-body\)\}/);
  // As variáveis carregam a pilha com fallback (não a string crua de antes).
  assert.match(css, /--font-display:"Playfair Display", Georgia/);
  assert.match(css, /--font-body:Inter, Arial/);
});

test('buildBrandingCss aplica a paleta escolhida (identidade do site)', () => {
  const css = buildBrandingCss(branding);
  assert.match(css, /--brand-primary: #c62828/);
  assert.match(css, /--brand-bg: #0b0b0e/);
  assert.match(css, /--primary: var\(--brand-primary\)/, 'sobrescreve o primary dos componentes');
});
