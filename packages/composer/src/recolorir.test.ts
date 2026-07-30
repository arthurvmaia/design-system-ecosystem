import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClusterDeCor } from '@ds/shared';
import { mapaDeRecoloracao, recolorirCss } from './recolorir.js';

/**
 * A recoloração é o que faz a paleta da marca vencer de verdade — medido no
 * site real: 712 literais de cor e ZERO consumo de `--marca-*`. Cada teste
 * aqui protege uma das propriedades que sustentam o mecanismo.
 */

const cluster = (over: Partial<ClusterDeCor>): ClusterDeCor => ({
  papel: 'primary',
  corCanonica: '#0d3c1f',
  confianca: 0.8,
  membros: [{ literal: '#0d3c1f', hexOpaco: '#0d3c1f', ocorrencias: 1, contexto: 'bg' }],
  ...over,
});

const MAPA = new Map([
  ['#0d3c1f', 'primary' as const],
  ['#f69066', 'accent' as const],
]);

test('opaco vira var() com o literal de fallback', () => {
  const r = recolorirCss('.a{color:#0d3c1f}', MAPA);
  assert.equal(r.css, '.a{color:var(--marca-primary, #0d3c1f)}');
  assert.equal(r.reescritas, 1);
});

test('alfa em var() do Tailwind vira sintaxe relativa — o caso medido', () => {
  const r = recolorirCss('.b{background-color:rgb(13 60 31 / var(--tw-bg-opacity, 1))}', MAPA);
  assert.equal(
    r.css,
    '.b{background-color:rgb(from var(--marca-primary, #0d3c1f) r g b / var(--tw-bg-opacity, 1))}',
  );
});

test('cor sem papel no mapa fica intocada', () => {
  const r = recolorirCss('.c{color:#123456}', MAPA);
  assert.equal(r.css, '.c{color:#123456}');
  assert.equal(r.mantidas, 1);
});

test('hex dentro de url() NUNCA é tocado', () => {
  const css = `.d{background-image:url("data:image/svg+xml,%3Cpath fill='%230d3c1f'/%3E");color:#0d3c1f}`;
  const r = recolorirCss(css, MAPA);
  assert.ok(r.css.includes(`%230d3c1f'`), 'o data-uri segue intacto');
  assert.ok(r.css.includes('var(--marca-primary, #0d3c1f)'), 'a cor de verdade foi reescrita');
});

test('gradiente reescreve cada cor separadamente', () => {
  const r = recolorirCss('.e{background:linear-gradient(90deg, #0d3c1f, #f69066)}', MAPA);
  assert.equal(
    r.css,
    '.e{background:linear-gradient(90deg, var(--marca-primary, #0d3c1f), var(--marca-accent, #f69066))}',
  );
  assert.equal(r.reescritas, 2);
});

test('IDEMPOTÊNCIA: recolorir duas vezes = uma', () => {
  const uma = recolorirCss('.f{color:#0d3c1f}', MAPA);
  const duas = recolorirCss(uma.css, MAPA);
  assert.equal(duas.css, uma.css);
  assert.equal(duas.reescritas, 0);
});

test('INVARIANTE: a recoloração nunca DECLARA --marca-*, só consome', () => {
  // É este invariante que garante que o :root do marca.css alcança as peças
  // por herança: a origem não declara nada no namespace, então o proxy não
  // tem o que interceptar. Se um dia alguém fizer a recoloração declarar,
  // o defeito de herança do escopo (documentado em escopo.ts) volta por aqui.
  const r = recolorirCss('.g{color:#0d3c1f;background:#f69066}', MAPA);
  assert.ok(!/--marca-[a-z-]+\s*:/.test(r.css), 'nenhuma DECLARAÇÃO de --marca-*');
  assert.ok(/var\(--marca-/.test(r.css), 'só consumo');
});

test('mapa vazio devolve o CSS intacto sem custo', () => {
  const r = recolorirCss('.h{color:#0d3c1f}', new Map());
  assert.equal(r.css, '.h{color:#0d3c1f}');
});

test('CSS quebrado degrada com aviso, não com exceção', () => {
  const r = recolorirCss('isto { não é css', MAPA);
  assert.equal(r.css, 'isto { não é css');
  assert.equal(r.avisos.length, 1);
});

test('mapaDeRecoloracao respeita papel null e o limiar de confiança', () => {
  const mapa = mapaDeRecoloracao([
    cluster({}),
    cluster({
      papel: null,
      corCanonica: '#111111',
      membros: [{ literal: '#111111', hexOpaco: '#111111', ocorrencias: 1, contexto: 'text' }],
    }),
    cluster({
      papel: 'accent',
      confianca: 0.3,
      corCanonica: '#222222',
      membros: [{ literal: '#222222', hexOpaco: '#222222', ocorrencias: 1, contexto: 'text' }],
    }),
  ]);
  assert.equal(mapa.get('#0d3c1f'), 'primary');
  assert.equal(mapa.get('#111111'), undefined, 'papel null fica de fora');
  assert.equal(mapa.get('#222222'), undefined, 'confiança abaixo do limiar fica de fora');
});
