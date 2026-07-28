import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type CapturedAsset,
  type RepresentationDecision,
  type StackEntry,
  derivarContrato,
} from '@ds/shared';
import type { RawJsInline } from '../mapper/raw.js';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import { type ResultadoCss, organizarCss } from './css-organize.js';
import { type ResultadoJs, organizarJs, tagsDeScript } from './js-organize.js';
import { renderizarStackMd } from './stack.js';
import { classificarSvg, isolarIdsSvg } from './svg-classify.js';

/**
 * Escrita do bundle de um segmento.
 *
 * O bundle é o que faz o item **sobreviver sozinho**: apagar a extração original
 * não pode quebrar o que a Biblioteca guardou. Por isso o `index.html` do bundle
 * referencia só caminhos relativos internos, e cada asset de que ele depende é
 * declarado no `manifest.json` — não basta o arquivo existir em algum lugar do
 * vault, o bundle precisa saber de quais arquivos ele depende.
 *
 * A forma da saída muda com a representação, e isso é o ponto:
 *
 * - **componente portátil** — HTML + CSS + JS + assets. Editável.
 * - **cápsula de runtime** — o mesmo, mais o `runtime.html` que roda em iframe
 *   isolado com CSP e sandbox, e SÓ a menor unidade funcional (não a página).
 * - **referência visual animada** — frames + `frame de fallback` + o aviso de que
 *   não é editável. Nunca um HTML que finge ser componente.
 */

export const COMPILER_VERSION = 1;

/**
 * Uma folha de estilo EXTERNA já localizada pela fase de assets.
 *
 * O `localPath` é o nome hashed do `localizeCss` (`css/<hash>.css`) e NÃO pode
 * mudar: os `@import` reescritos referenciam vizinhos por `<hash>.css` e as
 * fontes por `../font/<hash>.woff2`. A posição na cascata é dada pela sequência
 * dos `<link>` no `index.html`, nunca pelo nome do arquivo.
 */
export type FolhaExternaBundle = {
  /** Posição na ordem do documento — a ordem é a cascata. */
  ordem: number;
  /** URL absoluta original do `<link>`, para o manifesto e auditoria. */
  href: string;
  /** Caminho hashed relativo a `assets/` da captura (ex.: `css/ab12cd.css`). */
  localPath: string;
};

export type EntradaBundle = {
  segmento: SegmentoV2;
  /** CSS que este segmento usa (já filtrado pelo motor). */
  css: string;
  /** Folhas externas localizadas, na ordem do documento — entram ANTES do inline. */
  cssExternos?: readonly FolhaExternaBundle[];
  /** Folhas inline individuais com posição — habilita o fallback de intercalação. */
  cssInlineOrdenado?: readonly { ordem: number; conteudo: string }[];
  /** Fontes/imagens/@imports internos das folhas externas (`localizeCss`). */
  assetsDeCss?: readonly CapturedAsset[];
  /** Diretório `assets/` da captura, de onde os arquivos hashed são copiados. */
  dirAssetsCaptura?: string;
  /** Scripts inline relevantes, na ordem original. */
  scripts: readonly RawJsInline[];
  /** Assets de que o segmento depende. */
  assets: readonly CapturedAsset[];
  stack: readonly StackEntry[];
  /** Frames gravados (caminhos relativos ao diretório de captura). */
  frames: readonly string[];
  /** Runtimes necessários, com os arquivos deles. */
  runtimeScripts: readonly string[];
  /** URL de origem, só para registro. */
  sourceUrl: string | null;
  capturadoEm: number;
};

export type BundleEscrito = {
  /** Diretório do bundle. */
  dir: string;
  arquivos: string[];
  css: ResultadoCss;
  js: ResultadoJs;
  /** Avisos honestos sobre o que não pôde ser feito. */
  avisos: string[];
};

