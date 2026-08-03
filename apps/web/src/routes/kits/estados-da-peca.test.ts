import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SegmentFidelity } from '@/lib/api';
import { pecaDeAbertura, temHoverMedido, tiraDeEstados } from './estados-da-peca.js';

/**
 * O que estes testes protegem: a tira nunca inventa um estado.
 *
 * O defeito que ela existe para não repetir é o da tela que desenha hover,
 * foco e clique como se fossem sempre três, e preenche com o repouso o que não
 * foi medido. Quem olha não tem como saber que dois daqueles quadros são
 * suposição, e leva a suposição para o site.
 */

const medida = (f: Partial<SegmentFidelity>): SegmentFidelity => ({
  support: 'completo',
  renderMode: 'html',
  fidelity: 1,
  warnings: [],
  interactions: [],
  ...f,
});

test('sem medição nenhuma, a tira tem só o repouso e diz que não mediu', () => {
  const tira = tiraDeEstados({ tipo: 'medida', fidelity: medida({}) });
  assert.equal(tira.quadros.length, 1);
  assert.equal(tira.quadros[0]?.fonte, 'repouso');
  assert.match(tira.declaracao ?? '', /sem estado medido/i);
});

test('cada ausência tem a sua frase — não é tudo "sem estado"', () => {
  const semVinculo = tiraDeEstados({ tipo: 'sem-vinculo' }).declaracao ?? '';
  const origemAusente = tiraDeEstados({ tipo: 'origem-ausente' }).declaracao ?? '';
  const semFidelidade = tiraDeEstados({ tipo: 'medida', fidelity: null }).declaracao ?? '';

  for (const frase of [semVinculo, origemAusente, semFidelidade]) {
    assert.match(frase, /sem estado medido/i);
  }
  // Três causas diferentes pedem três instruções diferentes de quem lê.
  assert.equal(new Set([semVinculo, origemAusente, semFidelidade]).size, 3);
  assert.match(origemAusente, /acervo/i);
  assert.match(semFidelidade, /extraia o site de novo/i);
});

test('hover medido pelas interações entra na tira', () => {
  const tira = tiraDeEstados({
    tipo: 'medida',
    fidelity: medida({ interactions: [{ kind: 'hover', support: 'completo' }] }),
  });
  assert.deepEqual(
    tira.quadros.map((q) => q.fonte),
    ['repouso', 'hover'],
  );
  assert.equal(tira.declaracao, null);
});

test('hover medido só pelo pipeline também entra', () => {
  const f = medida({
    pipeline: [{ kind: 'hover', status: 'replayable', confidence: 'alta', stateIds: [] }],
  });
  assert.equal(temHoverMedido(f), true);
  assert.equal(tiraDeEstados({ tipo: 'medida', fidelity: f }).quadros.length, 2);
});

test('cada estado gravado vira um quadro, com o id que a reprodução usa', () => {
  const tira = tiraDeEstados({
    tipo: 'medida',
    fidelity: medida({
      states: [
        { id: 'st_1', trigger: 'click', label: 'menu aberto' },
        { id: 'st_2', trigger: 'focus', label: 'campo focado' },
      ],
    }),
  });
  assert.deepEqual(
    tira.quadros.map((q) => q.estadoId),
    [null, 'st_1', 'st_2'],
  );
  assert.equal(tira.quadros[1]?.rotulo, 'menu aberto');
  assert.equal(tira.quadros[1]?.gatilho, 'Clique');
  assert.equal(tira.quadros[2]?.gatilho, 'Foco');
  assert.equal(tira.declaracao, null);
});

test('estado sem rótulo cai no gatilho em vez de virar um quadro sem nome', () => {
  const tira = tiraDeEstados({
    tipo: 'medida',
    fidelity: medida({ states: [{ id: 'st_9', trigger: 'hover', label: '  ' }] }),
  });
  assert.equal(tira.quadros[1]?.rotulo, 'Passe o mouse');
});

test('o repouso vem do arquivo entregue, não do bloco de origem', () => {
  const tira = tiraDeEstados({ tipo: 'sem-vinculo' });
  assert.equal(tira.quadros[0]?.estadoId, null);
  assert.match(tira.quadros[0]?.nota ?? '', /vai para o site/);
});

test('a tira abre numa peça de interface quando o kit tem alguma', () => {
  const pecas = [
    { id: 'a', category: 'hero' },
    { id: 'b', category: 'button' },
    { id: 'c', category: 'input' },
  ];
  assert.equal(pecaDeAbertura(pecas)?.id, 'b');
});

test('kit só de dobras abre na primeira em vez de abrir vazio', () => {
  const pecas = [
    { id: 'a', category: 'hero' },
    { id: 'b', category: 'footer' },
  ];
  assert.equal(pecaDeAbertura(pecas)?.id, 'a');
  assert.equal(pecaDeAbertura([]), null);
});
