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
    tokenIds: [],
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

/** A entrada mínima do bundle — só o que `escreverBundle` exige. */
const entradaMinima = () => ({
  segmento: segmentoFixture(),
  css: '.hero{color:red}',
  scripts: [],
  assets: [],
  stack: [],
  frames: [],
  runtimeScripts: [],
  sourceUrl: 'https://origem.example',
  capturadoEm: 0,
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

// ── Os assets apontam para DENTRO do bundle ──────────────────────────────────

test('imagem baixada passa a ser referenciada por caminho local, e o arquivo vem junto', (t) => {
  // O bundle saía com `<img src="https://origem…">` mesmo tendo o arquivo em
  // disco. Um .zip aberto sem internet mostrava caixas cinzas, e a dependência
  // sumia de vez no dia em que o site de origem trocasse de endereço.
  const captura = mkdtempSync(join(tmpdir(), 'cap-'));
  mkdirSync(join(captura, 'image'), { recursive: true });
  writeFileSync(join(captura, 'image', 'abc.jpg'), 'bytes-da-imagem', 'utf8');

  const dir = mkdtempSync(join(tmpdir(), 'bun-'));
  escreverBundle(dir, {
    ...entradaMinima(),
    segmento: {
      ...entradaMinima().segmento,
      htmlSnippet: '<section><img src="https://origem.com/foto.jpg"></section>',
    },
    dirAssetsCaptura: captura,
    assetsLocais: new Map([['https://origem.com/foto.jpg', 'image/abc.jpg']]),
  });

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('assets/image/abc.jpg'), `saiu: ${html.slice(0, 300)}`);
  assert.ok(!html.includes('https://origem.com/foto.jpg'), 'a URL remota não pode sobrar');
  assert.ok(
    existsSync(join(dir, 'assets', 'image', 'abc.jpg')),
    'apontar para um caminho local que não existe é pior que apontar para o remoto',
  );
  t.diagnostic(dir);
});

test('asset que NÃO foi baixado continua remoto, e o bundle declara isso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bun-'));
  const r = escreverBundle(dir, {
    ...entradaMinima(),
    segmento: {
      ...entradaMinima().segmento,
      htmlSnippet: '<section><img src="https://origem.com/nao-baixada.jpg"></section>',
    },
    assetsLocais: new Map([['https://origem.com/outra.jpg', 'image/x.jpg']]),
  });
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('https://origem.com/nao-baixada.jpg'));
  assert.ok(r.avisos.some((a) => a.includes('apontando para a origem')));
});

test('script decidido como "levar" vira caminho local no index', () => {
  const captura = mkdtempSync(join(tmpdir(), 'cap-'));
  mkdirSync(join(captura, 'js'), { recursive: true });
  writeFileSync(join(captura, 'js', 'bg.js'), '// fundo', 'utf8');

  const dir = mkdtempSync(join(tmpdir(), 'bun-'));
  escreverBundle(dir, {
    ...entradaMinima(),
    dirAssetsCaptura: captura,
    scriptsExternos: [
      {
        url: 'https://cdn.exemplo/webgl-background.js',
        localPath: 'js/bg.js',
        decisao: 'levar',
        motivo: 'x',
      },
    ],
  });
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="assets/js/bg.js">'));
  assert.ok(!html.includes('cdn.exemplo'));
  assert.ok(existsSync(join(dir, 'assets', 'js', 'bg.js')));
});

test('script dispensado não vira tag nenhuma, e o motivo fica nos avisos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bun-'));
  const r = escreverBundle(dir, {
    ...entradaMinima(),
    scriptsExternos: [
      {
        url: 'https://cdn.tailwindcss.com',
        decisao: 'dispensar',
        motivo: 'CSS já capturado do CSSOM',
      },
    ],
  });
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(!html.includes('tailwindcss'));
  assert.ok(r.avisos.some((a) => a.includes('CSSOM')));
});

// ── A cápsula não pode ficar para trás do índice ─────────────────────────────
//
// O `runtime.html` era montado com uma lista própria de argumentos, e a cada
// melhoria do `index.html` ficava um passo atrás — em silêncio. O sintoma final
// foi a Galeria mostrar os cards de um site ESCURO com fundo BRANCO: o índice
// recebia os atributos de `<html>`/`<body>` da origem e a cápsula não.
//
// Estes testes comparam os DOIS arquivos do MESMO bundle. É o formato que
// impede a regressão de voltar, porque foi exatamente assim que ela nasceu.

