import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COTA_PADRAO,
  COTA_POR_CATEGORIA,
  type EntradaDeAvaliacao,
  type Nota,
  avaliarPeca,
  escolherParaBiblioteca,
} from './curadoria-escolha.js';

/**
 * O que se testa aqui é a DECISÃO — quem entra na Biblioteca. Ela decide quais
 * peças existem para os kits, e até agora não tinha teste nenhum: morava dentro
 * de um script que rodava na importação.
 */

const nota = (over: Partial<Nota> & { segId: string }): Nota => ({
  dsId: 'ds_a',
  nome: over.segId,
  categoria: 'card',
  kind: 'component',
  nota: 100,
  motivos: [],
  reprova: null,
  reprovaTipo: null,
  jaNaBiblioteca: false,
  ...over,
});

const varias = (n: number, molde: (i: number) => Partial<Nota> & { segId: string }): Nota[] =>
  Array.from({ length: n }, (_, i) => nota(molde(i)));

const ids = (r: readonly Nota[]): string[] => r.map((x) => x.segId).sort();

// ── A reserva por papel ─────────────────────────────────────────────────────

/**
 * O caso medido: `card`, `nav` e `hero` são abundantes e de nota alta, e gastam
 * o teto de 6 por origem antes de a peça de papel escasso da MESMA origem ser
 * alcançada. Foram 125 peças barradas pelo teto de origem, com quatro papéis
 * das sequências em zero absoluto.
 */
test('a reserva por papel alcança o depoimento que a fila de nota deixaria de fora', () => {
  const entradas = [
    ...varias(6, (i) => ({ segId: `card_${i}`, categoria: 'card', nota: 900 - i })),
    nota({ segId: 'depo', categoria: 'testimonial', nota: 1 }),
  ];
  const r = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  assert.ok(
    r.some((n) => n.segId === 'depo'),
    'sem a reserva, os 6 cards de nota alta esgotariam o teto da origem',
  );
});

test('a reserva não fura o teto por (origem, categoria): dois heros do mesmo site bastam', () => {
  const entradas = varias(8, (i) => ({ segId: `hero_${i}`, categoria: 'hero', nota: 900 - i }));
  const r = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  assert.equal(r.length, 2, `saíram: ${ids(r).join(', ')}`);
});

test('o estouro da reserva é limitado: uma origem não passa de teto + 2', () => {
  // Uma origem com peça de sobra em muitos papéis diferentes: sem o limite, a
  // reserva viraria a escolha inteira e o teto por origem deixaria de existir.
  const categorias = ['hero', 'nav', 'card', 'feature', 'pricing', 'faq', 'footer', 'form'];
  const entradas = categorias.flatMap((c, i) =>
    varias(2, (k) => ({ segId: `${c}_${k}`, categoria: c, nota: 500 - i })),
  );
  const r = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  assert.equal(r.length, 8, `teto 6 + estouro 2; saíram: ${ids(r).join(', ')}`);
});

// ── As cotas ────────────────────────────────────────────────────────────────

/**
 * A cota de 8 em `interaction` barrava 37 peças aprovadas cuja nota mediana
 * (122) era a MAIOR do banco — as escolhidas medianas ficavam em 104. Era a
 * trava mais cara do sistema, e sobre exatamente o que o dono cobra: movimento.
 */
test('comportamento não tem mais cota de 8: 20 origens rendem 20 peças', () => {
  assert.equal(COTA_POR_CATEGORIA.interaction, undefined, 'a cota de interaction saiu da tabela');
  const entradas = varias(20, (i) => ({
    segId: `int_${i}`,
    dsId: `ds_${i}`,
    categoria: 'interaction',
    kind: 'animation',
    nota: 200 - i,
  }));
  const r = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  assert.equal(r.length, 20);
  assert.ok(COTA_PADRAO >= 20);
});

test('as cotas fantasma continuam: `overlay` para em 4 mesmo com 10 origens', () => {
  const entradas = varias(10, (i) => ({
    segId: `ov_${i}`,
    dsId: `ds_${i}`,
    categoria: 'overlay',
    nota: 200 - i,
  }));
  assert.equal(escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 }).length, 4);
});

// ── O que nunca entra ───────────────────────────────────────────────────────

test('peça reprovada não entra, por mais alta que seja a nota', () => {
  const entradas = [
    nota({ segId: 'boa', nota: 10 }),
    nota({ segId: 'ruim', nota: 9999, reprova: 'G8: mistura rastreamento', reprovaTipo: 'G8' }),
  ];
  assert.deepEqual(ids(escolherParaBiblioteca(entradas)), ['boa']);
});

test('a mesma entrada dá a mesma saída — inclusive com notas empatadas', () => {
  const entradas = varias(12, (i) => ({ segId: `p_${i}`, dsId: `ds_${i % 3}`, nota: 100 }));
  const a = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  const b = escolherParaBiblioteca(entradas, { tetoPorOrigem: 6 });
  assert.deepEqual(
    a.map((n) => n.segId),
    b.map((n) => n.segId),
  );
});

// ── A nota, e a régua de aceite dentro dela ─────────────────────────────────

const entrada = (over: Partial<EntradaDeAvaliacao> = {}): EntradaDeAvaliacao => ({
  segId: 'seg_1',
  dsId: 'ds_a',
  nome: 'Cartões com ícone',
  categoria: 'card',
  kind: 'component',
  htmlSnippet: '<section>'.padEnd(2000, 'x'),
  jaNaBiblioteca: false,
  fidelidade: 80,
  representacao: 'componente-portatil',
  representacaoDoInsight: 'componente-portatil',
  interacoes: 0,
  movimentoProprio: false,
  suporte: 'suportado',
  comparacaoVisualOk: true,
  comparacaoVisualDelta: null,
  rastreamento: null,
  alvosPerdidos: [],
  ...over,
});

test('G8 chega até a curadoria: bundle com rastreio MISTURADO é reprovado ali', () => {
  const r = avaliarPeca(entrada({ rastreamento: 'misturado' }));
  assert.ok(r.reprova?.startsWith('G8:'));
  assert.equal(r.reprovaTipo, 'G8 — O rastreamento da origem não viaja');
  // E o resumo por motivo agrupa por esse rótulo, sem os números do caso.
  assert.deepEqual(escolherParaBiblioteca([r]), []);
});

test('rastreio PURO não reprova: o motor o tira sozinho na montagem', () => {
  assert.equal(avaliarPeca(entrada({ rastreamento: 'puro' })).reprova, null);
});
