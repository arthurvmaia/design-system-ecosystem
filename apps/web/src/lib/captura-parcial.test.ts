import assert from 'node:assert/strict';
import { test } from 'node:test';
import { oQueFaltou } from './captura-parcial.js';

test('a fase interrompida vira a CONSEQUÊNCIA, não o nome dela', () => {
  // "v2-percurso" não diz nada a quem usa o app. O que importa é o que se
  // perdeu: as dobras de baixo e os efeitos de mouse e rolagem.
  const t = oQueFaltou('v2-percurso');
  assert.ok(t.includes('rolagem'));
  assert.ok(!t.includes('v2-'), 'jargão de pipeline não vai para a tela');
});

test('cada fase conhecida tem uma consequência própria', () => {
  const fases = ['v2-percurso', 'v2-estados', 'v2-candidatos', 'assets-rede', 'v2-compilar'];
  const textos = fases.map(oQueFaltou);
  assert.equal(new Set(textos).size, textos.length, 'duas fases com o mesmo texto não informam');
});

test('fase desconhecida cai no texto geral, sem inventar efeito', () => {
  // Inventar uma consequência específica para uma fase que ninguém mapeou seria
  // pior que a frase genérica: soaria preciso e estaria errado.
  const t = oQueFaltou('v2-fase-que-ainda-nao-existe');
  assert.ok(t.includes('pode faltar conteúdo'));
});

test('sem fase nenhuma ainda sai uma frase legível', () => {
  assert.ok(oQueFaltou(undefined).length > 20);
  assert.ok(oQueFaltou('').length > 20);
});

test('toda frase termina em ponto: ela é seguida de outra na tela', () => {
  for (const f of ['v2-percurso', 'v2-estados', 'segmentar', undefined]) {
    assert.ok(oQueFaltou(f).trim().endsWith('.'), `"${f}" não fecha a frase`);
  }
});
