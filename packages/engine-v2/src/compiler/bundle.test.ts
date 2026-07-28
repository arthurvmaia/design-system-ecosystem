import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  filhos: [],
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

// ── CSS externo no bundle (Fase A3) ─────────────────────────────────────────

/** Monta um diretório `assets/` de captura com uma folha hashed e uma fonte. */
const capturaFixture = (): { dir: string; hashedCss: string; fonte: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'captura-assets-'));
  const hashedCss = 'css/ab12cd34ef567890.css';
  const fonte = 'font/ffffeeee00001111.woff2';
  const escrever = (rel: string, conteudo: string | Uint8Array): void => {
    const destino = join(dir, rel);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo);
  };
  escrever(
    hashedCss,
    ':root{--marca-externa:#00aaff}@font-face{font-family:Externa;src:url(../font/ffffeeee00001111.woff2)}',
  );
  escrever(fonte, new Uint8Array([0x77, 0x4f, 0x46, 0x32]));
  return { dir, hashedCss, fonte };
};

const assetsDeCssFixture = (hashedCss: string, fonte: string) => [
  {
    originalUrl: 'https://origem.example/build.css',
    localPath: hashedCss,
    sha256: 'b'.repeat(64),
    mimeType: 'text/css',
    bytes: 90,
    kind: 'css' as const,
    status: 'local' as const,
  },
  {
    originalUrl: 'https://origem.example/x.woff2',
    localPath: fonte,
    sha256: 'c'.repeat(64),
    mimeType: 'font/woff2',
    bytes: 4,
    kind: 'font' as const,
    status: 'local' as const,
  },
];

/** Hrefs dos `<link rel="stylesheet">` de um documento, na ordem. */
const linksDe = (html: string): string[] =>
  [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1] ?? '');

test('CSS externo: entra ANTES do inline, com nome hashed preservado e fontes copiadas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-css-externo-'));
  const captura = capturaFixture();
  try {
    escreverBundle(join(dir, 'seg_0'), {
      segmento: segmentoFixture(),
      css: '.hero{min-height:100vh}',
      // Layout comum: o <link> (ordem 0) vem antes do <style> (ordem 1).
      cssExternos: [
        { ordem: 0, href: 'https://origem.example/build.css', localPath: captura.hashedCss },
      ],
      cssInlineOrdenado: [{ ordem: 1, conteudo: '.hero{min-height:100vh}' }],
      assetsDeCss: assetsDeCssFixture(captura.hashedCss, captura.fonte),
      dirAssetsCaptura: captura.dir,
      scripts: [],
      assets: [],
      stack: [],
      frames: [],
      runtimeScripts: [],
      sourceUrl: 'https://origem.example/',
      capturadoEm: 1_700_000_000_000,
    });

    // O nome hashed sobrevive intacto — os `@import` reescritos e o layout
    // `css/`/`font/` dependem dele. Nada de `external-01-*.css`.
    assert.ok(existsSync(join(dir, 'seg_0', 'assets', captura.hashedCss)));
    assert.ok(existsSync(join(dir, 'seg_0', 'assets', captura.fonte)));

    const index = readFileSync(join(dir, 'seg_0', 'index.html'), 'utf8');
    const links = linksDe(index);
    assert.equal(links[0], `assets/${captura.hashedCss}`, 'a folha externa carrega primeiro');
    assert.ok(
      links.slice(1).every((l) => !l.includes('ab12cd34ef567890')),
      'a folha externa aparece uma única vez',
    );
    assert.ok(links.length > 1, 'o CSS inline continua linkado depois da externa');

    const manifest = JSON.parse(readFileSync(join(dir, 'seg_0', 'manifest.json'), 'utf8'));
    assert.equal(manifest.dependencies.css[0], `assets/${captura.hashedCss}`);
    assert.equal(manifest.css.dividido, true, 'sem intercalação a divisão segue valendo');

    // O contrato recebeu a folha externa: o token `:root` dela está lá.
    const contrato = ComponentContract.parse(manifest.contract);
    assert.ok(contrato.tokens.cores.some((c) => c.varName === '--marca-externa'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(captura.dir, { recursive: true, force: true });
  }
});

