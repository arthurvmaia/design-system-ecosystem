import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SectionRole } from '@ds/shared/schemas';
import { ROTEIRO_POR_SECAO } from './conteudo-roteiro.js';

test('todo papel de seção tem roteiro (ou é explicitamente sem conteúdo)', () => {
  for (const role of SectionRole.options) {
    assert.ok(role in ROTEIRO_POR_SECAO, `papel sem roteiro: ${role}`);
  }
});

test('todo campo do roteiro tem rótulo e placeholder (nada de campo mudo)', () => {
  for (const [role, roteiro] of Object.entries(ROTEIRO_POR_SECAO)) {
    if (roteiro === null) continue;
    assert.ok(roteiro.campos.length > 0, `${role}: roteiro sem campos`);
    for (const campo of roteiro.campos) {
      const dica = roteiro.dica[campo];
      assert.ok(dica, `${role}.${campo}: sem dica`);
      assert.ok(dica.label.trim() !== '', `${role}.${campo}: sem rótulo`);
      assert.ok(dica.placeholder.trim() !== '', `${role}.${campo}: sem placeholder`);
    }
  }
});
