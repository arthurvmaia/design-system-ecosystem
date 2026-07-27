import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORMATO_ACERVO,
  ManifestoAcervo,
  escaparParaLike,
  paresDeSubstituicao,
  substituirRaiz,
} from './acervo.js';

const RAIZ_WIN = 'C:\\Users\\fulano\\design-system-ecosystem';
const RAIZ_WIN_DESTINO = 'C:\\Users\\beltrano\\design-system-ecosystem';

test('paresDeSubstituicao cobre as formas crua, JSON-escapada e com barras normais', () => {
  const pares = paresDeSubstituicao(RAIZ_WIN, RAIZ_WIN_DESTINO);
  assert.equal(pares.length, 3);
  assert.deepEqual(
    pares.map((p) => p.de),
    [
      'C:\\Users\\fulano\\design-system-ecosystem',
      'C:\\\\Users\\\\fulano\\\\design-system-ecosystem',
      'C:/Users/fulano/design-system-ecosystem',
    ],
  );
});

test('paresDeSubstituicao numa raiz POSIX deduplica para um único par', () => {
  const pares = paresDeSubstituicao('/home/fulano/design-system-ecosystem', '/home/b/dse');
  assert.equal(pares.length, 1);
});

test('substituirRaiz troca a forma crua sem tocar no resto do caminho', () => {
  const pares = paresDeSubstituicao(RAIZ_WIN, RAIZ_WIN_DESTINO);
  const antes = `${RAIZ_WIN}\\vault\\ds_abc\\extracted`;
  assert.equal(substituirRaiz(antes, pares), `${RAIZ_WIN_DESTINO}\\vault\\ds_abc\\extracted`);
});

test('substituirRaiz troca a forma JSON-escapada dentro de um blob serializado', () => {
  const pares = paresDeSubstituicao(RAIZ_WIN, RAIZ_WIN_DESTINO);
  const blob = JSON.stringify({ workDir: `${RAIZ_WIN}\\workspace\\task_1` });
  const depois = substituirRaiz(blob, pares);
  assert.equal(JSON.parse(depois).workDir, `${RAIZ_WIN_DESTINO}\\workspace\\task_1`);
});

test('substituirRaiz troca a forma com barras normais', () => {
  const pares = paresDeSubstituicao(RAIZ_WIN, RAIZ_WIN_DESTINO);
  assert.equal(
    substituirRaiz('C:/Users/fulano/design-system-ecosystem/library/cmp_x', pares),
    'C:/Users/beltrano/design-system-ecosystem/library/cmp_x',
  );
});

test('substituirRaiz não altera texto sem ocorrência da raiz', () => {
  const pares = paresDeSubstituicao(RAIZ_WIN, RAIZ_WIN_DESTINO);
  const texto = 'https://stripe.com/assets/logo.svg';
  assert.equal(substituirRaiz(texto, pares), texto);
});

test('escaparParaLike neutraliza os curingas % e _ do LIKE', () => {
  assert.equal(
    escaparParaLike('C:\\Users\\joao_silva\\100%\\design-system-ecosystem'),
    'C:\\Users\\joao!_silva\\100!%\\design-system-ecosystem',
  );
});

test('ManifestoAcervo aceita um manifesto válido e rejeita formato desconhecido', () => {
  const valido = {
    formato: FORMATO_ACERVO,
    exportadoEm: '2026-07-27T12:00:00.000Z',
    raizOrigem: RAIZ_WIN,
    plataforma: 'win32',
    contagens: { designSystems: 2, componentes: 10, kits: 1, sites: 0 },
  };
  assert.equal(ManifestoAcervo.parse(valido).raizOrigem, RAIZ_WIN);
  assert.throws(() => ManifestoAcervo.parse({ ...valido, formato: 'ds-acervo/99' }));
});
