import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A resolução de bundle por IDENTIDADE, nos três níveis.
 *
 * `position` acumulava dois papéis — ordem de exibição e identidade de pasta —
 * e a consequência era medida: um rejeitado recuperado entrava com a posição de
 * um contador próprio, colidia com uma seção existente, e a partir dali a
 * prévia e a promoção serviam o bundle de OUTRO segmento, com o nome certo e os
 * arquivos errados.
 *
 * O terceiro nível é literalmente o comportamento de antes: o pior caso de um
 * bug nos dois primeiros é voltar ao status quo, nunca regredir.
 */

const comVault = async (
  corpo: (raiz: string, lerBundleInfo: typeof import('./bundle-v2.js').lerBundleInfo) => void,
): Promise<void> => {
  const raiz = mkdtempSync(join(tmpdir(), 'bundle-chave-'));
  const anterior = process.env.DS_ECOSYSTEM_ROOT;
  process.env.DS_ECOSYSTEM_ROOT = raiz;
  try {
    // Import tardio: `paths` resolve a raiz na chamada, mas o módulo precisa
    // enxergar a variável já posta.
    const mod = await import('./bundle-v2.js');
    corpo(raiz, mod.lerBundleInfo);
  } finally {
    process.env.DS_ECOSYSTEM_ROOT = anterior;
    rmSync(raiz, { recursive: true, force: true });
  }
};

const escreverBundle = (raiz: string, ds: string, pasta: string, hash: string | null): void => {
  const dir = join(raiz, 'vault', ds, 'segments', 'bundles', pasta);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      representation: { type: 'componente-portatil' },
      ...(hash !== null ? { evidence: { segmentId: hash } } : {}),
    }),
    'utf8',
  );
};

test('nível 3: só a posição continua resolvendo como sempre', async () => {
  await comVault((raiz, lerBundleInfo) => {
    escreverBundle(raiz, 'ds_A', 'seg_2', null);
    const b = lerBundleInfo('ds_A', { position: 2 });
    assert.equal(b?.pasta, 'seg_2');
    // A forma antiga (número solto) tem de continuar valendo: os chamadores
    // migram um a um, não todos de uma vez.
    assert.equal(lerBundleInfo('ds_A', 2)?.pasta, 'seg_2');
  });
});

test('nível 2: o hash acha a pasta certa mesmo com a posição errada', async () => {
  await comVault((raiz, lerBundleInfo) => {
    escreverBundle(raiz, 'ds_B', 'seg_0', 'hash-do-hero');
    escreverBundle(raiz, 'ds_B', 'seg_1', 'hash-do-rodape');
    // O caso do rejeitado recuperado: a posição aponta para o bundle de outro.
    const b = lerBundleInfo('ds_B', { position: 0, hash: 'hash-do-rodape' });
    assert.equal(b?.pasta, 'seg_1', 'a identidade tem de vencer a posição');
  });
});

test('nível 1: o bundleId é autoritativo e ignora hash e posição', async () => {
  await comVault((raiz, lerBundleInfo) => {
    escreverBundle(raiz, 'ds_C', 'seg_0', 'hash-a');
    escreverBundle(raiz, 'ds_C', 'seg_7', 'hash-b');
    const b = lerBundleInfo('ds_C', { position: 0, hash: 'hash-a', bundleId: 'seg_7' });
    assert.equal(b?.pasta, 'seg_7');
  });
});

test('hash sem dono cai na posição, sem inventar bundle', async () => {
  await comVault((raiz, lerBundleInfo) => {
    escreverBundle(raiz, 'ds_D', 'seg_3', 'hash-existente');
    const b = lerBundleInfo('ds_D', { position: 3, hash: 'hash-que-ninguem-tem' });
    assert.equal(b?.pasta, 'seg_3', 'sem dono, o comportamento é o de sempre');
  });
});

test('sem bundle nenhum devolve null, e não um objeto vazio', async () => {
  await comVault((_raiz, lerBundleInfo) => {
    assert.equal(lerBundleInfo('ds_E', { position: 0 }), null);
  });
});
