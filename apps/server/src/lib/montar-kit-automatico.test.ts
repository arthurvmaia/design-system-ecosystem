import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEQUENCIAS } from '@ds/shared/schemas';
import { type PecaParaMontagem, montarKitAutomatico } from './montar-kit-automatico.js';

const peca = (
  id: string,
  category: string,
  designSystemId: string,
  name = id,
): PecaParaMontagem => ({ id, name, category, kind: 'component', designSystemId });

const semMarca = (): number | null => null;

test('a montagem segue a ordem da sequência do objetivo, não a ordem da Biblioteca', () => {
  // Biblioteca embaralhada de propósito: cta antes de hero, footer antes de nav.
  const pecas = [
    peca('cmp_cta', 'cta', 'ds_a'),
    peca('cmp_footer', 'footer', 'ds_a'),
    peca('cmp_hero', 'hero', 'ds_a'),
    peca('cmp_nav', 'nav', 'ds_a'),
    peca('cmp_pricing', 'pricing', 'ds_a'),
  ];
  const r = montarKitAutomatico('vender-produto', pecas, semMarca);
  const papeisEscolhidos = r.passos.filter((p) => p.componentId !== null).map((p) => p.papel);
  const papeisDaSequencia = SEQUENCIAS['vender-produto'].map((e) => e.papel);
  assert.deepEqual(
    papeisEscolhidos,
    papeisDaSequencia.filter((p) => papeisEscolhidos.includes(p)),
    'os papéis saem na ordem argumentativa da sequência',
  );
  assert.equal(r.componentIds[0], 'cmp_nav', 'a sequência começa pela navegação');
});

test('papel sem peça sai DECLARADO, não omitido — e vira aviso', () => {
  const r = montarKitAutomatico('vender-produto', [peca('cmp_hero', 'hero', 'ds_a')], semMarca);
  const vazios = r.passos.filter((p) => p.componentId === null);
  assert.ok(vazios.length > 0, 'a sequência de vender tem mais papéis que uma peça cobre');
  assert.ok(vazios[0]?.motivo.includes('criar seções faltantes'));
  assert.ok(r.avisos.some((a) => a.includes('sem peça')));
});

test('coerência de origem vence marca: a origem que cobre mais etapas veste o kit', () => {
  // ds_b tem UM hero com marca alta; ds_a cobre hero e nav. O kit deve sair
  // de ds_a — colcha de retalhos com uma peça "melhor" é pior que kit coeso.
  const pecas = [
    peca('cmp_hero_a', 'hero', 'ds_a'),
    peca('cmp_nav_a', 'nav', 'ds_a'),
    peca('cmp_hero_b', 'hero', 'ds_b'),
  ];
  const marca = (id: string): number | null => (id === 'cmp_hero_b' ? 0.99 : 0.4);
  const r = montarKitAutomatico('captar-contato', pecas, marca);
  assert.equal(r.origemPrincipal, 'ds_a');
  assert.ok(r.componentIds.includes('cmp_hero_a'), 'o hero da origem principal vence');
  assert.ok(!r.componentIds.includes('cmp_hero_b'));
});

test('a mesma peça não entra duas vezes, mesmo servindo a dois papéis', () => {
  // 'card' serve features, showcase e gallery — uma peça só não pode virar três.
  const pecas = [peca('cmp_card', 'card', 'ds_a')];
  const r = montarKitAutomatico('mostrar-trabalho', pecas, semMarca);
  assert.equal(r.componentIds.filter((id) => id === 'cmp_card').length, 1);
});

test('origens misturadas são avisadas quando a principal não cobre tudo', () => {
  const pecas = [peca('cmp_hero', 'hero', 'ds_a'), peca('cmp_nav', 'nav', 'ds_b')];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  assert.ok(r.avisos.some((a) => a.includes('misturou')));
});
