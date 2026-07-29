import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Apagar um projeto com pedido na fila não pode passar.
 *
 * O estrago real: a pessoa clicou em "Gerar site" e, logo depois, na lixeira do
 * card. O `DELETE` levou a linha do banco e a pasta inteira — mas quem gera o
 * site é um processo de fora, que já tinha lido o pedido do disco e seguiu
 * trabalhando. O site ficou pronto, íntegro, dentro de uma pasta que o
 * aplicativo não alcança mais: Meus sites lista a partir do banco, e no banco
 * não havia mais nada. Trabalho perdido sem uma linha de aviso.
 */
test('excluir projeto: recusa enquanto houver job na fila, libera depois', async (t) => {
  const root = join(tmpdir(), `ds-prj-del-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { enqueueJob, finishJob, projectDir, projectGeneratedDir } = await import('@ds/shared');
  const { projectsRoute } = await import('./projects.js');
  const { Hono } = await import('hono');

  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* SQLite pode segurar o arquivo no Windows */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  getDb();
  runMigrations();
  const db = getDb();

  const prjId = `prj_${randomUUID().replace(/-/g, '').slice(0, 20)}` as `prj_${string}`;
  db.insert(tables.projects)
    .values({
      id: prjId,
      name: 'Pelina',
      createdAt: 1,
      updatedAt: 1,
      kitId: null,
      contentJson: null,
      brandingJson: null,
      mediaManifestJson: null,
      layoutJson: null,
      status: 'draft',
    })
    .run();

  // Um site já gerado em disco: é exatamente o que se perdeu no caso real.
  const versao = join(projectGeneratedDir(prjId), '2026-07-29T01-49-46-490Z');
  mkdirSync(versao, { recursive: true });
  writeFileSync(join(versao, 'index.html'), '<!doctype html><title>Pelina</title>', 'utf8');

  const job = enqueueJob('generate', 'Gerar site — Pelina', { projectId: prjId });

  const app = new Hono().route('/api/projects', projectsRoute);
  const apagar = async () => app.request(`/api/projects/${prjId}`, { method: 'DELETE' });

  const recusa = await apagar();
  assert.equal(recusa.status, 409, 'com job na fila, o servidor tem de recusar');

  const corpo = (await recusa.json()) as { error: string; message: string };
  assert.equal(corpo.error, 'job_em_aberto');
  assert.match(corpo.message, /fila/i, 'a mensagem é lida por uma pessoa, não por um log');
  assert.match(corpo.message, /Pelina/, 'dizer QUAL pedido segura a exclusão');

  assert.ok(existsSync(join(versao, 'index.html')), 'a recusa não pode ter apagado nada');
  assert.ok(
    db.select().from(tables.projects).all().length === 1,
    'a linha do projeto continua no índice',
  );

  // Job encerrado, o caminho volta a abrir: a trava é sobre trabalho em voo,
  // não uma proibição permanente de apagar projetos que já geraram site.
  finishJob(job.id, { result: { ok: true } });

  const ok = await apagar();
  assert.equal(ok.status, 200, 'sem job em aberto, apagar volta a funcionar');
  assert.equal(db.select().from(tables.projects).all().length, 0);
  assert.ok(!existsSync(projectDir(prjId)), 'a pasta sai junto, como sempre saiu');
});
