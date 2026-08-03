import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PISO_PARA_COMPARAR_MS, decidirComparacao } from './decidir-comparacao.js';

const base = {
  querVerificar: true,
  parcial: false,
  tetoMs: 25_000,
  restanteMs: 190_000,
  fasesQueInvalidam: ['v2-compilar', 'v2-comparar'],
};

test('captura completa confere, e sem ressalva', () => {
  const d = decidirComparacao(base);
  assert.equal(d.rodar, true);
  assert.ok(d.rodar && d.ressalva === undefined);
});

test('corte no percurso NÃO impede a conferência', () => {
  // Este é o caso que fez a comparação sumir do acervo inteiro: sete de sete
  // capturas cortadas no percurso, e nenhuma delas conferida, mesmo com quase
  // metade do orçamento total ainda livre.
  const d = decidirComparacao({ ...base, parcial: true, faseCortada: 'v2-percurso' });
  assert.equal(d.rodar, true);
  assert.ok(d.rodar && d.ressalva !== undefined, 'roda, mas declara o alcance');
  assert.match(d.rodar ? (d.ressalva ?? '') : '', /cortada por tempo na fase "v2-percurso"/);
  assert.match(
    d.rodar ? (d.ressalva ?? '') : '',
    /não fala sobre o que a fase interrompida deixou de explorar/,
    'a ressalva diz o que a medição NÃO cobre',
  );
});

test('corte na compilação impede: o que seria conferido não existe inteiro', () => {
  const d = decidirComparacao({ ...base, parcial: true, faseCortada: 'v2-compilar' });
  assert.equal(d.rodar, false);
  assert.match(d.rodar ? '' : d.motivo, /fase que produz o que seria conferido/);
});

test('sem teto para um bundle sequer, não confere e diz o número', () => {
  const d = decidirComparacao({ ...base, tetoMs: PISO_PARA_COMPARAR_MS - 1 });
  assert.equal(d.rodar, false);
  assert.match(d.rodar ? '' : d.motivo, /2999 ms/);
});

test('sem tempo restante, não confere', () => {
  // O teto pode ser generoso e o processo estar no fim: quem manda é o que resta.
  const d = decidirComparacao({ ...base, restanteMs: 500 });
  assert.equal(d.rodar, false);
  assert.match(d.rodar ? '' : d.motivo, /sobraram 500 ms/);
});

test('quem desligou a verificação não recebe explicação', () => {
  const d = decidirComparacao({ ...base, querVerificar: false });
  assert.equal(d.rodar, false);
  assert.equal(d.rodar ? '' : d.motivo, '', 'silêncio: quem desligou sabe que desligou');
});

test('nenhuma frase da decisão usa travessão', () => {
  const frases = [
    decidirComparacao({ ...base, parcial: true, faseCortada: 'v2-percurso' }),
    decidirComparacao({ ...base, parcial: true, faseCortada: 'v2-compilar' }),
    decidirComparacao({ ...base, tetoMs: 10 }),
    decidirComparacao({ ...base, restanteMs: 10 }),
  ].map((d) => (d.rodar ? (d.ressalva ?? '') : d.motivo));
  for (const f of frases) assert.ok(!f.includes('—'), `travessão em texto de tela: ${f}`);
});
