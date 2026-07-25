import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type EvidenciaNome, nomeEhGenerico, nomearPorEvidencia } from './naming.js';

const ev = (over: Partial<EvidenciaNome> = {}): EvidenciaNome => ({
  category: 'other',
  role: 'section',
  heading: null,
  runtimes: [],
  midias: [],
  midiaComoFundo: false,
  animado: false,
  reageAoPonteiro: false,
  particulas: false,
  scroll: [],
  estados: [],
  representacao: 'componente-portatil',
  ...over,
});

test('hero com partículas que reagem ao ponteiro sai nomeado, não como "Seção"', () => {
  const { nome } = nomearPorEvidencia(
    ev({
      category: 'hero',
      role: 'hero',
      particulas: true,
      reageAoPonteiro: true,
      runtimes: ['three'],
    }),
  );
  assert.equal(nome, 'Hero com partículas WebGL');
  assert.equal(nomeEhGenerico(nome), false);
});

test('background WebGL animado é nomeado pelo runtime', () => {
  const { nome } = nomearPorEvidencia(
    ev({ category: 'background', role: 'canvas', runtimes: ['three'], animado: true }),
  );
  assert.equal(nome, 'Background com WebGL em loop');
});

test('CTA com vídeo de fundo diz exatamente isso', () => {
  const { nome } = nomearPorEvidencia(
    ev({ category: 'cta', midias: ['video'], midiaComoFundo: true }),
  );
  assert.equal(nome, 'CTA com vídeo de fundo');
});

test('cards com reveal por scroll ganham o comportamento no nome', () => {
  const { nome } = nomearPorEvidencia(ev({ category: 'card', scroll: ['viewport-reveal'] }));
  assert.equal(nome, 'Cards com reveal progressivo');
});

test('cena Lottie em loop', () => {
  const { nome } = nomearPorEvidencia(
    ev({
      category: 'other',
      role: 'canvas',
      runtimes: ['lottie'],
      animado: true,
      representacao: 'capsula-runtime',
    }),
  );
  assert.equal(nome, 'Cena com Lottie em loop');
});

test('navegação com estado capturado é desambiguada pelo estado', () => {
  const { nome } = nomearPorEvidencia(
    ev({ category: 'nav', role: 'nav', estados: ['menu expandido'] }),
  );
  assert.equal(nome, 'Navegação com menu expandido');
});

test('seção sticky com transição por scroll', () => {
  const { nome } = nomearPorEvidencia(
    ev({ category: 'other', role: 'section', scroll: ['sticky', 'progress-transform'] }),
  );
  assert.equal(nome, 'Bloco com sticky');
});

test('hover magnético só aparece quando a reação foi MEDIDA', () => {
  const semMedicao = nomearPorEvidencia(ev({ category: 'feature' }));
  assert.equal(semMedicao.nome, 'Recursos');
  const comMedicao = nomearPorEvidencia(ev({ category: 'feature', reageAoPonteiro: true }));
  assert.equal(comMedicao.nome, 'Recursos com hover magnético');
});

test('sem qualificador, o título visível desempata — na língua do site, sem tradução', () => {
  const { nome } = nomearPorEvidencia(ev({ category: 'feature', heading: 'Built for scale' }));
  assert.equal(nome, 'Recursos — Built for scale');
});

test('sem categoria, sem papel e sem título, o nome sai da representação — nunca "Seção"', () => {
  const capsula = nomearPorEvidencia(ev({ role: 'unknown', representacao: 'capsula-runtime' }));
  assert.equal(capsula.nome, 'Cena');
  const referencia = nomearPorEvidencia(
    ev({ role: 'unknown', representacao: 'referencia-visual' }),
  );
  assert.equal(referencia.nome, 'Referência visual');
});

test('o nome é determinístico — a mesma evidência dá o mesmo nome', () => {
  const e = ev({ category: 'hero', particulas: true, reageAoPonteiro: true });
  assert.equal(nomearPorEvidencia(e).nome, nomearPorEvidencia(e).nome);
});

test('no máximo dois qualificadores — o resto vai para os selos', () => {
  const { nome } = nomearPorEvidencia(
    ev({
      category: 'hero',
      runtimes: ['three'],
      midias: ['video'],
      particulas: true,
      reageAoPonteiro: true,
      scroll: ['parallax'],
      estados: ['aberto'],
    }),
  );
  assert.equal((nome.match(/ e /g) ?? []).length, 1, `nome virou frase: ${nome}`);
});

test('índice desambigua homônimos', () => {
  const { nome } = nomearPorEvidencia(ev({ category: 'card', indice: 2 }));
  assert.equal(nome, 'Cards (3)');
});

test('nomeEhGenerico reconhece os nomes que o V1 produzia', () => {
  for (const n of ['Seção', 'Seção 3', 'Bloco', 'div', 'Container', 'wrapper', 'Conteúdo']) {
    assert.equal(nomeEhGenerico(n), true, `"${n}" deveria contar como genérico`);
  }
  for (const n of ['Hero com partículas WebGL', 'Cabeçalho', 'Bloco com sticky']) {
    assert.equal(nomeEhGenerico(n), false, `"${n}" não é genérico`);
  }
});

test('título muito longo é encurtado sem cortar palavra no meio', () => {
  const { nome } = nomearPorEvidencia(
    ev({
      role: 'unknown',
      heading: 'Uma manchete absurdamente longa que jamais caberia num card da Galeria',
    }),
  );
  assert.ok(nome.length <= 41, `nome longo: ${nome.length}`);
  assert.ok(nome.endsWith('…'));
  assert.ok(!/\s…$/.test(nome), 'não deve sobrar espaço antes das reticências');
});
