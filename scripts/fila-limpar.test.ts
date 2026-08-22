import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type JobNaFila, planejarLimpeza } from './fila-limpar.js';

/**
 * A regra que impede a limpeza de rotina de levar material pago.
 *
 * O `PROCESSAR.bat` termina chamando o `fila:limpar`. Enquanto ele apagava tudo,
 * cada sessão levava junto o pedido do criativo — e com ele a peça que a tela
 * "Minhas peças" lista, o teto de créditos que a conferência de fechamento
 * confere e os claims autorizados. Os arquivos ficavam órfãos em
 * `criativos/<job_id>/`, alcançáveis só por quem soubesse o id de cor.
 */

const job = (id: string, tipo: string | null): JobNaFila => ({
  arquivo: `${id}.json`,
  id,
  tipo,
});

test('limpeza de rotina nao apaga job criativo', () => {
  const r = planejarLimpeza({
    jobs: [job('job_a', 'extract'), job('job_b', 'criativo')],
    ids: null,
    incluirCriativos: false,
  });
  assert.deepEqual(
    r.apagar.map((j) => j.id),
    ['job_a'],
  );
  assert.deepEqual(
    r.criativosPoupados.map((j) => j.id),
    ['job_b'],
  );
});

test('nomear o id nao basta: o criativo continua exigindo a bandeira', () => {
  const r = planejarLimpeza({
    jobs: [job('job_b', 'criativo')],
    ids: ['job_b'],
    incluirCriativos: false,
  });
  assert.equal(r.apagar.length, 0);
  assert.equal(r.criativosPoupados.length, 1);
});

test('com --incluir-criativos o criativo sai', () => {
  const r = planejarLimpeza({
    jobs: [job('job_b', 'criativo')],
    ids: ['job_b'],
    incluirCriativos: true,
  });
  assert.deepEqual(
    r.apagar.map((j) => j.id),
    ['job_b'],
  );
  assert.equal(r.criativosPoupados.length, 0);
});

test('com ids, o pendente que ficou de fora do lote nao e tocado', () => {
  const r = planejarLimpeza({
    jobs: [job('job_a', 'extract'), job('job_c', 'extract')],
    ids: ['job_a'],
    incluirCriativos: false,
  });
  assert.deepEqual(
    r.apagar.map((j) => j.id),
    ['job_a'],
  );
});

test('json ilegivel sobrevive a limpeza de rotina, porque pode ser criativo', () => {
  const r = planejarLimpeza({
    jobs: [job('job_x', null)],
    ids: null,
    incluirCriativos: false,
  });
  assert.equal(r.apagar.length, 0);
  assert.deepEqual(
    r.desconhecidosPoupados.map((j) => j.id),
    ['job_x'],
  );
});

test('json ilegivel sai quando a pessoa nomeia o id', () => {
  const r = planejarLimpeza({
    jobs: [job('job_x', null)],
    ids: ['job_x'],
    incluirCriativos: false,
  });
  assert.deepEqual(
    r.apagar.map((j) => j.id),
    ['job_x'],
  );
  assert.equal(r.desconhecidosPoupados.length, 0);
});

test('PROVA: a faxina de rotina tambem poupa job de MARCA', () => {
  // O estrago e o mesmo do criativo, e nem o nome muda: o job e a unica
  // identidade que o pedido tem. Apaga-lo deixa em disco o simbolo gerado, as
  // versoes da logo e a apresentacao em PDF — tudo pago — numa pasta orfa.
  const r = planejarLimpeza({
    jobs: [job('job_a', 'extract'), job('job_b', 'marca'), job('job_c', 'criativo')],
    ids: null,
    incluirCriativos: false,
  });
  assert.deepEqual(
    r.apagar.map((j) => j.id),
    ['job_a'],
  );
  assert.deepEqual(
    r.criativosPoupados.map((j) => j.id),
    ['job_b', 'job_c'],
  );
});

test('nomear o id nao basta para a marca: a bandeira continua exigida', () => {
  const r = planejarLimpeza({
    jobs: [job('job_b', 'marca')],
    ids: ['job_b'],
    incluirCriativos: false,
  });
  assert.equal(r.apagar.length, 0);
  assert.equal(r.criativosPoupados.length, 1);
});
