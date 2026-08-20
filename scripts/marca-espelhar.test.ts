import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { caminhosDoEspelho, espelhoEsperado } from './marca-espelhar.js';

/**
 * O espelho não é uma duplicação: é uma cópia VERIFICADA.
 *
 * A diferença está inteira neste arquivo. Duas cópias que ninguém compara
 * divergem no primeiro conserto feito de um lado só, e a divergência aparece
 * como "a logo da loja não é a mesma do site" — tarde, e para o cliente.
 */

test('PROVA: a frente de Lojas usa o MESMO recorte que o motor', () => {
  const { origem, espelho } = caminhosDoEspelho();
  const esperado = espelhoEsperado(readFileSync(origem, 'utf8'));
  const atual = readFileSync(espelho, 'utf8');
  assert.equal(
    atual,
    esperado,
    'O espelho da frente de Lojas está defasado. Edite o original no motor e rode `pnpm marca:espelhar`.',
  );
});

test('o espelho avisa, no proprio arquivo, que ele nao e o original', () => {
  const { espelho } = caminhosDoEspelho();
  const atual = readFileSync(espelho, 'utf8');
  assert.match(atual, /NÃO EDITE AQUI/);
  assert.match(atual, /pnpm marca:espelhar/);
  assert.match(
    atual,
    /packages\/creative-engine\/src\/marca\/derivar-navegador\.ts/,
    'quem abrir o arquivo tem de achar o original sem perguntar a ninguém',
  );
});
