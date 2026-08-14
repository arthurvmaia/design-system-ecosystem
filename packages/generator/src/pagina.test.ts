import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { KitDesignSystem } from '@ds/shared';
import { DEFAULT_PROJECT_BRANDING, ProjectLayout } from '@ds/shared';
import { corDePaginaDaOrigem, montarPaginaDoKit } from './pagina.js';

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

    // 3. O fundo mantém as cores originais (origem-apelido `__original`).
    //
    // O apelido já foi `::original` e mudou porque este mesmo texto vira sufixo
    // de nome global: `@keyframes girar--ds_b::original` não é identificador
    // CSS válido, o navegador descarta a at-rule e a animação do fundo não roda.
    assert.ok(styles.includes('__original'), 'escopo próprio do fundo');
    assert.ok(!styles.includes('::original'), 'e sem dois-pontos, que mata a at-rule');
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

test('vídeo da origem é trocado pelo do projeto, com src, source e capa', () => {
  // Foto de outra empresa num site é constrangedor; vídeo de outra empresa é a
  // marca dela falando dentro do site do cliente. Até aqui o único tratamento
  // de <video> era APAGÁ-LO, e só quando o tema era oposto — nos outros casos
  // ele atravessava inteiro até a entrega.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-video-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const mediaDir = join(raiz, 'root', 'projects', 'prj_teste', 'media');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, 'marca.mp4'), 'mp4', 'utf8');
    writeFileSync(join(mediaDir, 'capa.jpg'), 'jpg', 'utf8');

    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'video'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'video', 'origem.mp4'), 'origem', 'utf8');
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section><video src="assets/video/origem.mp4" poster="assets/video/frame.jpg" autoplay muted>
<source src="assets/video/origem.mp4" type="video/mp4">
</video></section>
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
            id: 'cmp_v',
            name: 'Peça com vídeo',
            category: 'hero',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_v'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      midia: [
        { de: 'marca.mp4', para: 'midia/marca.mp4', secaoId: 'sec_1', kind: 'video' },
        { de: 'capa.jpg', para: 'midia/capa.jpg', secaoId: 'sec_1', kind: 'image' },
      ],
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    // Os três lugares que carregam endereço mudam juntos: sem o poster, o
    // primeiro instante do vídeo ainda seria o da outra empresa.
    assert.match(index, /<video[^>]*src="midia\/marca\.mp4"/, 'o src do vídeo');
    assert.match(index, /<source[^>]*src="midia\/marca\.mp4"/, 'e o do source');
    assert.match(index, /poster="midia\/capa\.jpg"/, 'e a capa, que é foto e não vídeo');
    assert.ok(!index.includes('assets/cmp_v/video/origem.mp4'), 'nada da origem sobrou');
    assert.ok(
      r.avisos.some((a) => a.includes('vídeo(s) do site de origem trocado')),
      'a troca é declarada',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o site gerado é FECHADO EM SI: apagar a peça de origem não o quebra', () => {
  // O dono foi direto: "os sites que já foram gerados têm que ser independentes,
  // pois já foram gerados e não dependem mais dos componentes, já que está em
  // disco". A montagem já copiava tudo, mas isso era acidente feliz — aqui vira
  // garantia conferida, e o teste apaga a origem para provar.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-independente-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'image'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'image', 'foto.jpg'), 'bytes', 'utf8');
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section><img src="assets/image/foto.jpg" alt="x"><a href="/contato">contato</a></section>
</body></html>`,
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), '.x{color:#111}', 'utf8');

    const saida = join(raiz, 'saida');
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_p',
            name: 'Peça',
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
      outputDir: saida,
    });

    assert.ok(r.independente.fechadoEmSi, `pendentes: ${r.independente.pendentes.join(', ')}`);

    // A prova de verdade: some com a peça de origem e o site continua inteiro.
    rmSync(dir, { recursive: true, force: true });
    const index = readFileSync(join(saida, 'index.html'), 'utf8');
    for (const m of index.matchAll(/<[a-z][\w-]*\b[^>]*?\s(?:href|src)\s*=\s*"([^"]+)"/gi)) {
      const ref = m[1] ?? '';
      const tag = (m[0].match(/^<([a-z][\w-]*)/i)?.[1] ?? '').toLowerCase();
      // `<a href>` é navegação, não arquivo — a mesma distinção do validador.
      if (tag === 'a' || tag === 'form' || tag === 'area' || tag === 'base') continue;
      if (ref.startsWith('#') || /^(?:https?:)?\/\/|^(?:data|mailto|tel):/i.test(ref)) continue;
      assert.ok(
        existsSync(join(saida, ref.split(/[?#]/)[0] ?? '')),
        `${ref} sumiu junto com a peça de origem`,
      );
    }
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o nome da empresa de ORIGEM não sobrevive no texto do site', () => {
  // O dono viu "CANVAS" em letras gigantes no rodapé de um site de clínica e
  // "© 2024 CANVAS SYSTEMS" logo abaixo. O kit empresta o desenho; o nome da
  // outra empresa não vai junto.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-nome-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    // O endereço é a fonte do nome: existe em toda captura e não depende de
    // ninguém ter preenchido nada.
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://canvas-visual.aura.build/design-system' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<footer class="canvas-grid"><h2>CANVAS</h2><p>© 2024 Canvas Systems.</p>
<a href="#" title="Canvas">Sobre a canvas</a><canvas id="fundo"></canvas>
<abbr title="https://canvas-visual.aura.build/sobre">fonte</abbr>
<input placeholder="Seu e-mail na Canvas" data-arquivo="canvas-logo.png"></footer>
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
            id: 'cmp_r',
            name: 'Rodapé',
            category: 'footer',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Rodapé', componentIds: ['cmp_r'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Sorriso Vivo' },
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    // A caixa de cada ocorrência é respeitada: sem isso o rodapé em versalete
    // sairia com uma palavra em caixa mista e a troca ficaria mais visível que
    // o problema.
    assert.ok(index.includes('SORRISO VIVO'), 'CANVAS vira SORRISO VIVO');
    assert.ok(index.includes('Sorriso Vivo Systems'), 'Canvas vira Sorriso Vivo');
    assert.ok(index.includes('Sobre a sorriso vivo'), 'canvas minúsculo também');

    // O `title` vira balão ao parar o mouse e o `placeholder` fica dentro do
    // campo. São texto que a pessoa lê, mesmo morando em atributo.
    assert.ok(index.includes('title="Sorriso Vivo"'), 'o title também é texto');
    assert.ok(
      index.includes('placeholder="Seu e-mail na Sorriso Vivo"'),
      'o placeholder também é texto',
    );

    // E o que NÃO é nome de empresa fica: classe de CSS, tag `<canvas>`,
    // atributo de máquina, e qualquer valor que seja ENDEREÇO — trocar dentro
    // dele corromperia o link em vez de limpar o texto.
    assert.ok(index.includes('class="canvas-grid"'), 'a classe não é tocada');
    assert.ok(index.includes('<canvas id="fundo">'), 'a tag <canvas> não é tocada');
    assert.ok(index.includes('canvas-visual.aura.build/sobre'), 'endereço fica inteiro');
    assert.ok(index.includes('data-arquivo="canvas-logo.png"'), 'atributo de máquina fica');

    // E a regra S2 confirma, no site pronto, que não sobrou nenhum.
    assert.equal(r.aceite.vereditos.find((v) => v.codigo === 'S2')?.estado, 'passou');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('@font-face que pede arquivo que não veio sai da folha, em vez de dar 404', () => {
  // Medido: um CSS de fonte capturado pedia 8 `.woff2` e a captura baixou 2. Os
  // outros seis continuavam declarados e o navegador pedia cada um — 404 a cada
  // carregamento, sem nada quebrar na tela.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-fonte-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    mkdirSync(join(dir, 'assets', 'font'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'font', 'existe.woff2'), 'x', 'utf8');
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://exemplo-tipos.com/' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'assets', 'css', 'tokens.css'),
      [
        '@font-face{font-family:"Meia";src:url("../font/existe.woff2") format("woff2"),url("sumiu.woff2") format("woff2")}',
        '@font-face{font-family:"Fantasma";src:url("nao-veio.woff2") format("woff2")}',
        '@font-face{font-family:"DaRede";src:url("https://cdn.exemplo.com/f.woff2") format("woff2")}',
        '.faixa{color:#111}',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><html><head></head><body><section class="faixa"><h2>Tipos</h2></section></body></html>',
      'utf8',
    );

    const r = montarPaginaDoKit({
      projectId: 'prj_fonte',
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
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Faixa', componentIds: ['cmp_f'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Minha Marca' },
      outputDir: join(raiz, 'saida'),
    });

    const css = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');
    assert.ok(!css.includes('sumiu.woff2'), 'o src que não existe some');
    assert.ok(!css.includes('nao-veio.woff2'), 'e o único src da outra família também');
    assert.ok(!css.includes('Fantasma'), 'família sem arquivo nenhum sai inteira');
    // O que existe fica: a família continua vestindo o texto.
    assert.ok(css.includes('existe.woff2'), 'o arquivo que veio continua declarado');
    assert.ok(css.includes('Meia'), 'e a família dele também');
    // Fonte remota não é arquivo desta pasta e não é problema desta regra.
    assert.ok(css.includes('cdn.exemplo.com/f.woff2'), 'fonte da rede não é tocada');
    assert.ok(
      r.avisos.some((a) => a.includes('404')),
      'o que foi retirado é declarado',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a substituição vale em TODAS as ocorrências, não só na primeira', () => {
  // Medido numa faixa de cartões: "KRAFTON" aparecia quatro vezes, o criativo
  // mandou trocar, e três ficaram — o site do cliente saiu com o nome de uma
  // empresa de games repetido, sem nada avisar. A regra S2 não pega: ali não é
  // o nome da ORIGEM, é o conteúdo que ela exibia.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-subst-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://exemplo-grade.com/' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<ul><li>KRAFTON</li><li>KRAFTON</li><li>KRAFTON</li><li>KRAFTON Studios</li></ul>
</body></html>`,
      'utf8',
    );

    const r = montarPaginaDoKit({
      projectId: 'prj_subst',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_g',
            name: 'Grade',
            category: 'features',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Grade', componentIds: ['cmp_g'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Minha Marca' },
      secoes: [{ secaoId: 'sec_1', substituicoes: { '>KRAFTON<': '>Número vitalício<' } }],
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.equal(index.match(/Número vitalício/g)?.length, 3, 'as três da lista trocaram');
    assert.ok(!/>KRAFTON</.test(index), 'nenhuma sobrou na forma que o criativo pediu');
    // A quarta é `KRAFTON Studios`: a chave `>KRAFTON<` não a descreve — o
    // texto não termina ali —, e ela fica. O criativo pede o que enxerga.
    assert.ok(index.includes('KRAFTON Studios'), 'o que a chave não descreve não é tocado');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o RASTREAMENTO da origem não entra no site do cliente', () => {
  // Um site gerado carregava a `gtag.js` de 572 KB e o snippet
  // `gtag('config','G-…')` da empresa de origem, vindos dentro dos bundles
  // capturados. Cada visitante do cliente virava `page_view` na conta de outra
  // empresa; nada quebrava e nada aparecia no console.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-rastreio-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'js'), { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://exemplo-loja.com/' } }),
      'utf8',
    );
    // Três scripts: o carregador do fornecedor, o snippet de init, e um de
    // comportamento de verdade que precisa sobreviver.
    writeFileSync(
      join(dir, 'assets', 'js', 'vendor.js'),
      '// Copyright 2012 Google Inc.\nvar u="https://www.googletagmanager.com/gtag/js?id=G-ABCD123456";\n',
      'utf8',
    );
    writeFileSync(
      join(dir, 'assets', 'js', 'init.js'),
      "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}\ngtag('config','G-ABCD123456');\n",
      'utf8',
    );
    writeFileSync(
      join(dir, 'assets', 'js', 'menu.js'),
      "document.querySelectorAll('.abre').forEach(function(b){b.addEventListener('click',function(){b.classList.toggle('aberto');});});\n",
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<section class="faixa"><h2>Loja</h2></section>
<script src="assets/js/vendor.js"></script>
<script src="assets/js/init.js"></script>
<script src="assets/js/menu.js"></script>
</body></html>`,
      'utf8',
    );

    const r = montarPaginaDoKit({
      projectId: 'prj_rastreio',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_s',
            name: 'Faixa',
            category: 'features',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Faixa', componentIds: ['cmp_s'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Minha Marca' },
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(!index.includes('vendor.js'), 'o carregador do fornecedor não é referenciado');
    assert.ok(!index.includes('init.js'), 'o snippet de init também não');
    assert.ok(index.includes('menu.js'), 'o comportamento de verdade continua');

    // E o arquivo some do DISCO: sem tag, mas copiado, seria entregar o
    // rastreador de outra empresa dentro da pasta do cliente.
    assert.ok(!existsSync(join(r.outputDir, 'assets', 'cmp_s', 'js', 'vendor.js')));
    assert.ok(existsSync(join(r.outputDir, 'assets', 'cmp_s', 'js', 'menu.js')));

    assert.equal(r.aceite.vereditos.find((v) => v.codigo === 'S2')?.estado, 'passou');
    assert.ok(
      r.avisos.some((a) => a.includes('RASTREAMENTO')),
      'a remoção é declarada, não calada',
    );
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('o nome sai do CAMINHO quando o acervo veio de um catálogo espelho', () => {
  // 246 das 288 peças da Biblioteca vieram de `ds.asimov.academy`, que guarda
  // cada site numa pasta com o nome do domínio original. Lendo só o host, a
  // troca não achava nome em 85% do acervo — foi por essa fresta que "CANVAS"
  // chegou ao rodapé do site da clínica com a troca já ligada.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-nome-espelho-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        source: {
          url: 'https://ds.asimov.academy/1_temas_escuros/canvas-visual.aura.build/design-system',
        },
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<nav><span>Canvas</span></nav><footer><p>© 2024 CANVAS</p><p>por Asimov Academy</p></footer>
</body></html>`,
      'utf8',
    );

    const r = montarPaginaDoKit({
      projectId: 'prj_espelho',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_n',
            name: 'Navegação',
            category: 'nav',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Navegação', componentIds: ['cmp_n'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Sorriso Vivo' },
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(index.includes('<span>Sorriso Vivo</span>'), 'o nome do caminho é o que vale');
    assert.ok(index.includes('© 2024 SORRISO VIVO'), 'e em qualquer caixa');
    // O host é o CATÁLOGO que hospeda a cópia, não a empresa de origem: trocar
    // "asimov" pelo nome do cliente seria trocar o nome do arquivista.
    assert.ok(index.includes('por Asimov Academy'), 'o nome do catálogo não é tocado');
    assert.equal(r.aceite.vereditos.find((v) => v.codigo === 'S2')?.estado, 'passou');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('peça SEM pasta de assets também é limpa, e sem marca a regra S2 reprova', () => {
  // Rodapé e barra de menu costumam não ter `assets/` — e é justamente neles
  // que o nome da outra empresa aparece. A primeira versão da troca morava
  // dentro do bloco de assets e não pegava nenhum dos dois.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-nome-sem-assets-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://canvas-visual.aura.build/' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<footer><h2>CANVAS</h2><p>© 2024 Canvas Systems.</p></footer>
</body></html>`,
      'utf8',
    );

    const kit = {
      id: 'kit_t',
      components: [
        {
          id: 'cmp_r',
          name: 'Rodapé',
          category: 'footer',
          kind: 'component',
          bundlePath: dir,
          designSystemId: 'ds_a',
        },
      ],
    };
    const layout = ProjectLayout.parse({
      secoes: [{ id: 'sec_1', nome: 'Rodapé', componentIds: ['cmp_r'] }],
    });

    const comMarca = montarPaginaDoKit({
      projectId: 'prj_a',
      titulo: 'T',
      kit,
      layout,
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Sorriso Vivo' },
      outputDir: join(raiz, 'com-marca'),
    });
    const html = readFileSync(join(comMarca.outputDir, 'index.html'), 'utf8');
    assert.ok(html.includes('SORRISO VIVO'), 'peça sem assets também é limpa');
    assert.equal(comMarca.aceite.vereditos.find((v) => v.codigo === 'S2')?.estado, 'passou');

    // Sem nome de marca não há por que trocar — e é aí que a regra precisa
    // falar, em vez de deixar o site subir com a marca de outra empresa.
    const semMarca = montarPaginaDoKit({
      projectId: 'prj_b',
      titulo: 'T',
      kit,
      layout,
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: '' },
      outputDir: join(raiz, 'sem-marca'),
    });
    const s2 = semMarca.aceite.vereditos.find((v) => v.codigo === 'S2');
    assert.equal(s2?.estado, 'reprovou');
    assert.ok(s2?.motivo.includes('canvas'), 'o nome que sobrou é dito por extenso');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

/**
 * O tema da origem mora na FOLHA quando ela não está na tag — e ler só a tag
 * produzia meia migração.
 *
 * Medido no site do clube (marca escura, `#0b1530`): a origem `green-museum` é
 * de tema CLARO e declara `body{background-color:#E6E3D6}` no CSS, sem
 * `bg-[#hex]` nenhum no `<body>`. A leitura antiga só entendia a tag, devolvia
 * `null`, e `null` caía em "os temas combinam" — o único regime INCOERENTE,
 * porque mantém a superfície da origem e mesmo assim resgata o texto para a
 * tinta da marca.
 *
 * Na tela isso foi um cartão creme da origem com tinta clara da marca por cima:
 * 14 trechos abaixo do piso de contraste num site só. O que o teste trava é a
 * COERÊNCIA do par — fundo e texto migram juntos, ou nenhum dos dois migra.
 */
test('o tema da origem é lido da FOLHA quando o <body> não o declara', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-tema-'));
  try {
    // Sem `bg-[#hex]` na tag: o `bundle()` põe `class="fundo-a"`, e é só isso.
    const peca = bundle(
      raiz,
      'claro',
      '<section class="cartao"><p class="texto">x</p></section>',
      'body{background-color:#E6E3D6}.cartao{background:#EAE8DE}.texto{color:#57534e}',
    );
    const r = montarPaginaDoKit({
      projectId: 'prj_tema',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_claro',
            name: 'Cartão',
            category: 'other',
            kind: 'component',
            bundlePath: peca,
            designSystemId: 'ds_claro',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'A', componentIds: ['cmp_claro'] }],
      }),
      // Marca ESCURA: é o contraste com o `#E6E3D6` da folha que faz a origem
      // ser de tema oposto — o fato que a leitura antiga não enxergava.
      branding: {
        ...DEFAULT_PROJECT_BRANDING,
        palette: { primary: '#0050c4', background: '#0b1530', foreground: '#ffffff' },
      },
      outputDir: join(raiz, 'saida'),
    });
    const styles = readFileSync(join(r.outputDir, 'assets', 'styles.css'), 'utf8');

    // O fundo do cartão MIGRA: é isso que a leitura da tag não conseguia, e é o
    // lado do par que ficava para trás.
    assert.match(
      styles,
      /--marca-(surface|background)[^)]*#EAE8DE/i,
      'o cartão claro da origem migra para a superfície da marca',
    );
    // E o texto migra junto. Os dois na marca é coerente; um só é o defeito.
    assert.match(styles, /--marca-[\w-]+, #57534e/i, 'o texto migra junto com o fundo');
    // Tema lido é tema medido: o aviso de "não deu para ler" não pode aparecer.
    assert.ok(
      !r.avisos.some((a) => a.includes('não deu para ler a cor de página')),
      'a cor de página foi lida da folha, então não há aviso de desconhecido',
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('origem sem cor de página em lugar nenhum: o desconhecido é DITO', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-tema-mudo-'));
  try {
    const peca = bundle(raiz, 'mudo', '<section class="c">x</section>', '.c{color:#333}');
    const r = montarPaginaDoKit({
      projectId: 'prj_mudo',
      titulo: 'T',
      kit: {
        id: 'kit_t',
        components: [
          {
            id: 'cmp_mudo',
            name: 'C',
            category: 'other',
            kind: 'component',
            bundlePath: peca,
            designSystemId: 'ds_mudo',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'A', componentIds: ['cmp_mudo'] }],
      }),
      branding: {
        ...DEFAULT_PROJECT_BRANDING,
        palette: { primary: '#0050c4', background: '#0b1530', foreground: '#ffffff' },
      },
      outputDir: join(raiz, 'saida'),
    });
    // Sem dado, o regime segue o de sempre — mas para de ser silencioso: quem
    // ler o relatório sabe onde procurar se sair texto claro sobre bloco claro.
    assert.ok(
      r.avisos.some((a) => a.includes('não deu para ler a cor de página')),
      'origem sem cor de página declarada avisa em vez de seguir calada',
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

// ── O comportamento que viaja e não anima nada, e a camada que salva ────────

/**
 * Um bundle de COMPORTAMENTO: quase nada de HTML e um script que procura, por
 * seletor, os elementos que ele anima. É a forma exata das 8 peças
 * `animation/interaction` do acervo.
 */
const bundleDeComportamento = (raiz: string, nome: string, seletor: string): string => {
  const dir = join(raiz, nome);
  mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'js'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    [
      '<!doctype html><html class="tema-a"><head>',
      '<link rel="stylesheet" href="assets/css/tokens.css">',
      '</head><body class="fundo-a">',
      '<div class="amostra-da-origem">amostra dos alvos na origem</div>',
      '<script src="assets/js/rev.js"></script>',
      '</body></html>',
    ].join(''),
    'utf8',
  );
  writeFileSync(
    join(dir, 'assets', 'css', 'tokens.css'),
    `${seletor}{opacity:0;transition:opacity 400ms ease-out}`,
    'utf8',
  );
  writeFileSync(
    join(dir, 'assets', 'js', 'rev.js'),
    [
      'var io = new IntersectionObserver(function(e){});',
      `document.querySelectorAll('${seletor}').forEach(function(el){ io.observe(el); });`,
    ].join('\n'),
    'utf8',
  );
  return dir;
};

const montarComComportamento = (raiz: string, motion: 'nenhuma' | 'sutil') => {
  const secao = bundle(
    raiz,
    `secao-${motion}`,
    '<div class="cartao">Conteúdo</div>',
    '.cartao{padding:24px;transition:transform 200ms ease-out}',
  );
  const comp = bundleDeComportamento(raiz, `comp-${motion}`, '.scroll-item');
  const out = join(raiz, `saida-${motion}`);
  const r = montarPaginaDoKit({
    projectId: 'prj_teste',
    titulo: 'Clube',
    kit: {
      id: 'kit_c',
      components: [
        {
          id: 'cmp_secao',
          name: 'Seção',
          category: 'hero',
          kind: 'component',
          bundlePath: secao,
          designSystemId: 'ds_a',
        },
        {
          id: 'cmp_comp',
          name: 'Revelar ao rolar',
          category: 'interaction',
          kind: 'animation',
          bundlePath: comp,
          designSystemId: 'ds_b',
        },
      ],
    },
    layout: ProjectLayout.parse({
      motion,
      secoes: [
        { id: 's1', nome: 'Menu', papel: 'nav', componentIds: ['cmp_secao', 'cmp_comp'] },
        { id: 's2', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_secao'] },
        { id: 's3', nome: 'Planos', papel: 'pricing', componentIds: ['cmp_secao'] },
        { id: 's4', nome: 'Chamada', papel: 'cta', componentIds: ['cmp_secao'] },
      ],
    }),
    branding: DEFAULT_PROJECT_BRANDING,
    outputDir: out,
  });
  return { r, index: readFileSync(join(out, 'index.html'), 'utf8'), out };
};

/**
 * O defeito do site do clube, reduzido: o comportamento é da origem `ds_b`,
 * nenhuma seção veio dela, e o script dele procura `.scroll-item` — que não
 * existe em lugar nenhum da página. Antes disto ele chegava calado e a S6
 * carimbava "passou".
 */
test('comportamento de origem ausente é declarado morto, e a S6 reprova', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'comport-morto-'));
  try {
    const { r, index, out } = montarComComportamento(raiz, 'nenhuma');

    assert.ok(
      r.avisos.some((a) => a.includes('Revelar ao rolar') && a.includes('NÃO alcança nada')),
      `nenhum aviso de morte: ${r.avisos.join(' | ')}`,
    );
    assert.ok(!index.includes('scroll-item'), 'de fato não há alvo na página');

    const s6 = r.aceite.vereditos.find((v) => v.codigo === 'S6');
    assert.equal(s6?.estado, 'reprovou');
    assert.match(s6?.motivo ?? '', /ds_b/, 'o motivo nomeia a origem ausente');

    // `motion: 'nenhuma'` é declaração do usuário e é respeitada: sem camada.
    assert.ok(!existsSync(join(out, 'assets', 'movimento.css')));
    assert.ok(!index.includes('data-orbis-revelar'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('sem nada que reaja à rolagem, a camada de movimento do compositor entra', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'comport-camada-'));
  try {
    const { r, index, out } = montarComComportamento(raiz, 'sutil');

    const css = readFileSync(join(out, 'assets', 'movimento.css'), 'utf8');
    assert.match(index, /<link rel="stylesheet" href="assets\/movimento\.css"\/>/);
    // Entre criadas.css e responsivo.css: o marca.css continua vencendo.
    assert.ok(
      index.indexOf('criadas.css') < index.indexOf('movimento.css'),
      'depois das seções criadas',
    );
    assert.ok(
      index.indexOf('movimento.css') < index.indexOf('responsivo.css'),
      'antes do responsivo',
    );
    assert.ok(index.indexOf('movimento.css') < index.indexOf('marca.css'), 'antes da marca');

    // A marcação é por SEÇÃO, e a primeira (a nav) fica de fora.
    assert.match(index, /data-orbis-revelar/);
    assert.ok(!/data-secao="nav"[^>]*data-orbis-revelar/.test(index), 'a nav não é revelada');
    assert.equal(
      (index.match(/<section[^>]*data-orbis-revelar/g) ?? []).length,
      3,
      'hero, pricing e cta',
    );
    // Nada dentro da peça foi tocado: o cartão da origem segue intacto.
    assert.ok(index.includes('class="cartao"'));

    // O ritmo é MEDIDO no CSS do kit (200ms e 400ms estão nos bundles).
    assert.match(css, /--orbis-duracao-media:\s*\d+ms/);
    assert.match(css, /ease-out/);
    assert.match(index, /IntersectionObserver' in window/);

    const s6 = r.aceite.vereditos.find((v) => v.codigo === 'S6');
    assert.equal(s6?.estado, 'passou', 'a página passa a reagir à rolagem');
    // E o comportamento morto continua sendo dito — a camada não o encobre.
    assert.ok(r.avisos.some((a) => a.includes('NÃO alcança nada')));
    assert.ok(r.avisos.some((a) => a.includes('camada de movimento do compositor entrou')));
    // O site segue fechado em si: a folha nova está em disco.
    assert.ok(r.independente.fechadoEmSi, r.independente.pendentes.join(', '));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

/**
 * O outro lado: comportamento da MESMA origem das seções, alcançando alvo de
 * verdade. Aqui a camada do compositor NÃO entra — duas revelações sobre o
 * mesmo elemento seriam piores que uma.
 */
test('comportamento vivo desliga a camada: quem já se mexe não é remexido', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'comport-vivo-'));
  try {
    const secao = bundle(
      raiz,
      'secao-viva',
      '<div class="cartao scroll-item">Conteúdo</div>',
      '.cartao{padding:24px;transition:transform 200ms ease-out}',
    );
    const comp = bundleDeComportamento(raiz, 'comp-vivo', '.scroll-item');
    const out = join(raiz, 'saida-viva');
    const r = montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'Clube',
      kit: {
        id: 'kit_v',
        components: [
          {
            id: 'cmp_secao',
            name: 'Seção',
            category: 'hero',
            kind: 'component',
            bundlePath: secao,
            designSystemId: 'ds_a',
          },
          {
            id: 'cmp_comp',
            name: 'Revelar ao rolar',
            category: 'interaction',
            kind: 'animation',
            bundlePath: comp,
            // MESMA origem das seções: o CSS escopado dela alcança as peças.
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        motion: 'sutil',
        secoes: [
          { id: 's1', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_secao', 'cmp_comp'] },
          { id: 's2', nome: 'Planos', papel: 'pricing', componentIds: ['cmp_secao'] },
        ],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: out,
    });
    const index = readFileSync(join(out, 'index.html'), 'utf8');

    assert.ok(!r.avisos.some((a) => a.includes('NÃO alcança nada')), 'ninguém é acusado de morto');
    assert.ok(!existsSync(join(out, 'assets', 'movimento.css')), 'a camada não entra');
    assert.ok(!index.includes('data-orbis-revelar'));
    assert.equal(r.aceite.vereditos.find((v) => v.codigo === 'S6')?.estado, 'passou');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

/**
 * Vídeo do projeto entra numa vaga de FOTO quando a peça não tem `<video>`.
 *
 * A troca era estritamente preservadora de tipo, e a peça capturada quase nunca
 * traz `<video>` — ela traz `<img>`. Sem esta conversão, um vídeo ancorado numa
 * seção simplesmente não tinha onde entrar, e o pedido "põe vídeo onde couber"
 * ficava sem via.
 */
test('vídeo ancorado entra na vaga de foto quando a peça não tem tag de vídeo', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-video-'));
  const anterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = raiz;
    const peca = bundle(
      raiz,
      'galeria',
      '<section><img class="w-full h-64 rounded-xl" src="assets/foto.jpg" alt=""></section>',
      '.x{color:#111}',
    );
    mkdirSync(join(peca, 'assets'), { recursive: true });
    writeFileSync(join(peca, 'assets', 'foto.jpg'), 'jpg', 'utf8');
    const midiaDir = join(raiz, 'projects', 'prj_v', 'media');
    mkdirSync(midiaDir, { recursive: true });
    writeFileSync(join(midiaDir, 'clipe.mp4'), 'mp4', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_v',
      titulo: 'T',
      kit: {
        id: 'kit_v',
        components: [
          {
            id: 'cmp_g',
            name: 'Galeria',
            category: 'gallery',
            kind: 'component',
            bundlePath: peca,
            designSystemId: 'ds_v',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Galeria', componentIds: ['cmp_g'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      midia: [{ de: 'clipe.mp4', para: 'midia/clipe.mp4', secaoId: 'sec_1', kind: 'video' }],
      outputDir: join(raiz, 'saida'),
    });
    const html = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.match(html, /<video[^>]*src="midia\/clipe\.mp4"/, 'o vídeo entrou na vaga da foto');
    assert.match(html, /<video[^>]*\bmuted\b/, 'mudo: sem isso o celular recusa o autoplay');
    assert.match(html, /<video[^>]*\bplaysinline\b/, 'inline: senão abre em tela cheia');
    assert.match(html, /<video[^>]*\bloop\b/);
    // A capa NUNCA é o asset da origem: seria devolver a imagem de outra
    // empresa como primeiro quadro do vídeo, que é o vazamento que a troca de
    // mídia existe para fechar. Sem foto do projeto, melhor sem capa.
    assert.ok(!/poster="assets\//.test(html), 'a capa nunca sai do asset da origem');
    assert.match(html, /<video[^>]*class="w-full h-64 rounded-xl"/, 'as classes da vaga viajam');
    assert.ok(r.avisos.some((a) => a.includes('vaga de foto recebeu VÍDEO')));
  } finally {
    if (anterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = anterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

/**
 * A vaga de vídeo tem de ser GRANDE — "a primeira que aparecer" deu absurdo.
 *
 * Medido no site do clube: um vídeo de estádio de 8 segundos foi parar num
 * `w-10 h-10 rounded-full grayscale`, que é o avatar de 40px de um depoimento.
 * Vídeo ali não é decisão de desenho, é acidente. A marcação diz o tamanho, e é
 * dela que sai a régua.
 */
test('o vídeo pula a vaga pequena e pousa na grande', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-vaga-'));
  const anterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = raiz;
    const peca = bundle(
      raiz,
      'depoimento',
      [
        '<section>',
        '<img class="w-10 h-10 rounded-full object-cover" src="assets/avatar.jpg" alt="">',
        '<img class="w-full h-full object-cover absolute inset-0" src="assets/fundo.jpg" alt="">',
        '</section>',
      ].join(''),
      '.x{color:#111}',
    );
    mkdirSync(join(peca, 'assets'), { recursive: true });
    writeFileSync(join(peca, 'assets', 'avatar.jpg'), 'a', 'utf8');
    writeFileSync(join(peca, 'assets', 'fundo.jpg'), 'b', 'utf8');
    const midiaDir = join(raiz, 'projects', 'prj_vv', 'media');
    mkdirSync(midiaDir, { recursive: true });
    writeFileSync(join(midiaDir, 'clipe.mp4'), 'mp4', 'utf8');

    const r = montarPaginaDoKit({
      projectId: 'prj_vv',
      titulo: 'T',
      kit: {
        id: 'kit_vv',
        components: [
          {
            id: 'cmp_d',
            name: 'Depoimento',
            category: 'testimonials',
            kind: 'component',
            bundlePath: peca,
            designSystemId: 'ds_vv',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Depoimentos', componentIds: ['cmp_d'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      midia: [{ de: 'clipe.mp4', para: 'midia/clipe.mp4', secaoId: 'sec_1', kind: 'video' }],
      outputDir: join(raiz, 'saida'),
    });
    const html = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.match(html, /<video[^>]*class="w-full h-full[^"]*"/, 'o vídeo foi para a vaga grande');
    assert.ok(!/<video[^>]*class="w-10 h-10/.test(html), 'o avatar de 40px não recebe vídeo');
  } finally {
    if (anterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = anterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('nome da marca repetido lado a lado vira UM so', () => {
  // O dono fotografou "PROVA LOJA DE PRODUTO FISICO.PROVA LOJA DE PRODUTO
  // FISICO" e, num site, o nome TRIPLICADO. A causa: `nomesDaOrigem` quebra o
  // rotulo do dominio em tokens (`sanok-design` -> ['sanok','design']) e o
  // logotipo da origem escreve os dois juntos.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-nome-rep-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://sanok-design.aura.build/design-system' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<nav><span>sanok.design</span><a href="#">Sanok Design</a><p>The sanok design sanok</p></nav>
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
            id: 'cmp_n',
            name: 'Navegação',
            category: 'nav',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Navegação', componentIds: ['cmp_n'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Vitalis' },
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(index.includes('Vitalis'), 'a marca entrou');
    // Nenhuma colagem: nem com ponto, nem com espaco, nem tripla.
    assert.ok(!/Vitalis\s*\.\s*Vitalis/i.test(index), 'sem MARCA.MARCA');
    assert.ok(!/Vitalis\s+Vitalis/i.test(index), 'sem MARCA MARCA');
    assert.ok(!/(Vitalis[\s.·|/–—-]*){3}/i.test(index), 'sem MARCA MARCA MARCA');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('corDePaginaDaOrigem le os CINCO idiomas em que a cor de pagina mora', () => {
  // Medido nos 20 sites de prova: 270 dos 425 trechos que a S4 reprovava vinham
  // de a cor NAO ter sido lida. Sem cor o motor nao conclui "tema oposto" —
  // conclui nada, e o silencio cai no regime "temas combinam", que congela a
  // superficie da origem e mesmo assim resgata o texto. Meia migracao.

  // 1. bg-[#hex] no body (o unico que ja funcionava)
  assert.equal(corDePaginaDaOrigem('class="bg-[#050505] antialiased"'), '#050505');

  // 2. bg-[#hex] no HTML — 203 das 270 falhas moravam aqui
  assert.equal(corDePaginaDaOrigem('class="text-zinc-400"', '', 'class="bg-[#050505]"'), '#050505');

  // 3. body{background} na folha, com literal
  assert.equal(corDePaginaDaOrigem(undefined, 'body{background:#101014}'), '#101014');

  // 3b. html{background} tambem conta: e dele que a pagina herda
  assert.equal(corDePaginaDaOrigem(undefined, 'html{background-color:#0a0a0f}'), '#0a0a0f');

  // 4. body{background:var(--bg-0)} com a variavel na folha — 49 das 270
  assert.equal(
    corDePaginaDaOrigem(undefined, ':root{--bg-0:#07070a}body{background:var(--bg-0)}'),
    '#07070a',
  );

  // 4b. variavel encadeada
  assert.equal(
    corDePaginaDaOrigem(
      undefined,
      ':root{--base:#123456;--bg:var(--base)}body{background:var(--bg)}',
    ),
    '#123456',
  );

  // 5. classe NOMEADA na tag, resolvida na folha — 18 das 270
  assert.equal(
    corDePaginaDaOrigem('class="bg-white text-black"', '.bg-white{background-color:#ffffff}'),
    '#ffffff',
  );

  // O silencio continua sendo silencio: sem declaracao nenhuma, null.
  assert.equal(corDePaginaDaOrigem('class="text-sm"', '.x{color:#fff}'), null);
  assert.equal(corDePaginaDaOrigem(undefined, undefined), null);
});

test('a tag vence a folha: quem escreveu a classe ali decidiu', () => {
  assert.equal(corDePaginaDaOrigem('class="bg-[#111111]"', 'body{background:#eeeeee}'), '#111111');
});

test('cor de pagina com ALFA nao conta: fundo semitransparente nao e o chao', () => {
  assert.equal(corDePaginaDaOrigem(undefined, 'body{background:rgba(0,0,0,0.5)}'), null);
});

test('nome da origem: pula o subdominio de servico e casa o rotulo colado', () => {
  // Dois furos medidos pelo cetico do diagnostico. (1) `dominio.split('.')[0]`
  // devolvia "www" em www.marca.com — trocar "www" nao faz nada, e o nome da
  // outra empresa ficava no site. (2) `humanacademy.com` vira um token colado e
  // a pagina escreve "Human Academy": `\bhumanacademy\b` nao casa com isso.
  const raiz = mkdtempSync(join(tmpdir(), 'pagina-nomes-'));
  const rootAnterior = process.env.DS_ECOSYSTEM_ROOT;
  try {
    process.env.DS_ECOSYSTEM_ROOT = join(raiz, 'root');
    const dir = join(raiz, 'peca');
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ source: { url: 'https://www.humanacademy.com/design-system' } }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
<footer><h2>Human Academy</h2><p>© 2024 humanacademy</p></footer>
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
            name: 'Rodapé',
            category: 'footer',
            kind: 'component',
            bundlePath: dir,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        secoes: [{ id: 'sec_1', nome: 'Rodapé', componentIds: ['cmp_f'] }],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Vitalis' },
      outputDir: join(raiz, 'saida'),
    });

    const index = readFileSync(join(r.outputDir, 'index.html'), 'utf8');
    assert.ok(!/Human\s*Academy/i.test(index), 'o nome ESPACADO tambem sai');
    assert.ok(!/humanacademy/i.test(index), 'e o colado tambem');
    assert.ok(index.includes('Vitalis'), 'a marca entrou no lugar');
  } finally {
    if (rootAnterior === undefined) process.env.DS_ECOSYSTEM_ROOT = undefined;
    else process.env.DS_ECOSYSTEM_ROOT = rootAnterior;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a folha composta sai com as correcoes que nascem DEPOIS dela', () => {
  /**
   * A regressao que me enganou quatro vezes seguidas.
   *
   * `escrever('assets/styles.css', concatCss)` morava no meio da funcao, e
   * `concatCss` continuava crescendo depois: e abaixo daquela linha que a raiz
   * da peca volta ao fluxo e que o texto travado na opacidade inicial acende.
   * Tudo isso ia para uma string que ja tinha virado arquivo.
   *
   * O sintoma nunca foi um erro: era o NUMERO NAO MEXER. S13 saiu de 33/40
   * para 32/40 depois de um destravamento que, no papel, acendia centenas de
   * trechos. A conferencia estava certa; a folha e que nao tinha a correcao.
   */
  const raiz = mkdtempSync(join(tmpdir(), 'folha-tardia-'));
  try {
    const a = bundle(
      raiz,
      'navfixa',
      '<header class="fixed">menu do site</header>',
      '.fixed{position:fixed}',
    );
    const out = join(raiz, 'saida');
    montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'Folha',
      kit: {
        id: 'kit_f',
        components: [
          {
            id: 'cmp_a',
            name: 'Nav',
            category: 'nav',
            kind: 'component',
            bundlePath: a,
            designSystemId: 'ds_a',
          },
        ],
      },
      layout: ProjectLayout.parse({
        preferDesignSystemId: 'ds_a',
        secoes: [{ id: 's1', nome: 'Menu', papel: 'nav', componentIds: ['cmp_a'] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: out,
    });
    const estilos = readFileSync(join(out, 'assets', 'styles.css'), 'utf8');
    assert.match(
      estilos,
      /\[data-secao\] \[data-ds-corpo\]>\.fixed\{position:relative!important\}/,
      'a raiz da peca tem de voltar ao fluxo NA FOLHA, nao so na memoria',
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('nome de origem: a caixa decide, e a uniao alcanca a copy de outra peca', () => {
  /**
   * Dois defeitos do banco de prova, no mesmo mecanismo.
   *
   * 1. `luxury-real-estate-22` solta o token "real", e a pagina tem "metricas
   *    em tempo real" — portugues legitimo. Trocar isso escreveria "tempo
   *    MARCA" no meio da frase do cliente; acusar isso ensina a ignorar a
   *    regua. So a ocorrencia com MAIUSCULA e uso de marca.
   * 2. "Engine de Orquestracao Nexus" vivia numa peca da axion-ai com a
   *    nexus-architecture na mesma pagina: a troca por peca nunca tentou
   *    "nexus". A passada final usa a UNIAO das origens.
   */
  const raiz = mkdtempSync(join(tmpdir(), 'nome-origem-'));
  try {
    const a = bundle(
      raiz,
      'axion',
      '<section class="a"><h3>Engine de Orquestracao Nexus</h3><p>metricas em tempo real</p></section>',
      '.a{color:#111}',
    );
    // O manifesto e quem da o nome da origem — escreva um para a peca "nexus".
    const b = bundle(raiz, 'nexus', '<section class="b">outra peca</section>', '.b{color:#222}');
    writeFileSync(
      join(b, 'manifest.json'),
      JSON.stringify({
        source: { url: 'https://ds.catalogo.x/nexus-architecture.aura.build/design-system' },
      }),
      'utf8',
    );
    writeFileSync(
      join(a, 'manifest.json'),
      JSON.stringify({
        source: { url: 'https://ds.catalogo.x/luxury-real-estate-22.aura.build/design-system' },
      }),
      'utf8',
    );
    const out = join(raiz, 'saida');
    montarPaginaDoKit({
      projectId: 'prj_teste',
      titulo: 'Nomes',
      kit: {
        id: 'kit_n',
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
            category: 'cta',
            kind: 'component',
            bundlePath: b,
            designSystemId: 'ds_b',
          },
        ],
      },
      layout: ProjectLayout.parse({
        preferDesignSystemId: 'ds_a',
        secoes: [
          { id: 's1', nome: 'Hero', papel: 'hero', componentIds: ['cmp_a'] },
          { id: 's2', nome: 'CTA', papel: 'cta', componentIds: ['cmp_b'] },
        ],
      }),
      branding: { ...DEFAULT_PROJECT_BRANDING, brandName: 'Vila Forte' },
      outputDir: out,
    });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.ok(!/Orquestracao Nexus/.test(html), 'o Nexus maiusculo (marca de outra origem) sai');
    assert.match(html, /Orquestracao Vila Forte/, 'trocado pela marca do cliente');
    assert.match(html, /tempo real/, 'o "real" minusculo do portugues fica em paz');
    assert.ok(!/tempo Vila Forte/.test(html), 'a troca nao corrompe a frase do cliente');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
