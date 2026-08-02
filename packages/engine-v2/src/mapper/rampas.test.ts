import assert from 'node:assert/strict';
import { test } from 'node:test';
import { derivarRampas } from './rampas.js';
import type { RawNode, RawVisual } from './raw.js';

const visual = (v: Partial<RawVisual>): RawVisual => ({
  fontSize: 0,
  fontWeight: 400,
  lineHeight: null,
  letterSpacing: 0,
  radius: 0,
  padY: 0,
  padX: 0,
  gap: 0,
  ...v,
});

let proximoRef = 1;
const no = (opts: { texto?: string; visual?: Partial<RawVisual>; visivel?: boolean }): RawNode =>
  ({
    ref: proximoRef++,
    realm: 'document',
    parentRef: null,
    tag: 'div',
    role: null,
    aria: {},
    dataAttrs: {},
    id: null,
    classes: [],
    text: opts.texto ?? '',
    ownText: opts.texto ?? '',
    subtreeTextLength: (opts.texto ?? '').length,
    semanticAncestor: null,
    siblingIndex: 0,
    structuralSignature: 'div',
    href: null,
    tipo: null,
    tabindex: null,
    download: false,
    targetBlank: false,
    desabilitado: false,
    papel: 'conteudo',
    camada: 'conteudo',
    visivel: opts.visivel ?? true,
    areaShare: 0,
    box: { x: 0, y: 0, w: 100, h: 20 },
    pageBox: { x: 0, y: 0, w: 100, h: 20 },
    normalizedBox: { x: 0, y: 0, w: 0.1, h: 0.02 },
    midiaTags: [],
    listeners: [],
    cursor: 'auto',
    observadoPorIntersection: false,
    temShadow: false,
    stacking: {
      zIndex: 'auto',
      createsContext: false,
      position: 'static',
      opacity: 1,
      transform: 'none',
      filter: 'none',
      backdropFilter: 'none',
      mixBlendMode: 'normal',
      isolation: 'auto',
      mask: 'none',
      clipPath: 'none',
      overflow: 'visible',
      pointerEvents: 'auto',
    },
    pseudo: [],
    animationName: 'none',
    animationDuration: '0s',
    transitionProperty: 'none',
    transitionDuration: '0s',
    ...(opts.visual === undefined ? {} : { visual: visual(opts.visual) }),
  }) as RawNode;

const texto = (n: number): string => 'x'.repeat(n);

test('valores quase iguais viram UM degrau, com o valor mais frequente na frente', () => {
  // O caso real: o mesmo degrau chega como 15.984 e 16 em nós diferentes,
  // porque o site declarou `rem` e o navegador arredondou.
  const nos = [
    no({ texto: texto(40), visual: { fontSize: 16 } }),
    no({ texto: texto(40), visual: { fontSize: 16 } }),
    no({ texto: texto(40), visual: { fontSize: 15.984 } }),
  ];
  const r = derivarRampas(nos);
  const tipo = r.tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo.length, 1, 'era para ser um degrau só');
  assert.equal(tipo[0]?.valor, 16, 'o representante é o valor que o site usa, não a média');
  assert.equal(tipo[0]?.ocorrencias, 3);
});

test('a tolerância não anda: uma sequência longa não vira um degrau só', () => {
  // Se a janela fosse medida a partir do representante, 20→22→24→26→29 caberia
  // num degrau único, porque cada passo cabe no anterior.
  const nos = [20, 20, 22, 22, 24, 24, 26, 26, 29, 29].map((v) => no({ visual: { padY: v } }));
  const espaco = derivarRampas(nos).tokens.filter((t) => t.eixo === 'espaco');

  assert.ok(espaco.length >= 3, `esperava mais de dois degraus, veio ${espaco.length}`);
});

test('embrulho sem texto próprio não infla o degrau de corpo', () => {
  // Cinco divs de embrulho herdam o mesmo font-size computado e não pintam
  // letra nenhuma. Contá-los faria a rampa medir a profundidade do HTML.
  const comTexto = [
    no({ texto: texto(200), visual: { fontSize: 16 } }),
    no({ texto: texto(200), visual: { fontSize: 16 } }),
  ];
  const embrulhos = [1, 2, 3, 4, 5].map(() => no({ texto: '', visual: { fontSize: 16 } }));
  const r = derivarRampas([...comTexto, ...embrulhos]);
  const tipo = r.tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo[0]?.ocorrencias, 2, 'só os nós que de fato pintam texto contam');
});

test('o degrau com mais TEXTO é o corpo, e o maior só é display se se destacar', () => {
  const nos = [
    // O corpo: pouco nó, muito texto.
    no({ texto: texto(900), visual: { fontSize: 16 } }),
    no({ texto: texto(900), visual: { fontSize: 16 } }),
    // O display: muito nó, pouco texto.
    ...[1, 2, 3, 4, 5].map(() => no({ texto: texto(12), visual: { fontSize: 48 } })),
  ];
  const tipo = derivarRampas(nos).tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo.find((t) => t.papel === 'corpo')?.valor, 16);
  assert.equal(tipo.find((t) => t.papel === 'display')?.valor, 48);
});

