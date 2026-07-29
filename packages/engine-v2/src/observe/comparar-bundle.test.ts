import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import {
  type PaginaParaComparar,
  compararBundlesComOriginal,
  naturezaDoSegmento,
  resumirComparacoes,
} from './comparar-bundle.js';

/** PNG de uma cor sólica, para o diff ter algo real para comparar. */
const pngSolido = (w: number, h: number, r: number, g: number, b: number): Uint8Array => {
  const crc = (buf: Buffer): number => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (tipo: string, dados: Buffer): Buffer => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(corpo));
    return Buffer.concat([tam, corpo, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  const linhas: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      linha[1 + x * 4] = r;
      linha[2 + x * 4] = g;
      linha[3 + x * 4] = b;
      linha[4 + x * 4] = 255;
    }
    linhas.push(linha);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.concat(linhas))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
};

const seg = (over: Partial<SegmentoV2> = {}): SegmentoV2 =>
  ({
    position: 0,
    category: 'hero',
    kind: 'section',
    name: 'Hero',
    htmlSnippet: '',
    hash: 'h1',
    evidence: { segmentId: 's', members: [], signals: [], assetKeys: [], runtimeIds: [] },
    representation: {
      type: 'componente-portatil',
      reasons: [],
      rejected: [],
      runtimes: [],
      renderMode: 'html',
      editable: true,
      confidence: 'alta',
      limitations: [],
    },
    fidelity: {},
    support: 'total',
    interactions: [],
    limitations: [],
    filhos: [],
    ...over,
  }) as unknown as SegmentoV2;

// ── A natureza decide o limiar ──────────────────────────────────────────────

test('região estática é medida com rigor; canvas, não', () => {
  // Um único limiar para tudo reprovaria toda cena animada e aprovaria um
  // layout quebrado. É por isso que a natureza existe.
  assert.equal(naturezaDoSegmento(seg()), 'estatica');
  assert.equal(
    naturezaDoSegmento(
      seg({
        representation: { ...seg().representation, renderMode: 'webgl' },
      }),
    ),
    'canvas',
  );
});

test('quem depende de runtime externo é medido com a folga que merece', () => {
  // O bundle busca o ícone na rede a cada carga; exigir precisão de pixel aqui
  // reprovaria o que está certo.
  const s = seg({
    representation: { ...seg().representation, runtimes: ['iconify'] },
  });
  assert.equal(naturezaDoSegmento(s), 'runtime-externo');
});

test('vídeo tem natureza própria, mesmo com runtime junto', () => {
  const s = seg({
    representation: { ...seg().representation, renderMode: 'video', runtimes: ['iconify'] },
  });
  assert.equal(naturezaDoSegmento(s), 'video');
});

// ── A comparação ────────────────────────────────────────────────────────────

const paginaFalsa = (opts: {
  origem?: { x: number; y: number; w: number; h: number } | null;
  imagem?: Uint8Array;
  erra?: boolean;
}): PaginaParaComparar => ({
  goto: async () => {
    if (opts.erra === true) throw new Error('não abriu');
  },
  esperar: async () => {},
  evaluate: async <T>() =>
    (opts.origem === undefined ? { x: 0, y: 0, w: 10, h: 10 } : opts.origem) as T,
  screenshot: async () => opts.imagem ?? pngSolido(20, 20, 0, 0, 0),
  fechar: async () => {},
});

const montarEntrada = (frame: Uint8Array): { dir: string; dirCaptura: string } => {
  const dirCaptura = mkdtempSync(join(tmpdir(), 'cap-'));
  writeFileSync(join(dirCaptura, 'frame.png'), frame);
  const dir = mkdtempSync(join(tmpdir(), 'bun-'));
  writeFileSync(join(dir, 'index.html'), '<html><body><section>x</section></body></html>', 'utf8');
  return { dir, dirCaptura };
};

test('imagens iguais dão delta zero e passam', async () => {
  const img = pngSolido(20, 20, 10, 20, 30);
  const { dir, dirCaptura } = montarEntrada(img);
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ imagem: img }),
    entradas: [{ segmento: seg(), dirBundle: dir, framePath: 'frame.png' }],
    dirCaptura,
  });
  assert.equal(r.comparacoes.length, 1);
  assert.equal(r.comparacoes[0]?.delta, 0);
  assert.equal(r.comparacoes[0]?.ok, true);
});

