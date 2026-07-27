import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEBOUNCE_AUTOSAVE_MS,
  ROTULO_AUTOSAVE,
  deveSalvar,
  reduzirAutosave,
} from './autosave-core.js';

test('máquina de estados: o ciclo feliz e a falha que não perde trabalho', () => {
  let e = reduzirAutosave('ocioso', 'alterou');
  assert.equal(e, 'pendente');
  e = reduzirAutosave(e, 'comecou-salvar');
  assert.equal(e, 'salvando');
  e = reduzirAutosave(e, 'salvou');
  assert.equal(e, 'salvo');

  // Falha volta a pendente — a próxima janela tenta de novo, nada se perde.
  assert.equal(reduzirAutosave('salvando', 'falhou'), 'pendente');
  // Alterar durante o salvamento deixa o resultado pendente (snapshot velho).
  assert.equal(reduzirAutosave('salvando', 'alterou-durante-salvar'), 'pendente');
});

test('deveSalvar: nunca sem rascunho, nunca por tecla, sempre na troca de etapa', () => {
  const base = { estado: 'pendente' as const, temRascunho: true };

  assert.equal(
    deveSalvar({ ...base, temRascunho: false, msDesdeUltimaAlteracao: 99999 }),
    false,
    'sem rascunho não salva (digitar o nome não cria projeto)',
  );
  assert.equal(
    deveSalvar({ ...base, msDesdeUltimaAlteracao: 200 }),
    false,
    'dentro da janela de silêncio não dispara (sem request por tecla)',
  );
  assert.equal(deveSalvar({ ...base, msDesdeUltimaAlteracao: DEBOUNCE_AUTOSAVE_MS }), true);
  assert.equal(
    deveSalvar({ ...base, msDesdeUltimaAlteracao: 0, trocouDeEtapa: true }),
    true,
    'troca de etapa salva imediatamente',
  );
  assert.equal(
    deveSalvar({ estado: 'salvando', temRascunho: true, msDesdeUltimaAlteracao: 9999 }),
    false,
    'não empilha salvamento sobre salvamento em voo',
  );
  assert.equal(
    deveSalvar({ estado: 'salvo', temRascunho: true, msDesdeUltimaAlteracao: 9999 }),
    false,
    'sem alteração pendente não há o que salvar',
  );
});

test('todos os estados têm rótulo definido (nunca status só por cor)', () => {
  for (const estado of ['ocioso', 'pendente', 'salvando', 'salvo', 'falha'] as const) {
    assert.ok(estado in ROTULO_AUTOSAVE);
  }
  assert.ok(ROTULO_AUTOSAVE.falha.includes('tentar'));
});
