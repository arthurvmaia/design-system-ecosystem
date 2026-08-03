import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMIAR_DE_ALCANCE,
  faixaDeAlcance,
  fraseDoSelo,
  frasesDeAlcanceDoKit,
  motivosDe,
  motivosEmLinha,
  pecasForaDaMarca,
  rotuloDoMotivo,
} from './alcance-da-marca.js';
import type { KitContratoResumo, Recolorabilidade } from './api.js';

const medida = (
  alcancavel: number,
  total: number,
  fora: Recolorabilidade['fora'] = {},
): Recolorabilidade => ({
  alcancavel,
  total,
  taxa: total === 0 ? 1 : alcancavel / total,
  fora,
});

const peca = (id: string, nome: string, marca?: Recolorabilidade): KitContratoResumo => ({
  id,
  nome,
  disponivel: true,
  textos: 0,
  links: 0,
  logos: 0,
  midias: [],
  ...(marca !== undefined ? { marca } : {}),
});

// ── A faixa ────────────────────────────────────────────────────────────────

test('a faixa usa os limiares declarados, e não números soltos', () => {
  assert.equal(faixaDeAlcance(medida(9, 10)), 'aplicavel');
  assert.equal(faixaDeAlcance(medida(8, 10)), 'aplicavel', 'o corte de cima é inclusivo');
  assert.equal(faixaDeAlcance(medida(5, 10)), 'parcial');
  assert.equal(faixaDeAlcance(medida(2, 10)), 'cores-fixas');
  assert.equal(LIMIAR_DE_ALCANCE.veste, 0.8);
  assert.equal(LIMIAR_DE_ALCANCE.origem, 0.35);
});

test('peça sem cor nenhuma não tem o que perder', () => {
  // A conta do composer devolve taxa 1 para CSS sem cor. Chamar isso de
  // "cores fixas" acusaria a peça de um defeito que ela não tem.
  assert.equal(faixaDeAlcance(medida(0, 0)), 'aplicavel');
});

test('sem medida nenhuma a faixa DECLARA que não mediu, em vez de aprovar', () => {
  // Este é o defeito que a faixa fecha: `undefined` escondia o selo, e o card
  // de uma peça nunca medida ficava idêntico ao de uma peça aprovada.
  assert.equal(faixaDeAlcance(undefined), 'nao-medido');
  assert.equal(faixaDeAlcance(null), 'nao-medido');
});

/**
 * O corte binário de 0,35 do wizard deixava passar calada uma peça com 40% de
 * alcance, ou seja, três de cada cinco cores saindo do site de origem. A faixa
 * do meio agora fala.
 */
test('a peça de 40% deixou de passar calada', () => {
  const quarenta = medida(4, 10);
  assert.equal(faixaDeAlcance(quarenta), 'parcial');
  const frases = frasesDeAlcanceDoKit(pecasForaDaMarca([peca('cmp_1', 'Abertura', quarenta)]));
  assert.equal(frases.length, 1);
  assert.ok(frases[0]?.includes('40%'), 'o número medido tem de aparecer');
  assert.ok(frases[0]?.includes('Abertura'), 'sem o nome ninguém sabe qual peça trocar');
});

// ── Os motivos ─────────────────────────────────────────────────────────────

test('os motivos saem do mais pesado para o menos pesado', () => {
  const m = motivosDe(
    medida(10, 100, { palavra: 12, 'funcao-dinamica': 60, 'dentro-de-imagem': 8 }),
  );
  assert.deepEqual(
    m.map((x) => x.motivo),
    ['funcao-dinamica', 'palavra', 'dentro-de-imagem'],
  );
});

test('motivo com contagem zero não vira linha na tela', () => {
  const m = motivosDe(medida(10, 20, { palavra: 10 }));
  assert.equal(m.length, 1);
  assert.equal(m[0]?.motivo, 'palavra');
});

test('empate tem ordem fixa: a lista não pode sacudir entre renders', () => {
  const a = motivosDe(medida(1, 7, { palavra: 3, 'dentro-de-imagem': 3 })).map((x) => x.motivo);
  const b = motivosDe(medida(1, 7, { 'dentro-de-imagem': 3, palavra: 3 })).map((x) => x.motivo);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['palavra', 'dentro-de-imagem']);
});

test('o rótulo concorda em número com a contagem', () => {
  assert.equal(rotuloDoMotivo('palavra', 1), 'cor escrita por nome');
  assert.equal(rotuloDoMotivo('palavra', 2), 'cores escritas por nome');
  assert.equal(rotuloDoMotivo('funcao-dinamica', 1), 'cor calculada na hora');
});

test('a explicação não vaza jargão de código para a tela', () => {
  for (const m of motivosDe(
    medida(1, 30, { palavra: 10, 'funcao-dinamica': 10, 'dentro-de-imagem': 9 }),
  )) {
    assert.ok(!m.explicacao.includes('coresDoValor'), 'nome de função interna na tela');
    assert.ok(!m.explicacao.includes('recolorabilidade'), 'nome de módulo na tela');
    assert.ok(m.explicacao.trim().endsWith('.'), `"${m.motivo}" não fecha a frase`);
  }
});

test('os motivos em uma linha trazem contagem e rótulo', () => {
  const linha = motivosEmLinha(medida(5, 20, { palavra: 10, 'funcao-dinamica': 5 }));
  assert.equal(linha, '10 cores escritas por nome, 5 cores calculadas na hora');
});

// ── A frase do selo ────────────────────────────────────────────────────────

