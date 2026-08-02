import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { documentoDaPeca } from './library.js';

/**
 * Curtir uma PEÇA (subcomponente) não pode produzir um componente vazio.
 *
 * O defeito, medido no acervo: os bundles são das seções, e a `position` de um
 * filho começa depois de todas elas. `lerBundleInfo` devolvia null, o código
 * caía no ramo de extração V1 e chamava o podador de CSS contra
 * `extracted/assets/css` — pasta que a extração V2 nunca cria. Saía um
 * `styles.css` de zero byte e um `.zip` que abre em branco, com fidelidade
 * inventada. Estava a um clique: 9 peças no acervo, nenhuma promovida.
 *
 * Este teste exercita a montagem do documento da peça, que é a parte da
 * correção que dá para provar sem subir servidor e sem tocar no acervo real.
 */

const comBundle = (index: string, corpo: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), 'peca-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), index, 'utf8');
    corpo(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const INDEX_DO_PAI = `<!doctype html>
<html class="dark"><head><link rel="stylesheet" href="assets/css/a.css"></head>
<body class="bg-black text-white"><section id="hero"><h1>Manchete da origem</h1><button class="btn">Ir</button></section></body></html>`;

test('a peça herda head, classes do body e CSS do pai', () => {
  comBundle(INDEX_DO_PAI, (dir) => {
    const doc = documentoDaPeca(dir, '<button class="btn">Ir</button>');
    assert.ok(doc !== null);
    // O head é o que traz o CSS: sem ele, a peça abre sem estilo — que é
    // exatamente o defeito.
    assert.match(doc, /<link rel="stylesheet"/);
    // As classes do body importam: `body.bg-black .btn` só casa com elas.
    assert.match(doc, /<body class="bg-black text-white">/);
  });
});

test('o corpo é a PEÇA, não a seção inteira', () => {
  comBundle(INDEX_DO_PAI, (dir) => {
    const doc = documentoDaPeca(dir, '<button class="btn">Ir</button>') as string;
    assert.match(doc, /<button class="btn">Ir<\/button>/);
    // O conteúdo da seção não vai junto: promover um botão não pode trazer a
    // manchete da outra empresa dentro.
    assert.doesNotMatch(doc, /Manchete da origem/);
    assert.doesNotMatch(doc, /<section id="hero">/);
  });
});

test('documento ilegível devolve null em vez de lixo', () => {
  comBundle('<html><head></head>sem body', (dir) => {
    assert.equal(documentoDaPeca(dir, '<button/>'), null);
  });
});

test('bundle sem index não inventa documento', () => {
  const dir = mkdtempSync(join(tmpdir(), 'peca-vazia-'));
  try {
    assert.equal(documentoDaPeca(dir, '<button/>'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
