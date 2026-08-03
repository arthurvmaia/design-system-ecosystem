import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pecasForaDaMarca } from './alcance-da-marca.js';
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
  const semMidia = problemas.find((p) => /nenhuma mídia/i.test(p.mensagem));
  assert.ok(semMidia !== undefined, 'projeto sem mídia nenhuma precisa avisar antes de gerar');
  assert.equal(
    semMidia.etapa,
    ETAPA.estrutura,
    'a mídia se envia na Estrutura desde que a Mídia deixou de ser etapa',
  );
});

/**
 * O defeito que este teste tranca: a Mídia era o índice 3 e a Revisão passou a
 * ser. Um `ETAPA.midia` esquecido aqui não quebraria nada visível — o botão
 * "Corrigir" simplesmente mandaria a pessoa para a Revisão, que é a tela em que
 * ela já está, sem erro no console e sem nada acontecer.
 */
test('nenhum aviso aponta para a Revisão: não se corrige nada lá dentro', () => {
  const problemas = validarProjeto({
    ...BASE,
    nome: ' ',
    kitComponentes: null,
    brandName: '',
    nLogos: 0,
    tons: [],
    arquetipos: [],
    ctaPrincipal: '',
    nMidias: 0,
    secoes: [{ nome: 'Abertura', componentIds: ['cmp_a'] }],
  });
  assert.ok(problemas.length > 0);
  assert.ok(problemas.every((p) => p.etapa !== ETAPA.revisao));
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

/**
 * O corte de alcance da marca era binário aqui: só abaixo de 35% a revisão
 * falava. Uma peça com 40% de alcance passava calada e saía com a cara do site
 * de origem do mesmo jeito, que é o defeito que a faixa fecha.
 */
test('a peça de 40% de alcance vira aviso na etapa onde se troca o kit', () => {
  const problemas = validarProjeto({
    ...BASE,
    pecasForaDaMarca: pecasForaDaMarca([
      {
        id: 'cmp_a',
        nome: 'Abertura com vídeo',
        disponivel: true,
        textos: 0,
        links: 0,
        logos: 0,
        midias: [],
        marca: { total: 10, alcancavel: 4, taxa: 0.4, fora: { 'funcao-dinamica': 6 } },
      },
    ]),
  });
  const p = problemas.find((x) => /Abertura com vídeo/.test(x.mensagem));
  assert.ok(p !== undefined, 'a faixa do meio não pode voltar a ficar calada');
  assert.equal(p.nivel, 'aviso', 'isso não impede gerar, só precisa ser sabido antes');
  assert.equal(p.etapa, ETAPA.projeto, 'trocar peça do kit se resolve na etapa Projeto');
  assert.match(p.mensagem, /40%/);
});

test('peça que veste a marca não vira aviso nenhum na revisão', () => {
  const problemas = validarProjeto({
    ...BASE,
    pecasForaDaMarca: pecasForaDaMarca([
      {
        id: 'cmp_a',
        nome: 'Rodapé',
        disponivel: true,
        textos: 0,
        links: 0,
        logos: 0,
        midias: [],
        marca: { total: 10, alcancavel: 9, taxa: 0.9, fora: { palavra: 1 } },
      },
    ]),
  });
  assert.deepEqual(problemas, [], 'aviso em toda peça boa ensina a não ler nenhum');
});

test('enquanto o kit carrega, nenhuma seção é acusada de peça órfã', () => {
  // O wizard usa um marcador enquanto a consulta do kit não respondeu. Sem esta
  // guarda, abrir a Revisão acusaria todas as seções de apontar para peças que
  // "não existem" — e some sozinho um segundo depois, o que é pior que não ter.
  const problemas = validarProjeto({ ...BASE, kitComponentes: [{ id: '__carregando__' }] });
  assert.ok(!problemas.some((p) => /saiu do kit/.test(p.mensagem)));
});
