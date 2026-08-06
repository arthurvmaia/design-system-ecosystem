import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { comPisoDoSite, consolidarFases, mediana, p95 } from './historico-de-fases.js';

/**
 * O histórico é o que transforma a reserva de orçamento de fração fixa em
 * custo medido. Duas regras têm de valer sempre: fase abortada não conta (o
 * custo dela é o teto que a cortou, não o custo real), e p95 segura o caso
 * típico sem deixar um outlier mandar.
 */

test('p95 de lista vazia é undefined: sem medição, sem promessa', () => {
  assert.equal(p95([]), undefined);
});

test('p95 pega o alto sem ser o máximo absoluto', () => {
  const valores = [10, 12, 11, 13, 12, 11, 10, 12, 11, 100];
  const v = p95(valores);
  assert.ok(v !== undefined);
  // Com 10 valores, o p95 é o 10º (o teto). Com mais amostras ele desgruda.
  assert.ok(v >= 13);
});

test('mediana: o custo típico, não o outlier', () => {
  assert.equal(mediana([]), undefined);
  assert.equal(mediana([10, 90, 20]), 20);
  // Par: fica com o de baixo do meio, conservador para o percurso.
  assert.equal(mediana([10, 20, 30, 90]), 20);
});

test('fase abortada não entra na MEDIANA, mas vira PISO: custou pelo menos o corte', () => {
  const historico = consolidarFases([
    [
      { nome: 'v2-percurso', ms: 169_000, abortada: true },
      { nome: 'v2-compilar', ms: 4_000 },
    ],
    [
      { nome: 'v2-percurso', ms: 91_000 },
      { nome: 'v2-compilar', ms: 3_000 },
    ],
  ]);
  assert.equal(
    historico['v2-percurso'],
    169_000,
    'a fase cortada em 169 s custou PELO MENOS 169 s: o piso vence a mediana magra',
  );
  assert.equal(historico['v2-compilar'], 3_000, 'MEDIANA, não p95: o típico manda');
});

test('o piso de corte quebra o ciclo da fome: sites leves não encolhem a reserva do pesado', () => {
  // O laço medido no acervo: retratos cortado em TODA rodada do site WebGL
  // (25-33 s no teto), descartado do histórico, mediana feita só dos sites
  // leves (~16 s) → reserva magra → percurso come tudo → retratos cortado de
  // novo. Com o piso, a evidência "precisou de MAIS que 33 s" entra na régua.
  const historico = consolidarFases([
    [{ nome: 'v2-retratos', ms: 16_000 }],
    [{ nome: 'v2-retratos', ms: 18_000 }],
    [{ nome: 'v2-retratos', ms: 33_000, abortada: true }],
  ]);
  assert.equal(historico['v2-retratos'], 33_000, 'o piso do corte vence a mediana dos leves');
});

test('o histórico consolida pela MEDIANA: um site pesado não esfomeia os outros', () => {
  // O laço medido no acervo: p95 dos pesados engordava a reserva a cada
  // rodada (125 s → 217 s num dia) e o teto do percurso caía para TODOS.
  const historico = consolidarFases([
    [{ nome: 'v2-estados', ms: 20_000 }],
    [{ nome: 'v2-estados', ms: 25_000 }],
    [{ nome: 'v2-estados', ms: 30_000 }],
    [{ nome: 'v2-estados', ms: 95_000 }],
  ]);
  assert.equal(historico['v2-estados'], 25_000, 'o outlier de 95 s não vira a régua');
});

test('fase que só existe abortada entra pelo piso: é a única evidência que há', () => {
  const historico = consolidarFases([[{ nome: 'v2-estados', ms: 92_000, abortada: true }]]);
  assert.equal(historico['v2-estados'], 92_000);
});

test('comPisoDoSite: a recaptura reserva pelo que ESTE site custou, não pelo típico', () => {
  // O laço medido: mediana do acervo magra (sites leves) → reserva magra → o
  // percurso do site WebGL comia o livre → retratos/estados cortados em toda
  // rodada. O manifesto anterior do próprio site é a evidência que faltava.
  const raiz = mkdtempSync(join(tmpdir(), 'acervo-'));
  const dsId = 'ds_TESTE';
  mkdirSync(join(raiz, 'vault', dsId, 'capture-v2'), { recursive: true });
  writeFileSync(
    join(raiz, 'vault', dsId, 'capture-v2', 'manifest.json'),
    JSON.stringify({
      telemetry: {
        fases: [
          { nome: 'v2-retratos', ms: 30_623, abortada: true },
          { nome: 'v2-estados', ms: 67_876, abortada: true },
          { nome: 'v2-comparar', ms: 11_314 },
        ],
      },
    }),
    'utf8',
  );
  const anterior = process.env.DS_ECOSYSTEM_ROOT;
  process.env.DS_ECOSYSTEM_ROOT = raiz;
  try {
    const h = comPisoDoSite({ 'v2-retratos': 20_000, 'v2-estados': 80_000 }, dsId);
    assert.ok(h !== undefined);
    assert.equal(h['v2-retratos'], 30_623, 'o gasto real do site vence a mediana magra');
    assert.equal(h['v2-estados'], 80_000, 'a mediana maior não é rebaixada');
    assert.equal(h['v2-comparar'], 11_314, 'fase sem mediana entra pelo site');

    const semManifesto = comPisoDoSite({ 'v2-estados': 1 }, 'ds_QUENAOEXISTE');
    assert.deepEqual(semManifesto, { 'v2-estados': 1 }, 'sem manifesto, o histórico passa intacto');
  } finally {
    if (anterior === undefined) Reflect.deleteProperty(process.env, 'DS_ECOSYSTEM_ROOT');
    else process.env.DS_ECOSYSTEM_ROOT = anterior;
  }
});
