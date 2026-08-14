import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  destinoDoVeredito,
  ehEnderecoDeRede,
  enderecoDoAlvo,
  lerArgumentos,
} from './conferir-site.js';

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

/**
 * O `--credencial` nasceu de uma medição que MENTIU por omissão.
 *
 * A régua mediu `http://localhost:4000/` e devolveu dez vereditos verdes. A
 * página que ela mediu era a tela de login: seis elementos. Verde medido no
 * lugar errado é pior que vermelho, porque ninguém confere de novo.
 *
 * Estes testes cobrem a leitura da linha de comando, que é onde o defeito
 * óbvio mora: tratar o VALOR da credencial como se fosse o alvo.
 */
test('o valor da credencial não é confundido com o alvo', () => {
  const a = lerArgumentos(['--credencial', 'iron7*', 'http://localhost:5173/inicio']);
  assert.equal(a.alvo, 'http://localhost:5173/inicio');
  assert.equal(a.credencial, 'iron7*');

  // E na ordem inversa, que é como as pessoas realmente digitam.
  const b = lerArgumentos(['http://localhost:5173/inicio', '--credencial', 'iron7*']);
  assert.equal(b.alvo, 'http://localhost:5173/inicio');
  assert.equal(b.credencial, 'iron7*');
});

test('sem --credencial, a senha vem do ambiente; sem ambiente, não vem nenhuma', () => {
  assert.equal(lerArgumentos(['./site'], { ORBIS_SENHA: 'do-ambiente' }).credencial, 'do-ambiente');
  assert.equal(lerArgumentos(['./site'], {}).credencial, undefined);
  assert.equal(
    lerArgumentos(['./site'], { ORBIS_SENHA: '' }).credencial,
    undefined,
    'senha vazia é portão desligado, não credencial vazia',
  );
  // A explícita vence a do ambiente: quem digitou quis aquela.
  assert.equal(
    lerArgumentos(['./site', '--credencial', 'digitada'], { ORBIS_SENHA: 'do-ambiente' })
      .credencial,
    'digitada',
  );
});

test('--credencial sem valor não engole a bandeira seguinte', () => {
  // `pnpm conferir ./site --credencial --ver` não pode virar senha "--ver" nem
  // perder o alvo: a falha tem de ser a ausência da senha, não um alvo sumido.
  const a = lerArgumentos(['./site', '--credencial', '--ver']);
  assert.equal(a.alvo, './site');
  assert.equal(a.credencial, undefined);
  assert.equal(a.visivel, true);
});

test('as bandeiras antigas continuam lidas', () => {
  const a = lerArgumentos(['./site', '--ver', '--corrigir']);
  assert.equal(a.alvo, './site');
  assert.equal(a.visivel, true);
  assert.equal(a.corrigir, true);
  const b = lerArgumentos(['./site']);
  assert.equal(b.visivel, false);
  assert.equal(b.corrigir, false);
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
