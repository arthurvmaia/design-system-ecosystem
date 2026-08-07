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

test('o pareamento cobre o máximo de etapas: a peça disputada vai para onde é insubstituível', () => {
  // 'card' serve features, showcase e catalog; 'feature' só serve features. A
  // gula dava o card (origem principal, +2) para features e deixava showcase
  // vazia com a peça de feature sobrando. O pareamento remaneja: features fica
  // com a peça de feature e o card cobre a showcase — uma etapa a mais vestida.
  const pecas = [
    peca('cmp_nav', 'nav', 'ds_a'),
    peca('cmp_card', 'card', 'ds_a'),
    peca('cmp_feature', 'feature', 'ds_b'),
  ];
  const r = montarKitAutomatico('vender-produto', pecas, semMarca);
  assert.ok(r.componentIds.includes('cmp_card'), 'o card entra');
  assert.ok(r.componentIds.includes('cmp_feature'), 'a peça de feature também — ninguém sobra');
  const porPapel = new Map(r.passos.map((p) => [p.papel, p.componentId]));
  assert.equal(porPapel.get('features'), 'cmp_feature', 'features fica com a peça específica');
  assert.equal(porPapel.get('showcase'), 'cmp_card', 'o card cobre a etapa que só ele serve');
  // E o teto continua honesto: catalog (que também aceita card) fica declarada
  // sem peça, porque a mesma peça não vira duas seções.
  assert.equal(porPapel.get('catalog'), null);
  assert.ok(
    r.passos.some((p) => p.papel === 'catalog' && p.motivo.includes('já cobrem outras etapas')),
    'o motivo distingue "sem peça na Biblioteca" de "peça ocupada em outra etapa"',
  );
});

test('origens misturadas são avisadas quando a principal não cobre tudo', () => {
  const pecas = [peca('cmp_hero', 'hero', 'ds_a'), peca('cmp_nav', 'nav', 'ds_b')];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  assert.ok(r.avisos.some((a) => a.includes('misturou')));
});

test('a origem preferida veste o kit, mesmo sem ser a de maior cobertura', () => {
  // ds_a cobre nav+hero+card; ds_b cobre só o hero. Sem preferência o kit sai
  // todo de ds_a; com preferência por ds_b, o hero é dele — é o que faz dois
  // sites da mesma Biblioteca saírem diferentes.
  const pecas = [
    peca('cmp_nav_a', 'nav', 'ds_a'),
    peca('cmp_hero_a', 'hero', 'ds_a'),
    peca('cmp_card_a', 'card', 'ds_a'),
    peca('cmp_hero_b', 'hero', 'ds_b'),
  ];
  const semPreferencia = montarKitAutomatico('vender-produto', pecas, semMarca);
  assert.equal(semPreferencia.origemPrincipal, 'ds_a');
  assert.ok(semPreferencia.componentIds.includes('cmp_hero_a'));

  const comPreferencia = montarKitAutomatico('vender-produto', pecas, semMarca, {
    origemPreferida: 'ds_b',
  });
  assert.equal(comPreferencia.origemPrincipal, 'ds_b');
  assert.ok(comPreferencia.componentIds.includes('cmp_hero_b'), 'o hero preferido vence');
  // E o resto continua vindo de quem tem peça: preferir não é amputar.
  assert.ok(comPreferencia.componentIds.includes('cmp_nav_a'));
});

test('origem preferida que não cobre nada avisa e não esvazia o kit', () => {
  const pecas = [peca('cmp_nav_a', 'nav', 'ds_a'), peca('cmp_hero_a', 'hero', 'ds_a')];
  const r = montarKitAutomatico('vender-produto', pecas, semMarca, {
    origemPreferida: 'ds_inexistente',
  });
  assert.equal(r.origemPrincipal, 'ds_a', 'segue pela origem que serve');
  assert.ok(r.componentIds.length > 0, 'o kit não sai vazio');
  assert.ok(r.avisos.some((a) => a.includes('origem preferida')));
});
