import { inflateSync } from 'node:zlib';

/**
 * Decodificador PNG mínimo — sem dependência externa.
 *
 * Existe porque a observação temporal precisa de uma resposta que hash de bytes
 * não dá: **quanto** mudou e **onde**. Comparar o hash de dois screenshots diz
 * apenas "mudou / não mudou"; para separar "o vídeo está rodando naquele canto"
 * de "a página inteira trocou de tema" — e para mascarar as regiões dinâmicas na
 * comparação visual — é preciso o pixel.
 *
 * Cobre o que o Chromium produz em `screenshot()`: bit depth 8, não-entrelaçado,
 * color type 0 (cinza), 2 (RGB), 4 (cinza+alfa) e 6 (RGBA). Paleta (3) e 16 bits
 * lançam erro claro, e o chamador degrada para comparação por hash — nunca finge
 * ter medido.
 */

export type ImagemRaw = {
  width: number;
  height: number;
  /** Canais por pixel no buffer devolvido (sempre 4: normalizamos para RGBA). */
  channels: 4;
  /** RGBA, linha por linha. */
  data: Uint8Array;
};

export class PngNaoSuportado extends Error {
  constructor(motivo: string) {
    super(`PNG não suportado: ${motivo}`);
    this.name = 'PngNaoSuportado';
  }
}

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const canaisPorTipo: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/** Desfaz os filtros de linha, in-place, sobre os dados já descomprimidos. */
const desfiltrar = (
  bruto: Uint8Array,
  width: number,
  height: number,
  canais: number,
): Uint8Array => {
  const stride = width * canais;
  const out = new Uint8Array(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filtro = bruto[pos];
    pos++;
    if (filtro === undefined) throw new PngNaoSuportado('dados truncados');
    const linha = out.subarray(y * stride, (y + 1) * stride);
    const anterior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const x = bruto[pos + i] ?? 0;
      const a = i >= canais ? (linha[i - canais] ?? 0) : 0;
      const b = anterior ? (anterior[i] ?? 0) : 0;
      const c = anterior && i >= canais ? (anterior[i - canais] ?? 0) : 0;
      let v: number;
      switch (filtro) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4:
          v = x + paeth(a, b, c);
          break;
        default:
          throw new PngNaoSuportado(`filtro ${filtro}`);
      }
      linha[i] = v & 0xff;
    }
    pos += stride;
  }
  return out;
};

/** Normaliza para RGBA, qualquer que seja o color type de origem. */
const paraRgba = (src: Uint8Array, width: number, height: number, canais: number): Uint8Array => {
  if (canais === 4) return src;
  const out = new Uint8Array(width * height * 4);
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const s = i * canais;
    const d = i * 4;
    if (canais === 1) {
      const g = src[s] ?? 0;
      out[d] = g;
      out[d + 1] = g;
      out[d + 2] = g;
      out[d + 3] = 255;
    } else if (canais === 2) {
      const g = src[s] ?? 0;
      out[d] = g;
      out[d + 1] = g;
      out[d + 2] = g;
      out[d + 3] = src[s + 1] ?? 255;
    } else {
      out[d] = src[s] ?? 0;
      out[d + 1] = src[s + 1] ?? 0;
      out[d + 2] = src[s + 2] ?? 0;
      out[d + 3] = 255;
    }
  }
  return out;
};

const leU32 = (b: Uint8Array, off: number): number =>
  ((b[off] ?? 0) << 24) | ((b[off + 1] ?? 0) << 16) | ((b[off + 2] ?? 0) << 8) | (b[off + 3] ?? 0);

/** Decodifica um PNG para RGBA. Lança `PngNaoSuportado` no que sai do escopo. */
export const decodePng = (bytes: Uint8Array): ImagemRaw => {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== ASSINATURA[i]) throw new PngNaoSuportado('assinatura inválida');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let canais = 0;
  const idat: Uint8Array[] = [];

  while (pos + 8 <= bytes.length) {
    const len = leU32(bytes, pos);
    const tipo = String.fromCharCode(
      bytes[pos + 4] ?? 0,
      bytes[pos + 5] ?? 0,
      bytes[pos + 6] ?? 0,
      bytes[pos + 7] ?? 0,
    );
    const dados = bytes.subarray(pos + 8, pos + 8 + len);
    if (tipo === 'IHDR') {
      width = leU32(dados, 0);
      height = leU32(dados, 4);
      const bitDepth = dados[8] ?? 0;
      const colorType = dados[9] ?? 0;
      const interlace = dados[12] ?? 0;
      if (bitDepth !== 8) throw new PngNaoSuportado(`bit depth ${bitDepth}`);
      if (interlace !== 0) throw new PngNaoSuportado('entrelaçado');
      const c = canaisPorTipo[colorType];
      if (c === undefined) throw new PngNaoSuportado(`color type ${colorType}`);
      canais = c;
    } else if (tipo === 'IDAT') {
      idat.push(dados);
    } else if (tipo === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (width === 0 || height === 0 || canais === 0) throw new PngNaoSuportado('IHDR ausente');
  if (idat.length === 0) throw new PngNaoSuportado('IDAT ausente');

  const comprimido = Buffer.concat(idat.map((c) => Buffer.from(c)));
  const bruto = new Uint8Array(inflateSync(comprimido));
  const plano = desfiltrar(bruto, width, height, canais);
  return { width, height, channels: 4, data: paraRgba(plano, width, height, canais) };
};
