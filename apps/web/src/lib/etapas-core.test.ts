import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type DadosDasEtapas,
  ETAPA,
  ETAPAS,
  maiorEtapaLiberada,
  pendenciasDaEtapa,
  podeAvancar,
} from './etapas-core.js';

const CHEIO: DadosDasEtapas = {
  nome: 'Meu site',
  kitId: 'kit_a',
  brandName: 'Acme',
  secoes: [{ nome: 'Abertura' }, { nome: 'Contato' }],
  produtos: [{ nome: 'Anel' }],
};

test('projeto completo libera todas as etapas', () => {
  for (let i = 0; i < ETAPAS.length; i++) {
    assert.deepEqual(pendenciasDaEtapa(i, CHEIO), [], `etapa ${i} travou sem motivo`);
  }
  assert.equal(maiorEtapaLiberada(CHEIO), ETAPAS.length - 1);
});

test('a etapa Projeto exige nome e kit', () => {
  const p = pendenciasDaEtapa(ETAPA.projeto, { ...CHEIO, nome: '  ', kitId: null });
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => x.etapa === ETAPA.projeto));
});

test('a etapa Marca exige o nome da marca', () => {
  assert.equal(podeAvancar(ETAPA.marca, { ...CHEIO, brandName: '' }), false);
  assert.equal(podeAvancar(ETAPA.marca, CHEIO), true);
});

test('a etapa Estrutura exige ao menos uma seção, todas com nome', () => {
  assert.equal(podeAvancar(ETAPA.estrutura, { ...CHEIO, secoes: [] }), false);
  const p = pendenciasDaEtapa(ETAPA.estrutura, {
    ...CHEIO,
    secoes: [{ nome: 'Abertura' }, { nome: ' ' }],
  });
  assert.equal(p.length, 1);
  assert.match(p[0]?.mensagem ?? '', /2ª/, 'a mensagem tem de dizer QUAL seção');
});

test('seção sem peça e sem texto NÃO trava: é escolha, não lacuna', () => {
  // Seção vazia quer dizer "crie no estilo do kit" e texto vazio quer dizer
  // "escreva você". Travar por isso seria obrigar a pessoa a preencher o que ela
  // deliberadamente deixou em aberto.
  assert.equal(podeAvancar(ETAPA.estrutura, { ...CHEIO, secoes: [{ nome: 'Abertura' }] }), true);
});

test('a etapa de Mídia só trava por produto sem nome', () => {
  assert.equal(podeAvancar(ETAPA.midia, { ...CHEIO, produtos: [] }), true, 'mídia é opcional');
  assert.equal(podeAvancar(ETAPA.midia, { ...CHEIO, produtos: [{ nome: '' }] }), false);
});

test('maiorEtapaLiberada para na PRIMEIRA pendência', () => {
  assert.equal(maiorEtapaLiberada({ ...CHEIO, nome: '' }), ETAPA.projeto);
  assert.equal(maiorEtapaLiberada({ ...CHEIO, brandName: '' }), ETAPA.marca);
  assert.equal(maiorEtapaLiberada({ ...CHEIO, secoes: [] }), ETAPA.estrutura);
  // Pendência lá na frente não deve trancar quem ainda está atrás dela.
  assert.equal(maiorEtapaLiberada({ ...CHEIO, produtos: [{ nome: '' }] }), ETAPA.midia);
});

test('toda pendência tem mensagem, senão o botão travado fica mudo', () => {
  const vazio: DadosDasEtapas = {
    nome: '',
    kitId: null,
    brandName: '',
    secoes: [{ nome: '' }],
    produtos: [{ nome: '' }],
  };
  for (let i = 0; i < ETAPAS.length; i++) {
    for (const p of pendenciasDaEtapa(i, vazio)) {
      assert.ok(p.mensagem.trim() !== '', `pendência sem texto na etapa ${i}`);
      assert.equal(p.etapa, i, 'a pendência tem de apontar para a própria etapa');
    }
  }
});
