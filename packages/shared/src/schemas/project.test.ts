import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefVazio, espelhoDoBrief, normalizarProjectContent } from './project.js';

test('espelhoDoBrief: mensagem, pontos, provas e chamada viram texto plano', () => {
  const texto = espelhoDoBrief({
    mensagem: 'A promessa. ',
    pontos: ['Recurso A', ' ', 'Recurso B'],
    provas: ['98% de satisfação'],
    cta: 'Comece agora',
  });
  assert.equal(
    texto,
    'A promessa.\nRecurso A\nRecurso B\n98% de satisfação\nChamada: Comece agora',
  );

  assert.equal(briefVazio({ pontos: [], provas: [] }), true);
  assert.equal(briefVazio({ pontos: ['  '], provas: [], mensagem: ' ' }), true);
  assert.equal(briefVazio({ pontos: [], provas: [], mensagem: 'oi' }), false);
});

test('sections legado migra para briefs na leitura (texto vira mensagem)', () => {
  const c = normalizarProjectContent(
    JSON.stringify({ sections: { hero: 'Nossa promessa', features: '', faq: 'P — R' } }),
  );
  assert.equal(c.briefs?.hero?.mensagem, 'Nossa promessa');
  assert.equal(c.briefs?.faq?.mensagem, 'P — R');
  assert.equal(c.briefs?.features, undefined, 'texto vazio não vira brief');
  // o legado continua no lugar — nada some
  assert.equal(c.sections?.hero, 'Nossa promessa');
});

test('briefs já preenchidos NUNCA são sobrescritos pelo sections legado', () => {
  const c = normalizarProjectContent(
    JSON.stringify({
      sections: { hero: 'texto velho' },
      briefs: { hero: { mensagem: 'estruturado', pontos: ['a'], provas: [] } },
    }),
  );
  assert.equal(c.briefs?.hero?.mensagem, 'estruturado');
  assert.deepEqual(c.briefs?.hero?.pontos, ['a']);
});

test('JSON corrompido continua caindo no default carimbado', () => {
  const c = normalizarProjectContent('###');
  assert.ok(c.schemaVersion !== undefined);
  assert.ok(c.about);
  assert.equal(c.briefs, undefined);
});
