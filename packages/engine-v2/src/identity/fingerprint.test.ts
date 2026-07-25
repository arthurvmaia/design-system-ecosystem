import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMIAR_MESMO_ELEMENTO,
  type SinaisFingerprint,
  chaveCanonica,
  classesEstaveis,
  dataAttrsDeIntencao,
  hashFingerprint,
  melhorPar,
  montarFingerprint,
  pareceGerada,
  similaridade,
} from './fingerprint.js';

const base = (over: Partial<SinaisFingerprint> = {}): SinaisFingerprint => ({
  tag: 'button',
  role: null,
  aria: {},
  dataAttrs: {},
  text: 'Abrir menu',
  classes: ['btn', 'btn-primary'],
  id: null,
  semanticAncestor: 'header',
  siblingIndex: 0,
  structuralSignature: 'svg,span',
  listeners: ['click'],
  ...over,
});

test('classe gerada por bundler é descartada, classe de autor é mantida', () => {
  assert.equal(pareceGerada('css-1a2b3c'), true);
  assert.equal(pareceGerada('sc-bdVaJa'), true);
  assert.equal(pareceGerada('jsx-1234567'), true);
  assert.equal(pareceGerada('svelte-9f8e7d'), true);
  assert.equal(pareceGerada('Button_root__x9f3k'), true);
  assert.equal(pareceGerada('a1b2c3d4e5f6'), true);

  assert.equal(pareceGerada('btn'), false);
  assert.equal(pareceGerada('hero-background'), false);
  assert.equal(pareceGerada('md:flex'), false);
  assert.equal(pareceGerada('w-[42px]'), false);

  assert.deepEqual(classesEstaveis(['btn', 'css-9x8y7z', 'hero']), ['btn', 'hero']);
});

test('data-* de intenção entra; ruído de framework sai', () => {
  const out = dataAttrsDeIntencao({
    'data-toggle': 'modal',
    'data-reactid': '17',
    'data-testid': 'cta',
    'data-dsx-ref': '4',
    'data-config': 'x'.repeat(80),
  });
  assert.deepEqual(out, { 'data-toggle': 'modal', 'data-config': '' });
});

test('a chave canônica ignora a caixa — elemento que se move é o mesmo elemento', () => {
  const a = hashFingerprint(base({ box: { x: 0, y: 0, w: 0.1, h: 0.05 } }));
  const b = hashFingerprint(base({ box: { x: 0.5, y: 0.9, w: 0.1, h: 0.05 } }));
  assert.equal(a, b);
});

test('a chave canônica ignora a ordem das classes e dos atributos', () => {
  const a = chaveCanonica(base({ classes: ['btn', 'primary'], aria: { 'aria-label': 'x' } }));
  const b = chaveCanonica(base({ classes: ['primary', 'btn'], aria: { 'aria-label': 'x' } }));
  assert.equal(a, b);
});

test('classe gerada não muda a identidade entre builds', () => {
  const a = hashFingerprint(base({ classes: ['btn', 'css-aaaaaa'] }));
  const b = hashFingerprint(base({ classes: ['btn', 'css-bbbbbb'] }));
  assert.equal(a, b, 'só a classe gerada mudou; a identidade deve resistir');
});

test('elementos diferentes têm hashes diferentes', () => {
  const a = hashFingerprint(base());
  const b = hashFingerprint(base({ text: 'Fechar menu' }));
  assert.notEqual(a, b);
});

test('similaridade: mesmo id vence divergência de texto e classe', () => {
  const a = montarFingerprint(base({ id: 'menu-toggle', text: 'Menu' }));
  const b = montarFingerprint(
    base({ id: 'menu-toggle', text: 'Fechar', classes: ['btn', 'aberto'] }),
  );
  assert.notEqual(a.hash, b.hash);
  assert.ok(
    similaridade(a, b) >= LIMIAR_MESMO_ELEMENTO,
    `esperava >= ${LIMIAR_MESMO_ELEMENTO}, veio ${similaridade(a, b)}`,
  );
});

test('similaridade: elementos sem relação ficam abaixo do limiar', () => {
  const a = montarFingerprint(base());
  const b = montarFingerprint(
    base({
      tag: 'footer',
      text: 'Todos os direitos reservados',
      classes: ['rodape'],
      semanticAncestor: null,
      structuralSignature: 'p,ul',
      siblingIndex: 3,
    }),
  );
  assert.ok(similaridade(a, b) < LIMIAR_MESMO_ELEMENTO);
});

test('melhorPar devolve null quando nada passa do limiar — não gruda no errado', () => {
  const alvo = montarFingerprint(base({ id: 'hero-cta' }));
  const outros = [
    montarFingerprint(
      base({ tag: 'footer', text: 'rodapé', classes: [], structuralSignature: '' }),
    ),
    montarFingerprint(base({ tag: 'img', text: '', classes: ['logo'], structuralSignature: '' })),
  ];
  assert.equal(melhorPar(alvo, outros), null);
});

test('melhorPar acha o par certo entre vários parecidos', () => {
  const alvo = montarFingerprint(base({ id: 'tab-2', text: 'Recursos' }));
  const certo = montarFingerprint(
    base({ id: 'tab-2', text: 'Recursos', classes: ['btn', 'ativo'] }),
  );
  const errado = montarFingerprint(base({ id: 'tab-3', text: 'Preços' }));
  const par = melhorPar(alvo, [errado, certo]);
  assert.equal(par?.fingerprint.id, 'tab-2');
});

test('montarFingerprint normaliza a tag, ordena listeners e resume o texto', () => {
  const fp = montarFingerprint(
    base({
      tag: 'BUTTON',
      listeners: ['pointerdown', 'click', 'click'],
      text: `  a${'b'.repeat(200)}  `,
    }),
  );
  assert.equal(fp.tag, 'button');
  assert.deepEqual(fp.listeners, ['click', 'pointerdown']);
  assert.equal(fp.text.length, 120);
});
