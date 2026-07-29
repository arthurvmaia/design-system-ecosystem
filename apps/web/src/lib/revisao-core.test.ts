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
  secoes: [{ nome: 'Abertura', componentIds: ['cmp_a'], instrucao: 'a promessa da marca' }],
  nMidias: 2,
};

test('projeto completo passa sem problema nenhum', () => {
  assert.deepEqual(validarProjeto(BASE), []);
});

test('sem nome e sem kit são BLOQUEANTES apontando para a etapa Projeto', () => {
  const problemas = validarProjeto({ ...BASE, nome: ' ', kitComponentes: null });
  const b = bloqueantes(problemas);
  assert.equal(b.length, 2);
  for (const p of b) assert.equal(p.etapa, ETAPA.projeto);
  assert.equal(bloqueantes(validarProjeto({ ...BASE, kitComponentes: [] })).length, 1);
});

test('faltas de marca, texto e mídia são AVISOS com etapa exata', () => {
  const problemas = validarProjeto({
    ...BASE,
    brandName: '',
    nLogos: 0,
    tons: [],
    arquetipos: [],
    secoes: [{ nome: 'Abertura', componentIds: ['cmp_a'] }],
    ctaPrincipal: '',
    nMidias: 0,
  });
  assert.equal(bloqueantes(problemas).length, 0, 'nada disso bloqueia a geração');
  const etapas = problemas.map((p) => p.etapa);
  assert.ok(etapas.includes(ETAPA.marca));
  assert.ok(etapas.includes(ETAPA.estrutura), 'nenhuma seção com texto avisa na Estrutura');
  assert.ok(etapas.includes(ETAPA.midia));
});

test('a chamada principal agora se corrige na Marca, não numa etapa de conteúdo', () => {
  // Contato e chamada mudaram de casa quando a etapa Conteúdo deixou de existir.
  // O botão "Corrigir" navega pelo índice: apontar para a etapa velha levaria a
  // pessoa para a tela errada.
  const problemas = validarProjeto({ ...BASE, ctaPrincipal: '  ' });
  assert.ok(problemas.some((p) => p.etapa === ETAPA.marca && /chamada/i.test(p.mensagem)));
});

test('contraste baixo na paleta vira aviso; peça órfã na seção também', () => {
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
    secoes: [{ nome: 'Planos', componentIds: ['cmp_sumiu'] }],
  });
  assert.ok(problemas.some((p) => p.nivel === 'aviso' && p.etapa === ETAPA.marca));
  const orfa = problemas.find((p) => p.etapa === ETAPA.estrutura && /saiu do kit/.test(p.mensagem));
  assert.ok(orfa !== undefined, 'a peça que sumiu do kit precisa aparecer na revisão');
  assert.match(orfa.mensagem, /Planos/, 'e precisa dizer QUAL seção');
});

test('enquanto o kit carrega, nenhuma seção é acusada de peça órfã', () => {
  // O wizard usa um marcador enquanto a consulta do kit não respondeu. Sem esta
  // guarda, abrir a Revisão acusaria todas as seções de apontar para peças que
  // "não existem" — e some sozinho um segundo depois, o que é pior que não ter.
  const problemas = validarProjeto({ ...BASE, kitComponentes: [{ id: '__carregando__' }] });
  assert.ok(!problemas.some((p) => /saiu do kit/.test(p.mensagem)));
});
