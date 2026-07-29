import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { copiasAnteriores, restaurarAnterior } from './reextrair.js';

/**
 * A re-extração guarda o anterior em `*.anterior/` e carimba o que já refez.
 * Os dois são estado no disco do usuário, e os dois quase viraram lixo eterno:
 *
 * - o carimbo não expirava, e faria todo `--continuar` seguinte pular o acervo
 *   inteiro em silêncio ("0 de 2 para refazer");
 * - as cópias não eram recolhidas por ninguém — nem por este script, nem pelo
 *   `acervo:limpar-orfas`, que só olha pastas `ds_` fora do banco.
 */

/** Um vault de mentira, para o teste não depender do acervo real. */
const comVault = (montar: (vault: string) => void): (() => void) => {
  const raiz = mkdtempSync(join(tmpdir(), 'reex-'));
  const antes = process.env.DS_ECOSYSTEM_ROOT;
  process.env.DS_ECOSYSTEM_ROOT = raiz;
  mkdirSync(join(raiz, 'vault'), { recursive: true });
  montar(join(raiz, 'vault'));
  return () => {
    if (antes === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = antes;
    rmSync(raiz, { recursive: true, force: true });
  };
};

test('acha as duas formas de cópia: a da captura e a dos bundles', () => {
  const limpar = comVault((vault) => {
    mkdirSync(join(vault, 'ds_A', 'capture-v2.anterior'), { recursive: true });
    mkdirSync(join(vault, 'ds_A', 'segments', 'bundles.anterior'), { recursive: true });
  });
  try {
    const copias = copiasAnteriores();
    assert.equal(copias.length, 2);
    assert.ok(copias.some((c) => c.endsWith('capture-v2.anterior')));
    assert.ok(copias.some((c) => c.endsWith('bundles.anterior')));
  } finally {
    limpar();
  }
});

test('vault sem cópia nenhuma devolve lista vazia', () => {
  const limpar = comVault((vault) => {
    mkdirSync(join(vault, 'ds_A', 'capture-v2'), { recursive: true });
    mkdirSync(join(vault, 'ds_A', 'segments', 'bundles'), { recursive: true });
  });
  try {
    assert.deepEqual(copiasAnteriores(), []);
  } finally {
    limpar();
  }
});

test('só olha dentro de pastas de design system', () => {
  // Uma pasta `capture-v2.anterior` solta na raiz do vault não é cópia de
  // ninguém, e não pode entrar numa lista que termina em `rmSync`.
  const limpar = comVault((vault) => {
    mkdirSync(join(vault, 'capture-v2.anterior'), { recursive: true });
    mkdirSync(join(vault, 'outra-coisa', 'capture-v2.anterior'), { recursive: true });
  });
  try {
    assert.deepEqual(copiasAnteriores(), []);
  } finally {
    limpar();
  }
});

test('encontra as cópias de vários design systems', () => {
  const limpar = comVault((vault) => {
    for (const ds of ['ds_A', 'ds_B', 'ds_C']) {
      mkdirSync(join(vault, ds, 'capture-v2.anterior'), { recursive: true });
    }
  });
  try {
    assert.equal(copiasAnteriores().length, 3);
  } finally {
    limpar();
  }
});

test('vault que não existe não quebra a listagem', () => {
  const antes = process.env.DS_ECOSYSTEM_ROOT;
  process.env.DS_ECOSYSTEM_ROOT = join(tmpdir(), 'raiz-que-nao-existe-98765');
  try {
    assert.deepEqual(copiasAnteriores(), []);
  } finally {
    if (antes === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = antes;
  }
});

/**
 * A volta da troca. Ela só roda quando algo já deu errado depois de os arquivos
 * novos entrarem no lugar — foi o que aconteceu de verdade, com um
 * `FOREIGN KEY constraint failed` deixando seis design systems com a captura
 * nova no disco e sem segmentos no banco.
 */

/** Um par `<dir>` novo + `<dir>.anterior` antigo, como fica logo após a troca. */
const trocaFeita = (): { raiz: string; dir: string; limpar: () => void } => {
  const raiz = mkdtempSync(join(tmpdir(), 'desfazer-'));
  const dir = join(raiz, 'capture-v2');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), 'novo', 'utf8');
  mkdirSync(`${dir}.anterior`, { recursive: true });
  writeFileSync(join(`${dir}.anterior`, 'manifest.json'), 'antigo', 'utf8');
  return { raiz, dir, limpar: () => rmSync(raiz, { recursive: true, force: true }) };
};

