import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RuntimeDetection } from '@ds/shared';
import type { RawJsInline } from '../mapper/raw.js';
import {
  ORDEM_CSS,
  animacoesReferenciadas,
  classificarBlocoCss,
  fatiarCss,
  organizarCss,
  podemColidir,
} from './css-organize.js';
import { classificarJs, organizarJs, podeUnir, tagsDeScript } from './js-organize.js';
import { detectarFerramentas, montarStack, renderizarStackMd } from './stack.js';

// ── Fatiamento de CSS ───────────────────────────────────────────────────────

test('fatiarCss conta chaves — @media aninhado não parte no lugar errado', () => {
  const css = '.a{color:red}@media (min-width:640px){.b{color:blue}.c{color:green}}.d{color:#000}';
  const blocos = fatiarCss(css);
  assert.equal(blocos.length, 3);
  assert.equal(blocos[0]?.prelude, '.a');
  assert.ok(blocos[1]?.prelude.startsWith('@media'));
  assert.ok(blocos[1]?.texto.includes('.c{color:green}'), 'o @media leva o corpo inteiro');
  assert.equal(blocos[2]?.prelude, '.d');
});

test('chave dentro de string não parte o bloco', () => {
  const blocos = fatiarCss('.a::after{content:"}"}.b{color:red}');
  assert.equal(blocos.length, 2, 'o `}` dentro da string não deve fechar a regra');
  assert.equal(blocos[1]?.prelude, '.b');
});

test('chave dentro de comentário não parte o bloco', () => {
  const blocos = fatiarCss('.a{color:red /* } */}.b{color:blue}');
  assert.equal(blocos.length, 2);
});

test('at-rule sem corpo é preservada como bloco próprio', () => {
  const blocos = fatiarCss('@charset "utf-8";@import url(a.css);.a{color:red}');
  assert.equal(blocos.length, 3);
  assert.equal(blocos[0]?.corpo, null);
  assert.equal(blocos[1]?.corpo, null);
});

test('CSS truncado é preservado em vez de descartado', () => {
  const blocos = fatiarCss('.a{color:red}.b{color:blue');
  assert.equal(blocos.length, 2, 'a regra sem `}` não pode simplesmente desaparecer');
});

test('aspas ESCAPADAS no seletor arbitrário do Tailwind não abrem string fantasma', () => {
  // O caso real que matou a folha da prévia do kit: `.bg-\[url\(\'data\:…\'\)\]`
  // tem `\'` no NOME DA CLASSE. Sem tratar `\` fora de string, o fatiador
  // entrava numa string que não existe, engolia o `{` de verdade dentro dela e
  // cortava o bloco no `;` do url() — colando `\n\n` no meio de uma string CSS,
  // o que mata o parse do navegador dali até o fim do arquivo.
  const seletor = String.raw`.bg-\[url\(\'data\:image\/svg\+xml\;base64\2c QUJD\'\)\]`;
  const css = `${seletor}{background-image:url('data:image/svg+xml;base64,QUJD')}.depois{color:red}`;
  const blocos = fatiarCss(css);
  assert.equal(blocos.length, 2, 'o bloco arbitrário e o seguinte, nada fatiado no meio');
  assert.equal(blocos[0]?.prelude, seletor);
  assert.ok(
    blocos[0]?.corpo?.includes("url('data:image/svg+xml;base64,QUJD')"),
    'a declaração atravessa inteira, sem corte no `;` interno',
  );
  assert.equal(blocos[1]?.prelude, '.depois');
});

// ── Classificação ───────────────────────────────────────────────────────────

test('classificação: tokens, animações, interações, runtime e layout', () => {
  assert.equal(classificarBlocoCss(':root', '--x: 1px', ['--x']), 'tokens');
  assert.equal(classificarBlocoCss('@font-face', 'src:url(a.woff2)', ['src']), 'tokens');
  assert.equal(classificarBlocoCss('@keyframes girar', 'from{}', []), 'animations');
  assert.equal(classificarBlocoCss('.btn:hover', 'color:red', ['color']), 'interactions');
  assert.equal(
    classificarBlocoCss('[data-state="open"] .painel', 'display:block', ['display']),
    'interactions',
  );
  assert.equal(classificarBlocoCss('canvas', 'width:100%', ['width']), 'runtime');
  assert.equal(classificarBlocoCss('body', 'margin:0', ['margin']), 'layout');
  assert.equal(
    classificarBlocoCss('.card', 'box-shadow:0 0 4px #000', ['box-shadow']),
    'components',
  );
  assert.equal(classificarBlocoCss('.x', 'transition:all .3s', ['transition']), 'animations');
});

