import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type PecaComIdentidade, casarPorConteudo } from './segmentar.js';

/**
 * A decisão que salva o vínculo da Biblioteca.
 *
 * O motor cunha um ULID novo a cada persistência, e a segmentação apagava tudo
 * antes de reinserir. Com `on delete set null` em
 * `library_components.segment_id`, isso desligou **553 de 861** linhas da
 * Biblioteca — e **183 de 183** das peças usadas por algum kit.
 *
 * O corte é determinístico: 1349 dos 1396 segmentos saem byte a byte iguais de
 * uma rodada para a outra. Reaproveitar o id nesses é o que faz o vínculo, a
 * flag `in_library` e a classificação feita à mão sobreviverem ao refinamento.
 */

const p = (id: string, html: string | null, parentId: string | null = null): PecaComIdentidade => ({
  id,
  htmlSnippet: html,
  parentId,
});

test('conteúdo idêntico mantém o id — é isto que salva o vínculo', () => {
  const r = casarPorConteudo(
    [p('seg_velho', '<section>oi</section>')],
    [p('seg_novo', '<section>oi</section>')],
  );
  assert.equal(r.gravar[0]?.id, 'seg_velho');
  assert.deepEqual([...r.reaproveitados], ['seg_velho']);
});

test('conteúdo que mudou entra com id novo', () => {
  const r = casarPorConteudo(
    [p('seg_velho', '<section>oi</section>')],
    [p('seg_novo', '<section>outro</section>')],
  );
  assert.equal(r.gravar[0]?.id, 'seg_novo');
  assert.equal(r.reaproveitados.size, 0);
});

test('EMPATE não escolhe: dois cortes idênticos na mesma origem nascem novos', () => {
  // Medido: 19 chaves do acervo cobrem 38 segmentos (2,7%). Ligar ao errado é
  // pior que não ligar — a peça passaria a ser julgada pela evidência de outra.
  const r = casarPorConteudo(
    [p('a', '<div>x</div>'), p('b', '<div>x</div>')],
    [p('novo', '<div>x</div>')],
  );
  assert.equal(r.gravar[0]?.id, 'novo');
  assert.equal(r.reaproveitados.size, 0);
});

test('um id antigo não é reaproveitado duas vezes', () => {
  // Dois cortes novos com o MESMO conteúdo contra um antigo só: o primeiro
  // herda a identidade, o segundo é peça nova de verdade.
  const r = casarPorConteudo(
    [p('a', '<div>x</div>')],
    [p('n1', '<div>x</div>'), p('n2', '<div>x</div>')],
  );
  assert.equal(r.gravar[0]?.id, 'a');
  assert.equal(r.gravar[1]?.id, 'n2');
  assert.equal(r.reaproveitados.size, 1);
});

test('o filho segue o pai que trocou de id', () => {
  // Sem a tradução do parentId, o subcomponente fica pendurado num id que não
  // existe mais — e some da Galeria sem ninguém apagar nada.
  const r = casarPorConteudo(
    [p('pai_velho', '<section>pai</section>')],
    [p('pai_novo', '<section>pai</section>'), p('filho', '<button>b</button>', 'pai_novo')],
  );
  assert.equal(r.gravar[0]?.id, 'pai_velho');
  assert.equal(r.gravar[1]?.parentId, 'pai_velho', 'o filho aponta para o id que ficou');
});

test('segmento sem trecho de HTML não casa com ninguém', () => {
  // Sem conteúdo não há identidade; casar por ausência ligaria qualquer um a
  // qualquer um.
  const r = casarPorConteudo([p('a', null), p('b', '')], [p('n1', null), p('n2', '')]);
  assert.equal(r.reaproveitados.size, 0);
  assert.deepEqual(
    r.gravar.map((g) => g.id),
    ['n1', 'n2'],
  );
});

test('banco vazio: tudo entra novo, sem quebrar', () => {
  const r = casarPorConteudo([], [p('n1', '<div>a</div>')]);
  assert.equal(r.gravar[0]?.id, 'n1');
  assert.equal(r.reaproveitados.size, 0);
});