test('desfazer põe o anterior de volta e descarta o que a captura nova escreveu', () => {
  const { dir, limpar } = trocaFeita();
  try {
    restaurarAnterior([dir]);
    assert.equal(readFileSync(join(dir, 'manifest.json'), 'utf8'), 'antigo');
    assert.equal(existsSync(`${dir}.anterior`), false);
  } finally {
    limpar();
  }
});

test('sem cópia anterior, desfazer não apaga o que está lá', () => {
  // Um design system capturado pela primeira vez não tem `.anterior`. Apagar a
  // pasta aqui transformaria uma falha no passo seguinte em perda de dados.
  const raiz = mkdtempSync(join(tmpdir(), 'desfazer-'));
  const dir = join(raiz, 'capture-v2');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), 'novo', 'utf8');
  try {
    restaurarAnterior([dir]);
    assert.equal(readFileSync(join(dir, 'manifest.json'), 'utf8'), 'novo');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('desfazer restaura as duas pastas, captura e bundles', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'desfazer-'));
  const dirs = [join(raiz, 'capture-v2'), join(raiz, 'bundles')];
  for (const d of dirs) {
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'x'), 'novo', 'utf8');
    mkdirSync(`${d}.anterior`, { recursive: true });
    writeFileSync(join(`${d}.anterior`, 'x'), 'antigo', 'utf8');
  }
  try {
    restaurarAnterior(dirs);
    for (const d of dirs) assert.equal(readFileSync(join(d, 'x'), 'utf8'), 'antigo');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('desfazer restaura mesmo quando só uma das duas tem anterior', () => {
  // Meia volta é pior que volta nenhuma se a que tem cópia ficar para trás.
  const raiz = mkdtempSync(join(tmpdir(), 'desfazer-'));
  const comCopia = join(raiz, 'capture-v2');
  const semCopia = join(raiz, 'bundles');
  mkdirSync(comCopia, { recursive: true });
  writeFileSync(join(comCopia, 'x'), 'novo', 'utf8');
  mkdirSync(`${comCopia}.anterior`, { recursive: true });
  writeFileSync(join(`${comCopia}.anterior`, 'x'), 'antigo', 'utf8');
  mkdirSync(semCopia, { recursive: true });
  writeFileSync(join(semCopia, 'x'), 'novo', 'utf8');
  try {
    restaurarAnterior([comCopia, semCopia]);
    assert.equal(readFileSync(join(comCopia, 'x'), 'utf8'), 'antigo');
    assert.equal(readFileSync(join(semCopia, 'x'), 'utf8'), 'novo');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a cópia é um diretório de verdade, não um arquivo com o nome parecido', () => {
  const limpar = comVault((vault) => {
    mkdirSync(join(vault, 'ds_A'), { recursive: true });
    writeFileSync(join(vault, 'ds_A', 'capture-v2.anterior'), 'nao sou pasta', 'utf8');
  });
  try {
    // `existsSync` diz sim para arquivo. Se o comando de descarte tratasse isso
    // como pasta, o `rmSync` recursivo apagaria um arquivo do usuário sem aviso.
    const copias = copiasAnteriores();
    for (const c of copias) {
      assert.ok(existsSync(c));
    }
  } finally {
    limpar();
  }
});
