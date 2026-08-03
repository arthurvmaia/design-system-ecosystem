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

/**
 * A Mídia deixou de ser etapa e os produtos foram morar num painel da Estrutura.
 * A checagem tinha de ir junto: se ela tivesse ficado presa a um índice que
 * agora é de outra etapa, um produto em branco passaria batido — e `Produto.nome`
 * exige texto, então ele derruba a validação do conteúdo INTEIRO na leitura.
 */
test('produto sem nome trava a Estrutura, não uma etapa que não existe mais', () => {
  assert.equal(
    podeAvancar(ETAPA.estrutura, { ...CHEIO, produtos: [] }),
    true,
    'produto é opcional',
  );
  assert.equal(podeAvancar(ETAPA.estrutura, { ...CHEIO, produtos: [{ nome: '  ' }] }), false);
});

test('a pendência do produto aponta para o depósito, senão o painel vira esconderijo', () => {
  const p = pendenciasDaEtapa(ETAPA.estrutura, {
    ...CHEIO,
    produtos: [{ nome: 'Anel' }, { nome: '' }],
  });
  assert.equal(p.length, 1);
  assert.equal(p[0]?.foco, 'deposito');
  assert.match(p[0]?.mensagem ?? '', /2º/, 'a mensagem tem de dizer QUAL produto');
});

test('pendência de seção não carrega foco: ela se resolve na tela em volta', () => {
  const p = pendenciasDaEtapa(ETAPA.estrutura, { ...CHEIO, secoes: [] });
  assert.equal(p.length, 1);
  assert.equal(p[0]?.foco, undefined);
});

test('maiorEtapaLiberada para na PRIMEIRA pendência', () => {
  assert.equal(maiorEtapaLiberada({ ...CHEIO, nome: '' }), ETAPA.projeto);
  assert.equal(maiorEtapaLiberada({ ...CHEIO, brandName: '' }), ETAPA.marca);
  assert.equal(maiorEtapaLiberada({ ...CHEIO, secoes: [] }), ETAPA.estrutura);
  assert.equal(maiorEtapaLiberada({ ...CHEIO, produtos: [{ nome: '' }] }), ETAPA.estrutura);
});

/**
 * O guarda da fatia: o botão "Corrigir" da Revisão navega por NÚMERO, e um
 * índice que sobrou de uma etapa aposentada não dá erro nenhum — só leva a
 * pessoa para outra tela. Este teste é o que faz o esquecimento aparecer.
 */
test('os índices das etapas cobrem os rótulos, sem sobra nem buraco', () => {
  const indices = Object.values(ETAPA).sort((a, b) => a - b);
  assert.deepEqual(
    indices,
    ETAPAS.map((_, i) => i),
    'cada rótulo da barra precisa ter exatamente um nome, e cada nome um rótulo',
  );
  assert.equal(ETAPAS[ETAPA.projeto], 'Projeto');
  assert.equal(ETAPAS[ETAPA.marca], 'Marca');
  assert.equal(ETAPAS[ETAPA.estrutura], 'Estrutura');
  assert.equal(ETAPAS[ETAPA.revisao], 'Revisão');
});

test('a Mídia não é mais etapa, nem sobrou índice apontando para ela', () => {
  assert.ok(!('midia' in ETAPA), 'chave viva com etapa morta é navegação errada em silêncio');
  assert.ok(!ETAPAS.some((r) => /mídia/i.test(r)));
  assert.equal(
    ETAPA.revisao,
    ETAPAS.length - 1,
    'a Revisão é a última: é ela que libera o "Gerar"',
  );
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
