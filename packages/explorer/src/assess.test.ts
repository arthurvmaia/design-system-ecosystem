import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessFidelity, detectCapabilities, pickRenderMode } from './assess.js';

test('estático puro (html+css): suporte completo, modo html', () => {
  const a = assessFidelity('<section><h2>Preços</h2><p>Plano</p></section>', '.x{color:red}', {
    bundledAssets: true,
  });
  assert.equal(a.support, 'completo');
  assert.equal(a.renderMode, 'html');
});

test('animação CSS + keyframes: continua completo e marca hasCssAnimation', () => {
  const caps = detectCapabilities('<div class="animate-spin"></div>', '@keyframes spin{}');
  assert.equal(caps.hasCssAnimation, true);
  const a = assessFidelity('<div class="animate-spin"></div>', '@keyframes spin{}', {
    bundledAssets: true,
  });
  assert.equal(a.support, 'completo');
});

test('canvas: modo canvas, suporte apenas visual', () => {
  const a = assessFidelity('<canvas id="bg"></canvas>', '', { bundledAssets: true });
  assert.equal(a.renderMode, 'canvas');
  assert.equal(a.support, 'visual');
  assert.ok(a.warnings.some((w) => /canvas/i.test(w)));
});

test('webgl/three: modo webgl, visual, com aviso', () => {
  const caps = detectCapabilities('<canvas class="webgl"></canvas><div>three.js</div>', '');
  assert.equal(caps.hasWebGL, true);
  assert.equal(pickRenderMode(caps), 'webgl');
});

test('script externo: dependência externa', () => {
  const a = assessFidelity(
    '<div data-carousel></div><script src="https://cdn/x.js"></script>',
    '',
    {
      bundledAssets: true,
    },
  );
  assert.equal(a.support, 'externo');
  assert.ok(a.warnings.some((w) => /externo/i.test(w)));
});

test('toggle por JS inline: parcial sem captura, completo com estados capturados', () => {
  const html = '<button aria-expanded="false">Perguntas</button><div hidden>resposta</div>';
  const semCaptura = assessFidelity(html, '', { bundledAssets: true });
  assert.equal(semCaptura.support, 'parcial');
  assert.ok(semCaptura.interactions.some((i) => i.kind === 'toggle'));

  const comCaptura = assessFidelity(html, '', { bundledAssets: true, hasCapturedStates: true });
  assert.equal(comCaptura.support, 'completo');
  const toggle = comCaptura.interactions.find((i) => i.kind === 'toggle');
  assert.equal(toggle?.support, 'completo');
});

test('hover declarado no HTML sem CSS embutido: parcial, não completo', () => {
  const html = '<a class="btn hover:bg-red-500 focus:ring">Comprar</a>';
  const sem = assessFidelity(html, '', { bundledAssets: true });
  const hover = sem.interactions.find((i) => i.kind === 'hover');
  const focus = sem.interactions.find((i) => i.kind === 'focus');
  assert.equal(hover?.support, 'parcial');
  assert.equal(focus?.support, 'parcial');
  assert.match(hover?.description ?? '', /CSS não embutido/);
  assert.equal(sem.support, 'parcial', 'hover sem o CSS que o define rebaixa o selo');
});

test('hover com o CSS que o define embutido (ou sinal do chamador): completo', () => {
  const html = '<a class="btn hover:bg-red-500">Comprar</a>';
  const comCss = assessFidelity(html, '.btn:hover{background:red}', { bundledAssets: true });
  assert.equal(comCss.interactions.find((i) => i.kind === 'hover')?.support, 'completo');
  assert.equal(comCss.support, 'completo');

  const comSinal = assessFidelity(html, '', { bundledAssets: true, cssEmbutido: true });
  assert.equal(comSinal.interactions.find((i) => i.kind === 'hover')?.support, 'completo');
  assert.equal(comSinal.support, 'completo');
});

test('lottie: externo quando não embutido', () => {
  const a = assessFidelity('<lottie-player src="/a.json"></lottie-player>', '', {
    bundledAssets: false,
  });
  assert.equal(a.renderMode, 'lottie');
  assert.equal(a.support, 'externo');
});

test('assets não embutidos geram aviso de sobrevivência', () => {
  const a = assessFidelity('<img src="/x.png">', '', { bundledAssets: false });
  assert.ok(a.warnings.some((w) => /sobrevive|localmente|origem/i.test(w)));
});
