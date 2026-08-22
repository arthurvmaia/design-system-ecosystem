import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A criação de MARCA pela tela.
 *
 * O motor ficou pronto e provado antes de existir esta rota, e por isso o job
 * de prova nasceu de um script escrito à mão. Enquanto for assim, a marca é
 * ferramenta de quem tem terminal, e não produto.
 */

const PEDIDO = {
  nome: 'Sorriso Vivo',
  oQueFaz: 'clínica odontológica de bairro que atende famílias',
  familia: 'decida-por-mim',
  tom: 'acolhedora',
  evitar: 'dente desenhado',
  corPreferida: null,
  tetoDeCreditos: 825,
} as const;

const montar = async (t: { after: (fn: () => void) => void }) => {
  const root = join(tmpdir(), `ds-marca-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.ORBIS_SENHA_ACAO = 'acao';

  const shared = await import('@ds/shared');
  const { ensureDataTree } = await import('@ds/indexer');
  const { marcasRoute } = await import('./marcas.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SO limpa o temp */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
    process.env.ORBIS_SENHA_ACAO = undefined;
  });
  ensureDataTree();

  const app = new Hono().route('/api/marcas', marcasRoute);
  const enviar = async (chave: string, pedido: unknown, senha = 'acao') =>
    await app.request('http://x/api/marcas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orbis-acao': senha },
      body: JSON.stringify({ chaveDeEnvio: chave, pedido }),
    });

  return { shared, app, enviar };
};

test('PROVA: o pedido de marca vira job, com o retrato ao lado', async (t) => {
  const { shared, enviar } = await montar(t);
  const r = await enviar('marca-1', PEDIDO);
  assert.equal(r.status, 202);
  const { job } = (await r.json()) as { job: { id: string } };

  assert.ok(shared.getJob(job.id) !== null, 'o job entrou na fila');
  const retrato = shared.marcaPedidoPath(job.id);
  assert.ok(existsSync(retrato), 'e o retrato está ao lado, gravado ANTES da fila');
  const lido = JSON.parse(readFileSync(retrato, 'utf8')) as { nome: string; preset: string | null };
  assert.equal(lido.nome, 'Sorriso Vivo');
});

test('PROVA: clicar duas vezes devolve o MESMO job', async (t) => {
  const { enviar } = await montar(t);
  const a = (await (await enviar('dois', PEDIDO)).json()) as { job: { id: string } };
  const segunda = await enviar('dois', PEDIDO);
  assert.equal(segunda.status, 200, 'o segundo clique não é erro');
  const b = (await segunda.json()) as { job: { id: string }; repetido: boolean };
  assert.equal(b.job.id, a.job.id);
  assert.equal(b.repetido, true);
});

test('PROVA: pedido sem o que a marca FAZ nao entra', async (t) => {
  // Sem isso o símbolo é sorteio, e descobrir que saiu errado custa outra
  // geração. O contrato trava, e a rota devolve a frase dele.
  const { enviar } = await montar(t);
  const r = await enviar('sem-briefing', { ...PEDIDO, oQueFaz: '' });
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as { error: string }).error, 'pedido_invalido');
});

test('PROVA: teto folgado demais e recusado', async (t) => {
  // O payload é a fonte da verdade e nada impede que ele chegue montado por
  // fora. Um teto muito acima do que a produção inteira custa autoriza gasto
  // que ninguém precisa.
  const { enviar } = await montar(t);
  const r = await enviar('teto-alto', { ...PEDIDO, tetoDeCreditos: 99999 });
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as { error: string }).error, 'teto_alto_demais');
});

test('sem a credencial de acao, nao abre pedido pago', async (t) => {
  const { app } = await montar(t);
  const r = await app.request('http://x/api/marcas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chaveDeEnvio: 'sem-senha', pedido: PEDIDO }),
  });
  assert.equal(r.status, 428);
});

test('o custo da marca vem do CONTRATO, com a conta aberta', async (t) => {
  const { app } = await montar(t);
  const r = await app.request('http://x/api/marcas/custos');
  assert.equal(r.status, 200);
  const c = (await r.json()) as {
    teto: number;
    geracoes: number;
    estagios: { creditos: number }[];
  };
  // O teto é a SOMA dos estágios, e não um número escolhido: se os dois
  // divergirem, a tela promete um custo que o razão não cobra.
  assert.equal(
    c.teto,
    c.estagios.reduce((t, e) => t + e.creditos, 0),
  );
  assert.ok(c.geracoes > 0);
});