test('intercalação (<style> antes de <link>): um arquivo por folha, na ordem exata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-css-intercalado-'));
  const captura = capturaFixture();
  try {
    const escrito = escreverBundle(join(dir, 'seg_0'), {
      segmento: segmentoFixture(),
      css: '.a{color:red}\n.b{color:blue}',
      cssExternos: [
        { ordem: 1, href: 'https://origem.example/build.css', localPath: captura.hashedCss },
      ],
      // O <style> da ordem 0 vem ANTES do <link>: dividir mudaria a cascata.
      cssInlineOrdenado: [
        { ordem: 0, conteudo: '.a{color:red}' },
        { ordem: 2, conteudo: '.b{color:blue}' },
      ],
      assetsDeCss: assetsDeCssFixture(captura.hashedCss, captura.fonte),
      dirAssetsCaptura: captura.dir,
      scripts: [],
      assets: [],
      stack: [],
      frames: [],
      runtimeScripts: [],
      sourceUrl: 'https://origem.example/',
      capturadoEm: 1_700_000_000_000,
    });

    const index = readFileSync(join(dir, 'seg_0', 'index.html'), 'utf8');
    assert.deepEqual(
      linksDe(index),
      ['assets/css/inline-00.css', `assets/${captura.hashedCss}`, 'assets/css/inline-02.css'],
      'a ordem do documento é reproduzida folha a folha',
    );
    assert.equal(
      readFileSync(join(dir, 'seg_0', 'assets', 'css', 'inline-00.css'), 'utf8'),
      '.a{color:red}',
    );
    assert.ok(
      !existsSync(join(dir, 'seg_0', 'assets', 'css', 'tokens.css')) &&
        !existsSync(join(dir, 'seg_0', 'assets', 'css', 'layout.css')),
      'a divisão por responsabilidade foi abandonada',
    );

    const manifest = JSON.parse(readFileSync(join(dir, 'seg_0', 'manifest.json'), 'utf8'));
    assert.equal(manifest.css.dividido, false);
    assert.ok(String(manifest.css.motivo).includes('intercaladas'), 'o motivo fica no manifesto');
    assert.deepEqual(manifest.dependencies.css, [
      'assets/css/inline-00.css',
      `assets/${captura.hashedCss}`,
      'assets/css/inline-02.css',
    ]);
    assert.ok(escrito.avisos.some((a) => a.includes('intercaladas')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(captura.dir, { recursive: true, force: true });
  }
});

test('folha externa sem arquivo na captura: aviso honesto, sem link quebrado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-css-faltando-'));
  const captura = capturaFixture();
  try {
    const escrito = escreverBundle(join(dir, 'seg_0'), {
      segmento: segmentoFixture(),
      css: '.hero{min-height:100vh}',
      cssExternos: [
        { ordem: 0, href: 'https://origem.example/sumiu.css', localPath: 'css/naoexiste.css' },
      ],
      cssInlineOrdenado: [{ ordem: 1, conteudo: '.hero{min-height:100vh}' }],
      assetsDeCss: [],
      dirAssetsCaptura: captura.dir,
      scripts: [],
      assets: [],
      stack: [],
      frames: [],
      runtimeScripts: [],
      sourceUrl: 'https://origem.example/',
      capturadoEm: 1_700_000_000_000,
    });
    const index = readFileSync(join(dir, 'seg_0', 'index.html'), 'utf8');
    assert.ok(!index.includes('naoexiste.css'), 'link para arquivo inexistente não é emitido');
    assert.ok(escrito.avisos.some((a) => a.includes('sumiu.css')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(captura.dir, { recursive: true, force: true });
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
