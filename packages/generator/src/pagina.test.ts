import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    // O contador soma a folha E o HTML inline (`style=""`, `fill`/`stroke` do
    // SVG), então o número exato depende do que a peça carrega. O que se
    // garante aqui é que a recoloração ACONTECEU, não quantas vezes.
    assert.ok(r.recoloracao.reescritas >= 1, `recolorou pouco: ${r.recoloracao.reescritas}`);

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

test('sem design system: o cluster não recolore nada, mas o acento ainda veste a marca', () => {
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
    // O literal de origem continua sendo a reserva, sempre.
    assert.ok(styles.includes('#0d3c1f'));
    assert.ok(r.avisos.some((a) => a.includes('Sem design system')));
    // O RETEMA não depende do design system: ele deriva o papel da própria cor
    // e da paleta da marca. Verde saturado é acento, e acento de outra marca
    // não entra num site desta — com ou sem clusters consolidados.
    assert.match(styles, /var\(--marca-(primary|accent), #0d3c1f\)/, 'o acento veste a marca');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

/**
 * O kit SEM peça de fundo, vindo de um site que TINHA fundo: o caso do vão
 * preto. As peças chegam limpas (limparParaComposicao tira as camadas de cada
 * uma) e, sem este caminho, ninguém as devolvia — a página compunha sobre um
 * vazio. Aqui também moram o dedupe de scripts (duas peças da mesma origem
 * carregavam o MESMO arquivo duas vezes: dois listeners no menu, o toggle
 * abria e fechava no mesmo clique), a nav sticky e a limpeza do parallax.
 */
const bundleComFundo = (raiz: string, nome: string, corpoSemCamadas: string): string => {
  const dir = join(raiz, nome);
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'js'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head><link rel="stylesheet" href="assets/css/tokens.css"></head><body class="bg-escuro">
<div data-ds-camadas-de-fundo="2">
<canvas id="webgl-bg" class="fixed inset-0 -z-20"></canvas>
<div class="fixed inset-0 -z-10 blur-de-origem"></div>
</div>
${corpoSemCamadas}
<script src="assets/js/app.js"></script>
</body></html>`,
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');
  writeFileSync(
    join(dir, 'assets', 'js', 'app.js'),
    'window.__app = (window.__app ?? 0) + 1;',
    'utf8',
  );
  return dir;
};

test('kit sem peça de fundo herda as camadas da origem dominante; scripts, sticky e parallax', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-fundo-'));
  try {
    const nav = bundleComFundo(raiz, 'nav', '<nav class="sticky top-0">Menu</nav>');
    const hero = bundleComFundo(
      raiz,
      'hero',
      '<section class="hero" data-parallax="0.5" style="transform: translate(9.9px, -9.8px); opacity: 1">Oi</section>',
    );
    const out = join(raiz, 'saida');
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'Site de Teste',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_nav',
            name: 'Nav',
            category: 'nav',
            kind: 'component',
            bundlePath: nav,
            designSystemId: 'ds_a',
          },
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
      designSystem: null,
      layout: ProjectLayout.parse({
        secoes: [
          { id: 'sec_1', nome: 'Menu', papel: 'nav', componentIds: ['cmp_nav'] },
          { id: 'sec_2', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_hero'] },
        ],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: out,
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    const styles = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');

    // 1. A página herdou as camadas: uma vez, antes das seções, com aviso.
    assert.ok(index.includes('data-ds-camadas-de-pagina'), 'camada herdada presente');
    assert.equal(
      (index.match(/webgl-bg/g) ?? []).length,
      1,
      'as camadas entram UMA vez (não uma por peça)',
    );
    assert.ok(
      index.indexOf('data-ds-camadas-de-pagina') < index.indexOf('<section'),
      'camada antes das seções',
    );
    assert.ok(
      r.avisos.some((a) => a.includes('herdou as camadas')),
      'a herança é declarada',
    );

    // 2. Scripts: o MESMO conteúdo em duas peças vira UMA tag, depois das seções.
    const tags = index.match(/<script\b[^>]*src="assets\/[^"]+"/g) ?? [];
    assert.equal(tags.length, 1, 'um script local só, apesar de duas peças com o mesmo arquivo');
    assert.ok(
      (index.lastIndexOf('</section>') ?? 0) < index.indexOf('<script'),
      'os scripts fecham o body, quando todos os elementos já existem',
    );

    // 3. A nav sticky de origem promove a seção; a regra base existe no CSS.
    assert.match(index, /data-secao="nav"[^>]*data-fixa-no-topo/);
    assert.ok(styles.includes('[data-secao="nav"][data-fixa-no-topo]'), 'regra do sticky no base');
    assert.ok(styles.includes('html,body{margin:0}'), 'reset da margem do UA');

    // 4. O transform congelado do parallax saiu; as outras declarações ficam.
    assert.ok(!index.includes('translate(9.9px'), 'o congelado da captura saiu');
    assert.ok(index.includes('opacity: 1'), 'o resto do style fica');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('peça de referência visual sai da seção que TEM conteúdo criado; fica na que não tem', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-frame-'));
  try {
    const frameDir = join(raiz, 'frame');
    mkdirSync(join(frameDir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(frameDir, 'frames'), { recursive: true });
    writeFileSync(
      join(frameDir, 'index.html'),
      `<!doctype html><html><head></head><body>
<aside data-ds-aviso="referencia-visual">Referência visual animada.</aside>
<img src="frames/secao-x.png" alt="Cards da origem">
</body></html>`,
      'utf8',
    );
    writeFileSync(join(frameDir, 'frames', 'secao-x.png'), 'png', 'utf8');
    const montarCom = (secoes: { secaoId: string; htmlCriado?: string }[], nome: string) =>
      montarPaginaDoKit({
        projectId: 'prj_teste',
        titulo: 'T',
        kit: {
          id: 'kit_t',
          components: [
            {
              id: 'cmp_frame',
              name: 'Cards congelados',
              category: 'feature',
              kind: 'animation',
              bundlePath: frameDir,
              designSystemId: 'ds_a',
            },
          ],
        },
        layout: ProjectLayout.parse({
          secoes: [{ id: 'sec_1', nome: 'O que é', componentIds: ['cmp_frame'] }],
        }),
        branding: DEFAULT_PROJECT_BRANDING,
        secoes,
        outputDir: join(raiz, nome),
      });

    // COM criado: a imagem congelada da origem sai; o criado cobre a seção.
    const comCriado = montarCom(
      [{ secaoId: 'sec_1', htmlCriado: '<div class="meu-conteudo">Da marca</div>' }],
      'saida-com',
    );
    const indexCom = readFileSync(join(comCriado.outputDir, 'index.html'), 'utf8');
    assert.ok(!indexCom.includes('frames/secao-x.png'), 'o frame da origem saiu');
    assert.ok(indexCom.includes('meu-conteudo'), 'o conteúdo criado ficou');
    assert.match(indexCom, /data-secao-id="sec_1" data-origem="gerado"/, 'a procedência é honesta');
    assert.ok(
      comCriado.avisos.some((a) => a.includes('referência visual')),
      'a saída da peça é declarada',
    );
    // O criado vem embrulhado no envelope que a regra de passagem alcança.
    assert.ok(indexCom.includes('<div data-ds-criado>'), 'envelope do criado presente');

    // SEM criado: o frame é o único conteúdo da seção e continua.
    const semCriado = montarCom([], 'saida-sem');
    const indexSem = readFileSync(join(semCriado.outputDir, 'index.html'), 'utf8');
    assert.ok(indexSem.includes('frames/secao-x.png'), 'sem criado, o frame fica');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a camada da origem é HERDADA e vestida na marca, nunca descartada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-portao-'));
  try {
    // A origem declara o fundo no <body> (bg-[#03020A], preto) e tem camadas.
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      // A camada é a real: canvas pintado por JS (cor fora do alcance do CSS) e
      // um blob roxo declarado por classe — é dele que sai a matiz de referência.
      `<!doctype html><html><head></head><body class="bg-[#03020A] text-white">
<div data-ds-camadas-de-fundo="2"><canvas id="webgl-bg"></canvas><div class="bg-[#1A0B40] blur-[120px]"></div></div>
<section class="hero">Oi</section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.hero{color:#fff}', 'utf8');
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_hero',
            name: 'Hero escuro',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_hero'] }],
      }),
      // Marca CLARA sobre origem quase preta: o caso do café sobre o neon.
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: join(raiz, 'saida'),
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    const styles = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');

    // 1. A camada da origem VEM: é a decoração dela que dá vida à página.
    assert.ok(index.includes('data-ds-camada-herdada'), 'a camada foi herdada e marcada');
    assert.ok(!index.includes('data-ds-camada-da-marca'), 'sem fundo ambiente por cima');

    // 2. O canvas sai: ele é cena OPACA pintada por JavaScript no tema escuro
    //    da origem, e pixel não se recolore. Mantê-lo repintava a página
    //    inteira com a noite de outro site.
    assert.ok(!index.includes('webgl-bg'), 'o canvas do tema oposto saiu');
    assert.ok(
      r.avisos.some((a) => a.includes('canvas da origem saiu')),
      'e a saída é declarada',
    );

    // 3. A decoração que RESTA veste a marca, por estilo inline (vence a
    //    classe de valor arbitrário da origem).
    assert.match(index, /bg-\[#1A0B40\][^>]*style="background:#[0-9a-f]{6}"/i, 'blob na marca');

    // 4. E o fundo chapado da origem não pinta a página.
    assert.match(
      styles,
      /\[data-ds-camada-herdada\][^{]*\{background-color:transparent!important/,
      'o fundo chapado da origem é apagado',
    );

    // 3. A regra de passagem é da BASE: existe com ou sem camada.
    assert.ok(styles.includes('[data-ds-criado]'), 'regra de passagem sempre presente');
    assert.ok(styles.includes('--pagina-fundo'), 'o fundo da página é token publicado');
    assert.ok(styles.includes('body{background:var(--pagina-fundo)}'), 'uma página só');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('as variações da logo viajam para midia/ e o favicon entra no head', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-logo-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    // A raiz do ecossistema vira o tmp: projectMediaDir(prj_teste) mora nela.
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const mediaDir = join(raiz, 'root', 'projects', 'prj_teste', 'media');
    mkdirSync(mediaDir, { recursive: true });
    for (const tipo of ['principal', 'horizontal', 'simbolo', 'favicon']) {
      writeFileSync(join(mediaDir, `x-logo-${tipo}.svg`), `<svg data-tipo="${tipo}"/>`, 'utf8');
    }
    const hero = bundle(raiz, 'hero', '<section class="hero">Oi</section>', '.hero{color:#000}');
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
      branding: {
        ...DEFAULT_PROJECT_BRANDING,
        logos: [
          { tipo: 'principal', path: 'x-logo-principal.svg' },
          { tipo: 'horizontal', path: 'x-logo-horizontal.svg' },
          { tipo: 'simbolo', path: 'x-logo-simbolo.svg' },
          { tipo: 'favicon', path: 'x-logo-favicon.svg' },
        ],
        logosLocais: { favicon: 'x-logo-favicon.svg' },
      },
      // O autor já copiou a horizontal com o nome dele: a fonte não duplica.
      midia: [{ de: 'x-logo-horizontal.svg', para: 'midia/logo-horizontal.svg' }],
      outputDir: join(raiz, 'saida'),
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.match(
      index,
      /<link rel="icon" type="image\/svg\+xml" href="midia\/logo-favicon\.svg"\/>/,
      'favicon no head',
    );
    for (const tipo of ['principal', 'horizontal', 'simbolo', 'favicon']) {
      assert.ok(
        existsSync(join(r.outputDir, 'midia', `logo-${tipo}.svg`)),
        `logo-${tipo} copiada para o site`,
      );
    }
    assert.equal(
      r.arquivos.filter((a) => a === 'midia/logo-horizontal.svg').length,
      1,
      'a variação que o autor já copiou não entra duas vezes',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('quando o kit TEM peça de fundo, nada é herdado por cima', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-fundo-'));
  try {
    const r = montar(raiz);
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.equal(
      (index.match(/data-ds-camadas-de-pagina/g) ?? []).length,
      1,
      'uma camada só: a da peça de fundo promovida',
    );
    assert.ok(
      !r.avisos.some((a) => a.includes('herdou as camadas de fundo')),
      'sem herança quando o fundo veio de peça',
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('foto do site de origem é trocada pela mídia do projeto, e mantida quando não há', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-foto-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const mediaDir = join(raiz, 'root', 'projects', 'prj_teste', 'media');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, 'foto-da-marca.jpg'), 'jpg', 'utf8');

    // A peça traz DUAS fotos do acervo da origem — a casa de outra empresa.
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'image'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'image', 'casa.jpg'), 'origem', 'utf8');
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section><img src="assets/image/casa.jpg" alt="Casa"><img src="assets/image/casa.jpg" alt="Outra"></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_p',
            name: 'Peça com foto',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_p'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      // Uma foto do projeto para a seção: cobre a primeira, não a segunda.
      midia: [{ de: 'foto-da-marca.jpg', para: 'midia/marca-1.jpg', secaoId: 'sec_1' }],
      outputDir: join(raiz, 'saida'),
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(index.includes('src="midia/marca-1.jpg"'), 'a primeira foto virou a do projeto');
    // A SEGUNDA continua sendo a da origem: sem substituta, a foto fica. Um
    // buraco no lugar dela desmontaria o desenho, que é o que o kit empresta.
    assert.equal(
      (index.match(/assets\/cmp_p\/image\/casa\.jpg/g) ?? []).length,
      1,
      'a foto sem substituta continua na página',
    );
    assert.ok(
      r.avisos.some((a) => a.includes('trocada(s) pela mídia do projeto')),
      'a troca é declarada',
    );
    assert.ok(
      r.avisos.some((a) => a.includes('CONTINUAM na página')),
      'e a que ficou sem substituta é denunciada, com o que fazer',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('projeto SEM mídia nenhuma não sai sem foto nenhuma', () => {
  // O caso que aconteceu de verdade: o caminho de API e a prévia do kit não
  // passavam `midia`, a fila de fotos chegava vazia e TODA foto era removida —
  // o site inteiro com buraco onde havia imagem, e ninguém entendia por quê.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-sem-midia-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'image'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'image', 'casa.jpg'), 'origem', 'utf8');
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section><img src="assets/image/casa.jpg" alt="Casa"></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_p',
            name: 'Peça com foto',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_p'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      // Sem `midia`: exatamente como o caminho de API chamava.
      outputDir: join(raiz, 'saida'),
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(index.includes('assets/cmp_p/image/casa.jpg'), 'a página continua com a foto');
    assert.ok(
      r.avisos.some((a) => a.includes('CONTINUAM na página')),
      'e o aviso diz que ela é da origem e como resolver',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('logo ancorada numa seção não substitui a foto de conteúdo', () => {
  // A marca tem caminho próprio (variações + favicon). Se ela entrasse na fila
  // das fotos, o símbolo da empresa tomaria o lugar da foto do hero.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-logo-foto-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const mediaDir = join(raiz, 'root', 'projects', 'prj_teste', 'media');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, 'logo.svg'), '<svg/>', 'utf8');
    writeFileSync(join(mediaDir, 'foto.jpg'), 'jpg', 'utf8');

    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'image'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'image', 'casa.jpg'), 'origem', 'utf8');
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section><img src="assets/image/casa.jpg" alt="Casa"></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_p',
            name: 'Peça com foto',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_p'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      // A logo vem PRIMEIRO e ancorada na mesma seção: sem o `kind`, seria ela
      // a substituir a foto.
      midia: [
        { de: 'logo.svg', para: 'midia/logo.svg', secaoId: 'sec_1', kind: 'logo' },
        { de: 'foto.jpg', para: 'midia/foto.jpg', secaoId: 'sec_1', kind: 'image' },
      ],
      outputDir: join(raiz, 'saida'),
    });
    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(index.includes('src="midia/foto.jpg"'), 'quem entrou foi a foto');
    assert.ok(!index.includes('src="midia/logo.svg"'), 'a logo não virou foto de conteúdo');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a moldura MEDIDA devolve o container que a peça perdeu ao ser recortada', () => {
  // O caso que o dono viu no site de joalheria: o título "Uma joia que é sua"
  // começando em x=0 e cortado pela borda. A origem tinha um container
  // (`max-w-7xl mx-auto px-12`) que o recorte deixou para trás, e nenhuma das
  // duas evidências anteriores o via — não há margem negativa, e o container
  // era um PAI com utilitárias, não uma classe na peça.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-moldura-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    // O mapa estrutural como a captura o grava: a peça em x=129 com 1182 de
    // largura, dentro de um container em x=80 com 1280, numa tela de 1440.
    const capt = join(raiz, 'root', 'vault', 'ds_a', 'capture-v2');
    mkdirSync(capt, { recursive: true });
    writeFileSync(
      join(capt, 'manifest.json'),
      JSON.stringify({
        viewport: { width: 1440, height: 900 },
        structuralMap: [
          {
            fingerprint: { hash: 'corpo', stableClasses: ['bg-preto', 'text-branco'] },
            pageBox: { x: 0, w: 1440 },
            parent: null,
          },
          {
            fingerprint: { hash: 'container', stableClasses: ['max-w-7xl', 'mx-auto', 'px-12'] },
            pageBox: { x: 80, w: 1280 },
            parent: 'corpo',
          },
          {
            fingerprint: {
              hash: 'heroi',
              stableClasses: ['relative', 'pt-16', 'flex', 'items-center', 'gap-12'],
            },
            pageBox: { x: 129, w: 1182 },
            parent: 'container',
          },
        ],
      }),
      'utf8',
    );

    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section class="relative pt-16 flex items-center gap-12"><h1>Uma joia que é sua</h1></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_h',
            name: 'Hero',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_h'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: join(raiz, 'saida'),
    });

    const css = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');
    // Largura e respiro saem SUBTRAÍDOS da medição: 1280 é a largura do
    // container, 49 é 129 menos 80. Nenhum dos dois é suposto.
    assert.match(css, /--pagina-largura:1280px/, 'a largura vem do container medido');
    assert.match(css, /--pagina-respiro:min\(49px,6vw\)/, 'o respiro vem da subtração');
    assert.match(
      css,
      /\[data-secao\]:has\(>\[data-ds-raiz="ds_a"\]\)\{[^}]*max-width:var\(--pagina-largura\)/,
      'e a seção daquela origem entra no eixo',
    );
    assert.ok(
      r.avisos.some((a) => a.includes('MEDIDOS no mapa estrutural')),
      'a medição se declara, para ninguém confundir com suposição',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('peça que era sangria na origem NÃO recebe moldura', () => {
  // O outro lado da mesma régua, e a razão de a tentativa anterior ter virado
  // PDF: peça que ocupava a tela inteira na origem foi desenhada assim. Dar
  // container a ela é mudar a essência do desenho.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-sangria-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const capt = join(raiz, 'root', 'vault', 'ds_b', 'capture-v2');
    mkdirSync(capt, { recursive: true });
    writeFileSync(
      join(capt, 'manifest.json'),
      JSON.stringify({
        viewport: { width: 1440, height: 900 },
        structuralMap: [
          {
            fingerprint: { hash: 'corpo', stableClasses: ['bg-preto'] },
            pageBox: { x: 0, w: 1440 },
            parent: null,
          },
          {
            fingerprint: {
              hash: 'faixa',
              stableClasses: ['w-full', 'relative', 'flex', 'items-center', 'py-24'],
            },
            pageBox: { x: 0, w: 1440 },
            parent: 'corpo',
          },
        ],
      }),
      'utf8',
    );

    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section class="w-full relative flex items-center py-24"><p>Faixa inteira</p></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_f',
            name: 'Faixa',
            category: 'features',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_b',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Recursos', componentIds: ['cmp_f'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: join(raiz, 'saida'),
    });

    const css = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');
    assert.doesNotMatch(css, /--pagina-largura/, 'nenhuma moldura foi inventada');
    assert.doesNotMatch(css, /\[data-secao\]:has\(>\[data-ds-raiz="ds_b"\]\)/, 'e a seção sangra');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});
