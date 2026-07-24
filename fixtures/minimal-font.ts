/**
 * Gerador de uma fonte TTF MÍNIMA e válida, para testes.
 *
 * Não é material licenciado de terceiros: é uma fonte sintética com um nome de
 * família e um glifo vazio, suficiente para o navegador PARSEAR, carregar via
 * `document.fonts` e aplicar a família no estilo computado. É a "fixtura mínima
 * apropriada para testes" permitida pelo pedido.
 */

const u16 = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const i16 = (n: number): number[] => u16(n & 0xffff);
const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

const tag = (s: string): number[] => [
  s.charCodeAt(0),
  s.charCodeAt(1),
  s.charCodeAt(2),
  s.charCodeAt(3),
];

/** Alinha um array de bytes a múltiplo de 4 (padding com zero). */
const pad4 = (b: number[]): number[] => {
  const r = [...b];
  while (r.length % 4 !== 0) r.push(0);
  return r;
};

/** Soma de checksum (uint32) sobre bytes já alinhados a 4. */
const checksum = (b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) {
    const w =
      ((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    sum = (sum + (w >>> 0)) >>> 0;
  }
  return sum >>> 0;
};

const utf16be = (s: string): number[] => {
  const out: number[] = [];
  for (const ch of s) out.push(...u16(ch.charCodeAt(0)));
  return out;
};

export const minimalTtf = (family = 'DSTestFont'): Buffer => {
  const numGlyphs = 2; // .notdef + 1 vazio

  const head = [
    ...u16(1),
    ...u16(0), // version
    ...u32(0x00010000), // fontRevision
    ...u32(0), // checksumAdjustment (preenchido depois)
    ...u32(0x5f0f3cf5), // magic
    ...u16(0x000b), // flags
    ...u16(1024), // unitsPerEm
    ...u32(0),
    ...u32(0), // created
    ...u32(0),
    ...u32(0), // modified
    ...i16(0),
    ...i16(-200),
    ...i16(1024),
    ...i16(800), // bbox
    ...u16(0), // macStyle
    ...u16(8), // lowestRecPPEM
    ...i16(2), // fontDirectionHint
    ...i16(0), // indexToLocFormat (short)
    ...i16(0), // glyphDataFormat
  ];

  const hhea = [
    ...u16(1),
    ...u16(0),
    ...i16(800),
    ...i16(-200),
    ...i16(0),
    ...u16(1024),
    ...i16(0),
    ...i16(0),
    ...i16(1024),
    ...i16(1),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...u16(numGlyphs), // numberOfHMetrics
  ];

  const maxp = [
    ...u32(0x00010000),
    ...u16(numGlyphs),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(1),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...u16(0),
  ];

  // Duas métricas: ambas advance 1024, lsb 0.
  const hmtx = [...u16(1024), ...i16(0), ...u16(1024), ...i16(0)];

  // loca short: 3 offsets (numGlyphs+1), todos 0 → glifos vazios.
  const loca = [...u16(0), ...u16(0), ...u16(0)];

  // glyf vazio.
  const glyf: number[] = [0, 0, 0, 0];

  // cmap format 4: mapeia 'A' (0x41) → glifo 1.
  const sub4 = [
    ...u16(4), // format
    ...u16(0), // length (preenchido)
    ...u16(0), // language
    ...u16(4), // segCountX2
    ...u16(4), // searchRange
    ...u16(1), // entrySelector
    ...u16(0), // rangeShift
    ...u16(0x41),
    ...u16(0xffff), // endCode
    ...u16(0), // reservedPad
    ...u16(0x41),
    ...u16(0xffff), // startCode
    ...u16(0xffc0),
    ...u16(1), // idDelta
    ...u16(0),
    ...u16(0), // idRangeOffset
  ];
  sub4[2] = (sub4.length >>> 8) & 0xff;
  sub4[3] = sub4.length & 0xff;
  const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...sub4];

  // name: família (1), subfamília (2), full (4), postscript (6).
  const nomes: Array<[number, string]> = [
    [1, family],
    [2, 'Regular'],
    [4, family],
    [6, family.replace(/\s+/g, '')],
  ];
  const nameRecords: number[] = [];
  const nameStrings: number[] = [];
  for (const [id, str] of nomes) {
    const bytes = utf16be(str);
    nameRecords.push(
      ...u16(3),
      ...u16(1),
      ...u16(0x0409),
      ...u16(id),
      ...u16(bytes.length),
      ...u16(nameStrings.length),
    );
    nameStrings.push(...bytes);
  }
  const stringOffset = 6 + nomes.length * 12;
  const name = [
    ...u16(0),
    ...u16(nomes.length),
    ...u16(stringOffset),
    ...nameRecords,
    ...nameStrings,
  ];

  const post = [
    ...u32(0x00030000),
    ...u32(0), // italicAngle
    ...i16(0),
    ...i16(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
  ];

  const os2 = [
    ...u16(3), // version
    ...i16(1024), // xAvgCharWidth
    ...u16(400),
    ...u16(5), // weight, width
    ...u16(0), // fsType
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0),
    ...i16(0), // sub/super/strikeout
    ...i16(0), // sFamilyClass
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, // panose
    ...u32(1),
    ...u32(0),
    ...u32(0),
    ...u32(0), // unicodeRange
    ...tag('TEST'), // vendID
    ...u16(0x0040), // fsSelection (regular)
    ...u16(0x41),
    ...u16(0x41), // first/last char
    ...i16(800),
    ...i16(-200),
    ...i16(0), // typo
    ...u16(800),
    ...u16(200), // win asc/desc
    ...u32(1),
    ...u32(0), // codePageRange
    ...i16(0),
    ...i16(0), // xHeight, capHeight
    ...u16(0),
    ...u16(0x20), // defaultChar, breakChar
    ...u16(0), // maxContext
  ];

  // Monta as tabelas (tag → bytes), ordenadas por tag.
  const tabelas: Array<[string, number[]]> = [
    ['OS/2', os2],
    ['cmap', cmap],
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', loca],
    ['maxp', maxp],
    ['name', name],
    ['post', post],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const numTables = tabelas.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const rangeShift = numTables * 16 - searchRange;

  const header = [
    ...u32(0x00010000),
    ...u16(numTables),
    ...u16(searchRange),
    ...u16(entrySelector),
    ...u16(rangeShift),
  ];
  let offset = header.length + numTables * 16;

  const dir: number[] = [];
  const corpo: number[] = [];
  const headStart = { off: 0 };
  for (const [t, bytes] of tabelas) {
    const padded = pad4(bytes);
    const cs = checksum(padded);
    if (t === 'head') headStart.off = offset;
    dir.push(...tag(t), ...u32(cs), ...u32(offset), ...u32(bytes.length));
    corpo.push(...padded);
    offset += padded.length;
  }

  const arquivo = [...header, ...dir, ...corpo];
  // checksumAdjustment do head.
  const total = checksum(pad4(arquivo));
  const adj = (0xb1b0afba - total) >>> 0;
  const adjOff = headStart.off + 8; // após version(4)+fontRevision(4)
  arquivo[adjOff] = (adj >>> 24) & 0xff;
  arquivo[adjOff + 1] = (adj >>> 16) & 0xff;
  arquivo[adjOff + 2] = (adj >>> 8) & 0xff;
  arquivo[adjOff + 3] = adj & 0xff;

  return Buffer.from(arquivo);
};