test('@media herda a natureza do corpo, em vez de virar layout por padrão', () => {
  assert.equal(
    classificarBlocoCss('@media (hover:hover)', '.a:hover{color:red}', []),
    'interactions',
  );
  assert.equal(classificarBlocoCss('@media screen', '.a{animation:x 1s}', []), 'animations');
  assert.equal(classificarBlocoCss('@media screen', '.a{display:grid}', []), 'layout');
});

// ── Divisão segura ──────────────────────────────────────────────────────────

test('CSS sem conflito é dividido, e cada arquivo preserva a ordem original', () => {
  const css = [
    ':root{--brand:#7c3aed}',
    'body{margin:0}',
    '.card{box-shadow:0 0 4px #000}',
    '.card2{border-radius:8px}',
    '@keyframes girar{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
    '.btn:hover{opacity:.8}',
  ].join('\n');
  const r = organizarCss(css);
  assert.equal(r.dividido, true);
  const caminhos = r.arquivos.map((a) => a.caminho);
  assert.deepEqual(caminhos, [
    'assets/css/tokens.css',
    'assets/css/layout.css',
    'assets/css/components.css',
    'assets/css/animations.css',
    'assets/css/interactions.css',
  ]);
  const components = r.arquivos.find((a) => a.responsabilidade === 'components');
  assert.ok(components);
  assert.ok(
    components.conteudo.indexOf('.card{') < components.conteudo.indexOf('.card2{'),
    'a ordem original tem de sobreviver dentro do arquivo',
  );
});

test('conflito real de cascata: NÃO divide, e diz por quê', () => {
  // `.btn` em components (box-shadow) depois de `.btn` em interactions (:hover)
  // não conflita; o caso que conflita é o mesmo seletor com a mesma propriedade,
  // em que a ordem decide o vencedor.
  const css = ['.x:hover{color:red}', '.x{color:blue}'].join('\n');
  const r = organizarCss(css);
  assert.equal(r.dividido, false, 'dividir inverteria `.x:hover` e `.x` em `color`');
  assert.equal(r.arquivos.length, 1);
  assert.equal(r.arquivos[0]?.caminho, 'assets/css/styles.css');
  assert.ok(r.motivo?.includes('alteraria a cascata'));
  assert.ok(r.inversoes.length > 0);
  assert.equal(r.inversoes[0]?.propriedade, 'color');
  // E o conteúdo tem de sair inteiro, na ordem.
  assert.ok(
    r.arquivos[0]?.conteudo.indexOf(':hover') < (r.arquivos[0]?.conteudo.indexOf('.x{') ?? 0),
  );
});

test('nada é minificado nem removido na organização', () => {
  const css = '/* comentário importante */\n.a {\n  color: red;\n}\n';
  const r = organizarCss(css);
  const tudo = r.arquivos.map((a) => a.conteudo).join('\n');
  assert.ok(tudo.includes('comentário importante'), 'comentário preservado');
  assert.ok(/color:\s*red/.test(tudo));
});

test('a ordem de carregamento dos arquivos é o contrato da cascata', () => {
  assert.deepEqual(ORDEM_CSS, [
    'tokens',
    'layout',
    'components',
    'animations',
    'interactions',
    'runtime',
  ]);
});

test('podemColidir é conservador: mesma chave final conta como colisão', () => {
  assert.equal(podemColidir('.card p', 'p'), true);
  assert.equal(podemColidir('.a', '.a'), true);
  assert.equal(podemColidir('.a', '.b'), false);
  assert.equal(podemColidir('header .logo', 'footer .logo'), true);
});

