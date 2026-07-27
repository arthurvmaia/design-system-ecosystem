import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type DadosDeRevisao, ETAPA, bloqueantes, validarProjeto } from './revisao-core.js';

const BASE: DadosDeRevisao = {
  nome: 'Meu site',
  kitComponentes: [{ id: 'cmp_a' }],
  brandName: 'Acme',
  nLogos: 1,
  tons: ['direto'],
  arquetipos: [],
  paleta: {
    cores: [
      { id: 'fundo', nome: 'Fundo', hex: '#ffffff' },
      { id: 'texto', nome: 'Texto', hex: '#111111' },
      { id: 'primaria', nome: 'Primária', hex: '#7f1d1d' },
    ],
    atribuicoes: {},
  },
  ctaPrincipal: 'Comece agora',
  briefs: { hero: { mensagem: 'promessa', pontos: [], provas: [], iaDecide: false } },
  placements: [],
  nMidias: 2,
  modo: 'blueprint',
};

test('projeto completo passa sem problema nenhum', () => {
  assert.deepEqual(validarProjeto(BASE), []);
});

test('sem nome e sem kit são BLOQUEANTES apontando para a etapa Projeto', () => {
  const problemas = validarProjeto({ ...BASE, nome: ' ', kitComponentes: null });
  const b = bloqueantes(problemas);
  assert.equal(b.length, 2);
  for (const p of b) assert.equal(p.etapa, ETAPA.projeto);
  // kit vazio também bloqueia
  assert.equal(bloqueantes(validarProjeto({ ...BASE, kitComponentes: [] })).length, 1);
});

test('faltas de marca, voz, conteúdo e mídia são AVISOS com etapa exata', () => {
  const problemas = validarProjeto({
    ...BASE,
    brandName: '',
    nLogos: 0,
    tons: [],
    arquetipos: [],
    briefs: {},
    ctaPrincipal: '',
    nMidias: 0,
  });
  assert.equal(bloqueantes(problemas).length, 0, 'nada disso bloqueia');
  const etapas = problemas.map((p) => p.etapa);
  assert.ok(etapas.includes(ETAPA.marca));
  assert.ok(etapas.includes(ETAPA.conteudo));
  assert.ok(etapas.includes(ETAPA.midia));
});

test('contraste baixo na paleta vira aviso; placement órfão idem', () => {
  const problemas = validarProjeto({
    ...BASE,
    paleta: {
      cores: [
        { id: 'a', nome: 'Cinza claro', hex: '#dddddd' },
        { id: 'b', nome: 'Cinza', hex: '#bbbbbb' },
        { id: 'c', nome: 'Prata', hex: '#cccccc' },
      ],
      atribuicoes: {},
    },
    placements: [{ role: 'hero', escolha: 'componente', componentId: 'cmp_sumiu' }],
  });
  assert.ok(problemas.some((p) => p.nivel === 'aviso' && p.etapa === ETAPA.marca));
  assert.ok(problemas.some((p) => p.nivel === 'aviso' && p.etapa === ETAPA.estrutura));
});
