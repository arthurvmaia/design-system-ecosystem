import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILTIN_BLUEPRINTS,
  type ComponenteDoKitResumo,
  ROLE_CATEGORIES,
  SectionRole,
  normalizarProjectLayout,
  resolverPlacements,
  sugerirDistribuicao,
} from './layout.js';

const SLOTS = [
  { role: 'hero' as const, label: 'Abertura', hint: '', required: true },
  { role: 'features' as const, label: 'Funcionalidades', hint: '', required: true },
  { role: 'showcase' as const, label: 'Demonstração', hint: '', required: false },
  { role: 'stats' as const, label: 'Números', hint: '', required: false },
];

const KIT: ComponenteDoKitResumo[] = [
  { id: 'cmp_hero', name: 'Hero escuro', category: 'hero' },
  { id: 'cmp_cards', name: 'Grade de cards', category: 'card' },
  { id: 'cmp_cards2', name: 'Cards com ícone', category: 'card' },
];

test('todo papel de seção tem entrada no mapa papel→categoria', () => {
  for (const role of SectionRole.options) {
    assert.ok(role in ROLE_CATEGORIES, `papel sem categorias: ${role}`);
  }
});

test('sugerirDistribuicao espalha componentes distintos e reusa só quando precisa', () => {
  const mapa = sugerirDistribuicao(SLOTS, KIT);
  assert.equal(mapa.get('hero')?.id, 'cmp_hero');
  // features aceita card → pega o primeiro card livre
  assert.equal(mapa.get('features')?.id, 'cmp_cards');
  // showcase também aceita card → pega o SEGUNDO, não repete o primeiro
  assert.equal(mapa.get('showcase')?.id, 'cmp_cards2');
  // stats não tem categoria compatível → sem sugestão
  assert.equal(mapa.get('stats'), undefined);
});

test('resolverPlacements: manual vence, id órfão degrada, criar força criação', () => {
  const resolvidos = resolverPlacements(
    SLOTS,
    [
      // manual válido
      {
        role: 'features',
        escolha: 'componente',
        componentId: 'cmp_cards2',
        observacao: ' 3 colunas ',
      },
      // manual apontando para componente que saiu do kit → degrada para automático
      { role: 'hero', escolha: 'componente', componentId: 'cmp_sumiu' },
      // criação forçada mesmo havendo card compatível
      { role: 'showcase', escolha: 'criar', componentId: null },
    ],
    KIT,
  );
  const porRole = new Map(resolvidos.map((r) => [r.role, r]));

  assert.equal(porRole.get('features')?.origem, 'escolhido');
  assert.equal(porRole.get('features')?.componente?.id, 'cmp_cards2');
  assert.equal(porRole.get('features')?.observacao, '3 colunas');

  assert.equal(porRole.get('hero')?.origem, 'sugerido', 'id órfão cai na sugestão');
  assert.equal(porRole.get('hero')?.componente?.id, 'cmp_hero');

  assert.equal(porRole.get('showcase')?.origem, 'criado');
  assert.equal(porRole.get('showcase')?.componente, null);

  assert.equal(porRole.get('stats')?.origem, 'criado', 'sem compatível → criado no estilo');
});

test('normalizarProjectLayout: legado sem placements entra com lista vazia', () => {
  const legado = normalizarProjectLayout(
    JSON.stringify({ mode: 'blueprint', blueprintId: 'portfolio' }),
  );
  assert.deepEqual(legado.placements, []);
  assert.equal(legado.blueprintId, 'portfolio');

  const comPlacement = normalizarProjectLayout(
    JSON.stringify({
      blueprintId: 'saas-landing',
      placements: [{ role: 'hero', escolha: 'componente', componentId: 'cmp_x' }],
    }),
  );
  assert.equal(comPlacement.placements.length, 1);
  assert.equal(comPlacement.placements[0]?.componentId, 'cmp_x');
});

test('blueprints embutidos só usam papéis conhecidos (o mapa cobre todos)', () => {
  for (const bp of BUILTIN_BLUEPRINTS) {
    for (const s of bp.slots) {
      assert.ok(ROLE_CATEGORIES[s.role] !== undefined, `${bp.id}: ${s.role}`);
    }
  }
});
