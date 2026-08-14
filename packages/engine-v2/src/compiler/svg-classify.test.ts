import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classificarSvg, isolarIdsSvg } from './svg-classify.js';

test('ícone Lucide é reconhecido pela assinatura do markup, não pelo nome do arquivo', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right"><path d="M5 12h14"/></svg>';
  const c = classificarSvg(svg);
  assert.equal(c.categoria, 'A-icone-conhecido');
  assert.equal(c.biblioteca, 'lucide');
  assert.equal(c.icone, 'arrow-right');
  assert.equal(c.inline, true);
});

test('sem o runtime da biblioteca no bundle, a categoria A avisa que não presume instalação', () => {
  const svg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
  const semRuntime = classificarSvg(svg, { runtimeDeIconesDisponivel: false });
  assert.ok(
    semRuntime.motivos.some((m) => /NÃO está no bundle/.test(m)),
    `motivos: ${semRuntime.motivos.join(' | ')}`,
  );
  assert.equal(semRuntime.inline, true, 'sem runtime, o fallback inline é obrigatório');

  const comRuntime = classificarSvg(svg, { runtimeDeIconesDisponivel: true });
  assert.ok(comRuntime.motivos.some((m) => /referência semântica é segura/.test(m)));
});

test('currentColor mantém o SVG inline — virar <img> congelaria a cor', () => {
  const c = classificarSvg(
    '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M0 0h20v20H0z"/></svg>',
  );
  assert.equal(c.categoria, 'B-herda-cor');
  assert.equal(c.inline, true);
});

test('SVG sem fill nem stroke herda do CSS e fica inline', () => {
  const c = classificarSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  assert.equal(c.categoria, 'B-herda-cor');
  assert.ok(c.motivos.some((m) => /vem do CSS/.test(m)));
});

test('var(--cor) conta como herança de tema', () => {
  const c = classificarSvg(
    '<svg viewBox="0 0 10 10"><rect fill="var(--brand)" width="10" height="10"/></svg>',
  );
  assert.equal(c.categoria, 'B-herda-cor');
});

test('cor muda por hover: inline mesmo com cor fixa no markup', () => {
  const svg = '<svg viewBox="0 0 10 10"><rect fill="#ff0000" width="10" height="10"/></svg>';
  assert.equal(classificarSvg(svg).categoria, 'C-asset-fixo');
  assert.equal(classificarSvg(svg, { corMudaPorEstado: true }).categoria, 'B-herda-cor');
});

test('ilustração grande de cores fixas vira asset', () => {
  const grande = `<svg viewBox="0 0 600 400">${'<path fill="#123456" d="M0 0h10v10H0z"/>'.repeat(80)}</svg>`;
  const c = classificarSvg(grande);
  assert.equal(c.categoria, 'C-asset-fixo');
  assert.equal(c.inline, false, 'grande e fixo deve sair do HTML');
});

test('SVG pequeno de cor fixa continua inline — um arquivo por ícone não vale a requisição', () => {
  const c = classificarSvg('<svg viewBox="0 0 8 8"><rect fill="#000" width="8" height="8"/></svg>');
  assert.equal(c.categoria, 'C-asset-fixo');
  assert.equal(c.inline, true);
});

test('SMIL força inline e é registrado como animado', () => {
  const c = classificarSvg(
    '<svg viewBox="0 0 10 10"><rect fill="#f00" width="10" height="10"><animate attributeName="opacity" values="0;1" dur="2s"/></rect></svg>',
  );
  assert.equal(c.animado, true);
  assert.equal(c.inline, true);
  assert.equal(c.categoria, 'B-herda-cor');
});

test('sprite: os fragmentos usados são registrados para viajarem junto', () => {
  const c = classificarSvg('<svg><use href="#icone-menu"/></svg>');
  assert.equal(c.usaSprite, true);
  assert.deepEqual(c.fragmentos, ['icone-menu']);
  assert.equal(c.inline, true);
});

test('url(#id) de filtro/gradiente também conta como fragmento', () => {
  const c = classificarSvg(
    '<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/></svg>',
  );
  assert.ok(c.fragmentos.includes('g'));
  assert.equal(c.temIdsInternos, true);
});

