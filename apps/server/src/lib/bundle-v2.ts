/**
 * Leitura do bundle de um segmento do motor V2 e utilidades de imagem para a
 * validação por representação.
 *
 * O bundle mora em `vault/<ds>/segments/bundles/seg_<position>/` e o seu
 * `manifest.json` guarda a decisão de representação — é ELE que diz ao preview
 * se o segmento se serve como componente portátil (caminho clássico), cápsula
 * de runtime (`runtime.html` isolado) ou referência visual (frame + aviso).
 * Sem bundle, o segmento é tratado como portátil: é o comportamento V1.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type ImagemRaw, LIMIAR_POR_NATUREZA, decodePng, diffImagens } from '@ds/engine-v2';
import {
  type DesignSystemId,
  type VisualComparison,
  vaultCaptureV2FramesDir,
  vaultCaptureV2Manifest,
  vaultSegmentBundlesDir,
  vaultSegmentsManifest,
} from '@ds/shared';

export type RepresentacaoBundle = 'componente-portatil' | 'capsula-runtime' | 'referencia-visual';

export type NaturezaRegiao = keyof typeof LIMIAR_POR_NATUREZA;

export type BundleInfo = {
  /** Nome da pasta (`seg_<position>`), usado na rota de bundle. */
  pasta: string;
  /** Caminho absoluto do bundle no vault. */
  dir: string;
  representation: RepresentacaoBundle;
  /** Limitações que o compilador declarou para esta peça. */
  limitacoes: string[];
  /** Hash da seção (SegmentEvidence.segmentId) — liga o bundle ao manifesto V2. */
  hash: string | null;
  /** Hashes dos membros da seção — alvos das observações temporais (loop). */
  members: string[];
  /** Ids de mídia/runtime da evidência, para decidir a natureza da comparação. */
  mediaIds: string[];
  runtimeIds: string[];
};

const REPRESENTACOES: ReadonlySet<string> = new Set([
  'componente-portatil',
  'capsula-runtime',
  'referencia-visual',
]);

/**
 * Representação declarada num diretório de bundle qualquer (segmento OU cópia
 * curada na Biblioteca). `null` = sem manifest do compilador (bundle clássico).
 */
export const lerRepresentacaoDeDir = (dir: string): RepresentacaoBundle | null => {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      representation?: { type?: unknown };
    };
    const type = m.representation?.type;
    return typeof type === 'string' && REPRESENTACOES.has(type)
      ? (type as RepresentacaoBundle)
      : null;
  } catch {
    return null;
  }
};

/** Hash cheio → pasta, e prefixo de 10 → pasta (`null` = prefixo disputado). */
type IndiceDeBundles = {
  porHash: Map<string, string>;
  porPrefixo: Map<string, string | null>;
};

const VAZIO: IndiceDeBundles = { porHash: new Map(), porPrefixo: new Map() };

/** Tamanho do prefixo que o nome do frame carrega (`secao-<hash10>-<bytes8>.png`). */
const TAM_PREFIXO = 10;

const indices = new Map<string, { mtimeMs: number; indice: IndiceDeBundles }>();

/**
 * O índice hash → pasta de bundle, lido dos manifests de um design system.
 *
 * É o que faz a resolução por IDENTIDADE funcionar sobre o acervo que já está
 * em disco, sem migração nenhuma e sem reescrever nada: cada manifest já grava
 * `evidence.segmentId`, que é o hash do nó de origem daquele bundle. A chave
 * estava lá desde sempre e era lida e descartada.
 *
 * Cacheado por mtime do diretório de bundles: recompilar invalida sozinho.
 */
const indiceDeHashes = (dsId: DesignSystemId): IndiceDeBundles => {
  const raiz = vaultSegmentBundlesDir(dsId);
  if (!existsSync(raiz)) return VAZIO;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(raiz).mtimeMs;
  } catch {
    return VAZIO;
  }
  const cache = indices.get(raiz);
  if (cache !== undefined && cache.mtimeMs === mtimeMs) return cache.indice;

  const porHash = new Map<string, string>();
  const porPrefixo = new Map<string, string | null>();
  try {
    for (const pasta of readdirSync(raiz)) {
      const manifestPath = join(raiz, pasta, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          evidence?: { segmentId?: unknown };
        };
        const hash = m.evidence?.segmentId;
        // O PRIMEIRO a reivindicar o hash fica com ele. Duas pastas com o mesmo
        // hash é estado inconsistente de disco, e escolher pela ordem é
        // determinístico — melhor que a última leitura vencer por acaso.
        if (typeof hash === 'string' && hash !== '' && !porHash.has(hash)) {
          porHash.set(hash, pasta);
        }
        if (typeof hash === 'string' && hash.length >= TAM_PREFIXO) {
          const p = hash.slice(0, TAM_PREFIXO);
          // Disputa de prefixo vira `null` de propósito: com dois donos possíveis
          // não há como afirmar qual é, e chutar um é o defeito que a resolução
          // por identidade existe para acabar. Sem dono único, cai na posição.
          porPrefixo.set(p, porPrefixo.has(p) ? null : pasta);
        }
      } catch {
        // Manifest ilegível não derruba o índice: as outras pastas continuam.
      }
    }
  } catch {
    return VAZIO;
  }
  const indice: IndiceDeBundles = { porHash, porPrefixo };
  indices.set(raiz, { mtimeMs, indice });
  return indice;
};

