import assert from 'node:assert/strict';
import { test } from 'node:test';
import { medirRecolorabilidade, nivelDeMarca } from './recolorabilidade.js';

/**
 * A recoloração deixa coisas de fora de propósito, e cada exclusão está certa. O
 * defeito era o produto não CONTAR: a peça entrava no kit parecendo que ia
 * receber a marca e saía com as cores da origem, sem um lugar que avisasse.
 *
 * Estes testes fixam a conta, não a política de recoloração — o alcance dela
 * continua exatamente o mesmo.
 */

test('cor explícita é alcançável', () => {
  const r = medirRecolorabilidade('.a{color:#F69066;background:rgb(10 20 30)}');
  assert.equal(r.alcancavel, 2);
  assert.equal(r.total, 2);
  assert.equal(r.taxa, 1);
  assert.deepEqual(r.fora, {});
});

test('palavra de cor conta como fora, com o motivo', () => {
  // `white` é justamente o caso que a decisão original recusa recolorir, e o
  // caso mais comum num site Tailwind.
  const r = medirRecolorabilidade('.a{color:white;background:#111}');
  assert.equal(r.alcancavel, 1);
  assert.equal(r.fora.palavra, 1);
  assert.equal(r.total, 2);
  assert.equal(r.taxa, 0.5);
});

test('color-mix e var como cor inteira contam como fora', () => {
  const r = medirRecolorabilidade(
    '.a{color:color-mix(in srgb, #fff 50%, #000)}.b{background:var(--tw-bg)}',
  );
  assert.ok((r.fora['funcao-dinamica'] ?? 0) >= 2);
});

test('hex dentro de imagem conta como fora, e não como alcançável', () => {
  // Um `#0d3c1f` dentro de um SVG em data-uri não é cor da página: é conteúdo do
  // arquivo, e um replace ali corromperia o asset.
  const r = medirRecolorabilidade(
    '.a{background-image:url("data:image/svg+xml,%3Csvg fill=\'#0d3c1f\'%3E%3C/svg%3E")}',
  );
  assert.equal(r.alcancavel, 0);
  assert.equal(r.fora['dentro-de-imagem'], 1);
});

test('a peça Tailwind típica mede baixo, que é a verdade', () => {
  // Este é o cenário que o produto escondia: quase toda cor é palavra ou var.
  const r = medirRecolorabilidade(
    '.a{color:white;background:black;border-color:var(--tw-border);outline-color:transparent}',
  );
  assert.equal(r.alcancavel, 0);
  assert.equal(nivelDeMarca(r), 'cores-fixas');
});

test('CSS ilegível não acusa a peça', () => {
  // Quem não conseguiu medir não reprova: mesmo contrato de degradação do resto
  // do pipeline.
  const r = medirRecolorabilidade('.a{ isto não fecha');
  assert.equal(r.taxa, 1);
  assert.equal(nivelDeMarca(r), 'aplicavel');
});

test('peça sem cor nenhuma não é acusada de cores fixas', () => {
  const r = medirRecolorabilidade('.a{display:flex;gap:8px}');
  assert.equal(r.total, 0);
  assert.equal(nivelDeMarca(r), 'aplicavel');
});

test('os três níveis batem com os cortes', () => {
  assert.equal(nivelDeMarca({ total: 10, alcancavel: 9, taxa: 0.9, fora: {} }), 'aplicavel');
  assert.equal(nivelDeMarca({ total: 10, alcancavel: 5, taxa: 0.5, fora: {} }), 'parcial');
  assert.equal(nivelDeMarca({ total: 10, alcancavel: 2, taxa: 0.2, fora: {} }), 'cores-fixas');
});

test('propriedade que não é de cor não entra na conta', () => {
  // `content: "white"` é texto, não cor. Contar ali inflaria o denominador e
  // faria a peça parecer pior do que é.
  const r = medirRecolorabilidade('.a{content:"white";font-family:black-ops}');
  assert.equal(r.total, 0);
});
