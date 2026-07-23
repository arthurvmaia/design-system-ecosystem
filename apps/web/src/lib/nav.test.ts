import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PENDENCIAS_ROUTE, pendenciasBadge, primaryNav, secondaryNav } from './nav.js';

test('Pendências saiu das funcionalidades principais', () => {
  const rotasPrincipais = primaryNav.map((i) => i.to);
  assert.ok(
    !rotasPrincipais.includes('/revisao'),
    'a rota de revisão não pode estar no primaryNav',
  );
  // As áreas principais continuam lá.
  for (const rota of ['/extract', '/gallery', '/library', '/design-systems', '/projects']) {
    assert.ok(rotasPrincipais.includes(rota), `${rota} deve seguir no fluxo principal`);
  }
});

test('Pendências está na área auxiliar, com a rota preservada', () => {
  const item = secondaryNav.find((i) => i.to === PENDENCIAS_ROUTE);
  assert.ok(item, 'a Revisão deve aparecer na navegação auxiliar');
  assert.equal(item?.label, 'Pendências');
  // Rota inalterada — links antigos continuam válidos.
  assert.equal(PENDENCIAS_ROUTE, '/revisao');
  // Configurações continua na auxiliar também.
  assert.ok(secondaryNav.some((i) => i.to === '/settings'));
});

test('badge: zero pendências fica discreto e sem selo', () => {
  const b = pendenciasBadge({ total: 0, isError: false, isPending: false });
  assert.equal(b.mostrar, false);
  assert.equal(b.destaque, false);
  assert.match(b.rotuloAcessivel, /nenhuma pendência/);
});

test('badge: uma pendência mostra o contador com destaque e rótulo no singular', () => {
  const b = pendenciasBadge({ total: 1, isError: false, isPending: false });
  assert.equal(b.mostrar, true);
  assert.equal(b.valor, 1);
  assert.equal(b.destaque, true);
  assert.match(b.rotuloAcessivel, /1 item aguardando análise/);
});

test('badge: várias pendências usam plural e mostram o número real', () => {
  const b = pendenciasBadge({ total: 12, isError: false, isPending: false });
  assert.equal(b.mostrar, true);
  assert.equal(b.valor, 12);
  assert.match(b.rotuloAcessivel, /12 itens aguardando análise/);
});

test('badge: erro ao carregar NÃO assume zero e mantém acesso', () => {
  const b = pendenciasBadge({ total: undefined, isError: true, isPending: false });
  assert.equal(b.mostrar, false, 'não mostra número errado');
  assert.equal(b.destaque, false);
  // Não afirma "nenhuma pendência" (seria assumir zero).
  assert.doesNotMatch(b.rotuloAcessivel, /nenhuma pendência/);
  assert.equal(b.rotuloAcessivel, 'Pendências de revisão');
});

test('badge: carregando/indefinido também não inventa um número', () => {
  const carregando = pendenciasBadge({ total: undefined, isError: false, isPending: true });
  assert.equal(carregando.mostrar, false);
  const indefinido = pendenciasBadge({ total: undefined, isError: false, isPending: false });
  assert.equal(indefinido.mostrar, false);
});