/**
 * O prefixo do hash da seção que o nome do print carrega.
 *
 * O hash completo não está gravado em lugar nenhum do lado do SEGMENTO (a
 * coluna foi adiada de propósito, e o insight não o guarda), mas a captura
 * batiza o print da dobra de `secao-<hash10>-<bytes8>.png`. São 10 dos 16
 * caracteres do hash da seção, e é a única identidade que sobreviveu ali —
 * suficiente para achar a pasta certa sem migração nenhuma.
 *
 * `null` quando o nome não é desse formato: aí não dá para afirmar identidade e
 * quem chama cai na posição, como sempre.
 */
export const prefixoDeHashDoFrame = (framePath: string | null | undefined): string | null => {
  if (typeof framePath !== 'string' || framePath === '') return null;
  const nome = framePath.replace(/\\/g, '/').split('/').pop() ?? '';
  const m = /^secao-([0-9a-f]+)-/.exec(nome);
  const prefixo = m?.[1];
  return prefixo !== undefined && prefixo.length >= TAM_PREFIXO
    ? prefixo.slice(0, TAM_PREFIXO)
    : null;
};

/**
 * Índice segmento → print da dobra, do manifesto de segmentos.
 *
 * Existe para os chamadores que só têm o `SegmentRecord` em mãos (a prévia lê do
 * banco, não do manifesto) conseguirem montar a chave composta. Cacheado por
 * mtime porque o manifesto carrega o `htmlSnippet` de todos os segmentos e
 * costuma passar de 1 MB: parseá-lo a cada miniatura de card sairia caro.
 */
const framesPorSegmento = new Map<string, { mtimeMs: number; porSegmento: Map<string, string> }>();

export const framePathDoSegmento = (dsId: DesignSystemId, segId: string): string | null => {
  const path = vaultSegmentsManifest(dsId);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }
  const cache = framesPorSegmento.get(path);
  if (cache !== undefined && cache.mtimeMs === mtimeMs) return cache.porSegmento.get(segId) ?? null;

  const porSegmento = new Map<string, string>();
  try {
    const m = JSON.parse(readFileSync(path, 'utf8')) as {
      insights?: Array<{ segmentId?: unknown; framePath?: unknown }>;
    };
    for (const i of m.insights ?? []) {
      if (
        typeof i.segmentId === 'string' &&
        typeof i.framePath === 'string' &&
        i.framePath !== ''
      ) {
        porSegmento.set(i.segmentId, i.framePath);
      }
    }
  } catch {
    return null;
  }
  framesPorSegmento.set(path, { mtimeMs, porSegmento });
  return porSegmento.get(segId) ?? null;
};

/**
 * A chave de um bundle: identidade primeiro, posição por último.
 *
 * `position` acumulava dois papéis — ordem de exibição na Galeria e identidade
 * de pasta em disco — e isso tinha consequência medida: um candidato rejeitado
 * recuperado entra com a `position` de um contador próprio, colide com a de uma
 * seção existente, e a partir daí a prévia e a promoção servem o bundle de OUTRO
 * segmento. O acervo tinha um rejeitado esperando esse clique.
 *
 * Os quatro níveis, do mais forte ao mais fraco:
 *  1. `bundleId` — autoritativo, escrito pelo motor. O(1).
 *  2. `hash` no índice dos manifests — cobre o acervo atual sem escrita nenhuma.
 *  3. `framePath` — o nome do print carrega 10 caracteres do hash da seção. É o
 *     nível que de fato roda hoje: nenhum chamador tem o hash completo em mãos,
 *     porque ele não é gravado por segmento em lugar nenhum. Só vale quando o
 *     prefixo tem um dono único.
 *  4. `seg_<position>` — o comportamento de sempre. O pior caso de um bug nos
 *     níveis acima é voltar exatamente a ele, e não regredir.
 */