const escrever = (dir: string, relativo: string, conteudo: string | Uint8Array): string => {
  const destino = join(dir, relativo);
  mkdirSync(dirname(destino), { recursive: true });
  if (typeof conteudo === 'string') writeFileSync(destino, conteudo, 'utf8');
  else writeFileSync(destino, conteudo);
  return relativo;
};

/**
 * Processa os SVGs inline do HTML: classifica, isola os ids e (quando a
 * classificação disser) extrai para arquivo.
 *
 * O isolamento de id não é preciosismo: dois SVGs com um gradiente chamado `a` no
 * mesmo documento fazem o segundo herdar o do primeiro — um bug visual silencioso.
 */
export const processarSvgs = (
  html: string,
  prefixo: string,
): { html: string; assets: Array<{ caminho: string; conteudo: string }>; notas: string[] } => {
  const assets: Array<{ caminho: string; conteudo: string }> = [];
  const notas: string[] = [];
  let n = 0;
  let out = html;

  // Percorre de trás para frente para os índices não se deslocarem.
  const encontrados = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)];
  for (let i = encontrados.length - 1; i >= 0; i--) {
    const m = encontrados[i];
    if (m?.index === undefined) continue;
    const svg = m[0];
    const c = classificarSvg(svg, { bytes: svg.length });
    n++;
    const isolado = isolarIdsSvg(svg, `${prefixo}-svg${n}`);

    if (c.inline) {
      if (isolado !== svg) {
        out = `${out.slice(0, m.index)}${isolado}${out.slice(m.index + svg.length)}`;
      }
      if (c.categoria === 'A-icone-conhecido') {
        notas.push(
          `SVG ${n}: ícone ${c.biblioteca}${c.icone ? ` "${c.icone}"` : ''} mantido inline — o runtime da biblioteca não é presumido.`,
        );
      }
      continue;
    }

    // Categoria C grande: vira arquivo. O `alt` sai do rótulo acessível, para a
    // acessibilidade não se perder na troca de inline por <img>.
    const caminho = `assets/svg/${prefixo}-${n}.svg`;
    assets.push({ caminho, conteudo: isolado });
    const alt = c.rotuloAcessivel ?? '';
    const dimensoes = /viewBox=["']([^"']+)["']/i.exec(svg)?.[1]?.split(/\s+/) ?? [];
    const w = dimensoes[2];
    const h = dimensoes[3];
    const attrs = [
      `src="${caminho}"`,
      `alt="${alt.replace(/"/g, '&quot;')}"`,
      w !== undefined && h !== undefined ? `width="${w}" height="${h}"` : '',
      alt.length === 0 ? 'aria-hidden="true"' : '',
      'loading="lazy"',
    ]
      .filter((a) => a.length > 0)
      .join(' ');
    out = `${out.slice(0, m.index)}<img ${attrs}>${out.slice(m.index + svg.length)}`;
    notas.push(
      `SVG ${n}: ${svg.length} bytes de cores fixas extraídos para ${caminho}${alt.length === 0 ? ' (marcado aria-hidden: não tinha rótulo)' : ''}.`,
    );
  }

  return { html: out, assets, notas };
};

/** CSP do iframe da cápsula. Sem `connect-src`, sem formulário, sem navegação. */
const CSP_CAPSULA =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";

const documento = (opts: {
  titulo: string;
  css: readonly string[];
  corpo: string;
  scripts: string;
  inline: readonly { type: string; content: string }[];
  csp?: string;
}): string =>
  [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    opts.csp !== undefined
      ? `<meta http-equiv="Content-Security-Policy" content="${opts.csp}">`
      : '',
    `<title>${opts.titulo.replace(/[<>&]/g, '')}</title>`,
    ...opts.css.map((c) => `<link rel="stylesheet" href="${c}">`),
    // Dados inline (JSON-LD/importmap) voltam ao head, onde funcionam.
    ...opts.inline.map((d) => `<script type="${d.type}">${d.content}</script>`),
    '</head>',
    '<body>',
    opts.corpo,
    opts.scripts,
    '</body>',
    '</html>',
  ]
    .filter((l) => l.length > 0)
    .join('\n');

