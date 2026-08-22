import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dimensaoDePng } from './imagem.js';

/**
 * A medida sai dos BYTES, para o portão de entrega poder conferir sozinho.
 *
 * A folha de conferência é escrita por quem produziu a peça. Se o portão só a
 * lesse, uma folha escrita à mão — ou um arquivo trocado depois — passaria
 * dizendo que está tudo certo. Medir aqui é o que torna o portão um portão.
 */

/** Monta o cabeçalho de um PNG com a dimensão pedida. O resto não importa. */
const cabecalhoPng = (largura: number, altura: number): Uint8Array => {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const escreverU32 = (off: number, n: number) => {
    b[off] = (n >>> 24) & 0xff;
    b[off + 1] = (n >>> 16) & 0xff;
    b[off + 2] = (n >>> 8) & 0xff;
    b[off + 3] = n & 0xff;
  };
  escreverU32(16, largura);
  escreverU32(20, altura);
  return b;
};

test('le a dimensao do cabecalho', () => {
  assert.deepEqual(dimensaoDePng(cabecalhoPng(1080, 1920)), { largura: 1080, altura: 1920 });
  assert.deepEqual(dimensaoDePng(cabecalhoPng(1500, 500)), { largura: 1500, altura: 500 });
});

test('dimensao grande nao vira numero negativo', () => {
  // 3000 px cabe folgado, mas um deslize de sinal em 32 bits estragaria
  // qualquer imagem acima de 2^31 — e o erro apareceria como largura negativa.
  const r = dimensaoDePng(cabecalhoPng(3000, 4000));
  assert.deepEqual(r, { largura: 3000, altura: 4000 });
  assert.ok((r?.largura ?? -1) > 0);
});

test('o que nao e PNG devolve null, e null NAO e aprovacao', () => {
  assert.equal(dimensaoDePng(new Uint8Array([1, 2, 3])), null, 'curto demais');
  const falso = cabecalhoPng(100, 100);
  falso[1] = 0x00;
  assert.equal(dimensaoDePng(falso), null, 'assinatura errada');
});

test('dimensao zerada nao passa por medida', () => {
  assert.equal(dimensaoDePng(cabecalhoPng(0, 100)), null);
  assert.equal(dimensaoDePng(cabecalhoPng(100, 0)), null);
});
