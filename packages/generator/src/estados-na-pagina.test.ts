import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PROJECT_BRANDING, ProjectLayout } from '@ds/shared';
import { montarPaginaDoKit } from './pagina.js';

/**
 * A fatia dos estados vista DE FORA: o que a página montada ganha (e o que ela
 * não pode perder) quando a peça traz `bundle/states.json`.
 */

/** Um bundle com duas fotos da origem e, opcionalmente, estados capturados. */
const bundleComEstados = (raiz: string, nome: string, estados: unknown[] | null): string => {
  const dir = join(raiz, nome);
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'image'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'image', 'a.png'), 'x', 'utf8');
  writeFileSync(join(dir, 'assets', 'image', 'b.png'), 'y', 'utf8');
  const corpo = [
    '<section class="bloco">',
    '<button class="aba" type="button">Planos</button>',
    '<img src="assets/image/a.png" alt="foto da origem 1">',
    '<img src="assets/image/b.png" alt="foto da origem 2">',
    '</section>',
  ].join('');
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><link rel="stylesheet" href="assets/css/tokens.css"></head><body>${corpo}</body></html>`,
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.bloco{color:#111}', 'utf8');
  if (estados !== null) {
    writeFileSync(
      join(dir, 'states.json'),
      JSON.stringify({ segmentId: 'seg_1', generatedAt: 1, states: estados }),
      'utf8',
    );
  }
  return dir;
};

/** Um estado com delta REAL: a aba ganha a classe `ativa`. */
const ESTADO_COM_DELTA = {
  id: 'st_1',
  trigger: 'click',
  label: 'aba ativa',
  method: 'swap-html',
  html: '<button class="aba ativa" type="button" data-dsx2="7">Planos</button>',
};

/** O estado que carrega a URL da OUTRA empresa. Este não pode viajar. */
const ESTADO_REMOTO = {
  id: 'st_2',
  trigger: 'click',
  label: 'foto trocada',
  method: 'swap-html',
  html: '<img src="https://ds.asimov.academy/outra/coisa.png" alt="foto da origem 1">',
};

const montar = (raiz: string, estados: unknown[] | null, comMidia: boolean) => {
  const dir = bundleComEstados(raiz, `peca-${estados === null ? 'sem' : 'com'}`, estados);
  const midiaDir = join(raiz, 'media');
  mkdirSync(midiaDir, { recursive: true });
  writeFileSync(join(midiaDir, 'nossa.webp'), 'z', 'utf8');
  const out = join(raiz, `saida-${estados === null ? 'sem' : 'com'}`);
  const r = montarPaginaDoKit({
    projectId: 'prj_teste',
    titulo: 'Estados',
    kit: {
      id: 'kit_e',
      components: [
        {
          id: 'cmp_a',
          name: 'Bloco',
          category: 'pricing',
          kind: 'component',
          bundlePath: dir,
          designSystemId: 'ds_a',
        },
      ],
    },
    layout: ProjectLayout.parse({
      secoes: [{ id: 's1', nome: 'Planos', componentIds: ['cmp_a'] }],
    }),
    branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Sorriso Vivo' },
    midia: comMidia
      ? [
          {
            de: join(midiaDir, 'nossa.webp'),
            para: 'midia/nossa.webp',
            secaoId: 's1',
            kind: 'image',
          },
        ]
      : [],
    outputDir: out,
  });
  return { r, html: readFileSync(join(out, 'index.html'), 'utf8'), out };
};

test('a fila de mídia da seção NÃO é drenada pelos estados', () => {
  // O risco medido: `fotosDaSecao` é consumida por subtração, e rodar a troca
  // uma vez a mais drenaria a foto das peças vizinhas da mesma seção. O caminho
  // dos estados nunca lê aquela fila; este teste prova por igualdade.
  const raiz = mkdtempSync(join(tmpdir(), 'estados-pag-'));
  try {
    const sem = montar(raiz, null, true);
    const com = montar(raiz, [ESTADO_COM_DELTA], true);
    const fotos = (html: string) =>
      [...html.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(fotos(com.html), fotos(sem.html), 'a colocação de mídia é a mesma');
    assert.ok(fotos(sem.html).includes('midia/nossa.webp'), 'a mídia do projeto entrou');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o estado com delta liga o fio, e o site ganha a folha e o alternador', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'estados-pag-'));
  try {
    const { r, html, out } = montar(raiz, [ESTADO_COM_DELTA], false);
    assert.match(html, /data-orbis-ancora="orb-\d+"/, 'a âncora ganhou alça');
    assert.match(html, /data-orbis-gatilho="orb-\d+"/, 'o gatilho ganhou alça');
    assert.match(html, /<template data-orbis-estado=/, 'o estado virou template');
    assert.match(html, /assets\/estados\.css/, 'a folha do alternador entrou');
    assert.ok(r.arquivos.includes('assets/estados.css'));
    assert.ok(r.arquivos.includes('estados-derivados.json'));
    const derivados = JSON.parse(readFileSync(join(out, 'estados-derivados.json'), 'utf8'));
    assert.equal(derivados.ligados, 1);
    assert.equal(derivados.estados[0].veredito, 'ligado');
    // A instrumentação da captura não volta pela porta dos fundos.
    assert.ok(!html.includes('data-dsx2'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('sem estado nenhum a página fica exatamente como era', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'estados-pag-'));
  try {
    const { r, html } = montar(raiz, null, false);
    assert.ok(!html.includes('data-orbis-ancora'));
    assert.ok(!html.includes('data-orbis-gatilho'));
    assert.ok(!r.arquivos.includes('assets/estados.css'));
    assert.ok(!r.arquivos.includes('estados-derivados.json'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a URL do servidor da outra empresa não chega ao site do cliente', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'estados-pag-'));
  try {
    const { r, html } = montar(raiz, [ESTADO_REMOTO], false);
    assert.ok(!html.includes('asimov'), 'nem no corpo, nem no template');
    assert.ok(
      r.avisos.some((a) => a.includes('ds.asimov.academy')),
      'e o aviso nomeia o domínio',
    );
    // As externas que sobram são as fontes da marca, decisão de desenho. O que
    // não pode existir é um endereço vindo de um estado capturado.
    assert.ok(
      !r.independente.externas.some((e) => e.includes('asimov')),
      'nenhuma dependência externa veio do estado',
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
