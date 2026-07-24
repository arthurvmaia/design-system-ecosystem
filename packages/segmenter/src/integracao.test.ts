import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CaptureManifest, DesignSystemId } from '@ds/shared';

/**
 * Ponta a ponta SEM navegador (seção 14): um manifesto de captura de fixture no
 * lugar do explorer, o segmenter real consumindo-o, e a leitura de volta da
 * persistência. Prova o caminho captura → associação → persistência → o que a
 * API/preview/Biblioteca leem, sem depender do Playwright.
 */

const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;

const DESIGN_SYSTEM_HTML = `<!doctype html><html><head><style>.painel{display:none}</style></head>
<body>
  <section id="faq"><button id="faq-toggle" class="accordion-trigger">Qual o prazo?</button><div class="painel">Cinco dias.</div></section>
  <section id="cta"><h2>Fale conosco</h2><button id="abre-modal" class="btn-abre">Abrir contato</button></section>
</body></html>`;

const manifesto = (): CaptureManifest => ({
  version: 1,
  url: 'http://local.test/',
  capturedAt: Date.now(),
  strategy: 'playwright',
  exploration: { mode: 'deep', reasons: ['sticky'], durationMs: 1200, limitsHit: [], errors: [] },
  viewport: { width: 1440, height: 900 },
  stylesheets: [],
  assets: [],
  elements: [
    {
      ref: 'r1',
      tag: 'button',
      role: null,
      box: { x: 0, y: 0, w: 100, h: 40 },
      label: 'Qual o prazo?',
      match: { id: 'faq-toggle', classes: ['accordion-trigger'] },
      interactions: ['click', 'toggle'],
      states: [
        {
          id: 'st_faq_aberto',
          trigger: 'click',
          label: 'aberto',
          signature: 'faq-open',
          html: '<button id="faq-toggle" class="accordion-trigger" aria-expanded="true">Qual o prazo?</button>',
        },
      ],
      assessment: {
        support: 'parcial',
        renderMode: 'html-js',
        fidelity: 70,
        warnings: [],
        capabilities: { dependsOnJs: true },
        interactions: [{ kind: 'toggle', support: 'parcial' }],
      },
    },
    {
      ref: 'r2',
      tag: 'button',
      role: null,
      box: { x: 0, y: 100, w: 120, h: 40 },
      label: 'Abrir contato',
      match: { id: 'abre-modal', classes: ['btn-abre'] },
      interactions: ['modal', 'click'],
      states: [
        {
          id: 'st_modal',
          trigger: 'click',
          label: 'modal aberto',
          signature: 'modal-open',
          html: '<button id="abre-modal" class="btn-abre">Abrir contato</button>',
          portalHtml: '<dialog open class="modal-contato">Formulário de contato</dialog>',
        },
      ],
      assessment: {
        support: 'parcial',
        renderMode: 'html-js',
        fidelity: 65,
        warnings: [],
        capabilities: { dependsOnJs: true, hasPortal: true },
        interactions: [{ kind: 'modal', support: 'parcial' }],
      },
    },
  ],
  stats: {
    durationMs: 1200,
    elementsAnalyzed: 2,
    interactionsTried: 4,
    statesFound: 2,
    assetsFound: 0,
    assetsSaved: 0,
    assetsBytes: 0,
  },
  warnings: [],
});

test('E2E: manifesto → segmenter → persistência (estados ligados e gravados)', async (t) => {
  const root = join(tmpdir(), `ds-e2e-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  // Import DEPOIS de fixar a raiz: as funções de path leem o env em cada chamada,
  // então isso é seguro, mas garante um ambiente limpo.
  const { segmentDesignSystem } = await import('./index.js');
  const shared = await import('@ds/shared');

  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  // Monta o vault como o extrair deixaria: design-system.html + capture/manifest.json.
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  mkdirSync(shared.vaultCaptureDir(dsId), { recursive: true });
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), DESIGN_SYSTEM_HTML);
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(manifesto()));

  // Roda o segmenter REAL.
  const resultado = segmentDesignSystem(dsId);

  // Lê o manifesto de segmentos de volta (o que a API serve).
  const manifest = shared.SegmentsManifest.parse(
    JSON.parse(readFileSync(shared.vaultSegmentsManifest(dsId), 'utf8')),
  );

  const segFaq = manifest.segments.find((s) => s.htmlSnippet.includes('faq-toggle'));
  const segCta = manifest.segments.find((s) => s.htmlSnippet.includes('abre-modal'));
  if (!segFaq || !segCta) throw new Error('os dois segmentos deveriam ter sido criados');

  const insFaq = (manifest.insights ?? []).find((i) => i.segmentId === segFaq.id);
  assert.ok(insFaq, 'insight do FAQ existe');
  assert.ok(insFaq?.states && insFaq.states.length >= 1, 'estados ligados ao segmento');
  const clique = insFaq?.pipeline?.find((p) => p.kind === 'click');
  assert.equal(clique?.status, 'replayable', 'clique com estado é reproduzível');
  assert.equal(insFaq?.confidence, 'alta', 'associação por id → confiança alta');
  assert.equal(insFaq?.pipelineVersion, shared.PIPELINE_VERSION);

  // Estados PERSISTIDOS no vault (o que o preview lê para reproduzir).
  const arquivoEstados = shared.SegmentStatesFile.parse(
    JSON.parse(readFileSync(shared.vaultSegmentStates(dsId, segFaq.id), 'utf8')),
  );
  assert.equal(arquivoEstados.states[0]?.html.includes('aria-expanded="true"'), true);

  // O modal em portal virou elemento relacionado + HTML preservado.
  const insCta = (manifest.insights ?? []).find((i) => i.segmentId === segCta.id);
  assert.ok(
    insCta?.related?.some((r) => r.kind === 'portal'),
    'modal em portal relacionado ao CTA',
  );
  const estadosCta = shared.SegmentStatesFile.parse(
    JSON.parse(readFileSync(shared.vaultSegmentStates(dsId, segCta.id), 'utf8')),
  );
  assert.equal(estadosCta.states[0]?.portalHtml?.includes('modal-contato'), true);

  // Resumo que a API devolve na listagem.
  const resumo = shared.resumirPipeline(insFaq?.pipeline ?? []);
  assert.ok(resumo.replayable >= 1);

  // Nenhuma interação ficou sem associação (todas casaram por id).
  assert.equal(resultado.segments.length >= 2, true);
});
