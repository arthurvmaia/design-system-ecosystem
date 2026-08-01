import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suporteAposVereditos, vereditosDoSegmento } from './veredito.js';

/**
 * O canal existe porque a medição rodava e era jogada fora na leitura: um
 * resultado de `capsula` não casava com nenhum tipo de interação, então não
 * virava limitação, não rebaixava selo e não pintava nada. A peça reprovada
 * chegava à tela indistinguível de uma aprovada.
 */

const r = (kind: string, ok: boolean, detail?: string) => ({
  segmentId: 'seg_1',
  kind,
  ok,
  ...(detail !== undefined ? { detail } : {}),
});

test('os quatro canais sempre respondem, mesmo sem nada medido', () => {
  // Canal calado é indistinguível de canal aprovado, e essa confusão é o
  // defeito que este canal existe para acabar.
  const v = vereditosDoSegmento({ resultados: [], temBundle: true });
  assert.equal(v.length, 4);
  assert.deepEqual(v.map((x) => x.canal).sort(), ['interacao', 'navegador', 'pixel', 'scroll']);
  for (const x of v) {
    assert.equal(x.estado, 'nao-rodou');
    assert.ok(x.motivo.length > 0, `${x.canal} sem motivo`);
  }
});

test('cápsula reprovada vira falha no canal de navegador', () => {
  // É o caso real do acervo: 8 de 9 cápsulas reprovaram e o resultado sumia.
  const v = vereditosDoSegmento({
    resultados: [r('capsula', false, 'a diferença passou do limiar')],
    temBundle: true,
  });
  const nav = v.find((x) => x.canal === 'navegador');
  assert.equal(nav?.estado, 'falhou');
  assert.equal(nav?.motivo, 'a diferença passou do limiar');
});

test('cápsula reprovada sem detalhe ainda tem frase', () => {
  const v = vereditosDoSegmento({ resultados: [r('capsula', false)], temBundle: true });
  assert.ok((v.find((x) => x.canal === 'navegador')?.motivo.length ?? 0) > 10);
});

test('a conferência de pixel entra com número', () => {
  const v = vereditosDoSegmento({
    resultados: [],
    temBundle: true,
    pixel: { delta: 0.08, limiar: 0.05, passou: false },
  });
  const p = v.find((x) => x.canal === 'pixel');
  assert.equal(p?.estado, 'falhou');
  assert.equal(p?.delta, 0.08);
  assert.equal(p?.limiar, 0.05);
});

test('sem bundle, o motivo diz que não havia o que abrir', () => {
  const v = vereditosDoSegmento({ resultados: [], temBundle: false });
  assert.match(v.find((x) => x.canal === 'navegador')?.motivo ?? '', /não tem pacote/);
});

test('a captura cortada explica o pixel, e SÓ o pixel', () => {
  // O portão da comparação de pixel é literalmente a captura ter saído parcial.
  // Nos outros canais a causa é outra, e usar o corte para tudo seria inventar
  // um motivo plausível no lugar do verdadeiro.
  const v = vereditosDoSegmento({ resultados: [], temBundle: true, capturaParcial: true });
  assert.match(v.find((x) => x.canal === 'pixel')?.motivo ?? '', /cortada por tempo/);
  for (const canal of ['navegador', 'scroll', 'interacao'] as const) {
    const m = v.find((x) => x.canal === canal)?.motivo ?? '';
    assert.doesNotMatch(m, /cortada por tempo/, `${canal} culpou o corte sem ser a causa`);
    assert.match(m, /registro/);
  }
});

test('interação e scroll não se misturam com o canal de navegador', () => {
  const v = vereditosDoSegmento({
    resultados: [r('hover', true), r('scroll', false), r('capsula', true)],
    temBundle: true,
  });
  assert.equal(v.find((x) => x.canal === 'interacao')?.estado, 'passou');
  assert.equal(v.find((x) => x.canal === 'scroll')?.estado, 'falhou');
  assert.equal(v.find((x) => x.canal === 'navegador')?.estado, 'passou');
});

test('reprovar no navegador rebaixa o selo para visual', () => {
  const v = vereditosDoSegmento({ resultados: [r('capsula', false)], temBundle: true });
  assert.equal(suporteAposVereditos('completo', v), 'visual');
  assert.equal(suporteAposVereditos('parcial', v), 'visual');
});

test('o clamp só desce, nunca promove', () => {
  // Promover por conferência boa seria repetir o erro de origem: ausência de
  // medição virando aprovação, agora pelo lado contrário.
  const bom = vereditosDoSegmento({ resultados: [r('capsula', true)], temBundle: true });
  assert.equal(suporteAposVereditos('parcial', bom), 'parcial');
  const ruim = vereditosDoSegmento({ resultados: [r('capsula', false)], temBundle: true });
  assert.equal(suporteAposVereditos('nao-suportado', ruim), 'nao-suportado');
});
