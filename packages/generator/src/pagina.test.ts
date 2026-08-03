import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { KitDesignSystem } from '@ds/shared';
import { DEFAULT_PROJECT_BRANDING, ProjectLayout } from '@ds/shared';
import { montarPaginaDoKit } from './pagina.js';

/**
 * O teste de fogo da montagem: duas origens + um fundo + recoloração, tudo
 * junto — porque foi a INTEGRAÇÃO dessas partes que falhou no site real (cada
 * parte funcionava; o site saía verde onde devia ser amarelo e com o fundo em
 * faixa).
 */

const bundle = (raiz: string, nome: string, html: string, css: string): string => {
  const dir = join(raiz, nome);
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html class="tema-a"><head><link rel="stylesheet" href="assets/css/tokens.css"></head><body class="fundo-a">${html}</body></html>`,
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), css, 'utf8');
  return dir;
};

const DS: KitDesignSystem = {
  versao: 1,
  geradoEm: 1,
  tema: 'claro',
  origens: [
    {
      designSystemId: 'ds_a',
      tema: 'claro',
      clusters: [
        {
          papel: 'primary',
          corCanonica: '#0d3c1f',
          confianca: 0.8,
          membros: [{ literal: '#0d3c1f', hexOpaco: '#0d3c1f', ocorrencias: 3, contexto: 'bg' }],
          ajuste: null,
        },
      ],
      fontes: [],
    },
  ],
  limitacoes: [],
};

/**
 * Duas origens com réguas DIFERENTES, medidas.
 *
 * `ds_a` é a referência (a preferência do layout aponta para ela) e tem corpo
 * em 16px; `ds_b` tem corpo em 14px. Se o alinhamento funcionar, o texto de
 * leitura das duas sai do mesmo tamanho no site gerado — que é a coisa mais
 * visível que esta fatia faz.
 */
const DS_COM_ESCALA: KitDesignSystem = {
  versao: 1,
  geradoEm: 1,
  tema: 'claro',
  origens: [
    {
      designSystemId: 'ds_a',
      tema: 'claro',
      clusters: [],
      fontes: [],
      escala: {
        degraus: [14, 16, 24, 48],
        corpo: 16,
        display: 48,
        espacos: [8, 16, 32],
        raios: [4, 12],
      },
    },
    {
      designSystemId: 'ds_b',
      tema: 'claro',
      clusters: [],
      fontes: [],
      escala: {
        degraus: [12, 14, 20, 40],
        corpo: 14,
        display: 40,
        espacos: [6, 12, 24],
        raios: [2, 6],
      },
    },
  ],
  limitacoes: [],
};

const montarComEscala = (raiz: string, regime: 'da-marca' | 'de-cada-origem') => {
  const a = bundle(raiz, `a-${regime}`, '<section class="a">A</section>', '.a{font-size:16px}');
  const b = bundle(
    raiz,
    `b-${regime}`,
    '<section class="b">B</section>',
    '.b{font-size:14px;padding:12px;border-radius:6px}.b h2{font-size:40px}.b img{border-radius:50%}',
  );
  const out = join(raiz, `saida-${regime}`);
  const r = montarPaginaDoKit({
    projectId: 'prj_teste',
    titulo: 'Escala',
    kit: {
      id: 'kit_e',
      components: [
        {
          id: 'cmp_a',
          name: 'A',
          category: 'hero',
          kind: 'component',
          bundlePath: a,
          designSystemId: 'ds_a',
        },
        {
          id: 'cmp_b',
          name: 'B',
          category: 'pricing',
          kind: 'component',
          bundlePath: b,
          designSystemId: 'ds_b',
        },
      ],
    },
    designSystem: DS_COM_ESCALA,
    layout: ProjectLayout.parse({
      preferDesignSystemId: 'ds_a',
      secoes: [
        { id: 's1', nome: 'A', componentIds: ['cmp_a'] },
        { id: 's2', nome: 'B', componentIds: ['cmp_b'] },
      ],
    }),
    branding: { ...DEFAULT_PROJECT_BRANDING, escalaDoSite: regime },
    outputDir: out,
  });
  return {
    r,
    estilos: readFileSync(join(out, 'assets', 'styles.css'), 'utf8'),
    marca: readFileSync(join(out, 'assets', 'marca.css'), 'utf8'),
  };
};

test('a marca rege o tamanho: o corpo das duas origens cai no mesmo degrau', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'escala-'));
  try {
    const { r, estilos, marca } = montarComEscala(raiz, 'da-marca');

    // A régua da referência vira token declarado, em px.
    assert.match(marca, /--marca-passo-2:\s*16px/, 'o degrau de corpo da referência');
    assert.match(marca, /--marca-passo-4:\s*48px/, 'o degrau de display da referência');
    assert.match(marca, /--marca-espaco-2:\s*16px/);

    // O corpo de ds_b (14px, degrau 2 da régua dele) aponta para o MESMO token
    // que o corpo de ds_a (16px, degrau 2 da régua dela). É o alinhamento.
    assert.match(estilos, /font-size:\s*var\(--marca-passo-2,\s*14px\)/, 'corpo de ds_b');
    assert.match(estilos, /font-size:\s*var\(--marca-passo-2,\s*16px\)/, 'corpo de ds_a');

    // E a hierarquia sobrevive: o maior de ds_b vai para o maior da referência.
    assert.match(estilos, /font-size:\s*var\(--marca-passo-4,\s*40px\)/);
    assert.match(estilos, /padding:\s*var\(--marca-espaco-2,\s*12px\)/);

    // Terceiro eixo: o raio mais aberto de ds_b (6px) vai para o mais aberto da
    // referência (12px). E o `50%` do avatar NÃO é degrau — é forma, e virar
    // canto manso quebraria o desenho em vez de alinhá-lo.
    assert.match(marca, /--marca-raio-2:\s*12px/);
    assert.match(estilos, /border-radius:\s*var\(--marca-raio-2,\s*6px\)/);
    assert.match(estilos, /border-radius:\s*50%/, 'o círculo continua círculo');

    // O literal original é SEMPRE a reserva: sem o token, a peça degrada para o
    // tamanho de origem, nunca para quebrado.
    assert.doesNotMatch(estilos, /var\(--marca-passo-\d+\)/, 'nenhum var() sem fallback');
    assert.ok(r.reescala.reescritas >= 4, `reescreveu pouco: ${r.reescala.reescritas}`);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('em `de-cada-origem` nada é reescrito e o marca.css não ganha degrau', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'escala-off-'));
  try {
    const { r, estilos, marca } = montarComEscala(raiz, 'de-cada-origem');
    assert.equal(r.reescala.reescritas, 0);
    assert.doesNotMatch(estilos, /--marca-passo/, 'a peça mantém a régua da origem');
    assert.doesNotMatch(marca, /--marca-passo/, 'sem régua declarada');
    assert.match(estilos, /font-size:\s*14px/, 'o valor de origem continua literal');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

const montar = (raiz: string) => {
  const hero = bundle(
    raiz,
    'hero',
    '<section class="hero">Título de origem</section>',
    '.hero{background:#0d3c1f;color:#fff}',
  );
  const fundo = bundle(raiz, 'fundo', '<div class="neon"></div>', '.neon{background:#ff00ff}');
  const out = join(raiz, 'saida');
  return montarPaginaDoKit({
    projectId: 'prj_teste',
    titulo: 'Site de Teste',
    kit: {
      id: 'kit_t',
      components: [
        {
          id: 'cmp_hero',
          name: 'Hero',
          category: 'hero',
          kind: 'component',
          bundlePath: hero,
          designSystemId: 'ds_a',
        },
        {
          id: 'cmp_fundo',
          name: 'Fundo neon',
          category: 'background',
          kind: 'effect',
          bundlePath: fundo,
          designSystemId: 'ds_b',
        },
      ],
    },
    designSystem: DS,
    layout: ProjectLayout.parse({
      secoes: [
        { id: 'sec_1', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_hero'] },
        { id: 'sec_2', nome: 'Fundo', componentIds: ['cmp_fundo'] },
        { id: 'sec_3', nome: 'História', componentIds: [] },
      ],
    }),
    branding: DEFAULT_PROJECT_BRANDING,
    secoes: [
      { secaoId: 'sec_1', substituicoes: { 'Título de origem': 'Compre 2, pague 1' } },
      { secaoId: 'sec_3', htmlCriado: '<div class="minha-historia">Nossa história</div>' },
    ],
    cssCriado: '.minha-historia{padding:2rem}',
    outputDir: out,
  });
};

test('a página inteira: recoloração, fundo em camada, seção criada, cascata', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-'));
  try {
    const r = montar(raiz);
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    const styles = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');

    // 1. A recoloração aconteceu: o literal virou consumo de --marca-*.
    assert.ok(styles.includes('var(--marca-primary, #0d3c1f)'), 'peça recolorida');
    assert.equal(r.recoloracao.reescritas, 1);

    // 2. O fundo NÃO é <section>: é camada fixa atrás de tudo, logo após o body.
    assert.ok(index.includes('data-ds-camadas-de-pagina'), 'camada presente');
    assert.ok(
      index.indexOf('data-ds-camadas-de-pagina') < index.indexOf('<section'),
      'camada vem antes das seções',
    );
    // A seção que só tinha o fundo saiu da lista (a "História", criada e sem
    // papel, continua — e sai com o slug genérico "secao", que é dela).
    assert.ok(!index.includes('data-secao-id="sec_2"'), 'a seção que só tinha o fundo saiu');

    // 3. O fundo mantém as cores originais (origem-apelido ::original).
    assert.ok(styles.includes('::original'), 'escopo próprio do fundo');
    assert.ok(styles.includes('#ff00ff'), 'o neon continua neon');
    assert.ok(!styles.includes('var(--marca-primary, #ff00ff)'), 'fundo não recolore');

    // 4. A substituição criativa entrou; o texto de origem saiu.
    assert.ok(index.includes('Compre 2, pague 1'));
    assert.ok(!index.includes('Título de origem'));

    // 5. A seção criada existe com o HTML do agente e origem declarada.
    assert.ok(index.includes('minha-historia'));
    assert.ok(/data-secao-id="sec_3" data-origem="gerado"/.test(index));

    // 6. A cascata: styles → criadas → responsivo → marca, nessa ordem.
    const ordem = [
      'assets/styles.css',
      'assets/criadas.css',
      'assets/responsivo.css',
      'assets/marca.css',
    ];
    const posicoes = ordem.map((f) => index.indexOf(f));
    assert.deepEqual(
      [...posicoes].sort((a, b) => a - b),
      posicoes,
      'ordem da cascata',
    );
    assert.ok(posicoes.every((p) => p >= 0));

    // 7. Viewport e responsivo presentes (o fila:concluir valida isso).
    assert.ok(index.includes('name="viewport"'));
    assert.ok(
      readFileSync(join(r.outputDir, 'assets', 'responsivo.css'), 'utf8').includes('@media'),
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('peça sem bundle entra em faltando e a seção avisa em vez de sumir', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-'));
  try {
    const out = join(raiz, 'saida');
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_x',
            name: 'X',
            category: 'hero',
            kind: 'component',
            bundlePath: join(raiz, 'nao-existe'),
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_x'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: out,
    });
    assert.deepEqual(r.faltando, ['cmp_x']);
    const index = readFileSync(join(out, 'index.html'), 'utf8');
    assert.ok(index.includes('data-secao-id="sec_1"'), 'a seção continua na página');
    assert.ok(r.avisos.some((a) => a.includes('cmp_x')));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('sem design system: nada recolore e o aviso diz', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-'));
  try {
    const hero = bundle(
      raiz,
      'hero',
      '<section class="hero">x</section>',
      '.hero{background:#0d3c1f}',
    );
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_hero',
            name: 'Hero',
            category: 'hero',
            kind: 'component',
            bundlePath: hero,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'A', componentIds: ['cmp_hero'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: join(raiz, 'saida'),
    });
    const styles = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');
    assert.ok(styles.includes('#0d3c1f'));
    assert.ok(!styles.includes('--marca-'));
    assert.ok(r.avisos.some((a) => a.includes('Sem design system')));
    assert.equal(r.recoloracao.origens, 0);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