const bundleDeCapsula = (over: Partial<Parameters<typeof escreverBundle>[1]> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'capsula-'));
  escreverBundle(dir, {
    ...entradaMinima(),
    segmento: segmentoFixture({
      representation: {
        ...segmentoFixture().representation,
        type: 'capsula-runtime',
        editable: false,
      },
    }),
    documentoAttrs: { html: 'class="dark"', body: 'class="bg-[#03020A] text-white"' },
    ...over,
  });
  return {
    index: readFileSync(join(dir, 'index.html'), 'utf8'),
    capsula: readFileSync(join(dir, 'runtime.html'), 'utf8'),
    dir,
  };
};

test('a cápsula recebe os MESMOS atributos de <html> e <body> que o índice', () => {
  // A causa exata da tela branca: sem `class="bg-[#03020A] text-white"` no
  // body, um site escuro renderiza branco com texto preto.
  const { index, capsula } = bundleDeCapsula();
  const body = (h: string) => /<body\b([^>]*)>/i.exec(h)?.[1]?.trim() ?? '';
  const html = (h: string) => /<html\b([^>]*)>/i.exec(h)?.[1]?.trim() ?? '';
  assert.equal(body(capsula), body(index), 'o <body> dos dois tem de ser igual');
  assert.equal(html(capsula), html(index), 'o <html> dos dois tem de ser igual');
  assert.ok(body(capsula).includes('bg-[#03020A]'));
});

test('a cápsula recebe as MESMAS camadas de fundo que o índice', () => {
  const { index, capsula } = bundleDeCapsula({
    camadasDeFundo: ['<canvas id="feixes"></canvas>'],
  });
  assert.ok(index.includes('data-ds-camadas-de-fundo'));
  assert.ok(capsula.includes('data-ds-camadas-de-fundo'), 'a cápsula perdeu o fundo');
  assert.ok(capsula.includes('<canvas id="feixes">'));
});

test('a cápsula leva os scripts LOCAIS; os remotos ficam de fora, e isso é dito', () => {
  // A CSP da cápsula é `script-src self`: script remoto ali é bloqueado pelo
  // navegador em silêncio. Emitir a tag mesmo assim seria fingir que executa.
  const captura = mkdtempSync(join(tmpdir(), 'cap-'));
  mkdirSync(join(captura, 'js'), { recursive: true });
  writeFileSync(join(captura, 'js', 'bg.js'), '// fundo', 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'capsula-'));
  const r = escreverBundle(dir, {
    ...entradaMinima(),
    segmento: segmentoFixture({
      representation: { ...segmentoFixture().representation, type: 'capsula-runtime' },
    }),
    dirAssetsCaptura: captura,
    scriptsExternos: [
      { url: 'https://cdn/bg.js', localPath: 'js/bg.js', decisao: 'levar', motivo: 'x' },
      { url: 'https://cdn/remoto.js', decisao: 'remoto', motivo: 'y' },
    ],
  });
  const capsula = readFileSync(join(dir, 'runtime.html'), 'utf8');
  const index = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(capsula.includes('assets/js/bg.js'), 'o script local tem de entrar');
  assert.ok(!capsula.includes('cdn/remoto.js'), 'o remoto seria bloqueado pela CSP');
  assert.ok(index.includes('cdn/remoto.js'), 'no índice ele continua');
  assert.ok(r.avisos.some((a) => a.includes('fora da cápsula')));
});

test('a cápsula continua tendo o que a distingue: a CSP', () => {
  // Igualar os dois não pode apagar a razão de a cápsula existir.
  const { index, capsula } = bundleDeCapsula();
  assert.ok(capsula.includes('Content-Security-Policy'));
  assert.ok(!index.includes('Content-Security-Policy'));
});

