import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
// `getRoot()` é lido a cada chamada, então importar estático aqui não congela a
// raiz: cada teste troca a variável de ambiente antes de usar.
import { queueDoneDir, queuePendingDir } from './paths.js';

/**
 * O resultado de um trabalho que já rodou não pode ser descartado por causa do
 * estado do arquivo da fila.
 *
 * O caso: a pessoa cancela o pedido enquanto ele está sendo produzido. O
 * `cancelJob` move o arquivo de `pendente/` para `concluido/`, e quando o
 * produtor termina e chama `finishJob`, o `pendente/` já não existe. A função
 * devolvia `null` e o `result` sumia junto — e é dentro do `result` que mora o
 * `custoGasto`, ou seja, a única prova de que o crédito saiu da conta.
 */

const comRaizTemporaria = async (t: { after: (fn: () => void) => void }): Promise<
  typeof import('./queue.js')
> => {
  const root = join(tmpdir(), `ds-fila-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  mkdirSync(root, { recursive: true });
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SO limpa o temp */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });
  return await import('./queue.js');
};

test('cancelado no meio: o resultado e anexado em vez de descartado', async (t) => {
  const fila = await comRaizTemporaria(t);

  const job = fila.enqueueJob('criativo', 'Peça paga', { marca: 'X', tetoDeCreditos: 150 });
  assert.equal(fila.cancelJob(job.id), true);

  // O produtor só descobre agora que foi cancelado — e ele JÁ gastou.
  const fechado = fila.finishJob(job.id, { result: { custoGasto: 75 } });

  assert.notEqual(fechado, null, 'finishJob nao pode devolver null e perder o gasto');
  assert.equal(fechado?.status, 'cancelado', 'cancelar foi decisao de quem clicou');
  assert.equal((fechado?.result as { custoGasto?: number } | null)?.custoGasto, 75);

  const emDisco = JSON.parse(readFileSync(join(queueDoneDir(), `${job.id}.json`), 'utf8')) as {
    status: string;
    result: { custoGasto?: number } | null;
  };
  assert.equal(emDisco.status, 'cancelado');
  assert.equal(
    emDisco.result?.custoGasto,
    75,
    'a evidencia tem de estar no disco, nao so no retorno',
  );
});

test('job que nunca existiu continua devolvendo null', async (t) => {
  const fila = await comRaizTemporaria(t);
  assert.equal(fila.finishJob('job_naoexiste', { result: { a: 1 } }), null);
});

test('job ja concluido nao e reescrito por um finish atrasado', async (t) => {
  const fila = await comRaizTemporaria(t);

  const job = fila.enqueueJob('extract', 'Extrair', { url: 'https://exemplo.com' });
  fila.finishJob(job.id, { result: { designSystemId: 'ds_A' } });

  // Uma segunda chamada não pode sobrescrever o que já fechou: só o job
  // CANCELADO aceita evidência depois do fato.
  assert.equal(fila.finishJob(job.id, { result: { designSystemId: 'ds_B' } }), null);

  const emDisco = JSON.parse(readFileSync(join(queueDoneDir(), `${job.id}.json`), 'utf8')) as {
    result: { designSystemId?: string } | null;
  };
  assert.equal(emDisco.result?.designSystemId, 'ds_A');
});

test('PROVA: a chave continua valendo DEPOIS de o job fechar', async (t) => {
  // O `wx` protege só `pendente/`, e um job fechado não mora mais lá. Enquanto
  // a conferência olhava apenas essa pasta, a mesma chave de envio abria um
  // SEGUNDO job pago com o mesmo id — e o `finishJob` dele sobrescrevia o
  // resultado do primeiro, apagando o custo já registrado.
  const fila = await comRaizTemporaria(t);

  const primeiro = fila.enfileirarUmaVez({
    id: 'job_mesmachave',
    type: 'criativo',
    label: 'Peça',
    payload: { marca: 'X' },
    mesmoPedido: () => true,
  });
  assert.equal(primeiro?.estado, 'criado');
  fila.finishJob('job_mesmachave', { result: { custoGasto: 150 } });

  const segundo = fila.enfileirarUmaVez({
    id: 'job_mesmachave',
    type: 'criativo',
    label: 'Peça',
    payload: { marca: 'X' },
    mesmoPedido: () => true,
  });
  assert.equal(segundo?.estado, 'repetido', 'um job que fechou continua ocupando a chave');

  const emDisco = JSON.parse(readFileSync(join(queueDoneDir(), 'job_mesmachave.json'), 'utf8')) as {
    result: { custoGasto?: number } | null;
  };
  assert.equal(emDisco.result?.custoGasto, 150, 'o custo do primeiro continua lá');
});

test('depois de fechado, pedido DIFERENTE na mesma chave e conflito', async (t) => {
  const fila = await comRaizTemporaria(t);
  fila.enfileirarUmaVez({
    id: 'job_outra',
    type: 'criativo',
    label: 'Peça',
    payload: { marca: 'X' },
    mesmoPedido: () => true,
  });
  fila.finishJob('job_outra', { result: {} });

  const r = fila.enfileirarUmaVez({
    id: 'job_outra',
    type: 'criativo',
    label: 'Outra',
    payload: { marca: 'Y' },
    mesmoPedido: () => false,
  });
  assert.equal(r?.estado, 'conflito');
});

test('o marcador .consumed continua saindo de pendente', async (t) => {
  const fila = await comRaizTemporaria(t);
  const job = fila.enqueueJob('extract', 'Extrair', {});
  fila.finishJob(job.id, { result: {} });
  assert.equal(existsSync(join(queuePendingDir(), `${job.id}.json`)), false);
});
