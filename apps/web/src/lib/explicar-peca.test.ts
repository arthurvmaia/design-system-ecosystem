import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explicarPeca } from './explicar-peca.js';

test('a explicação começa dizendo o que a peça é, e em que família ela vive', () => {
  const frases = explicarPeca({ category: 'nav', kind: 'component', support: 'completo' });
  assert.ok(frases.length >= 3, 'pelo menos o que é, o que faz e o que esperar');
  assert.match(frases[0] ?? '', /^É (um|uma) /, 'abre respondendo "o que é isto"');
  assert.match(frases[0] ?? '', /combina|seção/i, 'a família entra na primeira frase');
});

test('cada fato medido vira uma frase, e nada é inventado', () => {
  const frases = explicarPeca({
    category: 'hero',
    kind: 'layout',
    support: 'parcial',
    dimensions: { width: 1440, height: 812 },
    filhos: 3,
    interacoes: ['hover-pixels', 'scroll-parallax'],
  });
  const texto = frases.join(' ');
  assert.match(texto, /faixa inteira da página/, 'o tipo é traduzido');
  assert.match(texto, /3 peças menores/, 'os filhos entram com plural certo');
  assert.match(texto, /ponteiro passa por cima/, 'hover vira o que se vê acontecer');
  assert.match(texto, /reage à rolagem/, 'scroll também');
  assert.match(texto, /1440 por 812 pixels/, 'o tamanho medido é dito como medida');
  assert.match(texto, /Veio quase inteira/, 'o suporte parcial é declarado');
});

test('peça não medida diz que não foi medida, em vez de prometer', () => {
  // O silêncio aqui seria pior: a pessoa leria a ausência de ressalva como
  // aprovação, que é exatamente a mentira que o resto do app evita.
  const frases = explicarPeca({ category: 'card', kind: 'component' });
  assert.match(frases.join(' '), /ainda não foi medida/);
});

test('um filho só não vira "1 peças"', () => {
  assert.match(explicarPeca({ category: 'card', filhos: 1 }).join(' '), /1 peça menor guardada/);
});

test('sem interação medida, a peça não ganha frase de comportamento', () => {
  const texto = explicarPeca({ category: 'card', interacoes: [] }).join(' ');
  assert.doesNotMatch(texto, /ponteiro|rolagem|clique|movimento próprio/);
});

test('nenhuma frase usa travessão', () => {
  // A regra de voz do Orbis, travada onde ela pode ser conferida.
  const casos = [
    explicarPeca({ category: 'nav', kind: 'component', support: 'completo' }),
    explicarPeca({ category: 'background', kind: 'effect', support: 'visual', filhos: 2 }),
    explicarPeca({ category: 'other', support: 'nao-suportado', interacoes: ['click'] }),
  ];
  for (const frase of casos.flat()) {
    assert.ok(!frase.includes('—'), `travessão em texto de tela: ${frase}`);
  }
});

test('categoria desconhecida não quebra a frase', () => {
  // O banco pode ter categoria de uma versão anterior da taxonomia.
  const frases = explicarPeca({ category: 'categoria-que-nao-existe-mais' });
  assert.ok(frases.length > 0);
  assert.match(frases[0] ?? '', /^É (um|uma) /);
});