export type ChaveDeBundle = {
  bundleId?: string | null;
  hash?: string | null;
  /** Print da dobra do insight, relativo a `capture-v2/` (`frames/secao-…png`). */
  framePath?: string | null;
  position: number;
};

/** A pasta que a IDENTIDADE aponta, ou `null` quando não dá para afirmar. */
const pastaPorIdentidade = (dsId: DesignSystemId, c: ChaveDeBundle): string | null => {
  const temHash = c.hash != null && c.hash !== '';
  const prefixo = prefixoDeHashDoFrame(c.framePath);
  // Sem identidade nenhuma não se constrói índice: a chave só com posição é o
  // caso mais comum (subcomponente, extração V1) e não deve pagar a varredura.
  if (!temHash && prefixo === null) return null;
  const indice = indiceDeHashes(dsId);
  if (temHash) {
    const exato = indice.porHash.get(c.hash as string);
    if (exato !== undefined) return exato;
  }
  return prefixo === null ? null : (indice.porPrefixo.get(prefixo) ?? null);
};

/** Lê o manifest.json do bundle de um segmento. `null` = sem bundle (fluxo V1). */
export const lerBundleInfo = (
  dsId: DesignSystemId,
  chave: number | ChaveDeBundle,
): BundleInfo | null => {
  const c: ChaveDeBundle = typeof chave === 'number' ? { position: chave } : chave;
  const doIndice = pastaPorIdentidade(dsId, c);
  const pasta =
    c.bundleId != null && c.bundleId !== '' ? c.bundleId : (doIndice ?? `seg_${c.position}`);
  const dir = join(vaultSegmentBundlesDir(dsId), pasta);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      representation?: { type?: unknown };
      limitations?: unknown;
      evidence?: {
        segmentId?: unknown;
        members?: unknown;
        mediaIds?: unknown;
        runtimeIds?: unknown;
      };
    };
    const type = m.representation?.type;
    if (typeof type !== 'string' || !REPRESENTACOES.has(type)) return null;
    const lista = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return {
      pasta,
      dir,
      representation: type as RepresentacaoBundle,
      limitacoes: lista(m.limitations),
      hash: typeof m.evidence?.segmentId === 'string' ? m.evidence.segmentId : null,
      members: lista(m.evidence?.members),
      mediaIds: lista(m.evidence?.mediaIds),
      runtimeIds: lista(m.evidence?.runtimeIds),
    };
  } catch {
    return null;
  }
};

/**
 * Frame de fallback da seção (`secao-<hash10>-*.png`), gravado pela captura para
 * superfícies de cena. Devolve o caminho RELATIVO a `capture-v2/` (com barra),
 * ou `null` quando a captura não guardou frame para esta seção.
 */
export const frameDaSecao = (dsId: DesignSystemId, hash: string | null): string | null => {
  if (hash === null || hash.length === 0) return null;
  const dir = vaultCaptureV2FramesDir(dsId);
  if (!existsSync(dir)) return null;
  const prefixo = `secao-${hash.slice(0, 10)}-`;
  const nome = readdirSync(dir).find((f) => f.startsWith(prefixo) && f.endsWith('.png'));
  return nome === undefined ? null : `frames/${nome}`;
};

/**
 * Frames do MOVIMENTO da seção, em ordem temporal: as amostras que a observação
 * temporal guardou para o hash da seção e dos membros dela. Com 2 ou mais dá
 * para mostrar o movimento de verdade — é o "loop visual" da referência.
 * Os nomes no manifesto são só o arquivo; o caminho devolvido já vem com o
 * prefixo `frames/` (relativo a `capture-v2/`).
 */
export const framesDoMovimento = (dsId: DesignSystemId, bundle: BundleInfo): string[] => {
  const path = vaultCaptureV2Manifest(dsId);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      temporalObservations?: Array<{ target?: unknown; frames?: unknown }>;
    };
    const alvos = new Set(
      [bundle.hash, ...bundle.members].filter((h): h is string => h !== null && h.length > 0),
    );
    const frames: string[] = [];
    for (const t of raw.temporalObservations ?? []) {
      if (typeof t.target !== 'string' || !alvos.has(t.target)) continue;
      if (!Array.isArray(t.frames)) continue;
      for (const f of t.frames) {
        if (typeof f !== 'string' || f.length === 0) continue;
        const rel = `frames/${f.replace(/\\/g, '/').replace(/^frames\//, '')}`;
        if (!frames.includes(rel)) frames.push(rel);
      }
    }
    return frames;
  } catch {
    return [];
  }
};

