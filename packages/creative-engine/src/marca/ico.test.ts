import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerIco, montarIco } from './ico.js';

/**
 * O `favicon.ico`, sem navegador.
 *
 * Ele é um container binário, e montar container é aritmética de deslocamento:
 * não precisa de Chromium para ser conferido, e a suíte rápida é a que bloqueia
 * o CI.
 */

test('PROVA: o .ico e um container de verdade, com varios tamanhos dentro', () => {
  // Um PNG renomeado é o "bitmap disfarçado" que a espec do pacote proíbe na
  // outra ponta. O `.ico` existe porque o sistema ESCOLHE, entre os tamanhos
  // que o arquivo carrega, o que serve à aba, ao atalho e à barra de tarefas.
  const falso = (n: number): Uint8Array =>
    new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));
  const ico = montarIco([
    { lado: 16, png: falso(100) },
    { lado: 32, png: falso(200) },
    { lado: 48, png: falso(300) },
  ]);

  const dentro = lerIco(ico);
  assert.deepEqual(
    dentro.map((d) => d.lado),
    [16, 32, 48],
  );
  assert.deepEqual(
    dentro.map((d) => d.bytes),
    [100, 200, 300],
  );
  // 6 de cabeçalho + 3 entradas de 16 + as três imagens.
  assert.equal(ico.byteLength, 6 + 16 * 3 + 100 + 200 + 300);
});

test('o .ico enderecaria 256 como ZERO, que e como o formato o escreve', () => {
  const ico = montarIco([{ lado: 256, png: new Uint8Array(10) }]);
  // O campo tem um byte, e o formato usa o zero para o maior tamanho.
  assert.equal(Buffer.from(ico).readUInt8(6), 0);
  assert.equal(lerIco(ico)[0]?.lado, 256);
});

test('o .ico recusa o que o formato nao endereca', () => {
  assert.throws(() => montarIco([]), /ICO_SEM_IMAGEM/);
  assert.throws(() => montarIco([{ lado: 512, png: new Uint8Array(1) }]), /ICO_LADO_INVALIDO/);
});