test('imagens bem diferentes reprovam numa região estática', async () => {
  const { dir, dirCaptura } = montarEntrada(pngSolido(20, 20, 0, 0, 0));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ imagem: pngSolido(20, 20, 255, 255, 255) }),
    entradas: [{ segmento: seg(), dirBundle: dir, framePath: 'frame.png' }],
    dirCaptura,
  });
  assert.equal(r.comparacoes[0]?.ok, false);
  assert.ok((r.comparacoes[0]?.delta ?? 0) > 0.5);
});

test('a MESMA diferença passa quando a região é de runtime externo', async () => {
  // É o ponto do limiar por natureza: o número não muda, o julgamento muda.
  const { dir, dirCaptura } = montarEntrada(pngSolido(20, 20, 0, 0, 0));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ imagem: pngSolido(20, 20, 130, 130, 130) }),
    entradas: [
      {
        segmento: seg({ representation: { ...seg().representation, runtimes: ['iconify'] } }),
        dirBundle: dir,
        framePath: 'frame.png',
      },
    ],
    dirCaptura,
  });
  assert.equal(r.comparacoes[0]?.nature, 'runtime-externo');
  assert.equal(r.comparacoes[0]?.threshold, 0.75);
});

test('tamanho diferente NÃO vira "100% de diferença": vira item pulado', async () => {
  // Um número que parece medição e não é seria pior que a ausência dele.
  const { dir, dirCaptura } = montarEntrada(pngSolido(20, 20, 0, 0, 0));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ imagem: pngSolido(40, 40, 0, 0, 0) }),
    entradas: [{ segmento: seg(), dirBundle: dir, framePath: 'frame.png' }],
    dirCaptura,
  });
  assert.equal(r.comparacoes.length, 0);
  assert.equal(r.pulados['tamanho-diferente'], 1);
});

test('bundle sem arquivo é contado como pulado, com o motivo', async () => {
  const dirCaptura = mkdtempSync(join(tmpdir(), 'cap-'));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({}),
    entradas: [{ segmento: seg(), dirBundle: join(tmpdir(), 'nao-existe'), framePath: 'x.png' }],
    dirCaptura,
  });
  assert.equal(r.pulados['sem-arquivo'], 1);
});

test('página que não abre não derruba a captura', async () => {
  const { dir, dirCaptura } = montarEntrada(pngSolido(20, 20, 0, 0, 0));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ erra: true }),
    entradas: [{ segmento: seg(), dirBundle: dir, framePath: 'frame.png' }],
    dirCaptura,
  });
  assert.equal(r.pulados.erro, 1);
  assert.equal(r.comparacoes.length, 0);
});

test('bundle sem região identificável é pulado com o motivo', async () => {
  const { dir, dirCaptura } = montarEntrada(pngSolido(20, 20, 0, 0, 0));
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ origem: null }),
    entradas: [{ segmento: seg(), dirBundle: dir, framePath: 'frame.png' }],
    dirCaptura,
  });
  assert.equal(r.pulados['sem-regiao'], 1);
});

test('o corte por orçamento para a lista sem inventar resultado', async () => {
  const img = pngSolido(20, 20, 0, 0, 0);
  const { dir, dirCaptura } = montarEntrada(img);
  const r = await compararBundlesComOriginal({
    pagina: paginaFalsa({ imagem: img }),
    entradas: [
      { segmento: seg(), dirBundle: dir, framePath: 'frame.png' },
      { segmento: seg(), dirBundle: dir, framePath: 'frame.png' },
    ],
    dirCaptura,
    cancelado: () => true,
  });
  assert.equal(r.comparacoes.length, 0);
});

test('o resumo conta o que foi olhado E o que ficou de fora', async () => {
  const r = resumirComparacoes({
    comparacoes: [
      {
        a: 'captura',
        b: 'bundle',
        nature: 'estatica',
        threshold: 0.02,
        delta: 0,
        ok: true,
        masked: [],
      },
      {
        a: 'captura',
        b: 'bundle',
        nature: 'estatica',
        threshold: 0.02,
        delta: 0.4,
        ok: false,
        masked: [],
      },
    ],
    pulados: {
      'sem-arquivo': 2,
      'print-ilegivel': 0,
      'sem-regiao': 0,
      'tamanho-diferente': 1,
      erro: 0,
    },
  });
  assert.equal(r.total, 2);
  assert.equal(r.ok, 1);
  assert.equal(r.piorDelta, 0.4);
  assert.equal(r.pulados, 3, 'cobertura parcial precisa aparecer no resumo');
  assert.ok(r.porMotivo.includes('sem-arquivo:2'));
});
