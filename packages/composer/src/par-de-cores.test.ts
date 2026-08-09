import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrasteEntre,
  corrigirParesDeCor,
  mapearClassesPorPapel,
  tintaQueSeLeSobre,
} from './par-de-cores.js';

/** A paleta MEDIDA no kit que reprovou: marca escura, acento âmbar. */
const TOKENS = {
  background: '#1a1210',
  surface: '#241a16',
  heading: '#faf3ec',
  body: '#c9b8ac',
  muted: '#a6a6a6',
  primary: '#d4552a',
  'primary-foreground': '#ffffff',
  accent: '#e8a33c',
};

const CSS = `
.text-stone-900{color:var(--marca-heading, #1c1917)}
.text-stone-700{color:var(--marca-body, #44403c)}
.bg-\\[\\#FBFCD4\\]{background-color:var(--marca-accent, #fbfcd4)}
.bg-marca{background:var(--marca-primary, #d4552a)}
`;

test('o caso medido: o par cai de 16,64:1 para 1,96:1 e cada lado passa sozinho', () => {
  assert.ok((contrasteEntre('#FBFCD4', '#1c1917') ?? 0) > 16, 'na origem o par era otimo');
  const depois = contrasteEntre(TOKENS.accent, TOKENS.heading) ?? 0;
  assert.ok(depois < 2, `o par migrado colapsa (${depois.toFixed(2)}:1)`);
  assert.ok((contrasteEntre(TOKENS.heading, TOKENS.background) ?? 0) > 3, 'a tinta passa sozinha');
  assert.ok((contrasteEntre(TOKENS.accent, TOKENS.background) ?? 0) > 3, 'o fundo passa sozinho');
});

test('o mapa le classe -> papel do CSS ja recolorido', () => {
  const m = mapearClassesPorPapel(CSS);
  assert.equal(m.tinta.get('text-stone-900'), 'heading');
  assert.equal(m.tinta.get('text-stone-700'), 'body');
  assert.equal(m.fundo.get('bg-[#FBFCD4]'), 'accent');
  assert.equal(m.fundo.get('bg-marca'), 'primary');
});

test('seletor composto NAO entra no mapa: ele depende de um ancestral', () => {
  const m = mapearClassesPorPapel('.pai .filho{color:var(--marca-heading)}');
  assert.equal(m.tinta.size, 0);
});

test('o par que colapsa e corrigido, e a correcao troca a TINTA', () => {
  const html = '<button class="bg-[#FBFCD4] text-stone-900">Tornar-se Membro</button>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 1);
  assert.equal(r.corrigidos[0]?.papelDoFundo, 'accent');
  assert.equal(r.corrigidos[0]?.papelAntes, 'heading');
  assert.ok(r.html.includes('style="color:var(--marca-'), 'sai como style no elemento');
  assert.ok(!r.html.includes('!important'), 'style ja vence a cascata');
  assert.ok(r.html.includes('bg-[#FBFCD4]'), 'o FUNDO fica: ele e a superficie da regiao');
});

test('a tinta escolhida realmente se le sobre aquele fundo', () => {
  const html = '<span class="bg-[#FBFCD4] text-stone-900">x</span>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  const papel = /var\(--marca-([a-z-]+)\)/.exec(r.html)?.[1] ?? '';
  const hex = (TOKENS as Record<string, string>)[papel];
  assert.ok(hex, `papel ${papel} existe na paleta`);
  assert.ok((contrasteEntre(hex, TOKENS.accent) ?? 0) >= 3, 'o par novo passa do piso');
});

test('par que ja passa NAO e tocado', () => {
  const html = '<button class="bg-marca text-stone-900">ok</button>';
  // primary #d4552a x heading #faf3ec passa folgado
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0);
  assert.equal(r.html, html);
});

test('elemento com color no style fica intocado: alguem ja decidiu ali', () => {
  const html =
    '<button class="bg-[#FBFCD4] text-stone-900" style="color:var(--marca-background)">x</button>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0);
});

test('style que existe sem color recebe a correcao SEM perder o que tinha', () => {
  const html = '<div class="bg-[#FBFCD4] text-stone-900" style="padding:1rem">x</div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.ok(r.html.includes('padding:1rem'), 'o que estava ali continua');
  assert.ok(r.html.includes('color:var(--marca-'));
});

test('elemento so com tinta, sem fundo, nao e par e nao e mexido', () => {
  const html = '<p class="text-stone-900">so texto</p>';
  assert.equal(corrigirParesDeCor(html, CSS, TOKENS).corrigidos.length, 0);
});

test('paleta impossivel nao piora nada: sem tinta que se leia, nada muda', () => {
  const cinza = { accent: '#808080', heading: '#7f7f7f', body: '#818181' };
  const html = '<b class="bg-[#FBFCD4] text-stone-900">x</b>';
  const r = corrigirParesDeCor(html, CSS, cinza);
  assert.equal(r.corrigidos.length, 0);
  assert.equal(r.html, html);
});

test('tintaQueSeLeSobre prefere a tinta de contraste do proprio papel', () => {
  assert.equal(tintaQueSeLeSobre('primary', TOKENS), 'primary-foreground');
});

test('sem CSS mapeado o HTML volta inteiro, sem varredura a toa', () => {
  const html = '<div class="bg-[#FBFCD4] text-stone-900">x</div>';
  assert.equal(corrigirParesDeCor(html, '', TOKENS).html, html);
});
