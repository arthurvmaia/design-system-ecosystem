import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Produto, ProjectContent, normalizarProjectContent } from './project.js';

/**
 * Produtos entraram no conteúdo do projeto. O que precisa continuar valendo:
 * projeto antigo (sem produtos) segue carregando, e o que o usuário digita
 * sobrevive à ida e volta pelo disco.
 */

test('só o nome é obrigatório', () => {
  assert.ok(Produto.safeParse({ id: 'prd_1', nome: 'Camiseta' }).success);
  assert.ok(!Produto.safeParse({ id: 'prd_1', nome: '' }).success, 'nome vazio não passa');
  assert.ok(!Produto.safeParse({ nome: 'Sem id' }).success, 'id é exigido');
});

test('preço é texto livre, para caber "sob consulta"', () => {
  const r = Produto.safeParse({ id: 'p', nome: 'Serviço', preco: 'sob consulta' });
  assert.ok(r.success);
  assert.equal(r.data?.preco, 'sob consulta');
});

test('projeto antigo, sem produtos, continua carregando', () => {
  const c = normalizarProjectContent(JSON.stringify({ sections: { hero: 'Bem-vindo' } }));
  assert.equal(c.produtos, undefined);
  assert.equal(c.briefs?.hero?.mensagem, 'Bem-vindo', 'a migração do legado segue de pé');
});

test('produtos sobrevivem à ida e volta pelo disco', () => {
  const original = {
    briefs: {},
    produtos: [
      {
        id: 'prd_1',
        nome: 'Jaqueta',
        preco: 'R$ 890',
        imagemPath: 'jaqueta.jpg',
        destaque: 'novo',
      },
    ],
  };
  const lido = normalizarProjectContent(JSON.stringify(original));
  assert.equal(lido.produtos?.length, 1);
  assert.equal(lido.produtos?.[0]?.nome, 'Jaqueta');
  assert.equal(lido.produtos?.[0]?.imagemPath, 'jaqueta.jpg');
});

test('JSON corrompido não derruba: cai no default sem produtos', () => {
  const c = normalizarProjectContent('{isso não é json');
  assert.equal(c.produtos, undefined);
  assert.ok(ProjectContent.safeParse(c).success);
});
