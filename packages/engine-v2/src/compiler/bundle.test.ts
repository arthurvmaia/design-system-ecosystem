import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONTRACT_VERSION, ComponentContract } from '@ds/shared';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import { escreverBundle } from './bundle.js';

/**
 * O bundle grava o CONTRATO derivado no manifest.json — aditivo: nenhum outro
 * arquivo do bundle muda por causa dele, e um manifest sem `contract` continua
 * sendo lido (a leitura sob demanda deriva; coberto em @ds/shared).
 */

const segmentoFixture = (over: Partial<SegmentoV2> = {}): SegmentoV2 => ({
  position: 0,
  category: 'hero',
  kind: 'component',
  name: 'Hero com vídeo de fundo',
  htmlSnippet: `
<section class="hero">
  <video src="https://origem.example/bg.mp4" autoplay loop muted width="1600" height="900"></video>
  <h1>Título do hero</h1>
  <p>Um subtítulo com contexto suficiente.</p>
  <a class="btn" href="https://origem.example/x">Ação principal</a>
</section>`,
  hash: 'hash-hero-fixture',
  evidence: {
    segmentId: 'hash-hero-fixture',
    members: [],
    signals: [],
    backgroundIds: [],
    mediaIds: [],
    runtimeIds: [],
    stateIds: [],
    pointerResponseIds: [],
    scrollIds: [],
    assetKeys: [],
    nameEvidence: [],
    confidence: 'alta',
  },
  representation: {
    type: 'componente-portatil',
    reasons: [],
    rejected: [],
    runtimes: [],
    editable: true,
    confidence: 'alta',
    limitations: [],
  },
  fidelity: {},
  support: 'completo',
  interactions: [],
  limitations: [],
  ...over,
});

test('escreverBundle grava contract válido e ADITIVO no manifest.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-contrato-'));
  try {
    escreverBundle(join(dir, 'seg_0'), {
      segmento: segmentoFixture(),
      css: ':root{--marca:#7c3aed}.hero{min-height:100vh}.btn{background:var(--marca)}@keyframes p{from{opacity:0}to{opacity:1}}',
      scripts: [],
      assets: [
        {
          localPath: 'video/aaa.mp4',
          originalUrl: 'https://origem.example/bg.mp4',
          kind: 'video',
          bytes: 10,
          status: 'local',
          sha256: 'a'.repeat(64),
          mimeType: 'video/mp4',
        },
      ],
      stack: [],
      frames: [],
      runtimeScripts: [],
      sourceUrl: 'https://origem.example/',
      capturadoEm: 1_700_000_000_000,
    });

    const manifest = JSON.parse(readFileSync(join(dir, 'seg_0', 'manifest.json'), 'utf8'));

    // O contrato existe, valida no schema e está na versão corrente.
    const contrato = ComponentContract.parse(manifest.contract);
    assert.equal(contrato.contractVersion, CONTRACT_VERSION);
    assert.equal(contrato.derivadoDe, 'bundle-v2');

    // Slots derivados do HTML fiel: vídeo com exibição medida + ponte local.
    const video = contrato.slots.midias.find((m) => m.tipo === 'video');
    assert.ok(video);
    assert.equal(video.exibicao.autoplay, true);
    assert.equal(video.localPath, 'video/aaa.mp4');
    assert.ok(contrato.slots.textos.some((t) => t.papel === 'titulo'));
    assert.ok(contrato.slots.links.some((l) => l.ehCta));
    assert.ok(contrato.tokens.cores.some((c) => c.varName === '--marca'));
    assert.equal(contrato.esqueleto.temAnimacoes, true);

    // Aditivo de verdade: os campos que os consumidores atuais leem seguem lá.
    assert.equal(manifest.compilerVersion, 1);
    assert.equal(manifest.representation.type, 'componente-portatil');
    assert.ok(Array.isArray(manifest.dependencies.assets));
    assert.ok(existsSync(join(dir, 'seg_0', 'index.html')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('referência visual: contrato deriva do corpo com aviso+frame, sem JS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-contrato-ref-'));
  try {
    escreverBundle(join(dir, 'seg_1'), {
      segmento: segmentoFixture({
        position: 1,
        name: 'Cena WebGL',
        representation: {
          type: 'referencia-visual',
          reasons: ['runtime não identificado'],
          rejected: [],
          runtimes: [],
          editable: false,
          confidence: 'media',
          limitations: [],
        },
      }),
      css: '.hero{background:#000}',
      scripts: [],
      assets: [],
      stack: [],
      frames: ['frames/secao-abc.png'],
      runtimeScripts: [],
      sourceUrl: null,
      capturadoEm: 1_700_000_000_000,
    });
    const manifest = JSON.parse(readFileSync(join(dir, 'seg_1', 'manifest.json'), 'utf8'));
    const contrato = ComponentContract.parse(manifest.contract);
    // O corpo da referência é aviso + frame: sem slot de texto editável do
    // segmento, sem JS no esqueleto — o contrato reflete a representação.
    assert.equal(contrato.esqueleto.jsFiles.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