/** O aviso que acompanha uma referência visual. Nunca escondido. */
const avisoDeReferencia = (r: RepresentationDecision): string =>
  [
    '<aside data-ds-aviso="referencia-visual" style="font:14px/1.5 system-ui;padding:12px 16px;background:#1c1917;color:#fafaf9;border-left:3px solid #b45309">',
    '<strong>Referência visual animada.</strong> Este item não é um componente editável: o movimento foi gravado, o runtime não foi reproduzido.',
    r.reasons.length > 0 ? `<br><span style="opacity:.8">Motivo: ${r.reasons[0]}</span>` : '',
    '</aside>',
  ].join('');

/**
 * Escreve o bundle. Devolve os caminhos escritos, para o manifesto declarar
 * exatamente de que o item depende.
 */
export const escreverBundle = (dir: string, entrada: EntradaBundle): BundleEscrito => {
  const { segmento } = entrada;
  const arquivos: string[] = [];
  const avisos: string[] = [];
  const prefixo = `seg${segmento.position}`;

  // ── SVGs ────────────────────────────────────────────────────────────────
  const svg = processarSvgs(segmento.htmlSnippet, prefixo);
  for (const a of svg.assets) arquivos.push(escrever(dir, a.caminho, a.conteudo));
  avisos.push(...svg.notas);

  // ── CSS externo ─────────────────────────────────────────────────────────
  // Os arquivos entram no bundle com o MESMO nome hashed da captura — renomear
  // quebraria os `@import` reescritos (vizinhos por `<hash>.css`) e o layout
  // `css/`/`font/` que os `url(...)` relativos assumem.
  const externos: Array<{ ordem: number; caminho: string; conteudo: string }> = [];
  const jaCopiados = new Set<string>();
  for (const folha of [...(entrada.cssExternos ?? [])].sort((a, b) => a.ordem - b.ordem)) {
    if (entrada.dirAssetsCaptura === undefined) {
      avisos.push(`Folha externa não embutida (sem diretório de captura): ${folha.href}.`);
      continue;
    }
    let conteudo: string;
    try {
      conteudo = readFileSync(join(entrada.dirAssetsCaptura, folha.localPath), 'utf8');
    } catch {
      avisos.push(`Folha externa sem arquivo na captura: ${folha.localPath} (${folha.href}).`);
      continue;
    }
    const caminho = `assets/${folha.localPath}`;
    if (!jaCopiados.has(folha.localPath)) {
      arquivos.push(escrever(dir, caminho, conteudo));
      jaCopiados.add(folha.localPath);
    }
    externos.push({ ordem: folha.ordem, caminho, conteudo });
  }
  // Fontes, imagens e @imports internos das folhas: mesmos bytes, mesmos nomes —
  // é o que faz `url(../font/<hash>.woff2)` resolver dentro do bundle.
  for (const a of entrada.assetsDeCss ?? []) {
    if (jaCopiados.has(a.localPath)) continue;
    if (a.status !== undefined && a.status !== 'local') continue;
    if (entrada.dirAssetsCaptura === undefined) continue;
    try {
      const bytes = readFileSync(join(entrada.dirAssetsCaptura, a.localPath));
      arquivos.push(escrever(dir, `assets/${a.localPath}`, bytes));
      jaCopiados.add(a.localPath);
    } catch {
      avisos.push(`Asset de CSS sem arquivo na captura: ${a.localPath}.`);
    }
  }

  // ── CSS ─────────────────────────────────────────────────────────────────
  // Caso comum (todos os `<link>` antes do primeiro `<style>` — layout
  // Next/Vite/Tailwind build): externos na frente, inline dividido por
  // responsabilidade como sempre. Com INTERCALAÇÃO (um `<style>` com regras
  // antes de um `<link>`), a divisão alteraria a cascata — sai um arquivo por
  // folha, na ordem exata do documento, no mesmo espírito do fallback de
  // inversão do `organizarCss`.
  const inlineOrdenado = (entrada.cssInlineOrdenado ?? []).filter(
    (f) => f.conteudo.trim().length > 0,
  );
  const intercalado =
    externos.length > 0 && inlineOrdenado.some((f) => externos.some((e) => f.ordem < e.ordem));

  let css: ResultadoCss;
  let caminhosCss: string[];
  let cssParaContrato: Array<[string, string]>;
  if (intercalado) {
    const porOrdem = [
      ...inlineOrdenado.map((f) => ({
        ordem: f.ordem,
        caminho: `assets/css/inline-${String(f.ordem).padStart(2, '0')}.css`,
        conteudo: f.conteudo,
      })),
      ...externos,
    ].sort((a, b) => a.ordem - b.ordem);
    css = {
      arquivos: porOrdem
        .filter((f) => f.caminho.includes('/inline-'))
        .map((f) => ({
          caminho: f.caminho,
          conteudo: f.conteudo,
          responsabilidade: 'components' as const,
        })),
      dividido: false,
      motivo:
        'Folhas inline e externas intercaladas no documento: dividir por responsabilidade alteraria a cascata. Um arquivo por folha, na ordem exata.',
      inversoes: [],
      contagem: {
        tokens: 0,
        layout: 0,
        components: inlineOrdenado.length,
        animations: 0,
        interactions: 0,
        runtime: 0,
      },
    };
    for (const a of css.arquivos) arquivos.push(escrever(dir, a.caminho, a.conteudo));
    caminhosCss = porOrdem.map((f) => f.caminho);
    cssParaContrato = porOrdem.map((f) => [f.caminho, f.conteudo]);
  } else {
    css = organizarCss(entrada.css);
    for (const a of css.arquivos) arquivos.push(escrever(dir, a.caminho, a.conteudo));
    caminhosCss = [...externos.map((e) => e.caminho), ...css.arquivos.map((a) => a.caminho)];
    cssParaContrato = [
      ...externos.map((e): [string, string] => [e.caminho, e.conteudo]),
      ...css.arquivos.map((a): [string, string] => [a.caminho, a.conteudo]),
    ];
  }
  if (!css.dividido && css.motivo !== undefined) avisos.push(css.motivo);

  // ── JS ──────────────────────────────────────────────────────────────────
  // Referência visual não recebe JavaScript: ela não executa nada, e embutir
  // script daria a impressão de que executa.
  const js =
    segmento.representation.type === 'referencia-visual'
      ? {
          arquivos: [],
          inline: [],
          notas: ['Referência visual: nenhum script embutido — o item não executa.'],
        }
      : organizarJs(entrada.scripts);
  for (const a of js.arquivos) arquivos.push(escrever(dir, a.caminho, a.conteudo));
  avisos.push(...js.notas);

  // ── HTML ────────────────────────────────────────────────────────────────
  const corpo =
    segmento.representation.type === 'referencia-visual'
      ? [
          avisoDeReferencia(segmento.representation),
          // Frame de fallback como imagem: é o que se vê, e é honesto.
          entrada.frames.length > 0
            ? `<img src="${entrada.frames[0]}" alt="${segmento.name.replace(/"/g, '&quot;')}" style="display:block;max-width:100%;height:auto">`
            : '<p style="font:14px system-ui;padding:16px">Sem frame de fallback disponível.</p>',
        ].join('\n')
      : svg.html;

  arquivos.push(
    escrever(
      dir,
      'index.html',
      documento({
        titulo: segmento.name,
        css: caminhosCss,
        corpo,
        scripts: tagsDeScript(js.arquivos),
        inline: js.inline,
      }),
    ),
  );

  // ── Cápsula de runtime ──────────────────────────────────────────────────
  if (segmento.representation.type === 'capsula-runtime') {
    const scriptsDoRuntime = entrada.runtimeScripts
      .map((s) => `<script src="${s}"></script>`)
      .join('\n');
    arquivos.push(
      escrever(
        dir,
        'runtime.html',
        documento({
          titulo: `${segmento.name} — cápsula`,
          css: caminhosCss,
          // A cápsula leva SÓ a menor unidade funcional: o HTML do segmento, não
          // a página. Levar a página inteira é o que o pedido proíbe.
          corpo: svg.html,
          scripts: [scriptsDoRuntime, tagsDeScript(js.arquivos)]
            .filter((s) => s.length > 0)
            .join('\n'),
          inline: js.inline,
          csp: CSP_CAPSULA,
        }),
      ),
    );
    if (entrada.runtimeScripts.length === 0) {
      avisos.push(
        'Cápsula sem script de runtime em disco: a cena pode não inicializar. Verifique as dependências declaradas.',
      );
    }
  }

  // ── STACK ───────────────────────────────────────────────────────────────
  arquivos.push(
    escrever(
      dir,
      'STACK.md',
      renderizarStackMd(entrada.stack, {
        url: entrada.sourceUrl,
        capturadoEm: entrada.capturadoEm,
      }),
    ),
  );

  // ── Contrato de esqueleto/slots/tokens ──────────────────────────────────
  // Metadado DERIVADO do que o bundle já é — nada do bundle muda por causa
  // dele. É o de-para que a geração usa para aplicar a identidade do usuário
  // por cima do esqueleto (A geração aplica por DOM/seletor; replace de
  // string não sobrevive a marcação real).
  const contract = derivarContrato({
    html: corpo,
    // Na ordem da cascata, com as folhas EXTERNAS incluídas — é onde vivem os
    // tokens `:root` e os `@font-face` de sites com CSS de build.
    css: Object.fromEntries(cssParaContrato),
    jsFiles: js.arquivos.map((a) => a.caminho),
    assets: entrada.assets.map((a) => ({
      originalUrl: a.originalUrl,
      localPath: a.localPath,
      kind: a.kind,
    })),
    origem: 'bundle-v2',
  });

  // ── manifest.json ───────────────────────────────────────────────────────
  const manifesto = {
    compilerVersion: COMPILER_VERSION,
    contract,
    name: segmento.name,
    category: segmento.category,
    kind: segmento.kind,
    representation: segmento.representation,
    fidelity: segmento.fidelity,
    support: segmento.support,
    interactions: segmento.interactions,
    limitations: [...segmento.limitations, ...avisos],
    evidence: segmento.evidence,
    // A declaração explícita do que o bundle precisa. Sem isto, "o asset está no
    // vault" não garante nada — o item não sabe de que arquivos depende.
    dependencies: {
      assets: entrada.assets.map((a) => ({
        localPath: a.localPath,
        originalUrl: a.originalUrl,
        kind: a.kind,
        bytes: a.bytes,
        status: a.status ?? 'local',
      })),
      runtimes: segmento.representation.runtimes,
      scripts: entrada.runtimeScripts,
      css: caminhosCss,
      js: js.arquivos.map((a) => a.caminho),
      frames: entrada.frames,
    },
    stack: entrada.stack,
    css: {
      dividido: css.dividido,
      motivo: css.motivo,
      contagem: css.contagem,
    },
    source: { url: entrada.sourceUrl, capturedAt: entrada.capturadoEm },
    files: arquivos,
  };
  arquivos.push(escrever(dir, 'manifest.json', `${JSON.stringify(manifesto, null, 2)}\n`));

  return { dir, arquivos, css, js, avisos };
};

/**
 * `validation.json` — escrito DEPOIS, pelo validador. Fica aqui a função para o
 * formato ficar num lugar só.
 */
export const escreverValidacao = (dir: string, relatorio: unknown): string =>
  escrever(dir, 'validation.json', `${JSON.stringify(relatorio, null, 2)}\n`);
