import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sugerirSecoes } from './estrutura-marketing.js';
import {
  type ComponenteDoKitResumo,
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  SectionRole,
  adicionarSecao,
  moverSecao,
  normalizarProjectLayout,
  removerSecao,
  resolverSecoes,
  slugDaSecao,
} from './layout.js';
import { espelharBriefsDasSecoes } from './project.js';

/**
 * A estrutura do site passou a ser do usuário: ele diz quantas seções existem,
 * quais peças compõem cada uma e o que cada uma deve comunicar. Estes testes
 * cobrem as peças puras que sustentam isso.
 */

const cmp = (id: string, name: string, category: string): ComponenteDoKitResumo => ({
  id,
  name,
  category,
});

/** Ids previsíveis: o teste não pode depender de ulid para saber o que saiu. */
const contador = (): (() => string) => {
  let n = 0;
  return () => `sec_${++n}`;
};

// ── Sugestão inicial ────────────────────────────────────────────────────────

test('todo papel tem rótulo em português', () => {
  for (const papel of SectionRole.options) {
    const rotulo = ROTULO_DE_PAPEL[papel];
    assert.ok(
      typeof rotulo === 'string' && rotulo.trim() !== '',
      `papel "${papel}" ficou sem rótulo — a seção nasceria sem nome na tela`,
    );
  }
});

test('kit vazio ainda propõe a página inteira, toda criada no estilo', () => {
  // A sequência mudou quando ela passou a nascer do objetivo do site: era uma
  // espinha técnica (nav, hero, logos, features…), virou uma ordem de
  // argumentação (promessa → problema → como funciona → prova → objeção →
  // pedido). Ver `estrutura-marketing.ts`.
  const secoes = sugerirSecoes([], contador());
  assert.deepEqual(
    secoes.map((s) => s.papel),
    ['nav', 'hero', 'features', 'showcase', 'logos', 'faq', 'contact', 'footer'],
  );
  assert.ok(
    secoes.every((s) => s.componentIds.length === 0),
    'sem kit não há peça para encaixar, e isso é legítimo',
  );
  assert.ok(
    secoes.every((s) => s.nome.trim() !== ''),
    'seção sem nome trava o avanço da etapa — a sugestão nunca pode nascer assim',
  );
});

test('cada peça cai na seção do papel dela', () => {
  const secoes = sugerirSecoes(
    [cmp('cmp_h', 'Hero escuro', 'hero'), cmp('cmp_n', 'Barra', 'nav')],
    contador(),
  );
  const porPapel = new Map(secoes.map((s) => [s.papel, s]));
  assert.deepEqual(porPapel.get('hero')?.componentIds, ['cmp_h']);
  assert.deepEqual(porPapel.get('nav')?.componentIds, ['cmp_n']);
});

test('a segunda peça da mesma categoria entra NA MESMA seção', () => {
  // É o caso que o modelo anterior não sabia expressar: um papel aceitava uma
  // peça só, e a segunda era simplesmente descartada da sugestão.
  //
  // O teste usa `testimonial` porque só um papel a aceita. Com `card` o
  // resultado seria outro e igualmente correto: a sequência tem várias seções
  // que aceitam card (funcionalidades, demonstração, galeria), então duas peças
  // de card se ESPALHAM em vez de empilhar — o que rende mais página.
  const secoes = sugerirSecoes(
    [cmp('cmp_a', 'Depoimento', 'testimonial'), cmp('cmp_b', 'Outro depoimento', 'testimonial')],
    contador(),
  );
  const depoimentos = secoes.find((s) => s.papel === 'testimonials');
  assert.deepEqual(depoimentos?.componentIds, ['cmp_a', 'cmp_b']);
  assert.equal(
    secoes.filter((s) => s.papel === 'testimonials').length,
    1,
    'duas peças iguais não podem virar duas seções repetidas',
  );
});

test('duas peças de card se espalham pela página em vez de empilhar numa seção', () => {
  // O outro lado da mesma regra, e é o comportamento que se quer: espalhar o
  // kit rende mais página que empilhar tudo num lugar só.
  const secoes = sugerirSecoes(
    [cmp('cmp_a', 'Cards', 'card'), cmp('cmp_b', 'Mais cards', 'card')],
    contador(),
  );
  const comPeca = secoes.filter((s) => s.componentIds.length > 0);
  assert.equal(comPeca.length, 2);
  assert.deepEqual(
    comPeca.flatMap((s) => s.componentIds),
    ['cmp_a', 'cmp_b'],
  );
});

