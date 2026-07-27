import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { segmentDesignSystem } from './index.js';

/**
 * Teste de integração do segmenter sobre um `design-system.html` de fixture.
 *
 * Prova as correções que mais importam: um background animado (canvas), um orbe
 * de gradiente e um modal oculto — que a regra de enfeite/escondido apagava —
 * agora viram segmentos, cada um com a sua avaliação de fidelidade. E o que já
 * funcionava (hero, seções com texto) continua funcionando.
 */

const FIXTURE = `<!doctype html>
<html><head><style>@keyframes float{from{top:0}to{top:10px}}</style></head>
<body class="bg-black text-white">
  <section class="hero p-20">
    <h1>Alche Studio</h1>
    <p>Um estúdio de design que constrói interfaces com muito cuidado e carinho pra cada detalhe.</p>
    <a class="btn bg-white rounded px-4 py-2">Comece agora</a>
  </section>

  <canvas id="bg" class="webgl fixed inset-0 h-full w-full"></canvas>

  <div class="absolute inset-0 gradient-orb blur-3xl pointer-events-none"></div>

  <section class="faq p-20">
    <h2>Perguntas frequentes</h2>
    <button aria-expanded="false" class="accordion-trigger">O que vocês fazem?</button>
    <div class="accordion-panel" hidden>Design de produto e sites sob medida.</div>
  </section>

  <div role="dialog" aria-modal="true" class="modal" style="display:none">
    <h3>Assine a newsletter</h3>
    <button>Fechar</button>
  </div>

  <div class="p-2"><button aria-label="avancar" class="seta"><svg viewBox="0 0 8 8"><path d="M0 0h8v8"/></svg></button></div>
  <footer class="p-10"><p>© 2026 Alche Studio. Todos os direitos reservados.</p></footer>
</body></html>`;

const setupVault = (): { root: string; dsId: `ds_${string}` } => {
  const root = mkdtempSync(join(tmpdir(), 'ds-seg-'));
  process.env.DS_ECOSYSTEM_ROOT = root;
  const dsId = 'ds_01TESTSEGMENT0000000000000' as `ds_${string}`;
  const extracted = join(root, 'vault', dsId, 'extracted');
  mkdirSync(extracted, { recursive: true });
  writeFileSync(join(extracted, 'design-system.html'), FIXTURE, 'utf8');
  return { root, dsId };
};

test('fragmento decorativo (canvas, orbe de gradiente) NÃO vira segmento — vai para a Revisão com motivo', () => {
  const { root, dsId } = setupVault();
  try {
    const res = segmentDesignSystem(dsId);
    // A Galeria não recebe efeito solto: nenhum segmento é só canvas/orbe.
    assert.equal(
      res.segments.filter((s) => s.category === 'background').length,
      0,
      'background solto não é componente',
    );
    // Mas nada some calado: os efeitos estão na Revisão, com o motivo humano.
    const efeitos = res.rejected.filter((r) =>
      r.motivos.some((m) => /Efeito visual sem conteúdo próprio/.test(m)),
    );
    assert.ok(efeitos.length >= 2, `esperava ≥2 efeitos na Revisão, veio ${efeitos.length}`);
    assert.ok(res.rejected.some((r) => r.htmlSnippet.includes('<canvas')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('controle solto (botão de seta isolado) NÃO vira componente — Revisão explica', () => {
  const { root, dsId } = setupVault();
  try {
    const res = segmentDesignSystem(dsId);
    assert.ok(
      !res.segments.some((s) => s.htmlSnippet.includes('aria-label="avancar"')),
      'um botão isolado não é componente reutilizável',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('promove modal oculto a segmento overlay em vez de descartá-lo', () => {
  const { root, dsId } = setupVault();
  try {
    const res = segmentDesignSystem(dsId);
    const overlays = res.segments.filter((s) => s.category === 'overlay');
    assert.equal(overlays.length, 1);
    assert.ok(overlays[0]?.htmlSnippet.includes('role="dialog"'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('o que já funcionava continua: hero e rodapé presentes', () => {
  const { root, dsId } = setupVault();
  try {
    const res = segmentDesignSystem(dsId);
    assert.ok(res.segments.some((s) => s.category === 'hero'));
    assert.ok(res.segments.some((s) => s.category === 'footer'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cada segmento tem avaliação de fidelidade; canvas é visual, accordion é parcial', () => {
  const { root, dsId } = setupVault();
  try {
    const res = segmentDesignSystem(dsId);
    // Um insight por segmento.
    assert.equal(res.insights.length, res.segments.length);

    const faqSeg = res.segments.find((s) => s.category === 'faq');
    const faqInsight = res.insights.find((i) => i.segmentId === faqSeg?.id);
    assert.equal(faqInsight?.support, 'parcial');
    assert.ok(faqInsight?.interactions.some((it) => it.kind === 'toggle'));

    const heroSeg = res.segments.find((s) => s.category === 'hero');
    const heroInsight = res.insights.find((i) => i.segmentId === heroSeg?.id);
    assert.equal(heroInsight?.support, 'completo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
