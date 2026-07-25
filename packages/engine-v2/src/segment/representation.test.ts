import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type EvidenciaRepresentacao, classificarRepresentacao } from './representation.js';

const ev = (over: Partial<EvidenciaRepresentacao> = {}): EvidenciaRepresentacao => ({
  runtimes: [],
  midias: [],
  assetsLocais: true,
  assetsExternos: 0,
  scriptsNaoLocalizados: 0,
  iframeCrossOrigin: false,
  shadowFechado: false,
  estadosCapturados: 0,
  movimentoMedido: false,
  movimentoPorCss: false,
  reageAoPonteiro: false,
  regiaoReativaSemDom: false,
  dependeDeJs: false,
  bootstrapIdentificado: false,
  ...over,
});

test('HTML/CSS puro é componente portátil e editável', () => {
  const d = classificarRepresentacao(ev());
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.editable, true);
  assert.equal(d.renderMode, 'html');
});

test('WebGL com scripts e assets em disco vira cápsula de runtime — não card preto', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['three'],
      midias: ['webgl'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
      movimentoMedido: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.equal(d.editable, false, 'cápsula não é editável como componente');
  assert.equal(d.renderMode, 'webgl');
  assert.ok(d.rejected.some((r) => r.type === 'componente-portatil'));
});

test('WebGL sem o script em mãos cai para referência visual, dizendo por quê', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['three'],
      midias: ['webgl'],
      scriptsNaoLocalizados: 2,
      bootstrapIdentificado: true,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.equal(d.editable, false);
  assert.ok(
    d.reasons.some((r) => /script/i.test(r)),
    `motivos: ${d.reasons.join(' | ')}`,
  );
});

test('WebGL sem inicialização identificada não é encapsulado', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['webgl-cru'],
      midias: ['webgl'],
      bootstrapIdentificado: false,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.reasons.some((r) => /inicializa/i.test(r)));
});

test('Lottie com player e JSON locais é cápsula', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['lottie'],
      midias: ['lottie'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.equal(d.renderMode, 'lottie');
});

test('iframe cross-origin nunca é portátil nem cápsula', () => {
  const d = classificarRepresentacao(ev({ iframeCrossOrigin: true }));
  assert.equal(d.type, 'referencia-visual');
  assert.equal(d.confidence, 'alta');
  assert.equal(d.rejected.length, 2);
  assert.ok(d.limitations.some((l) => /outra origem/i.test(l)));
});

test('Shadow DOM fechado vira referência visual, com a limitação declarada', () => {
  const d = classificarRepresentacao(ev({ shadowFechado: true }));
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.limitations.some((l) => /fechado/i.test(l)));
});

test('runtime que controla a PÁGINA não arrasta o site para dentro da cápsula', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['lenis', 'scrolltrigger'],
      dependeDeJs: true,
      movimentoMedido: true,
      movimentoPorCss: true,
    }),
  );
  assert.notEqual(d.type, 'capsula-runtime');
  assert.ok(
    d.limitations.some((l) => /p[áa]gina inteira/i.test(l)),
    `limitações: ${d.limitations.join(' | ')}`,
  );
});

test('vídeo com arquivo local é portátil — vídeo é só HTML', () => {
  const d = classificarRepresentacao(ev({ midias: ['video'], assetsLocais: true }));
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.renderMode, 'video');
  assert.equal(d.editable, true);
});

test('vídeo ainda na origem continua portátil, mas com a limitação de asset', () => {
  const d = classificarRepresentacao(
    ev({ midias: ['video'], assetsLocais: false, assetsExternos: 1 }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.ok(d.limitations.some((l) => /origem/i.test(l)));
});

test('GIF e WebP animado local são portáteis', () => {
  for (const m of ['gif', 'webp-animado', 'avif-animado'] as const) {
    const d = classificarRepresentacao(ev({ midias: [m] }));
    assert.equal(d.type, 'componente-portatil', `${m} deveria ser portátil`);
  }
});

test('SVG animado por SMIL é portátil (roda por inclusão)', () => {
  const d = classificarRepresentacao(
    ev({ midias: ['svg-animado'], movimentoMedido: true, movimentoPorCss: true }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.renderMode, 'svg-animado');
});

test('movimento de JS sem estado capturado não se passa por portátil', () => {
  const d = classificarRepresentacao(
    ev({ movimentoMedido: true, movimentoPorCss: false, dependeDeJs: true, estadosCapturados: 0 }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.limitations.some((l) => /mecanismo n[ãa]o foi reproduzido/i.test(l)));
});

test('movimento de JS COM estado capturado volta a ser portátil', () => {
  const d = classificarRepresentacao(
    ev({ movimentoMedido: true, dependeDeJs: true, estadosCapturados: 3 }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.confidence, 'alta');
});

test('região reativa sem DOM exige runtime e registra a limitação certa', () => {
  const d = classificarRepresentacao(
    ev({
      regiaoReativaSemDom: true,
      runtimes: ['canvas-2d'],
      midias: ['canvas-2d'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
      reageAoPonteiro: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.ok(
    d.limitations.some((l) => /sem elemento DOM/i.test(l)),
    'a cena reage, mas não há botão — isso precisa estar dito',
  );
});

test('toda decisão traz motivo — nada é escolhido por omissão', () => {
  const casos = [
    ev(),
    ev({ runtimes: ['three'], midias: ['webgl'], bootstrapIdentificado: true }),
    ev({ iframeCrossOrigin: true }),
    ev({ shadowFechado: true }),
    ev({ midias: ['video'], assetsLocais: false, assetsExternos: 2 }),
  ];
  for (const c of casos) {
    const d = classificarRepresentacao(c);
    assert.ok(d.reasons.length > 0, 'decisão sem motivo');
  }
});