test('o selo diz o motivo, não só o número', () => {
  // O defeito: "marca 46%" não distingue uma borda branca de um fundo inteiro
  // em var(), que são decisões opostas.
  const f = fraseDoSelo(medida(46, 100, { 'funcao-dinamica': 54 }));
  assert.ok(f.includes('46 de 100'));
  assert.ok(f.includes('54 cores calculadas na hora'));
});

test('peça que veste a marca não ganha frase', () => {
  assert.equal(fraseDoSelo(medida(9, 10)), '');
  assert.equal(fraseDoSelo(medida(0, 0)), '');
});

test('sem medida, o selo declara a ausência e não acusa a peça', () => {
  // O servidor devolve medida ausente em duas situações que o cliente não
  // distingue: peça sem folha de estilo própria e folha que não abriu. O texto
  // não pode escolher uma das duas e afirmá-la.
  const f = fraseDoSelo(undefined);
  assert.ok(f.includes('Não tenho medida'));
  assert.ok(f.includes('folha de estilo'));
  assert.ok(!f.includes('%'), 'não inventa percentual sobre o que não foi medido');
});

test('abaixo do corte de baixo o selo avisa que a peça sai com a cara da origem', () => {
  const f = fraseDoSelo(medida(2, 10, { palavra: 8 }));
  assert.ok(f.includes('site de origem'));
});

// ── As peças do kit ────────────────────────────────────────────────────────

test('só entram na lista as peças sobre as quais há algo a dizer', () => {
  const fora = pecasForaDaMarca([
    peca('cmp_1', 'Boa', medida(9, 10)),
    peca('cmp_2', 'Meia', medida(5, 10, { palavra: 5 })),
  ]);
  assert.deepEqual(
    fora.map((p) => p.id),
    ['cmp_2'],
  );
});

test('a pior peça vem primeiro: quem lê decide pelo topo', () => {
  const fora = pecasForaDaMarca([
    peca('cmp_a', 'Parcial alta', medida(7, 10, { palavra: 3 })),
    peca('cmp_b', 'Sem medida'),
    peca('cmp_c', 'Fixa', medida(1, 10, { palavra: 9 })),
    peca('cmp_d', 'Parcial baixa', medida(4, 10, { palavra: 6 })),
  ]);
  assert.deepEqual(
    fora.map((p) => p.id),
    ['cmp_c', 'cmp_d', 'cmp_a', 'cmp_b'],
  );
});

test('peça sem medida entra com taxa nula, nunca com zero fingindo medida', () => {
  const [p] = pecasForaDaMarca([peca('cmp_1', 'Sem CSS legível')]);
  assert.equal(p?.faixa, 'nao-medido');
  assert.equal(p?.taxa, null);
});

test('peça sem nome não vira id técnico na tela', () => {
  const semNome: KitContratoResumo = {
    id: 'cmp_9',
    disponivel: true,
    textos: 0,
    links: 0,
    logos: 0,
    midias: [],
    marca: medida(1, 10, { palavra: 9 }),
  };
  const fora = pecasForaDaMarca([semNome]);
  assert.equal(fora[0]?.nome, 'Peça sem nome');
  assert.ok(!frasesDeAlcanceDoKit(fora).join(' ').includes('cmp_9'));
});

// ── As frases da revisão ───────────────────────────────────────────────────

test('uma frase por faixa, não uma por peça', () => {
  const frases = frasesDeAlcanceDoKit(
    pecasForaDaMarca([
      peca('cmp_1', 'Fixa A', medida(1, 10, { palavra: 9 })),
      peca('cmp_2', 'Fixa B', medida(2, 10, { palavra: 8 })),
      peca('cmp_3', 'Parcial A', medida(5, 10, { palavra: 5 })),
      peca('cmp_4', 'Sem medida'),
    ]),
  );
  assert.equal(frases.length, 3, 'uma para cores fixas, uma para parcial, uma para não medido');
});

test('toda frase termina com o que fazer', () => {
  const frases = frasesDeAlcanceDoKit(
    pecasForaDaMarca([
      peca('cmp_1', 'Fixa', medida(1, 10, { palavra: 9 })),
      peca('cmp_2', 'Parcial', medida(5, 10, { palavra: 5 })),
    ]),
  );
  assert.ok(frases[0]?.includes('Troque'), 'aviso sem saída é só má notícia');
  assert.ok(
    frases[1]?.includes('prévia'),
    'a conferência antes de gerar é a saída da faixa do meio',
  );
});

test('kit inteiro dentro da marca não gera aviso nenhum', () => {
  const frases = frasesDeAlcanceDoKit(
    pecasForaDaMarca([peca('cmp_1', 'Boa', medida(10, 10)), peca('cmp_2', 'Outra', medida(9, 10))]),
  );
  assert.deepEqual(frases, []);
});

test('a lista de nomes é curta: mais de três vira contagem', () => {
  const frases = frasesDeAlcanceDoKit(
    pecasForaDaMarca(
      ['a', 'b', 'c', 'd', 'e'].map((n, i) =>
        peca(`cmp_${n}`, `Peça ${n}`, medida(1 + i, 100, { palavra: 99 - i })),
      ),
    ),
  );
  assert.ok(frases[0]?.includes('e mais 2'));
});

test('nenhuma frase da tela usa travessão', () => {
  const frases = frasesDeAlcanceDoKit(
    pecasForaDaMarca([
      peca('cmp_1', 'Fixa', medida(1, 10, { palavra: 9 })),
      peca('cmp_2', 'Parcial', medida(5, 10, { 'funcao-dinamica': 5 })),
      peca('cmp_3', 'Sem medida'),
    ]),
  );
  for (const f of [...frases, fraseDoSelo(medida(5, 10, { palavra: 5 })), fraseDoSelo(undefined)]) {
    assert.ok(!f.includes('—'), `travessão em texto de tela: ${f}`);
  }
});
