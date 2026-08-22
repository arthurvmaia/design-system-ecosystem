import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * O painel da fila não recebe mais o briefing de ninguém.
 *
 * A rota devolvia o job inteiro. Para `criativo` isso significa a descrição da
 * cena, a headline literal, os claims que o cliente autorizou e o teto de
 * créditos dele — tudo para desenhar uma linha numa lista, e para qualquer
 * sessão, inclusive a de leitura.
 */
test('GET /api/queue nao devolve o payload do pedido', async (t) => {
  const root = join(tmpdir(), `ds-fila-resumo-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree } = await import('@ds/indexer');
  const { queueRoute } = await import('./queue.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SO limpa o temp */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  shared.enqueueJob('criativo', 'Criativo: Marca', {
    marca: 'Marca',
    tetoDeCreditos: 150,
    texto: { semTexto: false, headline: 'SEGREDO COMERCIAL', cta: null },
    autorizacoesDeClaim: { preco: 'R$ 99,90' },
  });
  shared.enqueueJob('generate', 'Gerar site', { projectId: 'prj_ABC', kitId: 'kit_X' });

  const app = new Hono().route('/api/queue', queueRoute);
  const resposta = await app.request('http://x/api/queue');
  const corpo = (await resposta.json()) as {
    pending: { type: string; label: string; payload: Record<string, unknown> }[];
  };
  const texto = JSON.stringify(corpo);

  assert.equal(corpo.pending.length, 2, 'os dois jobs continuam na lista');
  assert.ok(!texto.includes('SEGREDO COMERCIAL'), 'a headline literal nao sai daqui');
  assert.ok(!texto.includes('99,90'), 'o claim autorizado nao sai daqui');
  assert.ok(!texto.includes('tetoDeCreditos'), 'o teto de credito do cliente nao sai daqui');

  const criativo = corpo.pending.find((j) => j.type === 'criativo');
  assert.deepEqual(criativo?.payload, {}, 'sem projectId, o payload vai vazio');
  assert.equal(criativo?.label, 'Criativo: Marca', 'o rotulo continua, que e o que a lista mostra');

  // A única chave que alguém consome continua chegando, com o mesmo nome:
  // `apps/web/src/routes/projects/index.tsx:208` procura o job daquele projeto.
  const gerar = corpo.pending.find((j) => j.type === 'generate');
  assert.equal(gerar?.payload.projectId, 'prj_ABC');
  assert.equal(gerar?.payload.kitId, undefined, 'e so ela');
});