test('sem destaque suficiente, ninguém é display', () => {
  // 16 e 20: o maior é um título comum, não um display. Nomeá-lo inventaria
  // uma hierarquia que o site não tem.
  const nos = [
    no({ texto: texto(900), visual: { fontSize: 16 } }),
    no({ texto: texto(900), visual: { fontSize: 16 } }),
    no({ texto: texto(20), visual: { fontSize: 20 } }),
    no({ texto: texto(20), visual: { fontSize: 20 } }),
  ];
  const tipo = derivarRampas(nos).tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo.filter((t) => t.papel === 'display').length, 0);
  assert.equal(tipo.filter((t) => t.papel === 'corpo').length, 1);
});

test('espaço e raio saem sem papel: um respiro de 24px não tem nome', () => {
  const nos = [1, 2, 3].map(() => no({ visual: { padY: 24, radius: 8 } }));
  const r = derivarRampas(nos);

  assert.ok(r.tokens.length >= 2);
  for (const t of r.tokens.filter((x) => x.eixo !== 'tipografia')) {
    assert.equal(t.papel, null);
  }
});

test('nó sem `visual` não entra: ausência é "não medido", nunca zero', () => {
  // Uma coleta antiga não tem o campo. Tratá-la como zero criaria um degrau de
  // respiro nascido do que ninguém observou.
  const r = derivarRampas([no({ texto: texto(50) }), no({ texto: texto(50) })]);
  assert.deepEqual(r.tokens, []);
  assert.equal(r.porRef.size, 0);
});

test('nó invisível não entra na rampa', () => {
  const r = derivarRampas([
    no({ texto: texto(50), visual: { fontSize: 99 }, visivel: false }),
    no({ texto: texto(50), visual: { fontSize: 99 }, visivel: false }),
  ]);
  assert.deepEqual(r.tokens, []);
});

test('cada nó fica ligado aos degraus que usa', () => {
  const a = no({ texto: texto(30), visual: { fontSize: 16, padY: 24 } });
  const b = no({ texto: texto(30), visual: { fontSize: 16, padY: 24 } });
  const r = derivarRampas([a, b]);

  const ids = r.porRef.get(a.ref) ?? [];
  assert.ok(
    ids.some((i) => i.startsWith('tipo-')),
    'o nó devia apontar para o degrau de tipografia',
  );
  assert.ok(
    ids.some((i) => i.startsWith('espaco-')),
    'e para o de espaço',
  );
});

test('valor único e solto não vira degrau quando há rampa de verdade', () => {
  // O `<sup>` perdido: um nó com 10px numa página inteira de 16px.
  const corpo = Array.from({ length: 300 }, () =>
    no({ texto: texto(50), visual: { fontSize: 16 } }),
  );
  const solto = no({ texto: texto(2), visual: { fontSize: 10 } });
  const tipo = derivarRampas([...corpo, solto]).tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo.length, 1);
  assert.equal(tipo[0]?.valor, 16);
});

test('página minúscula ainda devolve o degrau que existe', () => {
  // "Não sei nada" é pior que "sei um" quando um existe.
  const tipo = derivarRampas([no({ texto: texto(10), visual: { fontSize: 14 } })]).tokens.filter(
    (t) => t.eixo === 'tipografia',
  );
  assert.equal(tipo.length, 1);
  assert.equal(tipo[0]?.valor, 14);
});

test('o algarismo decorativo de 208px não vira display', () => {
  // Medido no acervo: a rampa saiu 10, 11, 12, 14, 16, 20 e 208. Nenhum site
  // desenha um degrau dez vezes maior que o anterior — aquilo é um enfeite, e
  // uma marca que governasse tamanho a partir dele escalaria o site por ele.
  const nos = [
    ...Array.from({ length: 30 }, () => no({ texto: texto(20), visual: { fontSize: 12 } })),
    no({ texto: texto(20), visual: { fontSize: 20 } }),
    no({ texto: texto(20), visual: { fontSize: 20 } }),
    no({ texto: texto(6), visual: { fontSize: 208 } }),
    no({ texto: texto(6), visual: { fontSize: 208 } }),
  ];
  const tipo = derivarRampas(nos).tokens.filter((t) => t.eixo === 'tipografia');

  assert.equal(tipo.find((t) => t.papel === 'corpo')?.valor, 12);
  assert.equal(
    tipo.filter((t) => t.papel === 'display').length,
    0,
    'salto de 10x não é degrau de escala',
  );
  // E o degrau continua na rampa: ele existe, só não manda em nada.
  assert.ok(tipo.some((t) => t.valor === 208));
});

test('um display de verdade continua sendo eleito', () => {
  // 12 → 24 → 56: escala com degraus, o topo manda.
  const nos = [
    ...Array.from({ length: 30 }, () => no({ texto: texto(20), visual: { fontSize: 12 } })),
    no({ texto: texto(20), visual: { fontSize: 24 } }),
    no({ texto: texto(20), visual: { fontSize: 24 } }),
    no({ texto: texto(10), visual: { fontSize: 56 } }),
    no({ texto: texto(10), visual: { fontSize: 56 } }),
  ];
  const tipo = derivarRampas(nos).tokens.filter((t) => t.eixo === 'tipografia');
  assert.equal(tipo.find((t) => t.papel === 'display')?.valor, 56);
});
