import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A prévia não pode ser servida em origem OPACA enquanto o portão exigir
 * credencial. Este teste existe por causa de um defeito que passou despercebido
 * por dias e apagou TODA prévia do app.
 *
 * A conta:
 *
 * 1. a resposta declarava `Content-Security-Policy: sandbox allow-scripts`;
 * 2. `sandbox` sem `allow-same-origin` dá ao documento uma origem opaca;
 * 3. de origem opaca, pedir o próprio `assets/styles.css` é um pedido
 *    **cross-site** — e o cookie do portão é `SameSite=Lax`, que não viaja em
 *    cross-site;
 * 4. o servidor respondia 401 em JSON e o Chrome bloqueava (`ERR_BLOCKED_BY_ORB`);
 * 5. o HTML aparecia cru: caixa branca com texto preto miúdo, em cada peça da
 *    Galeria, da Biblioteca e do kit.
 *
 * O sintoma ("as prévias ficaram brancas") não aponta para a causa ("a CSP tem
 * um `sandbox`"), e é por isso que a regra fica travada aqui: quem for endurecer
 * a CSP no futuro esbarra neste teste antes de a tela quebrar de novo.
 */
test('a prévia não sai com `sandbox` na CSP — sandbox + portão = prévia sem CSS', async (t) => {
  const root = join(tmpdir(), `ds-csp-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { previewRoute } = await import('./preview.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SQLite pode segurar o arquivo no Windows */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  runMigrations();

  const cmpId = 'cmp_01TESTECSP0000000000000000' as `cmp_${string}`;
  const bundle = shared.libraryComponentBundleDir(cmpId);
  mkdirSync(join(bundle, 'assets'), { recursive: true });
  writeFileSync(
    join(bundle, 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="assets/x.css"></head><body><p>oi</p></body></html>',
  );
  writeFileSync(join(bundle, 'assets', 'x.css'), 'body{background:#000}');

  getDb()
    .insert(tables.libraryComponents)
    .values({
      id: cmpId,
      segmentId: null,
      designSystemId: null,
      category: 'other',
      kind: 'static',
      name: 'peça de teste',
      bundlePath: bundle,
      bundleHash: 'x',
      addedAt: Date.now(),
    })
    .run();

  const app = new Hono();
  app.route('/api/preview', previewRoute);

  // O documento e o arquivo que ele pede: os dois passam pela mesma CSP.
  for (const url of [
    `/api/preview/component/${cmpId}`,
    `/api/preview/library-bundle/${cmpId}/assets/x.css`,
  ]) {
    const r = await app.request(url);
    assert.equal(r.status, 200, `${url} devia responder 200`);
    const csp = r.headers.get('content-security-policy') ?? '';
    assert.ok(csp.length > 0, `${url} devia declarar CSP`);
    assert.doesNotMatch(
      csp,
      /\bsandbox\b/,
      `${url} voltou a declarar sandbox: com o portão ligado isso deixa a prévia sem CSS`,
    );
    // O que de fato segura a exfiltração continua de pé: connect-src FECHADO,
    // com a única exceção sendo a lista curta de hosts de DADOS de runtime
    // (a cena do UnicornStudio vem por fetch; sem isso a prévia nunca podia
    // mostrar o que promete). Nada de 'self', nada de '*'.
    assert.match(
      csp,
      /connect-src https:\/\/assets\.unicorn\.studio;/,
      `${url} precisa manter connect-src fechado na lista declarada`,
    );
    assert.doesNotMatch(csp, /connect-src[^;]*(\*|'self')/, `${url} abriu o connect-src demais`);
  }
});
