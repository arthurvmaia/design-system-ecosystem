import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { CaptureManifest, CapturedElement, DesignSystemId, InteractionKind } from '@ds/shared';

/**
 * Validação REAL, em navegador, do replay do preview de PRODUÇÃO.
 *
 * Não é uma implementação paralela: sobe a `previewRoute` de verdade (a mesma que
 * a Galeria embute num iframe `sandbox="allow-scripts"`), monta o vault pelo
 * pipeline real (segmenter → estados no vault), abre o preview num iframe idêntico
 * ao da Galeria e executa as interações de verdade — clicando, passando o mouse,
 * focando — conferindo o DOM e o estado visual, o botão Reiniciar, o isolamento,
 * o console e as requests.
 *
 * O estado `validated` é atribuído POR TIPO e POR SEGMENTO só a partir do que
 * passou de verdade aqui; o que falhar continua `replayable`, com a limitação
 * exposta. Sem navegador (Playwright ausente), o teste é pulado com aviso — não
 * falha o ambiente.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright é opcional e não tipado neste pacote
type Any = any;

// Globais do NAVEGADOR: só existem dentro dos callbacks de frame.evaluate/$eval,
// que rodam na página. Declarados para o tsc do server (lib Node, sem DOM).
declare const document: Any;
declare const window: Any;
declare const getComputedStyle: (el: Any) => Any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FIXTURE = join(REPO_ROOT, 'fixtures/test-pages/interacoes.html');

// Estados capturados (escopo do BLOCO — a section), como o explorer produz.
const ACC_ABERTO =
  '<section><h2>Accordion</h2><div class="acc-item aberto" id="acc-1"><button class="acc-trigger" id="acc-trigger-1" aria-expanded="true">Qual o prazo de entrega?</button><div class="acc-painel">Entregamos em até cinco dias úteis.</div></div></section>';
const TAB_ATIVA =
  '<section><h2>Tabs</h2><div role="tablist"><button class="tab-btn" id="tab-1" aria-selected="false" data-tab="p1">Visão geral</button><button class="tab-btn" id="tab-2" aria-selected="true" data-tab="p2">Detalhes</button></div><div class="tab-panel" id="p1">Painel de visão geral.</div><div class="tab-panel ativo" id="p2">Painel de detalhes.</div></section>';
const MODAL_SECTION =
  '<section><h2>Modal em portal</h2><button class="modal-abre" id="abre-modal">Abrir contato</button></section>';
const MODAL_PORTAL =
  '<div class="modal-portal"><div class="caixa"><h3>Fale conosco</h3><p>Formulário de contato aqui.</p></div></div>';
const PULSO_NOOP = '<section><h2>Animação CSS</h2><div class="pulso" id="pulso"></div></section>';

const elemento = (
  ref: string,
  id: string,
  kinds: InteractionKind[],
  stateId: string,
  html: string,
  portalHtml?: string,
): CapturedElement => ({
  ref,
  tag: 'button',
  role: null,
  box: { x: 0, y: 0, w: 120, h: 40 },
  label: id,
  match: { id, classes: [] as string[] },
  interactions: kinds,
  states: [
    {
      id: stateId,
      trigger: 'click' as const,
      label: 'estado',
      signature: stateId,
      html,
      ...(portalHtml ? { portalHtml } : {}),
    },
  ],
  assessment: {
    support: 'parcial' as const,
    renderMode: 'html-js' as const,
    fidelity: 70,
    warnings: [],
    capabilities: { dependsOnJs: true, ...(portalHtml ? { hasPortal: true } : {}) },
    interactions: [],
  },
});

const construirManifesto = (): CaptureManifest => ({
  version: 1,
  url: 'http://local.test/',
  capturedAt: Date.now(),
  strategy: 'playwright',
  exploration: { mode: 'deep', reasons: ['fixture'], durationMs: 1, limitsHit: [], errors: [] },
  viewport: { width: 1440, height: 900 },
  stylesheets: [],
  assets: [],
  elements: [
    elemento('r1', 'acc-trigger-1', ['click', 'toggle'], 'st_acc', ACC_ABERTO),
    elemento('r2', 'tab-2', ['click', 'tab'], 'st_tab', TAB_ATIVA),
    elemento('r3', 'abre-modal', ['click', 'modal'], 'st_modal', MODAL_SECTION, MODAL_PORTAL),
    // Estado no-op (não muda nada visível): usado para provar que o gate NÃO
    // valida uma reprodução que não altera o preview.
    elemento('r4', 'pulso', ['click'], 'st_noop', PULSO_NOOP),
  ],
  stats: {
    durationMs: 1,
    elementsAnalyzed: 4,
    interactionsTried: 4,
    statesFound: 4,
    assetsFound: 0,
    assetsSaved: 0,
    assetsBytes: 0,
  },
  warnings: [],
});

test('replay do preview em navegador real (validação de ponta a ponta)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) {
    t.skip('Playwright indisponível — validação em navegador pulada.');
    return;
  }

  const root = join(tmpdir(), `ds-replay-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { segmentDesignSystem } = await import('@ds/segmenter');
  const { previewRoute } = await import('./preview.js');
  const { designSystemsRoute } = await import('./design-systems.js');
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  mkdirSync(shared.vaultCaptureDir(dsId), { recursive: true });
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), readFileSync(FIXTURE));
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(construirManifesto()));

  const seg = segmentDesignSystem(dsId);
  const db = getDb();
  // A linha do design system antes dos segmentos (FK).
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: null,
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'Fixture interações',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  for (const s of seg.segments) db.insert(tables.segments).values(s).run();

  // Descobre os segmentos: os de replay pela associação do estado, os de CSS
  // (hover/animação) pelo conteúdo da section.
  const man = shared.SegmentsManifest.parse(
    JSON.parse(readFileSync(shared.vaultSegmentsManifest(dsId), 'utf8')),
  );
  const segPorEstado = (stId: string): string => {
    const ins = (man.insights ?? []).find((i) => i.states?.some((x) => x.id === stId));
    if (!ins) throw new Error(`estado ${stId} não associado a nenhum segmento`);
    return ins.segmentId;
  };
  const segPorConteudo = (marca: string): string => {
    const s = seg.segments.find((x) => x.htmlSnippet.includes(marca));
    if (!s) throw new Error(`segmento com "${marca}" não encontrado`);
    return s.id;
  };
  const accId = segPorEstado('st_acc');
  const tabId = segPorEstado('st_tab');
  const modalId = segPorEstado('st_modal');
  const noopId = segPorEstado('st_noop');
  const hoverId = segPorConteudo('hover-card');
  const pulsoSegId = segPorConteudo('class="pulso"');

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  app.route('/api/design-systems', designSystemsRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });
  const base = `http://localhost:${port}`;

  const consoleErros: string[] = [];
  const requisicoes: string[] = [];
  // Módulo presente mas binário do Chromium ausente (ex.: CI sem `playwright
  // install`) → pular, não falhar. Fecha o servidor e o vault antes de sair.
  let browser: Any;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (err) {
    await new Promise<void>((r) => srv.close(() => r()));
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
    t.skip(
      `Chromium não instalado (${err instanceof Error ? err.message : 'erro'}) — validação pulada.`,
    );
    return;
  }
  const page = await browser.newPage();
  page.on('console', (m: Any) => {
    if (m.type() === 'error') consoleErros.push(m.text());
  });
  page.on('pageerror', (e: Any) => consoleErros.push(`pageerror: ${String(e)}`));
  page.on('request', (r: Any) => requisicoes.push(`${r.method()} ${r.url()}`));

  const resultados: Array<{ segmentId: string; kind: string; ok: boolean; detail?: string }> = [];

  t.after(async () => {
    await browser.close();
    await new Promise<void>((r) => srv.close(() => r()));
    // Limpeza best-effort: no Windows o handle do SQLite pode segurar o arquivo;
    // o temp do SO some depois. Não vale falhar o teste por causa disso.
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* temp preso; ignorado */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  /** Carrega o preview num iframe idêntico ao da Galeria e devolve o Frame. */
  const abrirPreview = async (segId: string, replay: boolean): Promise<Any> => {
    const url = `${base}/api/preview/segment/${segId}${replay ? '?replay=1' : ''}`;
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><iframe id="pf" src="${url}" sandbox="allow-scripts" style="width:1200px;height:900px;border:0"></iframe>`,
    );
    const handle = await page.waitForSelector('#pf');
    const frame = await handle.contentFrame();
    if (!frame) throw new Error('iframe sem frame');
    await frame.waitForSelector('body', { timeout: 5000 });
    return frame;
  };

  await t.test(
    'accordion: inicia fechado → clique abre (conteúdo + aria-expanded) → Reiniciar fecha',
    async () => {
      const frame = await abrirPreview(accId, true);
      await frame.waitForSelector('#ds-rp-alvo');
      // fechado
      assert.equal(
        await frame.$eval('#acc-trigger-1', (el: Any) => el.getAttribute('aria-expanded')),
        'false',
      );
      assert.equal(
        await frame.$eval('.acc-painel', (el: Any) => getComputedStyle(el).display),
        'none',
      );
      // abre
      await frame.click('[data-estado="st_acc"]');
      await frame.waitForSelector('#acc-trigger-1[aria-expanded="true"]', { timeout: 3000 });
      assert.notEqual(
        await frame.$eval('.acc-painel', (el: Any) => getComputedStyle(el).display),
        'none',
      );
      assert.match(await frame.$eval('.acc-painel', (el: Any) => el.textContent), /cinco dias/);
      // reinicia
      await frame.click('[data-estado="__reset__"]');
      await frame.waitForSelector('#acc-trigger-1[aria-expanded="false"]', { timeout: 3000 });
      assert.equal(
        await frame.$eval('.acc-painel', (el: Any) => getComputedStyle(el).display),
        'none',
      );
      resultados.push({ segmentId: accId, kind: 'toggle', ok: true });
    },
  );

  await t.test(
    'tabs: troca de aba, só uma ativa, conteúdo correspondente, Reiniciar restaura',
    async () => {
      const frame = await abrirPreview(tabId, true);
      await frame.waitForSelector('#ds-rp-alvo');
      // inicial: aba 1 ativa
      assert.equal(
        await frame.$eval('#tab-1', (el: Any) => el.getAttribute('aria-selected')),
        'true',
      );
      assert.equal(await frame.$eval('#p2', (el: Any) => getComputedStyle(el).display), 'none');
      // troca para aba 2
      await frame.click('[data-estado="st_tab"]');
      await frame.waitForSelector('#tab-2[aria-selected="true"]', { timeout: 3000 });
      assert.equal(
        await frame.$eval('#tab-1', (el: Any) => el.getAttribute('aria-selected')),
        'false',
      );
      assert.notEqual(await frame.$eval('#p2', (el: Any) => getComputedStyle(el).display), 'none');
      assert.equal(await frame.$eval('#p1', (el: Any) => getComputedStyle(el).display), 'none');
      // só uma aba ativa
      const ativas = await frame.$$eval(
        '.tab-btn[aria-selected="true"]',
        (els: Any[]) => els.length,
      );
      assert.equal(ativas, 1);
      // reinicia
      await frame.click('[data-estado="__reset__"]');
      await frame.waitForSelector('#tab-1[aria-selected="true"]', { timeout: 3000 });
      resultados.push({ segmentId: tabId, kind: 'tab', ok: true });
    },
  );

  await t.test('modal em portal: fechado → clique abre no preview → Reiniciar remove', async () => {
    const frame = await abrirPreview(modalId, true);
    await frame.waitForSelector('#ds-rp-alvo');
    assert.equal(await frame.$$eval('#ds-rp-portal .modal-portal', (e: Any[]) => e.length), 0);
    // abre
    await frame.click('[data-estado="st_modal"]');
    await frame.waitForSelector('#ds-rp-portal .modal-portal', { timeout: 3000 });
    assert.match(
      await frame.$eval('#ds-rp-portal .caixa', (el: Any) => el.textContent),
      /Fale conosco/,
    );
    // reinicia remove o modal
    await frame.click('[data-estado="__reset__"]');
    await frame.waitForFunction(
      () => document.querySelectorAll('#ds-rp-portal .modal-portal').length === 0,
      { timeout: 3000 },
    );
    resultados.push({ segmentId: modalId, kind: 'modal', ok: true });
  });

  await t.test('hover real: efeito CSS observável e retorno ao tirar o mouse', async () => {
    const frame = await abrirPreview(hoverId, false);
    const card = await frame.waitForSelector('#card-hover');
    const transformInicial = await frame.$eval(
      '#card-hover',
      (el: Any) => getComputedStyle(el).transform,
    );
    const revelInicial = await frame.$eval('.revelado', (el: Any) => getComputedStyle(el).opacity);
    await card.hover();
    await frame.waitForFunction(
      () => {
        const c = document.querySelector('#card-hover');
        const r = document.querySelector('.revelado');
        return !!c && !!r && Number(getComputedStyle(r).opacity) > 0.5;
      },
      { timeout: 3000 },
    );
    const transformHover = await frame.$eval(
      '#card-hover',
      (el: Any) => getComputedStyle(el).transform,
    );
    assert.notEqual(transformHover, transformInicial, 'transform muda no hover');
    assert.notEqual(
      await frame.$eval('.revelado', (el: Any) => getComputedStyle(el).opacity),
      revelInicial,
      'filho revelado no hover',
    );
    // tira o mouse (mouse é da Page, não do Frame)
    await page.mouse.move(5, 5);
    await frame.waitForFunction(
      () => Number(getComputedStyle(document.querySelector('.revelado') as Any).opacity) < 0.5,
      { timeout: 3000 },
    );
    resultados.push({ segmentId: hoverId, kind: 'hover', ok: true });
  });

  await t.test('focus: aplicar foco reproduz o estado :focus', async () => {
    const frame = await abrirPreview(accId, false);
    await frame.waitForSelector('#acc-trigger-1');
    const larguraAntes = await frame.$eval(
      '#acc-trigger-1',
      (el: Any) => getComputedStyle(el).outlineWidth,
    );
    await frame.focus('#acc-trigger-1');
    const focado = await frame.evaluate(() => document.activeElement?.id);
    assert.equal(focado, 'acc-trigger-1');
    const larguraFoco = await frame.$eval(
      '#acc-trigger-1',
      (el: Any) => getComputedStyle(el).outlineWidth,
    );
    const estiloFoco = await frame.$eval(
      '#acc-trigger-1',
      (el: Any) => getComputedStyle(el).outlineStyle,
    );
    assert.equal(larguraAntes, '0px', 'sem outline antes do foco');
    assert.notEqual(larguraFoco, '0px', 'outline aparece no foco');
    assert.equal(estiloFoco, 'solid');
    resultados.push({ segmentId: accId, kind: 'focus', ok: true });
  });

  await t.test('animação CSS: keyframes carregados e animação de fato rodando', async () => {
    const frame = await abrirPreview(pulsoSegId, false);
    await frame.waitForSelector('#pulso');
    // Não basta o CSS existir: a animação computada precisa estar ativa…
    assert.equal(
      await frame.$eval('#pulso', (el: Any) => getComputedStyle(el).animationName),
      'pulsar',
    );
    // …e o transform tem de mudar ao longo do tempo (rodando de verdade).
    const amostra = () => frame.$eval('#pulso', (el: Any) => getComputedStyle(el).transform);
    const a = await amostra();
    await new Promise((r) => setTimeout(r, 300));
    const b = await amostra();
    await new Promise((r) => setTimeout(r, 300));
    const c = await amostra();
    assert.ok(a !== b || b !== c, 'o transform muda ao longo do tempo (animação ativa)');
  });

  await t.test('isolamento: origem opaca e sem alcance ao parent', async () => {
    const frame = await abrirPreview(accId, true);
    await frame.waitForSelector('#ds-rp-alvo');
    assert.equal(await frame.evaluate(() => window.origin), 'null', 'origem opaca (sandbox)');
    const alcancaParent = await frame.evaluate(() => {
      try {
        return String((window.parent as Any).location.href).length > 0;
      } catch {
        return false;
      }
    });
    assert.equal(alcancaParent, false, 'não alcança o parent');
  });

  await t.test(
    'falha honesta: segmento sem estados cai na prévia limpa (sem barra de replay)',
    async () => {
      const frame = await abrirPreview(hoverId, true); // hover não tem estados capturados
      await frame.waitForSelector('body');
      assert.equal(
        await frame.$$eval('#ds-rp-bar', (e: Any[]) => e.length),
        0,
        'sem barra de replay',
      );
      assert.equal(
        await frame.$$eval('#card-hover', (e: Any[]) => e.length),
        1,
        'mostra o conteúdo do segmento',
      );
    },
  );

  await t.test('falha honesta: reprodução no-op não muda o preview → NÃO valida', async () => {
    const frame = await abrirPreview(noopId, true);
    await frame.waitForSelector('#ds-rp-alvo');
    const antes = await frame.$eval('#ds-rp-alvo', (el: Any) => el.innerText.trim());
    await frame.click('[data-estado="st_noop"]');
    await new Promise((r) => setTimeout(r, 200));
    const depois = await frame.$eval('#ds-rp-alvo', (el: Any) => el.innerText.trim());
    const mudou = antes !== depois;
    assert.equal(mudou, false, 'no-op não altera o conteúdo visível');
    // Resultado REAL: não mudou → não valida (mantém replayable).
    resultados.push({ segmentId: noopId, kind: 'click', ok: false, detail: 'preview não alterou' });
  });

  await t.test('sem erros de console e sem requests perigosas em nenhum fluxo', () => {
    assert.deepEqual(consoleErros, [], `console limpo (erros: ${consoleErros.join(' | ')})`);
    // Nenhuma mutação (o replay é autocontido) e nenhum host externo.
    const mutacoes = requisicoes.filter((r) => /^(DELETE|POST|PUT|PATCH) /.test(r));
    const externas = requisicoes.filter((r) => {
      const m = r.match(/^\S+ (\S+)/);
      const alvo = m?.[1] ?? '';
      return !(alvo.startsWith(base) || alvo.startsWith('about:') || alvo.startsWith('data:'));
    });
    assert.deepEqual(mutacoes, [], `sem requests de mutação (${mutacoes.join(' | ')})`);
    assert.deepEqual(externas, [], `sem requests externas (${externas.join(' | ')})`);
  });

  await t.test('validated atribuído por tipo/segmento só com base no resultado real', async () => {
    // Grava o registro de validação a partir dos resultados REAIS coletados.
    const arquivo = {
      designSystemId: dsId,
      generatedAt: Date.now(),
      results: resultados,
    };
    writeFileSync(shared.vaultSegmentValidation(dsId), JSON.stringify(arquivo, null, 2));

    // Consulta a API REAL da Galeria e confere as promoções.
    const res = await fetch(`${base}/api/design-systems/${dsId}/segments`);
    const body = (await res.json()) as Any;
    const fidelidade = (segId: string) =>
      body.items.find((i: Any) => i.id === segId)?.fidelity as Any;

    // Accordion: toggle passou → validated; click não teve resultado → segue replayable.
    const acc = fidelidade(accId);
    assert.equal(acc.pipeline.find((p: Any) => p.kind === 'toggle')?.status, 'validated');
    assert.equal(acc.pipeline.find((p: Any) => p.kind === 'click')?.status, 'replayable');

    // Tabs e modal validados nos seus tipos.
    assert.equal(
      fidelidade(tabId).pipeline.find((p: Any) => p.kind === 'tab')?.status,
      'validated',
    );
    assert.equal(
      fidelidade(modalId).pipeline.find((p: Any) => p.kind === 'modal')?.status,
      'validated',
    );

    // No-op: resultado falso → NÃO promove; segue replayable + limitação honesta.
    const noop = fidelidade(noopId);
    assert.equal(noop.pipeline.find((p: Any) => p.kind === 'click')?.status, 'replayable');
    assert.ok(
      (noop.limitations ?? []).some((l: string) => /falhou/i.test(l)),
      'a falha aparece como limitação na Galeria',
    );
  });
});
