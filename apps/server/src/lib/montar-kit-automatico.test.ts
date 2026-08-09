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
  // E o que sobra vai para o REUSO, na terceira passada: catalog também aceita
  // card, e o card já ocupado volta lá — uma vez, e com o motivo dizendo de
  // onde ele veio. O inventário do kit continua com uma cópia só.
  assert.equal(porPapel.get('catalog'), 'cmp_card');
  assert.ok(
    r.passos.some((p) => p.papel === 'catalog' && p.motivo.includes('reaproveitada da etapa')),
    'o motivo diz que a peça repete a forma e troca o conteúdo',
  );
  assert.equal(r.componentIds.filter((id) => id === 'cmp_card').length, 1);
});

/**
 * O reuso é o ÚLTIMO recurso e tem teto de um por peça: sem ele, a mesma peça
 * viraria a página inteira depois que as sequências foram alongadas (de 5-7
 * seções de conteúdo para 9-10, contra kits de 7 a 9 peças).
 */
test('reuso: uma peça serve a no máximo DUAS etapas, e nunca ao mesmo papel', () => {
  // `card` serve features, showcase e catalog em 'vender-produto': três etapas
  // para uma peça só.
  const r = montarKitAutomatico('vender-produto', [peca('cmp_card', 'card', 'ds_a')], semMarca);
  const comCard = r.passos.filter((p) => p.componentId === 'cmp_card');
  assert.equal(comCard.length, 2, `saiu em: ${comCard.map((p) => p.papel).join(', ')}`);
  assert.equal(new Set(comCard.map((p) => p.papel)).size, 2, 'papéis diferentes');
  const aindaVazias = r.passos.filter(
    (p) => p.componentId === null && p.motivo.includes('já cobrem outras etapas'),
  );
  assert.ok(aindaVazias.length > 0, 'o teto segura: a terceira etapa de card continua vazia');
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

// ── Comportamento e fundo: o que NÃO ocupa seção ────────────────────────────

const comportamento = (id: string, dsId: string, nome: string): PecaParaMontagem => ({
  id,
  name: nome,
  category: 'interaction',
  kind: 'animation',
  designSystemId: dsId,
});

/**
 * Medido nos 12 kits do banco de prova: TODOS carregavam um "Revelar ao rolar"
 * cuja origem não estava na página. O CSS do comportamento é escopado por
 * origem, então ele viajava sem alcançar nada — e o aviso ainda dizia que ele
 * "vale para todas as seções". Falso em 12 de 12.
 */
test('comportamento de origem AUSENTE não entra, e a ausência é declarada', () => {
  const pecas = [
    peca('cmp_hero', 'hero', 'ds_a'),
    peca('cmp_nav', 'nav', 'ds_a'),
    comportamento('cmp_rev', 'ds_b', 'Revelar ao rolar (×16)'),
  ];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  assert.ok(!r.componentIds.includes('cmp_rev'), 'ds_b não está na página');
  assert.ok(
    r.avisos.some((a) => a.includes('Nenhum comportamento de página entrou')),
    `avisos: ${r.avisos.join(' | ')}`,
  );
});

test('dois comportamentos com o MESMO mecanismo contam como um', () => {
  // "Revelar ao rolar" e "Revelar ao rolar (×16)" são a mesma família: dois
  // observadores de rolagem sobre os mesmos elementos não dobram o efeito.
  const pecas = [
    peca('cmp_hero', 'hero', 'ds_a'),
    comportamento('cmp_rev1', 'ds_a', 'Revelar ao rolar'),
    comportamento('cmp_rev2', 'ds_a', 'Revelar ao rolar (×16)'),
    comportamento('cmp_par', 'ds_a', 'Parallax ao rolar'),
  ];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  const entraram = ['cmp_rev1', 'cmp_rev2', 'cmp_par'].filter((id) => r.componentIds.includes(id));
  assert.deepEqual(entraram, ['cmp_rev1', 'cmp_par'], 'um por mecanismo, e o teto é 2');
});

test('o teto é de DOIS mecanismos, não de dois por categoria', () => {
  // Antes o dedupe era por categoria: só existem `interaction` e `cursor`, e
  // `cursor` está em zero no acervo — o teto real era 1.
  const pecas = [
    peca('cmp_hero', 'hero', 'ds_a'),
    comportamento('cmp_a', 'ds_a', 'Revelar ao rolar'),
    comportamento('cmp_b', 'ds_a', 'Parallax ao rolar'),
    comportamento('cmp_c', 'ds_a', 'Fixar ao rolar'),
  ];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  const quantos = ['cmp_a', 'cmp_b', 'cmp_c'].filter((id) => r.componentIds.includes(id));
  assert.equal(quantos.length, 2, `entraram: ${quantos.join(', ')}`);
});

/**
 * São 8 peças curadas de fundo (7 origens, `kind: 'effect'`) que nunca entraram
 * em kit nenhum: `background` não estava em `ROLE_CATEGORIES` — correto, ela não
 * ocupa seção — nem em `CATEGORIAS_DE_PAGINA`, onde ela pertence.
 */
test('uma camada de fundo da origem principal entra como fundo da PÁGINA', () => {
  const fundo: PecaParaMontagem = {
    id: 'cmp_fundo',
    name: 'Fundo animado da página',
    category: 'background',
    kind: 'effect',
    designSystemId: 'ds_a',
  };
  const pecas = [peca('cmp_hero', 'hero', 'ds_a'), peca('cmp_nav', 'nav', 'ds_a'), fundo];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  assert.ok(r.componentIds.includes('cmp_fundo'));
  assert.ok(!r.passos.some((p) => p.componentId === 'cmp_fundo'), 'não ocupa etapa nenhuma');
  assert.ok(r.avisos.some((a) => a.includes('fundo da PÁGINA')));
});

test('fundo de OUTRA origem não entra: ele é a superfície que todas as seções pisam', () => {
  const pecas = [
    peca('cmp_hero', 'hero', 'ds_a'),
    peca('cmp_nav', 'nav', 'ds_a'),
    {
      id: 'cmp_fundo_b',
      name: 'Fundo animado da página',
      category: 'background',
      kind: 'effect',
      designSystemId: 'ds_b',
    } satisfies PecaParaMontagem,
  ];
  const r = montarKitAutomatico('captar-contato', pecas, semMarca);
  assert.ok(!r.componentIds.includes('cmp_fundo_b'));
});
