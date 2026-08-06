import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  LIMIAR_POR_NATUREZA,
  classificarMovimento,
  diffImagens,
  diffPng,
  hashBytes,
  melhorJanela,
  recortarImagem,
} from './pixel.js';
import { PngNaoSuportado, decodePng } from './png.js';

// ── Encoder mínimo só para os testes ────────────────────────────────────────
// Não vale um encoder de produção: o motor só LÊ PNG (do screenshot). Aqui ele
// existe para provar que o decodificador acerta pixels conhecidos.

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf: Uint8Array): number => {
  let c = -1;
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (tipo: string, dados: Uint8Array): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), Buffer.from(dados)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
};

/** Codifica RGBA com filtro 0 (None) — suficiente para exercitar o decoder. */
const encodePng = (w: number, h: number, rgba: Uint8Array, colorType = 6): Buffer => {
  const canais = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const linhas: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    linhas.push(Buffer.from([0]));
    linhas.push(Buffer.from(rgba.subarray(y * w * canais, (y + 1) * w * canais)));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.concat(linhas)))),
    chunk('IEND', new Uint8Array(0)),
  ]);
};

const solida = (w: number, h: number, r: number, g: number, b: number): Uint8Array => {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
};

// ── PNG ─────────────────────────────────────────────────────────────────────

test('decodePng lê RGBA com os pixels certos', () => {
  const img = decodePng(new Uint8Array(encodePng(2, 2, solida(2, 2, 10, 20, 30))));
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.channels, 4);
  assert.deepEqual([...img.data.subarray(0, 4)], [10, 20, 30, 255]);
});

test('decodePng normaliza RGB (color type 2) para RGBA', () => {
  const rgb = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const img = decodePng(new Uint8Array(encodePng(2, 1, rgb, 2)));
  assert.deepEqual([...img.data], [1, 2, 3, 255, 4, 5, 6, 255]);
});

test('decodePng recusa o que não sabe ler, em vez de devolver lixo', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3])), PngNaoSuportado);
});

// ── Diff ────────────────────────────────────────────────────────────────────

test('imagens iguais dão delta zero', () => {
  const a = decodePng(new Uint8Array(encodePng(32, 32, solida(32, 32, 100, 100, 100))));
  const r = diffImagens(a, a);
  assert.equal(r.delta, 0);
  assert.equal(r.regioes.length, 0);
  assert.equal(r.incomparavel, false);
});

test('ruído abaixo do limiar perceptual não conta como mudança', () => {
  const base = solida(32, 32, 100, 100, 100);
  const quase = solida(32, 32, 103, 100, 100); // Δ ~0.9 em luminância
  const r = diffImagens(
    decodePng(new Uint8Array(encodePng(32, 32, base))),
    decodePng(new Uint8Array(encodePng(32, 32, quase))),
  );
  assert.equal(r.delta, 0, 'anti-aliasing/compressão não devem virar "animação"');
});

test('mudança forte é detectada e localizada na região certa', () => {
  const a = solida(64, 64, 0, 0, 0);
  const b = solida(64, 64, 0, 0, 0);
  // Pinta o quadrante inferior direito de branco.
  for (let y = 32; y < 64; y++) {
    for (let x = 32; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      b[i] = 255;
      b[i + 1] = 255;
      b[i + 2] = 255;
    }
  }
  const r = diffImagens(
    decodePng(new Uint8Array(encodePng(64, 64, a))),
    decodePng(new Uint8Array(encodePng(64, 64, b))),
    { bloco: 16 },
  );
  assert.ok(r.delta > 0.2 && r.delta < 0.3, `delta inesperado: ${r.delta}`);
  assert.ok(r.regioes.length > 0);
  for (const reg of r.regioes) {
    assert.ok(reg.x >= 0.5 - 1e-9, `região fora do quadrante: x=${reg.x}`);
    assert.ok(reg.y >= 0.5 - 1e-9, `região fora do quadrante: y=${reg.y}`);
  }
});

test('máscara remove a região dinâmica da conta', () => {
  const a = solida(64, 64, 0, 0, 0);
  const b = solida(64, 64, 0, 0, 0);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      b[i] = 255;
    }
  }
  const ia = decodePng(new Uint8Array(encodePng(64, 64, a)));
  const ib = decodePng(new Uint8Array(encodePng(64, 64, b)));
  assert.ok(diffImagens(ia, ib, { bloco: 16 }).delta > 0);
  const mascarado = diffImagens(ia, ib, {
    bloco: 16,
    mascaras: [{ x: 0, y: 0, w: 1, h: 0.5 }],
  });
  assert.equal(mascarado.delta, 0, 'a região mascarada não deve contar');
});

