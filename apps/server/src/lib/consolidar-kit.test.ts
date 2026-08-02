import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

/**
 * A metade esquecida da exclusão.
 *
 * O SQLite tem cascata e ela funciona: apagar uma peça tira a LINHA dela de
 * `kit_components`. O que ele não faz é refazer o que foi DERIVADO daquela
 * linha — o `tokensJson` do kit, que descreve as cores e as fontes das peças.
 * Sem reconsolidar, o kit seguia prometendo a paleta de uma peça que já não
 * existia.
 *
 * `kitsQueUsam` é a pergunta que torna a correção possível, e ela carrega um
 * detalhe de ORDEM: precisa ser respondida ANTES do delete. Depois, a cascata
 * já levou o vínculo e não há mais como saber quem dependia.
 *
 * ## Duas decisões de forma, cada uma por um motivo medido
 *
 * **Banco de verdade, não dublê.** A primeira versão usava um `db` de mentira e
 * quebrou porque `inArray` devolve uma expressão do drizzle, não uma lista. Um
 * dublê que precisa imitar o construtor de query testa o dublê.
 *
 * **Uma raiz para o arquivo inteiro.** `getDb` é singleton: uma raiz por teste
 * daria a mesma conexão para todas, e no Windows a limpeza falha com EPERM
 * porque o arquivo do banco continua aberto. Cada teste usa ids próprios.
 */

const raiz = mkdtempSync(join(tmpdir(), 'consolidar-kit-'));
process.env.DS_ECOSYSTEM_ROOT = raiz;

const indexer = await import('@ds/indexer');
indexer.ensureDataTree();
indexer.runMigrations();
const { kitsQueUsam } = await import('./consolidar-kit.js');

const db = indexer.getDb();
const { designSystems, kitComponents, kits, libraryComponents } = indexer.tables;

db.insert(designSystems)
  .values({
    id: 'ds_teste',
    sourceUrl: null,
    sourceHash: 'h',
    extractedAt: Date.now(),
    name: 'origem de teste',
    status: 'ready',
    vaultPath: 'x',
  })
  .run();

after(() => {
  indexer.getSqlite().close();
  rmSync(raiz, { recursive: true, force: true });
});

/** Semeia um kit com as peças pedidas. Ids próprios por teste, sem colisão. */
const cenario = (sufixo: string, opts: { pecas: string[]; noKit: string[] }): string => {
  const kitId = `kit_${sufixo}`;
  const agora = Date.now();
  for (const nome of opts.pecas) {
    db.insert(libraryComponents)
      .values({
        id: `cmp_${sufixo}_${nome}`,
        segmentId: null,
        designSystemId: 'ds_teste',
        category: 'button',
        kind: 'component',
        name: nome,
        bundlePath: 'x',
        bundleHash: 'h',
        addedAt: agora,
      })
      .run();
  }
  db.insert(kits).values({ id: kitId, name: sufixo, createdAt: agora, updatedAt: agora }).run();
  opts.noKit.forEach((nome, i) => {
    db.insert(kitComponents)
      .values({ kitId, componentId: `cmp_${sufixo}_${nome}`, position: i })
      .run();
  });
  return kitId;
};

test('lista vazia não consulta o banco', () => {
  cenario('vazia', { pecas: ['a'], noKit: ['a'] });
  assert.deepEqual(kitsQueUsam(db, []), []);
});

test('acha o kit que usa a peça', () => {
  const kitId = cenario('acha', { pecas: ['a', 'b'], noKit: ['a'] });
  assert.deepEqual(kitsQueUsam(db, ['cmp_acha_a']), [kitId]);
});

test('duas peças do mesmo kit devolvem o kit UMA vez', () => {
  // Reconsolidar duas vezes seria trabalho repetido, e o segundo passe leria o
  // estado que o primeiro já corrigiu.
  const kitId = cenario('duas', { pecas: ['a', 'b'], noKit: ['a', 'b'] });
  assert.deepEqual(kitsQueUsam(db, ['cmp_duas_a', 'cmp_duas_b']), [kitId]);
});

test('peça fora de qualquer kit não afeta ninguém', () => {
  cenario('fora', { pecas: ['a', 'b'], noKit: ['a'] });
  assert.deepEqual(kitsQueUsam(db, ['cmp_fora_b']), []);
});

test('depois do delete a resposta já é vazia — por isso a pergunta vem antes', () => {
  // Este é o teste que justifica a ORDEM no código da rota. Se alguém mover a
  // chamada para depois do delete, ela passa a devolver lista vazia e a
  // reconsolidação silenciosamente deixa de acontecer.
  const kitId = cenario('ordem', { pecas: ['a'], noKit: ['a'] });
  const antes = kitsQueUsam(db, ['cmp_ordem_a']);
  db.delete(libraryComponents).where(indexer.eq(libraryComponents.id, 'cmp_ordem_a')).run();
  const depois = kitsQueUsam(db, ['cmp_ordem_a']);

  assert.deepEqual(antes, [kitId]);
  assert.deepEqual(depois, []);
});
