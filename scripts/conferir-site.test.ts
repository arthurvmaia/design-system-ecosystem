import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { destinoDoVeredito, ehEnderecoDeRede, enderecoDoAlvo } from './conferir-site.js';

/**
 * Este arquivo não existia, e foi por isso que o defeito passou.
 *
 * A régua aprendeu a medir endereço em `8520eae` e ninguém percebeu que o
 * comando quebrava no fim: `join(pasta, 'aceite-navegador.json')` com uma URL
 * produz um caminho inexistente, e o `writeFileSync` estourava DEPOIS de
 * imprimir todos os vereditos. A tela mostrava tudo verde, o erro vinha no fim
 * e o processo saía com 1 — o mesmo código de "reprovou".
 *
 * O gate pegou. Três lentes independentes reproduziram o mesmo crash, e as três
 * apontaram a mesma causa raiz: um arquivo sem teste nenhum. Este é o teste.
 */

test('endereço e pasta são coisas diferentes, e quem grava precisa saber qual é', () => {
  assert.equal(ehEnderecoDeRede('http://localhost:4000/'), true);
  assert.equal(ehEnderecoDeRede('https://exemplo.com.br/pagina'), true);
  assert.equal(ehEnderecoDeRede('HTTP://MAIUSCULO/'), true, 'o esquema não é sensível a caixa');
  assert.equal(ehEnderecoDeRede('C:/sites/gerado'), false);
  assert.equal(ehEnderecoDeRede('./relativo'), false);
  assert.equal(
    ehEnderecoDeRede('file:///C:/sites/gerado/index.html'),
    false,
    'file:// não é endereço de rede: não é isso que o comando aceita',
  );
});

test('endereço NÃO grava veredito ao lado: não existe lado', () => {
  // O defeito exato: `join` de uma URL vira caminho relativo inexistente, e o
  // crash vinha depois da lista de vereditos, com saída 1 igual à de reprovação.
  assert.equal(destinoDoVeredito('http://localhost:4000/'), null);
  assert.equal(destinoDoVeredito('https://exemplo.com.br/'), null);

  const pasta = destinoDoVeredito('./algum-site');
  assert.ok(pasta !== null, 'pasta tem onde gravar');
  assert.equal(pasta, resolve('./algum-site', 'aceite-navegador.json'));
  assert.ok(!pasta.includes('http'), 'e o caminho não carrega esquema de URL');
});

test('o alvo vira o endereço que o navegador abre', () => {
  assert.equal(enderecoDoAlvo('http://localhost:4000/'), 'http://localhost:4000/');
  assert.equal(
    enderecoDoAlvo('https://exemplo.com.br/x?y=1'),
    'https://exemplo.com.br/x?y=1',
    'query string sobrevive: `resolve` a comeria',
  );
  // Pasta sem index.html é erro DITO, não silêncio: quem apontou errado precisa
  // saber que apontou errado.
  assert.throws(() => enderecoDoAlvo(resolve('pasta-que-nao-existe-em-lugar-nenhum')), /não achei/);
});
