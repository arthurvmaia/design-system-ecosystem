import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escoparCss, nomesGlobaisDe } from './escopo.js';

/**
 * Duas origens, a mesma família, arquivos diferentes.
 *
 * O teste de unidade prova o renomeio; este prova o CICLO — que é onde o defeito
 * de verdade morava. `escoparCss` aceitava `nomesUsados.fontFace` desde sempre,
 * `nomesGlobaisDe` coletava a família desde sempre, e `pagina.ts` acumulava o
 * conjunto desde sempre. Ninguém LIA. O tipo prometia
 * `renomeados: {tipo: 'font-face'}` e esse valor nunca era emitido.
 *
 * Sem o ciclo fechado, o site composto carrega dois `@font-face` com o mesmo
 * nome: o segundo vence, e a peça da primeira origem sai com a fonte da
 * segunda. Nenhum erro no console, nenhuma regra morta — só a letra errada.
 *
 * Medido no acervo real: `ds.asimov.academy` e `futureui` declaram Inter, com
 * `src` diferente. Este cenário é o que estava em disco.
 */

const CSS_ORIGEM_A = `
@font-face{font-family:"Inter";src:url(inter-a.woff2) format("woff2")}
.titulo{font-family:"Inter",sans-serif;font-weight:700}
`;

const CSS_ORIGEM_B = `
@font-face{font-family:"Inter";src:url(inter-b.woff2) format("woff2")}
@font-face{font-family:"Space Grotesk";src:url(space.woff2) format("woff2")}
.headline{font-family:"Inter",system-ui}
.display{font-family:"Space Grotesk",serif}
`;

/** Compõe as duas na ordem em que a página as carregaria. */
const comporDuas = () => {
  const usados = {
    keyframes: new Set<string>(),
    fontFace: new Set<string>(),
    layer: new Set<string>(),
  };

  const a = escoparCss(CSS_ORIGEM_A, {
    raiz: 'data-ds-raiz="a"',
    corpo: 'data-ds-corpo="a"',
    sufixo: 'a',
    nomesUsados: usados,
  });
  for (const n of nomesGlobaisDe(CSS_ORIGEM_A).fontFace) usados.fontFace.add(n);

  const b = escoparCss(CSS_ORIGEM_B, {
    raiz: 'data-ds-raiz="b"',
    corpo: 'data-ds-corpo="b"',
    sufixo: 'b',
    nomesUsados: usados,
  });
  for (const n of nomesGlobaisDe(CSS_ORIGEM_B).fontFace) usados.fontFace.add(n);

  return { a, b, folha: `${a.css}\n${b.css}` };
};

test('a primeira origem mantém o nome; a segunda é que se desloca', () => {
  // Quem chegou primeiro não paga pelo conflito. Renomear as duas encheria a
  // folha de sufixos sem necessidade, e mudaria uma peça que estava certa.
  const { a, b } = comporDuas();
  assert.equal(a.renomeados.length, 0);
  assert.deepEqual(b.renomeados, [{ tipo: 'font-face', de: 'Inter', para: 'Inter--b' }]);
});

test('cada origem termina apontando para o SEU arquivo de fonte', () => {
  // O defeito, em uma asserção: sem o renomeio, os dois `@font-face` disputam o
  // nome `Inter` e o último a carregar responde pelos dois.
  const { folha } = comporDuas();

  const blocos = [...folha.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1] ?? '');
  const inter = blocos.filter((b) => /inter/i.test(b));
  assert.equal(inter.length, 2, 'as duas declarações continuam existindo');

  const nomes = inter.map((b) => (b.match(/font-family:\s*"?([^";]+)"?/) ?? [])[1]);
  assert.equal(new Set(nomes).size, 2, `os dois @font-face ainda colidem: ${nomes.join(' e ')}`);

  // E cada nome está ligado ao arquivo certo.
  const comA = inter.find((b) => b.includes('inter-a.woff2')) ?? '';
  const comB = inter.find((b) => b.includes('inter-b.woff2')) ?? '';
  assert.match(comA, /font-family:\s*"?Inter"?\s*;/);
  assert.match(comB, /Inter--b/);
});

test('o uso de cada origem segue a fonte da própria origem', () => {
  const { a, b } = comporDuas();
  // A origem A pede Inter — a dela, que manteve o nome.
  assert.match(a.css, /\.titulo[^}]*font-family:\s*"?Inter"?\s*,/);
  // A origem B pede a versão renomeada, senão cairia na fonte da A.
  assert.match(b.css, /Inter--b/);
  assert.ok(!/font-family:"Inter",system-ui/.test(b.css), `B ficou pedindo a fonte de A: ${b.css}`);
});

test('a família que só existe numa origem não é tocada', () => {
  const { b } = comporDuas();
  assert.ok(b.css.includes('"Space Grotesk"'), `renomeou sem colisão: ${b.css}`);
  assert.ok(!b.css.includes('Space Grotesk--b'));
});

test('as pilhas de fallback sobrevivem às duas', () => {
  const { folha } = comporDuas();
  assert.ok(folha.includes('sans-serif'));
  assert.ok(folha.includes('system-ui'));
  assert.ok(folha.includes('serif'));
});