test('dimensões diferentes viram incomparável, não um delta inventado', () => {
  const a = decodePng(new Uint8Array(encodePng(16, 16, solida(16, 16, 0, 0, 0))));
  const b = decodePng(new Uint8Array(encodePng(32, 32, solida(32, 32, 0, 0, 0))));
  const r = diffImagens(a, b);
  assert.equal(r.incomparavel, true);
});

test('diffPng degrada para hash quando o formato sai do escopo — e declara isso', () => {
  const r = diffPng(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]));
  assert.equal(r.degradado, true);
  assert.equal(r.delta, 1);
  const igual = diffPng(new Uint8Array([9, 9]), new Uint8Array([9, 9]));
  assert.equal(igual.degradado, true);
  assert.equal(igual.delta, 0);
});

test('hashBytes deduplica frames idênticos', () => {
  assert.equal(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 3])));
  assert.notEqual(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 4])));
});

test('classificarMovimento: um par com mudança basta (animação lenta não se perde)', () => {
  assert.equal(classificarMovimento([0, 0, 0.02, 0]).movendo, true);
  assert.equal(classificarMovimento([0, 0.0001, 0]).movendo, false);
  assert.equal(classificarMovimento([]).movendo, false);
  assert.equal(classificarMovimento([0.5, 0.4]).maiorDelta, 0.5);
});

test('o limiar de comparação visual depende da natureza da região', () => {
  assert.ok(LIMIAR_POR_NATUREZA.estatica < LIMIAR_POR_NATUREZA.animada);
  assert.ok(LIMIAR_POR_NATUREZA.animada < LIMIAR_POR_NATUREZA.video);
  assert.ok(LIMIAR_POR_NATUREZA.video < LIMIAR_POR_NATUREZA.canvas);
  assert.ok(LIMIAR_POR_NATUREZA.canvas < LIMIAR_POR_NATUREZA['runtime-externo']);
});

// ── Fase 2: alinhamento antes de condenar ───────────────────────────────────

const rgba = (
  w: number,
  h: number,
  pinta: (x: number, y: number) => number,
): import('./png.js').ImagemRaw => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = pinta(x, y);
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, channels: 4, data };
};

test('recortarImagem devolve exatamente a janela pedida', () => {
  const img = rgba(8, 8, (x, y) => (y * 8 + x) % 256);
  const r = recortarImagem(img, 2, 3, 4, 2);
  assert.equal(r.width, 4);
  assert.equal(r.height, 2);
  assert.equal(r.data[0], (3 * 8 + 2) % 256, 'primeiro pixel é o (2,3) da origem');
});

test('melhorJanela acha o deslocamento onde a imagem realmente está', () => {
  // A base é uma faixa clara em y=8..11. Na expandida, a MESMA faixa está 4 px
  // mais abaixo. Sem alinhamento, o diff em (0,0) reprova; a busca encontra
  // dy=4 com delta ~0 — que é a diferença entre "bundle errado" e "bundle
  // 4 px mais baixo", o caso das tiras finas do acervo (frames de 80 px).
  const base = rgba(32, 16, (_x, y) => (y >= 8 && y < 12 ? 255 : 0));
  // Janela sem deslocamento cobre y=8..24 da expandida; a faixa em 20..24
  // cai 4 px abaixo de onde a base a espera (relativa 8..12 → absoluta 16..20).
  const expandida = rgba(32, 32, (_x, y) => (y >= 20 && y < 24 ? 255 : 0));
  const offsets: Array<{ dx: number; dy: number }> = [];
  for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) offsets.push({ dx, dy });
  // A janela sem deslocamento começa em (0, 8) dentro da expandida.
  const semAlinhar = diffImagens(base, recortarImagem(expandida, 0, 8, 32, 16));
  assert.ok(semAlinhar.delta > 0.1, 'crua, a faixa deslocada reprova');
  const m = melhorJanela(base, expandida, 0, 8, offsets);
  assert.equal(m.dy, 4, 'a faixa está 4 px abaixo, e a busca diz isso');
  assert.ok(m.delta < 0.01, 'alinhada, a diferença some');
});

test('melhorJanela sem janela possível devolve delta 1, nunca inventa', () => {
  const base = rgba(16, 16, () => 0);
  const pequena = rgba(8, 8, () => 0);
  const m = melhorJanela(base, pequena, 0, 0, [{ dx: 0, dy: 0 }]);
  assert.equal(m.delta, 1);
});