// ── O frame da referência visual vem PARA DENTRO do bundle ──────────────────
//
// Quando um segmento não é portátil, o bundle mostra o print daquela dobra: é
// a única coisa que uma referência visual tem para mostrar. O `<img>` apontava
// para `frames/x.png`, caminho da pasta de CAPTURA — uma árvore irmã da de
// bundles, que nunca resolve daqui.
//
// O defeito não aparecia no app: a rota de prévia reescreve a raiz de `frames/`
// e a Biblioteca copia os frames na promoção. Aparecia no `.zip` entregue ao
// cliente e na comparação de pixel, que abrem o arquivo direto.

const segmentoDeReferencia = (): SegmentoV2 =>
  segmentoFixture({
    representation: {
      type: 'referencia-visual',
      reasons: ['o conteúdo é desenhado por um runtime que não viaja'],
      rejected: [],
      runtimes: [],
      editable: false,
      confidence: 'alta',
      limitations: [],
    },
  });

/** Um PNG mínimo de verdade, para o teste copiar bytes e não uma string. */
const pngFalso = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

test('o frame da referência visual é copiado para dentro do bundle', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-frame-'));
  try {
    const captura = join(raiz, 'capture-v2');
    mkdirSync(join(captura, 'frames'), { recursive: true });
    writeFileSync(join(captura, 'frames', 'dobra-1.png'), pngFalso);

    const dir = join(raiz, 'bundles', 'seg_0');
    escreverBundle(dir, {
      ...entradaMinima(),
      segmento: segmentoDeReferencia(),
      frames: ['frames/dobra-1.png'],
      dirFramesCaptura: captura,
    });

    // O arquivo existe DENTRO do bundle, com os mesmos bytes.
    const copiado = join(dir, 'frames', 'dobra-1.png');
    assert.ok(existsSync(copiado), 'o frame tem de estar dentro do bundle');
    assert.deepEqual(readFileSync(copiado), pngFalso);

    // E o HTML aponta para ele por caminho relativo interno.
    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(index.includes('src="frames/dobra-1.png"'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('frame que não está na captura vira aviso, não <img> quebrada', () => {
  // Um `<img>` apontando para nada é pior que a frase: parece que o bundle
  // deveria mostrar algo e falhou, sem dizer o quê.
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-frame-'));
  try {
    const captura = join(raiz, 'capture-v2');
    mkdirSync(captura, { recursive: true });
    const dir = join(raiz, 'bundles', 'seg_0');
    const r = escreverBundle(dir, {
      ...entradaMinima(),
      segmento: segmentoDeReferencia(),
      frames: ['frames/sumiu.png'],
      dirFramesCaptura: captura,
    });

    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!index.includes('<img'), 'não pode sobrar imagem apontando para nada');
    assert.ok(index.includes('Sem frame de fallback'));
    assert.ok(r.avisos.some((a) => a.includes('sumiu.png')));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o bundle não escreve fora da própria pasta por causa de um frame', () => {
  // `frames` vem do manifesto da captura. Um caminho com `..` faria o bundle
  // gravar num diretório irmão — e o `<img>` sairia apontando para lá.
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-frame-'));
  try {
    const captura = join(raiz, 'capture-v2');
    mkdirSync(captura, { recursive: true });
    writeFileSync(join(raiz, 'vizinho.png'), pngFalso);

    const dir = join(raiz, 'bundles', 'seg_0');
    escreverBundle(dir, {
      ...entradaMinima(),
      segmento: segmentoDeReferencia(),
      frames: ['../../vizinho.png'],
      dirFramesCaptura: captura,
    });

    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(!index.includes('..'), 'nenhum caminho pode sair da pasta do bundle');
    assert.ok(index.includes('Sem frame de fallback'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('peça portátil não ganha um PNG que ela nunca abre', () => {
  // O frame só é exibido pela referência visual. Copiar em todo bundle poria uma
  // imagem de sobra dentro de cada peça — peso no `.zip` sem nada em troca.
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-frame-'));
  try {
    const captura = join(raiz, 'capture-v2');
    mkdirSync(join(captura, 'frames'), { recursive: true });
    writeFileSync(join(captura, 'frames', 'dobra-1.png'), pngFalso);

    const dir = join(raiz, 'bundles', 'seg_0');
    escreverBundle(dir, {
      ...entradaMinima(),
      frames: ['frames/dobra-1.png'],
      dirFramesCaptura: captura,
    });

    assert.equal(existsSync(join(dir, 'frames', 'dobra-1.png')), false);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