test('peça de papel fora da espinha vira uma seção nova, antes do fechamento', () => {
  const secoes = sugerirSecoes([cmp('cmp_p', 'Tabela de planos', 'pricing')], contador());
  const papeis = secoes.map((s) => s.papel);
  assert.ok(papeis.includes('pricing'), 'a peça curada tem de aparecer no site');
  assert.ok(papeis.indexOf('pricing') < papeis.indexOf('footer'), 'nada entra depois do rodapé');
});

test('peça de categoria que nenhum papel reconhece não some: vira seção com o nome dela', () => {
  const secoes = sugerirSecoes([cmp('cmp_x', 'Linha do tempo', 'timeline')], contador());
  const nova = secoes.find((s) => s.componentIds.includes('cmp_x'));
  assert.ok(nova !== undefined, 'a peça curada foi descartada da sugestão');
  assert.equal(nova.nome, 'Linha do tempo');
  assert.equal(nova.papel, undefined, 'sem papel reconhecido, o campo fica em branco');
});

test('um componente de formulário não produz duas seções de contato', () => {
  const secoes = sugerirSecoes([cmp('cmp_f', 'Formulário', 'form')], contador());
  const contatos = secoes.filter((s) => s.papel === 'contact');
  assert.equal(contatos.length, 1);
  assert.deepEqual(contatos[0]?.componentIds, ['cmp_f']);
});

test('a sugestão é determinística e os ids não se repetem', () => {
  const kit = [cmp('cmp_h', 'Hero', 'hero'), cmp('cmp_a', 'Cards', 'card')];
  const a = sugerirSecoes(kit, contador());
  const b = sugerirSecoes(kit, contador());
  assert.deepEqual(a, b, 'mesmo kit tem de propor sempre a mesma estrutura');
  assert.equal(new Set(a.map((s) => s.id)).size, a.length);
});

// ── slug (data-secao) ───────────────────────────────────────────────────────

const secao = (over: Partial<SecaoDoSite> = {}): SecaoDoSite => ({
  id: 'sec_1',
  nome: 'Seção',
  componentIds: [],
  ...over,
});

test('o papel escolhido manda no data-secao', () => {
  assert.equal(slugDaSecao(secao({ papel: 'pricing' }), []), 'pricing');
});

test('sem papel, o data-secao é inferido da categoria da primeira peça', () => {
  const kit = [cmp('cmp_a', 'Cards', 'card')];
  assert.equal(slugDaSecao(secao({ componentIds: ['cmp_a'] }), kit), 'features');
});

test('uma seção montada com peça de navegação é reconhecida como nav', () => {
  // Este é o teste que protege o CSS responsivo: `cssResponsivoBase()` tem regra
  // presa a [data-secao="nav"]. Sem a inferência, quem nunca abriu o campo de
  // papel perderia o comportamento da barra no celular, sem erro nenhum.
  const kit = [cmp('cmp_n', 'Barra', 'nav'), cmp('cmp_h', 'Cabeçalho', 'header')];
  assert.equal(slugDaSecao(secao({ componentIds: ['cmp_n'] }), kit), 'nav');
  assert.equal(slugDaSecao(secao({ componentIds: ['cmp_h'] }), kit), 'nav');
});

test('seção sem peça e sem papel ainda tem um data-secao válido', () => {
  assert.equal(slugDaSecao(secao(), []), 'secao');
});

// ── Resolução contra o kit ──────────────────────────────────────────────────

test('a ordem das peças dentro da seção é preservada', () => {
  const kit = [cmp('cmp_a', 'A', 'card'), cmp('cmp_b', 'B', 'card')];
  const { secoes } = resolverSecoes([secao({ componentIds: ['cmp_b', 'cmp_a'] })], kit);
  assert.deepEqual(
    secoes[0]?.pecas.map((p) => p.id),
    ['cmp_b', 'cmp_a'],
  );
  assert.equal(secoes[0]?.origem, 'kit');
});

