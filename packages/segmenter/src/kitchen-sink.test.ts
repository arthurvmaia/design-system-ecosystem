import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { segmentDesignSystem } from './index.js';

/**
 * Validação de largura sobre a página de teste `kitchen-sink.html`, que reúne
 * todos os cenários do pedido. Não checa só status 200: confere o CONTEÚDO
 * estrutural extraído — que os cenários que antes sumiam agora viram segmentos
 * com a fidelidade certa.
 */

const FIXTURE = fileURLToPath(
  new URL('../../../fixtures/test-pages/kitchen-sink.html', import.meta.url),
);

const setup = (): { root: string; dsId: `ds_${string}` } => {
  const root = mkdtempSync(join(tmpdir(), 'ds-kitchen-'));
  process.env.DS_ECOSYSTEM_ROOT = root;
  const dsId = 'ds_01KITCHENSINK000000000000A' as `ds_${string}`;
  const extracted = join(root, 'vault', dsId, 'extracted');
  mkdirSync(extracted, { recursive: true });
  copyFileSync(FIXTURE, join(extracted, 'design-system.html'));
  return { root, dsId };
};

test('a página de teste existe e é lida', () => {
  const html = readFileSync(FIXTURE, 'utf8');
  assert.match(html, /<canvas/);
  assert.match(html, /role="dialog"/);
});

test('overlay real entra; efeito solto (canvas, aurora) vai para a Revisão', () => {
  const { root, dsId } = setup();
  try {
    const res = segmentDesignSystem(dsId);
    const cats = new Set(res.segments.map((s) => s.category));
    // Modal oculto é conteúdo legítimo revelado por interação — continua.
    assert.ok(cats.has('overlay'), 'modal/overlay presente');
    // Efeito decorativo não é componente: nenhum segmento é só canvas/aurora…
    assert.ok(!cats.has('background'), 'background solto não vira card');
    assert.ok(!res.segments.some((s) => /^<canvas/i.test(s.htmlSnippet.trim())));
    // …mas nada some calado: está na Revisão com o motivo humano.
    assert.ok(
      res.rejected.some(
        (r) =>
          r.htmlSnippet.includes('<canvas') &&
          r.motivos.some((m) => /Efeito visual sem conteúdo próprio/.test(m)),
      ),
      'canvas decorativo revisável em Pendências',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cada cenário interativo recebe a fidelidade correta', () => {
  const { root, dsId } = setup();
  try {
    const res = segmentDesignSystem(dsId);
    const insightDe = (pred: (html: string) => boolean) => {
      const seg = res.segments.find((s) => pred(s.htmlSnippet));
      return res.insights.find((i) => i.segmentId === seg?.id);
    };

    // Accordion → parcial, com interação toggle.
    const faq = insightDe((h) => h.includes('accordion-trigger'));
    assert.equal(faq?.support, 'parcial');
    assert.ok(faq?.interactions.some((i) => i.kind === 'toggle'));

    // Tabs → parcial, com interação tab (mesmo sem o script no snippet).
    const tabs = insightDe((h) => h.includes('role="tab"'));
    assert.equal(tabs?.support, 'parcial');
    assert.ok(tabs?.interactions.some((i) => i.kind === 'tab'));

    // SVG animado → renderMode svg-animado.
    const svg = insightDe((h) => h.includes('<animate'));
    assert.equal(svg?.renderMode, 'svg-animado');

    // Seção estática (planos) → completo.
    const preco = insightDe((h) => h.includes('id="preco"'));
    assert.equal(preco?.support, 'completo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('nenhuma paleta de identidade é gerada na segmentação', () => {
  const { root, dsId } = setup();
  try {
    segmentDesignSystem(dsId);
    // O manifesto de segmentos não deve conter tokens de marca.
    const manifest = readFileSync(join(root, 'vault', dsId, 'segments', 'manifest.json'), 'utf8');
    assert.doesNotMatch(manifest, /"--primary"/);
    assert.doesNotMatch(manifest, /defaultTheme/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
