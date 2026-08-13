import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORIAS_DE_NICHO,
  CATEGORIA_OUTROS,
  agruparKitsPorNicho,
  categoriaDoKit,
} from './nichos-do-brasil.js';

/**
 * A segmentação da tela de Kits pelos nichos que mais vendem no Brasil.
 * Pedido do dono, na tela: "segmentasse os kits por categorias de nichos mais
 * vendidos info ou produtos no brasil".
 */

test('os 20 kits da leva atual caem cada um numa categoria de mercado', () => {
  // São os nomes REAIS de scripts/montar-kits.ts — se um deles cair em
  // "Outros", a segmentação nasceu furada para o acervo que existe.
  const kits = [
    'Clínica e consultório',
    'Loja de produto físico',
    'Serviço profissional',
    'Portfólio e estúdio',
    'Software e assinatura',
    'Evento e clube',
    'Restaurante e cafeteria',
    'Imóvel e arquitetura',
    'Educação e curso',
    'Marca pessoal',
    'Academia e bem-estar',
    'Advocacia e consultoria',
    'Agência e marketing',
    'Moda e vestuário',
    'Turismo e hospedagem',
    'Construtora e reforma',
    'Fotografia e audiovisual',
    'Beleza e estética',
    'Fintech e finanças',
    'Causa e organização social',
  ];
  const fora = kits.filter((k) => categoriaDoKit(k).slug === 'outros');
  // "Serviço profissional" é genérico de verdade — ele PODE cair em Outros.
  assert.ok(
    fora.every((k) => k === 'Serviço profissional'),
    `caíram em Outros sem ser genéricos: ${fora.join(', ')}`,
  );
});

test('a caixa e o acento não mudam a categoria', () => {
  assert.equal(categoriaDoKit('FINTECH E FINANÇAS').slug, 'financas-e-negocios');
  assert.equal(categoriaDoKit('academia e bem-estar').slug, 'saude-e-bem-estar');
  assert.equal(categoriaDoKit('Fotografia e Audiovisual').slug, 'criativos-e-portfolio');
});

test('kit criado pela pessoa cai na faixa certa pela palavra, não por tabela', () => {
  // Kit é criável: um nome novo precisa cair na categoria sem ninguém editar
  // lista. É por isso que o reconhecimento é por palavra.
  assert.equal(categoriaDoKit('Kit Nutrição Esportiva').slug, 'saude-e-bem-estar');
  assert.equal(categoriaDoKit('Pet Shop da Vila').slug, 'loja-e-produto');
  assert.equal(categoriaDoKit('Meu kit qualquer'), CATEGORIA_OUTROS);
});

test('a primeira categoria da ORDEM DE MERCADO vence o empate', () => {
  // "Clínica de estética": saúde vem antes de beleza na ordem — e é onde uma
  // clínica mora, mesmo vendendo estética.
  assert.equal(categoriaDoKit('Clínica de estética').slug, 'saude-e-bem-estar');
});

test('agrupar preserva a ordem de mercado e não cria faixa vazia', () => {
  const grupos = agruparKitsPorNicho([
    { name: 'Beleza e estética' },
    { name: 'Fintech e finanças' },
    { name: 'Academia e bem-estar' },
  ]);
  assert.deepEqual(
    grupos.map((g) => g.categoria.slug),
    ['saude-e-bem-estar', 'financas-e-negocios', 'beleza-e-moda'],
    'saúde vem antes de finanças, que vem antes de beleza — e nenhuma faixa vazia',
  );
});

test('toda categoria explica POR QUE vende — a tela mostra a frase', () => {
  for (const c of CATEGORIAS_DE_NICHO) {
    assert.ok(c.porQueVende.trim().length > 20, `${c.slug} sem a frase de mercado`);
    assert.ok(c.reconhecePor.length > 0, `${c.slug} não reconhece kit nenhum`);
  }
});