/** Content-Type por extensão para os arquivos servidos da rota de bundle. */
export const MIME_BUNDLE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Content-Type de um arquivo de bundle: extensão conhecida primeiro; extensão
 * DESCONHECIDA com cara de JavaScript vira `text/javascript`.
 *
 * O caso real: capturas antigas guardaram o runtime do Tailwind CDN como
 * `assets/other/<hash>.17` — a extensão veio da URL de origem e o faro de
 * conteúdo do coletor ainda não existia. Servido como `octet-stream` com
 * `nosniff`, o navegador RECUSA executar o script e a peça abre sem estilo,
 * sem nenhum erro apontando a causa. O faro aqui espelha o `pareceJs` do
 * coletor (`packages/explorer/src/assets.ts`), que hoje já grava `.js` — isto
 * cobre o acervo antigo e qualquer bundle exportado que ainda carregue o `.17`.
 */
export const mimeDoBundle = (ext: string, bytes: Uint8Array): string => {
  const porExtensao = MIME_BUNDLE[ext];
  if (porExtensao !== undefined) return porExtensao;
  const inicio = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).trimStart();
  if (
    /^(\(|!|"use strict"|'use strict'|\/\*|\/\/|(?:function|var|let|const|import|export)\s|window\.|globalThis)/.test(
      inicio,
    )
  ) {
    return 'text/javascript; charset=utf-8';
  }
  return 'application/octet-stream';
};

// ── Imagem (validação por representação) ─────────────────────────────────────

/**
 * O preview mostrou uma área praticamente toda preta/transparente?
 *
 * Amostra uma grade de ~64×64 pontos. Devolve `null` quando o PNG não pôde ser
 * decodificado — "não mensurável" é diferente de "não é tela preta", e o
 * chamador decide o que fazer com a dúvida.
 */
export const ehTelaPreta = (png: Uint8Array): boolean | null => {
  let img: ImagemRaw;
  try {
    img = decodePng(png);
  } catch {
    return null;
  }
  if (img.width === 0 || img.height === 0) return null;
  const passoY = Math.max(1, Math.floor(img.height / 64));
  const passoX = Math.max(1, Math.floor(img.width / 64));
  let escuros = 0;
  let total = 0;
  for (let y = 0; y < img.height; y += passoY) {
    for (let x = 0; x < img.width; x += passoX) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i] ?? 0;
      const g = img.data[i + 1] ?? 0;
      const b = img.data[i + 2] ?? 0;
      const a = img.data[i + 3] ?? 0;
      total++;
      if (a < 8 || (r < 18 && g < 18 && b < 18)) escuros++;
    }
  }
  // 98,5%: um hero escuro legítimo tem texto/detalhe que ocupa mais de 1,5% da
  // grade; um canvas que não pintou não tem nada.
  return total > 0 && escuros / total >= 0.985;
};

/** Reamostragem vizinho-mais-próximo para uma grade fixa de comparação. */
export const reduzirImagem = (img: ImagemRaw, w: number, h: number): ImagemRaw => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      data[di] = img.data[si] ?? 0;
      data[di + 1] = img.data[si + 1] ?? 0;
      data[di + 2] = img.data[si + 2] ?? 0;
      data[di + 3] = img.data[si + 3] ?? 0;
    }
  }
  return { width: w, height: h, channels: 4, data };
};

/**
 * Compara o frame da CAPTURA com o screenshot do PREVIEW numa grade comum.
 *
 * A reamostragem para a grade quadrada distorce o aspecto dos dois lados por
 * igual — é uma aproximação declarada, suficiente para responder "a cápsula
 * pintou algo parecido com o que foi capturado?" com o limiar POR NATUREZA
 * (um canvas animado tolera 60% de diferença; uma região estática, 2%).
 * Devolve `null` quando alguma das imagens não decodifica.
 */
export const compararCapturaComPreview = (
  pngCaptura: Uint8Array,
  pngPreview: Uint8Array,
  nature: NaturezaRegiao,
): VisualComparison | null => {
  let a: ImagemRaw;
  let b: ImagemRaw;
  try {
    a = decodePng(pngCaptura);
    b = decodePng(pngPreview);
  } catch {
    return null;
  }
  const GRADE = 192;
  const diff = diffImagens(reduzirImagem(a, GRADE, GRADE), reduzirImagem(b, GRADE, GRADE), {
    bloco: 12,
  });
  const threshold = LIMIAR_POR_NATUREZA[nature];
  return {
    a: 'captura',
    b: 'preview',
    nature,
    threshold,
    delta: Math.min(1, Math.max(0, Number(diff.delta.toFixed(4)))),
    ok: !diff.incomparavel && diff.delta <= threshold,
    masked: [],
  };
};
