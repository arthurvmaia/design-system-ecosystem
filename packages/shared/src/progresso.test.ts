import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * O caso real: a pessoa clicou em "Gerar site", abriu o PROCESSAR, escolheu o
 * job e fechou a janela sem rodar. O lote ficou no disco e a tela desenhou
 * "Planejando o site… 0%" com animação por minutos, para um trabalho que nunca
 * começou. `emAndamento` é o que separa "trabalhando" de "esperando você".
 */

const raiz = mkdtempSync(join(tmpdir(), 'ds-fila-'));
process.env.DS_DATA_DIR = raiz;

const { clearLote, enqueueJob, getProgresso, reportarProgresso, setLote, finishJob } = await import(
  './queue.js'
);

test('lote aberto sem nenhum reporte NÃO está em andamento', () => {
  const job = enqueueJob('generate', 'Gerar site — Teste', {});
  setLote([job.id]);
  const p = getProgresso();
  assert.equal(p?.emAndamento, false, 'ninguém reportou nada: não há trabalho acontecendo');
  assert.equal(p?.percentual, 0);
  clearLote();
});

test('a primeira etapa reportada já conta como em andamento', () => {
  const job = enqueueJob('generate', 'Gerar site — Teste 2', {});
  setLote([job.id]);
  reportarProgresso(job.id, 20);
  const p = getProgresso();
  assert.equal(p?.emAndamento, true);
  assert.equal(p?.percentual, 20);
  clearLote();
});

test('job concluído conta como em andamento mesmo sem etapa reportada', () => {
  const job = enqueueJob('extract', 'Extrair — Teste', {});
  setLote([job.id]);
  finishJob(job.id, { result: { ok: true } });
  const p = getProgresso();
  assert.equal(p?.emAndamento, true);
  assert.equal(p?.percentual, 100);
  clearLote();
});

test('sem lote não há progresso nenhum', () => {
  clearLote();
  assert.equal(getProgresso(), null);
});

test.after(() => rmSync(raiz, { recursive: true, force: true }));
