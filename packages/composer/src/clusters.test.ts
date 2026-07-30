import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidarCores } from './clusters.js';
import type { OcorrenciaDeCor } from './inventario.js';

/**
 * O caso de referência é o site REAL que expôs o defeito: origem clara
 * (neutros #faf9f6/#eaefeb/#272727) com três acentos — verde médio #3d7f61
 * (20 usos), verde escuro #0d3c1f (15) e laranja #f69066 (12). A consolidação
 * tem de devolver os acentos como primary/secondary/accent e os neutros nos
 * papéis certos do tema claro.
 */

const o = (
  hexOpaco: string,
  contexto: OcorrenciaDeCor['contexto'],
  ocorrencias: number,
  literal = hexOpaco,
): OcorrenciaDeCor => ({ hexOpaco, literal, contexto, ocorrencias });

const PELINA: OcorrenciaDeCor[] = [
  o('#faf9f6', 'bg', 30),
  o('#eaefeb', 'bg', 8),
  o('#272727', 'text', 25),
  o('#737373', 'text', 6),
  o('#d9d9d9', 'border', 5),
  o('#3d7f61', 'bg', 12),
  o('#3d7f61', 'text', 8),
  o('#0d3c1f', 'bg', 15),
  o('#f69066', 'text', 12),
];

test('a origem da Pelina sai com tema claro e os papéis certos', () => {
  const r = consolidarCores(PELINA);
  assert.equal(r.tema, 'claro');

  const papelDe = (hex: string) => r.clusters.find((c) => c.corCanonica === hex)?.papel;
  assert.equal(papelDe('#faf9f6'), 'background');
  assert.equal(papelDe('#272727'), 'heading');
  assert.equal(papelDe('#3d7f61'), 'primary', 'maior peso×croma entre os acentos');
  assert.equal(papelDe('#d9d9d9'), 'border');

  // Os outros dois acentos ganham papel de marca (secondary/accent) em alguma
  // ordem; o que importa é que NENHUM fica órfão.
  const laranja = papelDe('#f69066');
  const verdeEscuro = papelDe('#0d3c1f');
  assert.ok(['secondary', 'accent', 'primary-hover'].includes(laranja ?? ''), `laranja=${laranja}`);
  assert.ok(
    ['secondary', 'accent', 'primary-hover'].includes(verdeEscuro ?? ''),
    `verde=${verdeEscuro}`,
  );
  assert.notEqual(laranja, verdeEscuro);
});

test('a confiança do primary não zera num rank apertado', () => {
  // A fórmula "participação × margem" do desenho original zerava o caso real
  // (0.42 × 0.2 = 0.08) e matava a recoloração inteira. O piso é 0.5: trocar
  // primary por secondary não é catástrofe, os dois recebem cor de marca.
  const r = consolidarCores(PELINA);
  const primary = r.clusters.find((c) => c.papel === 'primary');
  assert.ok(primary !== undefined);
  assert.ok(primary.confianca >= 0.5, `confianca=${primary.confianca}`);
});

test('tema escuro inverte a ordenação dos neutros', () => {
  const r = consolidarCores([
    o('#0a0a1a', 'bg', 40),
    o('#f5f5f5', 'text', 20),
    o('#9ca3af', 'text', 6),
    o('#38bdf8', 'bg', 10),
  ]);
  assert.equal(r.tema, 'escuro');
  const papelDe = (hex: string) => r.clusters.find((c) => c.corCanonica === hex)?.papel;
  assert.equal(papelDe('#0a0a1a'), 'background');
  assert.equal(papelDe('#f5f5f5'), 'heading', 'no escuro o texto é o neutro CLARO');
  assert.equal(papelDe('#38bdf8'), 'primary');
});

test('cores vizinhas fundem num cluster só', () => {
  // #f69066 e #f79168 estão a ΔE << 0.03: são a mesma decisão de design.
  const r = consolidarCores([
    o('#f69066', 'text', 10),
    o('#f79168', 'text', 2),
    o('#ffffff', 'bg', 20),
  ]);
  const acentos = r.clusters.filter((c) => c.corCanonica.startsWith('#f'));
  const laranjas = acentos.filter((c) => c.corCanonica !== '#ffffff');
  assert.equal(laranjas.length, 1, 'um cluster, não dois');
  assert.equal(laranjas[0]?.membros.length, 2);
  assert.equal(laranjas[0]?.corCanonica, '#f69066', 'o canônico é o membro mais pesado');
});

test('cluster minúsculo fica sem papel, com a razão declarada', () => {
  const r = consolidarCores([
    o('#ffffff', 'bg', 500),
    o('#111111', 'text', 300),
    o('#ff00aa', 'text', 2), // 0,25% do total
  ]);
  const rosa = r.clusters.find((c) => c.corCanonica === '#ff00aa');
  assert.equal(rosa?.papel, null);
  assert.ok(r.limitacoes.some((l) => l.includes('#ff00aa')));
});

test('sem neutro pintando fundo: assume claro e DIZ', () => {
  const r = consolidarCores([o('#e35d30', 'text', 10)]);
  assert.equal(r.tema, 'claro');
  assert.ok(r.limitacoes.some((l) => l.includes('assumi tema claro')));
});

test('entrada vazia não quebra', () => {
  const r = consolidarCores([]);
  assert.deepEqual(r.clusters, []);
  assert.equal(r.limitacoes.length, 1);
});
