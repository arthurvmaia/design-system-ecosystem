import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { alvosPerdidosDoBundle } from './alvos-do-script.js';

const bundle = (html: string, js?: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'alvos-'));
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  if (js) {
    const jsDir = join(dir, 'assets', 'js');
    mkdirSync(jsDir, { recursive: true });
    for (const [nome, corpo] of Object.entries(js)) writeFileSync(join(jsDir, nome), corpo, 'utf8');
  }
  return dir;
};

test('o caso que o dono reprovou: o id foi renomeado e o script procura o antigo', () => {
  const dir = bundle('<div id="pipeline-stack"><svg id="seg6-svg1-pipeline-svg"></svg></div>', {
    'pipeline.js': "var svg = document.getElementById('pipeline-svg'); if (!svg) return;",
  });
  const perdidos = alvosPerdidosDoBundle(dir);
  assert.equal(perdidos.length, 1);
  assert.equal(perdidos[0]?.id, 'pipeline-svg');
  assert.equal(perdidos[0]?.onde, 'assets/js/pipeline.js');
});

test('script que acha tudo nao acusa nada', () => {
  const dir = bundle('<div id="pipeline-stack"><svg id="pipeline-svg"></svg></div>', {
    'pipeline.js':
      "document.getElementById('pipeline-svg');document.getElementById('pipeline-stack');",
  });
  assert.deepEqual(alvosPerdidosDoBundle(dir), []);
});

test('querySelector de id puro conta; seletor composto NAO', () => {
  const dir = bundle('<div id="existe"></div>', {
    'a.js': "document.querySelector('#sumiu');document.querySelector('#outro .interno');",
  });
  const ids = alvosPerdidosDoBundle(dir).map((a) => a.id);
  assert.deepEqual(ids, ['sumiu'], 'seletor composto depende do documento e nao e acusado');
});

test('id montado em tempo de execucao nao e acusado: nao da para saber o alvo', () => {
  const dir = bundle('<div id="a"></div>', {
    'a.js': "document.getElementById('pn-' + i);document.querySelector('#' + nome);",
  });
  assert.deepEqual(alvosPerdidosDoBundle(dir), []);
});

test('script inline tambem e lido, e diz de onde veio', () => {
  const dir = bundle('<div id="a"></div><script>document.getElementById("grafico")</script>');
  const perdidos = alvosPerdidosDoBundle(dir);
  assert.equal(perdidos[0]?.id, 'grafico');
  assert.equal(perdidos[0]?.onde, 'index.html #1');
});

test('bundle sem index.html nao vira acusacao', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alvos-vazio-'));
  assert.deepEqual(alvosPerdidosDoBundle(dir), []);
});

test('o mesmo alvo em dois arquivos aparece uma vez por arquivo', () => {
  const dir = bundle('<div id="a"></div>', {
    'a.js': "document.getElementById('x')",
    'b.js': "document.getElementById('x')",
  });
  assert.equal(alvosPerdidosDoBundle(dir).length, 2);
});

test('ids de framework sao ignorados: root e app nao sao alvo de desenho', () => {
  const dir = bundle('<div id="a"></div>', {
    'a.js': "document.getElementById('root');document.getElementById('app');",
  });
  assert.deepEqual(alvosPerdidosDoBundle(dir), []);
});
