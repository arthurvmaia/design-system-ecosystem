import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { orfasEntre, podeApagar, tamanhoDe } from './acervo-limpar-orfas.js';

/**
 * Esta é a função que APAGA ARQUIVOS DO USUÁRIO, e até agora `scripts/` estava
 * fora do glob de teste — nada aqui era executado pela suíte.
 *
 * O que se testa não é o `rmSync`: é a decisão que vem antes dele.
 */

const RAIZ = join(sep === '\\' ? 'C:\\vault' : '/vault');

// ── A guarda de caminho ─────────────────────────────────────────────────────

test('apaga o que está dentro do vault e tem nome de design system', () => {
  assert.equal(podeApagar(join(RAIZ, 'ds_01ABC'), RAIZ, 'ds_01ABC'), true);
});

test('NUNCA apaga o próprio vault', () => {
  // O erro que apaga o acervo inteiro de uma vez.
  assert.equal(podeApagar(RAIZ, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA apaga fora do vault, nem por caminho irmão', () => {
  assert.equal(podeApagar(join(RAIZ, '..', 'outro', 'ds_01ABC'), RAIZ, 'ds_01ABC'), false);
  assert.equal(podeApagar(`${RAIZ}-vizinho${sep}ds_01ABC`, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA sobe por .. mesmo dentro do vault', () => {
  assert.equal(podeApagar(join(RAIZ, 'ds_01ABC', '..', '..'), RAIZ, 'ds_01ABC'), false);
});

test('o id precisa ser um id: nada de travessia nem curinga', () => {
  for (const id of ['..', '.', '*', '', 'ds_', 'ds_a/b', 'ds_a\\b', 'ds_a..b', '../ds_x']) {
    assert.equal(podeApagar(join(RAIZ, 'ds_valido'), RAIZ, id), false, `passou com id "${id}"`);
  }
});

test('pasta que não é de design system não é apagada nem estando dentro', () => {
  // `library/`, `.tmp/`, `projects/` moram perto e não são órfãs de ninguém.
  assert.equal(podeApagar(join(RAIZ, 'library'), RAIZ, 'library'), false);
  assert.equal(podeApagar(join(RAIZ, '.tmp'), RAIZ, '.tmp'), false);
});

// ── Quem é órfã ─────────────────────────────────────────────────────────────

test('órfã é a pasta ds_ sem linha no banco', () => {
  const pastas = ['ds_A', 'ds_B', 'ds_C'];
  assert.deepEqual(orfasEntre(pastas, new Set(['ds_B'])), ['ds_A', 'ds_C']);
});

test('o que não é pasta de design system fica de fora', () => {
  // O vault tem vizinhos: se eles entrassem na lista, o comando ofereceria
  // apagar a Biblioteca.
  const pastas = ['ds_A', 'library', '.tmp', 'projects', 'ecosystem.db'];
  assert.deepEqual(orfasEntre(pastas, new Set()), ['ds_A']);
});

test('banco vazio não transforma o acervo inteiro em órfão por engano', () => {
  // Ele transforma, sim — e tem de transformar: banco vazio significa que o app
  // não mostra nada. O teste existe para essa consequência ficar EXPLÍCITA, e
  // porque é por isso que o comando lista antes de apagar.
  assert.deepEqual(orfasEntre(['ds_A', 'ds_B'], new Set()), ['ds_A', 'ds_B']);
});

test('acervo inteiro no banco não devolve órfã nenhuma', () => {
  assert.deepEqual(orfasEntre(['ds_A', 'ds_B'], new Set(['ds_A', 'ds_B'])), []);
});

// ── O tamanho ───────────────────────────────────────────────────────────────

test('tamanhoDe soma o conteúdo recursivamente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tam-'));
  mkdirSync(join(dir, 'sub', 'mais'), { recursive: true });
  writeFileSync(join(dir, 'a.txt'), 'x'.repeat(100));
  writeFileSync(join(dir, 'sub', 'b.txt'), 'x'.repeat(200));
  writeFileSync(join(dir, 'sub', 'mais', 'c.txt'), 'x'.repeat(300));
  assert.equal(tamanhoDe(dir), 600);
});

test('diretório que não existe tem tamanho zero, sem lançar', () => {
  // O relatório não pode morrer porque uma pasta sumiu entre a listagem e a
  // varredura.
  assert.equal(tamanhoDe(join(tmpdir(), 'nao-existe-mesmo-12345')), 0);
});
