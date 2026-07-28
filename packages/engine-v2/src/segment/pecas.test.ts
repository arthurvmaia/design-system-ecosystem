import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StructuralNode, StructuralRole } from '@ds/shared';
import { escolherPecas } from './pecas.js';

/**
 * A escolha das peças é a resposta à reclamação concreta: "isso teria que ser 1
 * componente e não isso tudo". Os casos abaixo são o mockup de celular do Cogni
 * (uma peça encaixada em quatro níveis), uma grade de cards repetidos, e o que
 * NÃO pode virar peça (enfeite, ícone, a dobra inteira).
 */

let seq = 0;
const no = (
  opts: Partial<StructuralNode> & {
    role: StructuralRole;
    w: number;
    h: number;
    y?: number;
    classes?: string[];
    parent?: string | null;
    depth?: number;
    texto?: number;
    midia?: string[];
    hash?: string;
  },
): StructuralNode =>
  ({
    fingerprint: {
      hash: opts.hash ?? `h${++seq}`,
      tag: 'div',
      role: null,
      aria: {},
      dataAttrs: {},
      text: '',
      stableClasses: opts.classes ?? [],
      id: null,
      semanticAncestor: null,
      siblingIndex: 0,
      structuralSignature: (opts.classes ?? []).join(','),
      box: { x: 0, y: 0, w: 0.2, h: 0.2 },
      listeners: [],
      cursor: 'auto',
    },
    role: opts.role,
    realm: 'document',
    parent: opts.parent ?? null,
    depth: opts.depth ?? 1,
    pageBox: { x: 0, y: opts.y ?? 0, w: opts.w, h: opts.h },
    areaShare: 0.1,
    ownText: '',
    subtreeTextLength: opts.texto ?? 40,
    mediaTags: opts.midia ?? [],
    visible: true,
  }) as StructuralNode;

const PAGINA = { pageHeight: 4000, viewportWidth: 1440 };

test('mockup encaixado em quatro níveis vira UMA peça — a de fora', () => {
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 900, depth: 0 }),
    no({ hash: 'moldura', role: 'card', w: 280, h: 580, parent: 'sec', depth: 1, midia: ['img'] }),
    no({
      hash: 'corpo',
      role: 'card',
      w: 276,
      h: 576,
      parent: 'moldura',
      depth: 2,
      midia: ['img'],
    }),
    no({ hash: 'tela', role: 'image', w: 273, h: 420, parent: 'corpo', depth: 3, midia: ['img'] }),
    no({ hash: 'legenda', role: 'card', w: 273, h: 150, parent: 'corpo', depth: 3 }),
  ];
  const pecas = escolherPecas({ nos, ...PAGINA });
  assert.equal(pecas.length, 1, `saíram: ${pecas.map((p) => `${p.nome}/${p.hash}`).join(', ')}`);
  assert.equal(pecas[0]?.hash, 'moldura');
  assert.equal(pecas[0]?.categoria, 'card');
  assert.equal(pecas[0]?.secaoHash, 'sec');
});

test('grade de cards iguais vira um exemplar com a contagem', () => {
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 900, depth: 0 }),
    ...[0, 1, 2].map((i) =>
      no({
        hash: `card${i}`,
        role: 'card',
        w: 320,
        h: 334,
        y: 100,
        parent: 'sec',
        depth: 2,
        classes: ['grade-card'],
      }),
    ),
  ];
  const pecas = escolherPecas({ nos, ...PAGINA });
  assert.equal(pecas.length, 1);
  assert.equal(pecas[0]?.nome, 'Card (×3)');
  assert.equal(pecas[0]?.quantidade, 3);
});

test('contêiner NÃO engole as peças: a faixa cai, os cards de dentro ficam', () => {
  // O caso que um site grande revelou: uma faixa que também passa nos filtros
  // ficava com tudo, e a página inteira rendia meia dúzia de peças.
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 900, depth: 0 }),
    no({ hash: 'faixa', role: 'card', w: 1200, h: 400, parent: 'sec', depth: 1, classes: ['fx'] }),
    ...[0, 1, 2].map((i) =>
      no({
        hash: `item${i}`,
        role: 'card',
        w: 360,
        h: 360,
        y: 10,
        parent: 'faixa',
        depth: 2,
        classes: ['it'],
      }),
    ),
  ];
  const pecas = escolherPecas({ nos, ...PAGINA });
  assert.equal(pecas.length, 1, `saíram: ${pecas.map((p) => p.hash).join(', ')}`);
  assert.equal(pecas[0]?.hash, 'item0', 'fica o item da grade, não a faixa');
  assert.equal(pecas[0]?.quantidade, 3);
});

test('enfeite sem texto nem mídia, ícone e a dobra inteira ficam de fora', () => {
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 900, depth: 0 }),
    no({ hash: 'blob', role: 'decoration', w: 720, h: 720, parent: 'sec', texto: 0 }),
    no({ hash: 'vazio', role: 'card', w: 300, h: 200, parent: 'sec', texto: 0 }),
    no({ hash: 'icone', role: 'image', w: 24, h: 24, parent: 'sec', midia: ['img'] }),
    no({ hash: 'gigante', role: 'card', w: 1440, h: 3000, parent: 'sec' }),
  ];
  assert.deepEqual(escolherPecas({ nos, ...PAGINA }), []);
});

test('peças saem na ordem da página, de cima para baixo', () => {
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 4000, depth: 0 }),
    no({ hash: 'baixo', role: 'card', w: 300, h: 200, y: 2000, parent: 'sec', classes: ['b'] }),
    no({ hash: 'topo', role: 'card', w: 300, h: 200, y: 100, parent: 'sec', classes: ['t'] }),
  ];
  assert.deepEqual(
    escolherPecas({ nos, ...PAGINA }).map((p) => p.hash),
    ['topo', 'baixo'],
  );
});

test('o teto corta pelas peças menos relevantes, mantendo a ordem da página', () => {
  const nos = [
    no({ hash: 'sec', role: 'section', w: 1440, h: 4000, depth: 0 }),
    no({ hash: 'grande', role: 'card', w: 800, h: 400, y: 900, parent: 'sec', classes: ['g'] }),
    no({ hash: 'medio', role: 'card', w: 400, h: 300, y: 100, parent: 'sec', classes: ['m'] }),
    no({ hash: 'pequeno', role: 'card', w: 120, h: 90, y: 500, parent: 'sec', classes: ['p'] }),
  ];
  assert.deepEqual(
    escolherPecas({ nos, ...PAGINA, max: 2 }).map((p) => p.hash),
    ['medio', 'grande'],
  );
});