test('animacoesReferenciadas ignora palavras-chave e pega o nome', () => {
  const usadas = animacoesReferenciadas(
    '.a{animation: girar 2s linear infinite}.b{animation-name:pulsar}',
  );
  assert.deepEqual(usadas.sort(), ['girar', 'pulsar']);
});

// ── JavaScript ──────────────────────────────────────────────────────────────

const js = (over: Partial<RawJsInline> & { content: string; ordem: number }): RawJsInline => ({
  type: '',
  module: false,
  dados: false,
  bytes: over.content.length,
  async: false,
  defer: false,
  ...over,
});

test('classificação de JS procura API, não nome de variável', () => {
  assert.equal(classificarJs('const scroll = 1;', false), 'bootstrap');
  assert.equal(classificarJs('new IntersectionObserver(cb)', false), 'scroll');
  assert.equal(classificarJs("el.addEventListener('click', f)", false), 'interactions');
  assert.equal(classificarJs('gsap.to(x,{y:1})', false), 'animations');
  assert.equal(classificarJs('new THREE.Scene()', false), 'runtime');
  assert.equal(classificarJs("c.getContext('webgl')", false), 'runtime');
  assert.equal(classificarJs('{"@context":"schema.org"}', true), 'dados');
});

test('JSON-LD nunca vira arquivo .js — viraria erro de sintaxe e sumiria do head', () => {
  const r = organizarJs([
    js({
      content: '{"@context":"https://schema.org","@type":"Organization"}',
      ordem: 0,
      type: 'application/ld+json',
      dados: true,
    }),
    js({ content: "document.addEventListener('click', () => {})", ordem: 1 }),
  ]);
  assert.equal(r.arquivos.length, 1);
  assert.equal(r.arquivos[0]?.responsabilidade, 'interactions');
  assert.equal(r.inline.length, 1);
  assert.equal(r.inline[0]?.type, 'application/ld+json');
  assert.ok(r.notas.some((n) => /JSON-LD/.test(n)));
});

test('scripts adjacentes da mesma responsabilidade são unidos; a ordem é preservada', () => {
  const r = organizarJs([
    js({ content: "a.addEventListener('click',f)", ordem: 0 }),
    js({ content: "b.addEventListener('click',g)", ordem: 1 }),
  ]);
  assert.equal(r.arquivos.length, 1);
  assert.equal(r.arquivos[0]?.unidos, 2);
  const conteudo = r.arquivos[0]?.conteudo ?? '';
  assert.ok(
    conteudo.indexOf('a.add') < conteudo.indexOf('b.add'),
    'unir não pode reordenar: o primeiro script continua primeiro',
  );
  assert.ok(
    conteudo.includes('\n;\n'),
    'o separador impede que a última expressão engula a próxima',
  );
});

test('módulo e script clássico NUNCA são unidos — escopo diferente', () => {
  assert.equal(
    podeUnir(js({ content: 'x', ordem: 0, module: true }), js({ content: 'y', ordem: 1 }), true),
    false,
  );
  const r = organizarJs([
    js({ content: "import x from './a.js'", ordem: 0, module: true, type: 'module' }),
    js({ content: 'var y = 1', ordem: 1 }),
  ]);
  assert.equal(r.arquivos.length, 2);
  assert.equal(r.arquivos[0]?.module, true);
  assert.equal(r.arquivos[1]?.module, false);
});

test('async/defer diferentes não são unidos — mudaria QUANDO o script roda', () => {
  const r = organizarJs([
    js({ content: "a.addEventListener('click',f)", ordem: 0, defer: true }),
    js({ content: "b.addEventListener('click',g)", ordem: 1, defer: false }),
  ]);
  assert.equal(r.arquivos.length, 2);
  assert.ok(r.notas.some((n) => /async\/defer/.test(n)));
});

test('scripts da mesma responsabilidade separados por outro tipo mantêm a ordem numerada', () => {
  const r = organizarJs([
    js({ content: "a.addEventListener('click',f)", ordem: 0 }),
    js({ content: 'gsap.to(x,{})', ordem: 1 }),
    js({ content: "b.addEventListener('click',g)", ordem: 2 }),
  ]);
  assert.equal(r.arquivos.length, 3);
  assert.equal(r.arquivos[0]?.caminho, 'assets/js/interactions.js');
  assert.equal(r.arquivos[1]?.caminho, 'assets/js/animations.js');
  assert.equal(
    r.arquivos[2]?.caminho,
    'assets/js/interactions-02.js',
    'o segundo grupo de interações precisa carregar DEPOIS das animações',
  );
});