test('peça que saiu do kit sai da seção E vira aviso nominal', () => {
  const kit = [cmp('cmp_a', 'A', 'card')];
  const { secoes, avisos } = resolverSecoes(
    [secao({ nome: 'Funcionalidades', componentIds: ['cmp_a', 'cmp_sumiu'] })],
    kit,
  );
  assert.deepEqual(
    secoes[0]?.pecas.map((p) => p.id),
    ['cmp_a'],
  );
  assert.equal(secoes[0]?.origem, 'mista');
  assert.equal(avisos.length, 1);
  assert.match(avisos[0] ?? '', /Funcionalidades/, 'o aviso tem de dizer QUAL seção');
});

test('seção sem nenhuma peça é criada no estilo, sem virar aviso', () => {
  const { secoes, avisos } = resolverSecoes([secao()], []);
  assert.equal(secoes[0]?.origem, 'criada');
  assert.equal(avisos.length, 0, 'seção sem peça é uma escolha, não um problema');
});

test('a instrução em branco não vira instrução vazia', () => {
  const { secoes } = resolverSecoes([secao({ instrucao: '   ' })], []);
  assert.equal(secoes[0]?.instrucao, undefined);
});

// ── Operações de lista ──────────────────────────────────────────────────────

test('mover respeita os extremos sem quebrar', () => {
  const lista: SecaoDoSite[] = [secao({ id: 'a' }), secao({ id: 'b' }), secao({ id: 'c' })];
  assert.deepEqual(
    moverSecao(lista, 'b', 'cima').map((s) => s.id),
    ['b', 'a', 'c'],
  );
  assert.deepEqual(
    moverSecao(lista, 'b', 'baixo').map((s) => s.id),
    ['a', 'c', 'b'],
  );
  assert.deepEqual(
    moverSecao(lista, 'a', 'cima').map((s) => s.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    moverSecao(lista, 'c', 'baixo').map((s) => s.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    moverSecao(lista, 'nao_existe', 'cima').map((s) => s.id),
    ['a', 'b', 'c'],
  );
});

test('adicionar entra no fim, em branco; remover tira só a pedida', () => {
  const lista = adicionarSecao([secao({ id: 'a' })], () => 'sec_nova');
  assert.deepEqual(
    lista.map((s) => s.id),
    ['a', 'sec_nova'],
  );
  assert.equal(lista[1]?.nome, '');
  assert.deepEqual(lista[1]?.componentIds, []);
  assert.deepEqual(
    removerSecao(lista, 'a').map((s) => s.id),
    ['sec_nova'],
  );
});

// ── Espelho dos briefs ──────────────────────────────────────────────────────

test('instrução vazia é delegação, não lacuna', () => {
  const briefs = espelharBriefsDasSecoes([{ id: 'sec_1' }, { id: 'sec_2', instrucao: '  ' }]);
  assert.equal(briefs.sec_1?.iaDecide, true);
  assert.equal(briefs.sec_2?.iaDecide, true);
});

test('instrução escrita vira a mensagem, chaveada pelo id da seção', () => {
  const briefs = espelharBriefsDasSecoes([{ id: 'sec_1', instrucao: ' fale do frete grátis ' }]);
  assert.equal(briefs.sec_1?.mensagem, 'fale do frete grátis');
  assert.equal(briefs.sec_1?.iaDecide, false);
});

test('duas seções do mesmo papel não colidem no espelho', () => {
  // O modelo antigo chaveava por papel. Como agora dá para ter duas seções de
  // "Demonstração", chavear por papel perderia uma delas em silêncio.
  const briefs = espelharBriefsDasSecoes([
    { id: 'sec_1', instrucao: 'primeira' },
    { id: 'sec_2', instrucao: 'segunda' },
  ]);
  assert.equal(Object.keys(briefs).length, 2);
});

// ── Projeto antigo ──────────────────────────────────────────────────────────

test('layout do modelo antigo entra sem quebrar e sai sem seções', () => {
  const antigo = JSON.stringify({
    mode: 'blueprint',
    blueprintId: 'saas-landing',
    disabledRoles: ['faq'],
    placements: [{ role: 'hero', escolha: 'componente', componentId: 'cmp_a' }],
    density: 'espacoso',
  });
  const layout = normalizarProjectLayout(antigo);
  assert.deepEqual(layout.secoes, [], 'sem seções, a tela cai na sugestão do kit');
  assert.equal(layout.density, 'espacoso', 'o que ainda vale continua valendo');
});
