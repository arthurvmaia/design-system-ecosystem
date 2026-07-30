import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analisarVideo } from './video.js';

/**
 * O caso que originou este módulo: um `.mp4` de 29 MB que o app aceitou e que
 * nenhum navegador tocou, porque era HEVC. O nome do arquivo não diz o codec.
 */

/** Monta um MP4 mínimo: ftyp + moov contendo o fourCC do codec. */
const mp4Com = (codec: string): Uint8Array => {
  const box = (tipo: string, corpo: Uint8Array): Uint8Array => {
    const b = new Uint8Array(8 + corpo.length);
    const n = 8 + corpo.length;
    b[0] = (n >>> 24) & 255;
    b[1] = (n >>> 16) & 255;
    b[2] = (n >>> 8) & 255;
    b[3] = n & 255;
    for (let i = 0; i < 4; i++) b[4 + i] = tipo.charCodeAt(i);
    b.set(corpo, 8);
    return b;
  };
  const ftyp = box('ftyp', new TextEncoder().encode('isomiso2mp41'));
  // Preenchimento antes do fourCC, como num stsd de verdade.
  const moov = box('moov', new TextEncoder().encode(`....stsd....${codec}....`));
  const fora = new Uint8Array(ftyp.length + moov.length);
  fora.set(ftyp, 0);
  fora.set(moov, ftyp.length);
  return fora;
};

test('HEVC é recusado com um motivo que diz o que fazer', () => {
  const r = analisarVideo(mp4Com('hvc1'));
  assert.equal(r.codec, 'hevc');
  assert.equal(r.tocaNaWeb, false);
  assert.match(r.motivo ?? '', /H\.264/);
});

test('hev1 é o mesmo HEVC com outro nome', () => {
  assert.equal(analisarVideo(mp4Com('hev1')).codec, 'hevc');
});

test('H.264 passa', () => {
  const r = analisarVideo(mp4Com('avc1'));
  assert.equal(r.codec, 'h264');
  assert.equal(r.tocaNaWeb, true);
  assert.equal(r.motivo, null);
});

test('AV1 e VP9 passam', () => {
  assert.equal(analisarVideo(mp4Com('av01')).tocaNaWeb, true);
  assert.equal(analisarVideo(mp4Com('vp09')).tocaNaWeb, true);
});

test('webm passa pela assinatura, sem parser de EBML', () => {
  const b = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  const r = analisarVideo(b);
  assert.equal(r.container, 'webm');
  assert.equal(r.tocaNaWeb, true);
});

test('o que não dá para afirmar PASSA: falso negativo bloquearia arquivo bom', () => {
  const r = analisarVideo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
  assert.equal(r.tocaNaWeb, true);
  assert.equal(r.codec, 'desconhecido');
});

test('mp4 sem codec reconhecido no moov passa', () => {
  assert.equal(analisarVideo(mp4Com('xxxx')).tocaNaWeb, true);
});

test('o arquivo REAL que quebrou é reconhecido como HEVC', (t) => {
  const f =
    'C:/Users/arthur.maia/design-system-ecosystem/projects/prj_01KYRJNMZFYQZT53SMM3P455YB/media/ms6zzsto-ljwn-0307.mp4';
  let bytes: Buffer;
  try {
    bytes = readFileSync(f);
  } catch {
    return t.skip('o arquivo do acervo não está nesta máquina');
  }
  const r = analisarVideo(bytes);
  assert.equal(r.codec, 'hevc');
  assert.equal(r.tocaNaWeb, false);
});
