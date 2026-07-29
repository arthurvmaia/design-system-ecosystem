import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidirScripts, refDoScript, runtimesQueViajam } from './runtime-local.js';

const ctx = (over: Partial<Parameters<typeof decidirScripts>[1]> = {}) => ({
  cssCompiladoCapturado: true,
  iconesPendentes: 0,
  ...over,
});

// ── O caso que motivou tudo ─────────────────────────────────────────────────

test('script baixado VIAJA no bundle em vez de apontar para o CDN', () => {
  // Os arquivos já eram baixados para a captura e o bundle os ignorava: o site
  // gerado só funcionava com internet, e só enquanto o endereço existisse.
  const [d] = decidirScripts(
    [{ url: 'https://cdn.exemplo/webgl-background.js', localPath: 'js/ab12.js' }],
    ctx(),
  );
  assert.equal(d?.decisao, 'levar');
  assert.equal(refDoScript(d as never), 'assets/js/ab12.js');
});

test('script que não pôde ser baixado fica remoto, e isso é DITO', () => {
  const [d] = decidirScripts([{ url: 'https://cdn.exemplo/x.js' }], ctx());
  assert.equal(d?.decisao, 'remoto');
  assert.equal(refDoScript(d as never), 'https://cdn.exemplo/x.js');
  assert.ok(d?.motivo.includes('internet'));
});

// ── Dispensar: quando levar seria peso morto ────────────────────────────────

test('Tailwind por CDN é dispensado quando o CSS compilado já foi capturado', () => {
  // Levá-lo faria o navegador recompilar tudo por cima do que já está pronto.
  const [d] = decidirScripts(
    [{ url: 'https://cdn.tailwindcss.com', localPath: 'js/tw.js' }],
    ctx({ cssCompiladoCapturado: true }),
  );
  assert.equal(d?.decisao, 'dispensar');
  assert.equal(refDoScript(d as never), null, 'dispensado não vira tag nenhuma');
});

test('sem o CSS capturado, o Tailwind por CDN volta a ser necessário', () => {
  const [d] = decidirScripts(
    [{ url: 'https://cdn.tailwindcss.com', localPath: 'js/tw.js' }],
    ctx({ cssCompiladoCapturado: false }),
  );
  assert.equal(d?.decisao, 'levar');
});

test('a biblioteca de ícones é dispensada quando todos os SVGs foram inlinados', () => {
  const [d] = decidirScripts(
    [{ url: 'https://cdn/iconify-icon.min.js', localPath: 'js/ic.js' }],
    ctx({ iconesPendentes: 0 }),
  );
  assert.equal(d?.decisao, 'dispensar');
});

// ── A nuance que é fácil errar ──────────────────────────────────────────────

test('com ícone pendente, a biblioteca viaja MAS o alcance é declarado', () => {
  // Ter o iconify-icon.min.js no disco é ter o carteiro, não a carta: o traçado
  // de cada ícone vem de uma API em tempo de execução. Dizer "agora funciona
  // offline" aqui seria falso.
  const [d] = decidirScripts(
    [{ url: 'https://cdn/iconify-icon.min.js', localPath: 'js/ic.js' }],
    ctx({ iconesPendentes: 5 }),
  );
  assert.equal(d?.decisao, 'levar');
  assert.ok(d?.motivo.includes('API'), `o motivo precisa dizer isso: ${d?.motivo}`);
});

test('o Iconify NÃO conta como runtime que passou a rodar offline', () => {
  const ds = decidirScripts(
    [
      { url: 'https://cdn/iconify-icon.min.js', localPath: 'js/ic.js' },
      { url: 'https://cdn/three.min.js', localPath: 'js/th.js' },
    ],
    ctx({ iconesPendentes: 3 }),
  );
  const viajam = runtimesQueViajam(ds);
  assert.ok(viajam.includes('three'));
  assert.ok(!viajam.includes('iconify'), 'a cópia do script não tira o Iconify da rede');
});

// ── Reconhecimento ──────────────────────────────────────────────────────────

test('o runtime é reconhecido pelo nome do arquivo, para o motivo ser útil', () => {
  const ds = decidirScripts(
    [
      { url: 'https://cdn/gsap.min.js', localPath: 'js/a.js' },
      { url: 'https://cdn/swiper-bundle.js', localPath: 'js/b.js' },
      { url: 'https://site/assets/interactions.js', localPath: 'js/c.js' },
    ],
    ctx(),
  );
  assert.equal(ds[0]?.runtime, 'gsap');
  assert.equal(ds[1]?.runtime, 'swiper');
  assert.equal(ds[2]?.runtime, undefined, 'script próprio do site não tem runtime conhecido');
  assert.equal(ds[2]?.decisao, 'levar', 'e mesmo assim viaja: é código que a página executa');
});

test('lista vazia não quebra', () => {
  assert.deepEqual(decidirScripts([], ctx()), []);
  assert.deepEqual(runtimesQueViajam([]), []);
});

test('localPath vazio conta como não baixado', () => {
  const [d] = decidirScripts([{ url: 'https://cdn/x.js', localPath: '' }], ctx());
  assert.equal(d?.decisao, 'remoto');
});
