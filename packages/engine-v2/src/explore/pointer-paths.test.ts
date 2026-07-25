import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NormalizedPoint, PointerPathKind } from '@ds/shared';
import {
  TRAJETORIAS_COMPLEMENTARES,
  TRAJETORIA_COBERTURA,
  boxNormalizado,
  construirTrajetoria,
  paraPixels,
  trajetoriaCirculoFechando,
  trajetoriaHilbert,
  trajetoriaRefinamento,
  trajetoriaSerpentina,
  unirRegioes,
} from './pointer-paths.js';

const TODAS: PointerPathKind[] = [
  'hilbert',
  'serpentina',
  'grade',
  'circulo-fechando',
  'circulo-expandindo',
  'diagonal',
  'horizontal',
  'vertical',
  'aproximar-centro',
  'afastar-centro',
  'refinamento',
];

test('toda trajetória fica dentro de 0..1 e não é vazia', () => {
  for (const kind of TODAS) {
    const pts = construirTrajetoria(kind, { regiao: { x: 0.2, y: 0.3, w: 0.4, h: 0.2 } });
    assert.ok(pts.length > 0, `${kind} veio vazia`);
    for (const p of pts) {
      assert.ok(p.x >= 0 && p.x <= 1, `${kind}: x fora de 0..1 (${p.x})`);
      assert.ok(p.y >= 0 && p.y <= 1, `${kind}: y fora de 0..1 (${p.y})`);
    }
  }
});

test('Hilbert cobre a viewport: toda célula da grade recebe pelo menos um ponto', () => {
  const ordem = 3;
  const n = 1 << ordem;
  const pts = trajetoriaHilbert(ordem);
  assert.equal(pts.length, n * n);
  const celulas = new Set(
    pts.map(
      (p) => `${Math.min(n - 1, Math.floor(p.x * n))},${Math.min(n - 1, Math.floor(p.y * n))}`,
    ),
  );
  assert.equal(celulas.size, n * n, 'cobertura incompleta da grade');
});

test('Hilbert tem localidade: nenhum salto atravessa a viewport', () => {
  const pts = trajetoriaHilbert(4);
  const n = 1 << 4;
  // Passo de uma célula: distância máxima esperada entre pontos consecutivos.
  const maxEsperado = (1 / n) * 1.5;
  let maior = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as NormalizedPoint;
    const b = pts[i] as NormalizedPoint;
    maior = Math.max(maior, Math.hypot(b.x - a.x, b.y - a.y));
  }
  assert.ok(
    maior <= maxEsperado,
    `salto de ${maior.toFixed(4)} excede ${maxEsperado.toFixed(4)} — perdeu a localidade`,
  );
});

test('serpentina alterna a direção entre linhas', () => {
  const pts = trajetoriaSerpentina(2, 4);
  const linha1 = pts.slice(0, 4).map((p) => p.x);
  const linha2 = pts.slice(4, 8).map((p) => p.x);
  assert.deepEqual(
    [...linha1].sort((a, b) => a - b),
    linha1,
    'primeira linha deve subir',
  );
  assert.deepEqual(
    [...linha2].sort((a, b) => b - a),
    linha2,
    'segunda linha deve descer',
  );
});

test('círculo fechando reduz o raio a cada volta', () => {
  const pts = trajetoriaCirculoFechando(3, 8);
  const raio = (p: NormalizedPoint): number => Math.hypot(p.x - 0.5, p.y - 0.5);
  const primeiro = raio(pts[0] as NormalizedPoint);
  const ultimo = raio(pts[pts.length - 1] as NormalizedPoint);
  assert.ok(primeiro > ultimo, `esperava fechar: ${primeiro} → ${ultimo}`);
});

test('a trajetória de cobertura é a principal e as complementares não a repetem', () => {
  assert.equal(TRAJETORIA_COBERTURA, 'hilbert');
  assert.ok(!TRAJETORIAS_COMPLEMENTARES.includes(TRAJETORIA_COBERTURA));
  // Os círculos são complementares, como o pedido exige — não a trajetória base.
  assert.ok(TRAJETORIAS_COMPLEMENTARES.includes('circulo-fechando'));
  assert.ok(TRAJETORIAS_COMPLEMENTARES.includes('circulo-expandindo'));
});

test('refinamento fica dentro da região pedida', () => {
  const regiao = { x: 0.25, y: 0.5, w: 0.25, h: 0.25 };
  for (const p of trajetoriaRefinamento(regiao, 4)) {
    assert.ok(p.x >= regiao.x && p.x <= regiao.x + regiao.w, `x=${p.x} fora da região`);
    assert.ok(p.y >= regiao.y && p.y <= regiao.y + regiao.h, `y=${p.y} fora da região`);
  }
});

test('paraPixels converte por viewport e nunca cai na borda', () => {
  assert.deepEqual(paraPixels({ x: 0.5, y: 0.5 }, { width: 1440, height: 900 }), {
    x: 720,
    y: 450,
  });
  assert.deepEqual(paraPixels({ x: 0.5, y: 0.5 }, { width: 1280, height: 720 }), {
    x: 640,
    y: 360,
  });
  const canto = paraPixels({ x: 1, y: 1 }, { width: 800, height: 600 });
  assert.deepEqual(canto, { x: 799, y: 599 }, 'a borda exata deixaria o ponteiro fora da viewport');
});

test('boxNormalizado é o inverso de paraPixels na escala', () => {
  const vp = { width: 1000, height: 500 };
  assert.deepEqual(boxNormalizado({ x: 250, y: 100, w: 500, h: 250 }, vp), {
    x: 0.25,
    y: 0.2,
    w: 0.5,
    h: 0.5,
  });
});

test('unirRegioes junta vizinhas e preserva as distantes', () => {
  const juntas = unirRegioes([
    { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    { x: 0.19, y: 0.1, w: 0.1, h: 0.1 },
    { x: 0.8, y: 0.8, w: 0.1, h: 0.1 },
  ]);
  assert.equal(juntas.length, 2);
  const grande = juntas.find((r) => r.w > 0.15);
  assert.ok(grande, 'as duas vizinhas deviam virar uma só');
  assert.ok(Math.abs(grande.x - 0.1) < 1e-9);
  assert.ok(Math.abs(grande.w - 0.19) < 1e-9);
});