test('as tags de script preservam type/async/defer', () => {
  const r = organizarJs([
    js({ content: "import a from './x'", ordem: 0, module: true }),
    js({ content: 'var z=1', ordem: 1, defer: true }),
  ]);
  const tags = tagsDeScript(r.arquivos);
  assert.ok(tags.includes('type="module"'));
  assert.ok(tags.includes(' defer'));
});

// ── STACK ───────────────────────────────────────────────────────────────────

const rt = (over: Partial<RuntimeDetection>): RuntimeDetection => ({
  id: 'rt_1',
  kind: 'three',
  label: 'THREE',
  evidence: ['global window.THREE'],
  confidence: 'alta',
  scripts: [],
  targets: [],
  assets: [],
  encapsulable: true,
  limitations: [],
  ...over,
});

test('runtime sem evidência não entra no STACK', () => {
  assert.equal(montarStack([rt({ evidence: [] })], []).length, 0);
});

test('o STACK ordena por confiança e marca o que é indício', () => {
  const stack = montarStack(
    [
      rt({
        id: 'rt_1',
        kind: 'gsap',
        label: 'gsap',
        confidence: 'baixa',
        evidence: ['script src /gsap.js'],
      }),
      rt({ id: 'rt_2', kind: 'three', label: 'THREE', confidence: 'alta', version: '160' }),
    ],
    [],
  );
  assert.equal(stack[0]?.name, 'THREE 160');
  assert.equal(stack[0]?.runtimeRequired, true);
  assert.equal(stack[1]?.confidence, 'baixa');
  const md = renderizarStackMd(stack, { url: 'https://x.test/', capturadoEm: Date.now() });
  assert.ok(md.includes('_(indício)_'));
  assert.ok(md.includes('necessário em execução'));
  assert.ok(md.includes('evidência:'));
});

test('STACK vazio diz que é HTML e CSS, em vez de inventar', () => {
  const md = renderizarStackMd([], { url: null, capturadoEm: Date.now() });
  assert.ok(md.includes('HTML e CSS'));
});

test('Tailwind exige VOLUME de utilitários; uma classe `flex` não basta', () => {
  const poucas = detectarFerramentas({ html: '<div class="flex">x</div>', css: '', scripts: [] });
  assert.equal(poucas.length, 0);

  const muitas = detectarFerramentas({
    html: Array.from(
      { length: 60 },
      (_, i) => `<div class="md:flex p-${i % 8} w-full">x</div>`,
    ).join(''),
    css: '',
    scripts: [],
  });
  assert.ok(muitas.some((f) => /Tailwind/.test(f.nome)));
  assert.notEqual(muitas.find((f) => /Tailwind/.test(f.nome))?.confidence, 'alta');
});

test('--tw-* no CSS compilado eleva a confiança do Tailwind', () => {
  const r = detectarFerramentas({ html: '', css: '.x{--tw-ring-color:red}', scripts: [] });
  assert.equal(r.find((f) => f.nome === 'Tailwind CSS')?.confidence, 'media');
});

test('Next.js é evidência alta (marcador do próprio framework)', () => {
  const r = detectarFerramentas({
    html: '<script id="__NEXT_DATA__">{}</script>',
    css: '',
    scripts: [],
  });
  assert.equal(r.find((f) => f.nome === 'Next.js')?.confidence, 'alta');
});

test('@font-face vira entrada de tipografia com as famílias reais', () => {
  const r = detectarFerramentas({
    html: '',
    css: '@font-face{font-family:"Satoshi";src:url(a.woff2)}',
    scripts: [],
  });
  const fonte = r.find((f) => /Fontes próprias/.test(f.nome));
  assert.ok(fonte);
  assert.ok(fonte.uso.includes('Satoshi'));
  assert.equal(fonte.confidence, 'alta');
});
