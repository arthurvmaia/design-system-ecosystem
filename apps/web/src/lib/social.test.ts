import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOCIAL_PLATFORMS, contarRedes, validarUrlSocial } from './social.js';

test('validarUrlSocial: vazio é válido (opcional)', () => {
  assert.equal(validarUrlSocial(''), null);
  assert.equal(validarUrlSocial('   '), null);
});

test('validarUrlSocial: aceita URL com e sem esquema', () => {
  assert.equal(validarUrlSocial('https://instagram.com/marca'), null);
  assert.equal(validarUrlSocial('instagram.com/marca'), null, 'sem esquema → assume https');
});

test('validarUrlSocial: rejeita lixo, protocolo perigoso e domínio incompleto', () => {
  assert.match(validarUrlSocial('não é url') ?? '', /inválida|incompleto/i);
  // `javascript:` nunca passa: sem esquema http(s), é prefixado e vira inválido.
  assert.notEqual(validarUrlSocial('javascript:alert(1)'), null, 'deve ser rejeitado');
  assert.match(validarUrlSocial('semdominio') ?? '', /incompleto|inválida/i);
});

test('contarRedes: conta só as preenchidas', () => {
  assert.equal(contarRedes({ instagram: 'https://x', linkedin: '', youtube: '  ' }), 1);
  assert.equal(contarRedes(undefined), 0);
});

test('SOCIAL_PLATFORMS: config tem instagram e linkedin (não hardcoded no componente)', () => {
  const ids = SOCIAL_PLATFORMS.map((p) => p.id);
  assert.ok(ids.includes('instagram'));
  assert.ok(ids.includes('linkedin'));
});
