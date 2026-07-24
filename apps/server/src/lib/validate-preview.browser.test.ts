import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CaptureManifest, DesignSystemId, InteractionKind } from '@ds/shared';

/**
 * Integração REAL de ponta a ponta da validação automática (req 20):
 *
 *   fixture local → segmentação → preview de produção → validarPreviews
 *   (navegador de verdade) → validation.json → API /segments → `validated`.
 *
 * Prova que o fluxo automático promove `replayable`→`validated` sem comando
 * manual, reusando a previewRoute. Pula (sem falhar) se o navegador faltar.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright/servidor opcional e não tipado
type Any = any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const DESIGN_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
.acc-painel{display:none}.acc-item.aberto .acc-painel{display:block}
.tab-panel{display:none}.tab-panel.ativo{display:block}
</style></head><body>
<section><div class="acc-item"><button id="acc-t" class="acc-trigger" aria-expanded="false">Pergunta sobre prazos</button><div class="acc-painel">Resposta com o prazo de entrega em cinco dias úteis.</div></div></section>
<section><div role="tablist"><button id="tab-1" class="tab-btn" aria-selected="true">Visão geral do produto</button><button id="tab-2" class="tab-btn" aria-selected="false">Detalhes técnicos</button></div><div class="tab-panel ativo" id="p1">Painel de visão geral do produto.</div><div class="tab-panel" id="p2">Painel de detalhes técnicos.</div></section>
<section><button id="abre" class="modal-abre">Abrir formulário de contato</button></section>
</body></html>`;

const ACC_ABERTO =
  '<section><div class="acc-item aberto"><button id="acc-t" class="acc-trigger" aria-expanded="true">Pergunta sobre prazos</button><div class="acc-painel">Resposta com o prazo de entrega em cinco dias úteis.</div></div></section>';
const TAB_ATIVA =
  '<section><div role="tablist"><button id="tab-1" class="tab-btn" aria-selected="false">Visão geral do produto</button><button id="tab-2" class="tab-btn" aria-selected="true">Detalhes técnicos</button></div><div class="tab-panel" id="p1">Painel de visão geral do produto.</div><div class="tab-panel ativo" id="p2">Painel de detalhes técnicos.</div></section>';
const MODAL_SECTION =
  '<section><button id="abre" class="modal-abre">Abrir formulário de contato</button></section>';
const MODAL_PORTAL =
  '<div class="modal-portal"><div class="caixa">Formulário de contato.</div></div>';

const el = (
  id: string,
  kinds: InteractionKind[],
  stId: string,
  html: string,
  portalHtml?: string,
) => ({
  ref: id,
  tag: 'button',
  role: null,
  box: { x: 0, y: 0, w: 120, h: 40 },
  label: id,
  match: { id, classes: [] as string[] },
  interactions: kinds,
  states: [
    {
      id: stId,
      trigger: 'click' as const,
      label: 'estado',
      signature: stId,
      html,
      ...(portalHtml ? { portalHtml } : {}),
    },
  ],
  assessment: {
    support: 'parcial' as const,
    renderMode: 'html-js' as const,
    fidelity: 70,
    warnings: [],
    capabilities: { dependsOnJs: true },
    interactions: [],
  },
});

const manifesto = (): CaptureManifest => ({
  version: 1,
  url: 'http://local/',
  capturedAt: Date.now(),
  strategy: 'playwright',
  exploration: { mode: 'deep', reasons: ['fixture'], durationMs: 1, limitsHit: [], errors: [] },
  viewport: { width: 1440, height: 900 },
  stylesheets: [],
  assets: [],
  elements: [
    el('acc-t', ['click', 'toggle'], 'st_acc', ACC_ABERTO),
    el('tab-2', ['click', 'tab'], 'st_tab', TAB_ATIVA),
    el('abre', ['click', 'modal'], 'st_modal', MODAL_SECTION, MODAL_PORTAL),
  ],
  stats: {
    durationMs: 1,
    elementsAnalyzed: 3,
    interactionsTried: 3,
    statesFound: 3,
    assetsFound: 0,
    assetsSaved: 0,
    assetsBytes: 0,
  },
  warnings: [],
});

test('auto-validação real: fixture → segmenter → validarPreviews → validation.json → API', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) {
    t.skip('Playwright indisponível — validação em navegador pulada.');
    return;
  }
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
    return;
  }

  const root = join(tmpdir(), `ds-autoval-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { segmentDesignSystem } = await import('@ds/segmenter');
  const { validarPreviews } = await import('./validate-preview.js');
  const { designSystemsRoute } = await import('../routes/design-systems.js');
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  mkdirSync(shared.vaultCaptureDir(dsId), { recursive: true });
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), DESIGN_HTML);
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(manifesto()));

  const seg = segmentDesignSystem(dsId);
  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: null,
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'Auto-val',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  for (const s of seg.segments) db.insert(tables.segments).values(s).run();

  const srv2 = new Hono();
  srv2.route('/api/design-systems', designSystemsRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: srv2.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });

  t.after(async () => {
    await new Promise<void>((r) => srv.close(() => r()));
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* temp preso no Windows; ignora */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  // === Validação automática REAL (navegador interno via previewRoute) ===
  const val = await validarPreviews(dsId);
  assert.equal(val.status, 'concluida', 'todos os previews validaram');
  const okKinds = new Set(val.results.filter((r) => r.ok).map((r) => r.kind));
  assert.ok(okKinds.has('toggle'), 'accordion (toggle) reproduziu + resetou');
  assert.ok(okKinds.has('tab'), 'tabs reproduziu');
  assert.ok(okKinds.has('modal'), 'modal em portal reproduziu');

  // === A API /segments mostra `validated` sem reextração ===
  const res = await fetch(`http://localhost:${port}/api/design-systems/${dsId}/segments`);
  const body = (await res.json()) as Any;
  const insAccId = (seg.insights ?? []).find((i) =>
    i.states?.some((x) => x.id === 'st_acc'),
  )?.segmentId;
  const acc = body.items.find((i: Any) => i.id === insAccId)?.fidelity;
  assert.ok(acc, 'insight do accordion presente na API');
  assert.equal(
    acc.pipeline.find((p: Any) => p.kind === 'toggle')?.status,
    'validated',
    'accordion promovido a validated na Galeria',
  );

  // === Idempotência: revalidar reaproveita o cache (não re-executa) ===
  const antes = val.segments.map((s) => `${s.segmentId}:${s.validatedAt}`).sort();
  const val2 = await validarPreviews(dsId);
  const depois = val2.segments.map((s) => `${s.segmentId}:${s.validatedAt}`).sort();
  assert.deepEqual(depois, antes, 'segunda validação reaproveita o cache (validatedAt preservado)');
});