test('o rótulo acessível não se perde na classificação', () => {
  const porAria = classificarSvg('<svg aria-label="Buscar" viewBox="0 0 10 10"><path/></svg>');
  assert.equal(porAria.rotuloAcessivel, 'Buscar');
  const porTitle = classificarSvg('<svg viewBox="0 0 10 10"><title>Fechar</title><path/></svg>');
  assert.equal(porTitle.rotuloAcessivel, 'Fechar');
});

test('isolarIdsSvg reescreve declaração e referência juntas', () => {
  const svg =
    '<svg><defs><linearGradient id="a"/><filter id="blur"/></defs><rect fill="url(#a)" filter="url(#blur)"/><use href="#a"/></svg>';
  const out = isolarIdsSvg(svg, 'seg1');
  assert.ok(out.includes('id="seg1-a"'));
  assert.ok(out.includes('url(#seg1-a)'));
  assert.ok(out.includes('id="seg1-blur"'));
  assert.ok(out.includes('url(#seg1-blur)'));
  assert.ok(out.includes('href="#seg1-a"'));
  assert.ok(!/id="a"/.test(out), 'nenhum id original deve sobrar');
});

test('isolarIdsSvg não mexe em SVG sem ids', () => {
  const svg = '<svg><path d="M0 0h1v1H0z"/></svg>';
  assert.equal(isolarIdsSvg(svg, 'x'), svg);
});

test('id que ninguém referencia fica INTOCADO: é por ele que o script acha o elemento', () => {
  const svg = '<svg id="pipeline-svg"><path id="pipeline-path-glow"/></svg>';
  const out = isolarIdsSvg(svg, 'seg6-svg1');
  assert.ok(out.includes('id="pipeline-svg"'), 'o id do svg não participa de url(#) e não colide');
  assert.ok(out.includes('id="pipeline-path-glow"'));
  assert.ok(!out.includes('seg6-svg1-'), 'nada a prefixar quando nada é referenciado');
});

test('mistura: prefixa o gradiente e deixa o alvo do script em paz', () => {
  const svg =
    '<svg id="pipeline-svg"><defs><linearGradient id="glow-grad"/></defs>' +
    '<path id="pipeline-path-glow" stroke="url(#glow-grad)"/></svg>';
  const out = isolarIdsSvg(svg, 'seg6-svg1');
  assert.ok(out.includes('id="seg6-svg1-glow-grad"'), 'o gradiente colide e continua isolado');
  assert.ok(out.includes('stroke="url(#seg6-svg1-glow-grad)"'), 'o par não pode quebrar');
  assert.ok(out.includes('id="pipeline-svg"'));
  assert.ok(out.includes('id="pipeline-path-glow"'));
});

test('o caso medido: dos cinco ids da linha do tempo, só os dois referenciados mudam', () => {
  const svg =
    '<svg id="pipeline-svg">' +
    '<defs><filter id="glow-line"/><linearGradient id="glow-grad"/></defs>' +
    '<path id="pipeline-path-base"/>' +
    '<path id="pipeline-path-glow" stroke="url(#glow-grad)" filter="url(#glow-line)"/>' +
    '</svg>';
  const out = isolarIdsSvg(svg, 'seg6-svg1');
  for (const alvoDoScript of ['pipeline-svg', 'pipeline-path-base', 'pipeline-path-glow']) {
    assert.ok(
      out.includes(`id="${alvoDoScript}"`),
      `${alvoDoScript} é procurado por getElementById e não pode ser renomeado`,
    );
  }
  for (const colide of ['glow-line', 'glow-grad']) {
    assert.ok(out.includes(`id="seg6-svg1-${colide}"`), `${colide} colide entre segmentos`);
    assert.ok(out.includes(`url(#seg6-svg1-${colide})`));
  }
});

test('sprite por href também conta como referência e continua isolado', () => {
  const svg = '<svg><symbol id="icone"/><use href="#icone"/><g id="camada-do-script"/></svg>';
  const out = isolarIdsSvg(svg, 'seg2');
  assert.ok(out.includes('id="seg2-icone"'));
  assert.ok(out.includes('href="#seg2-icone"'));
  assert.ok(out.includes('id="camada-do-script"'));
});
