import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CapturedAsset, RepresentationDecision, StackEntry } from '@ds/shared';
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

export type EntradaBundle = {
  segmento: SegmentoV2;
  /** CSS que este segmento usa (já filtrado pelo motor). */
  css: string;
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

  // ── CSS ─────────────────────────────────────────────────────────────────
  const css = organizarCss(entrada.css);
  for (const a of css.arquivos) arquivos.push(escrever(dir, a.caminho, a.conteudo));
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
  const caminhosCss = css.arquivos.map((a) => a.caminho);
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

  // ── manifest.json ───────────────────────────────────────────────────────
  const manifesto = {
    compilerVersion: COMPILER_VERSION,
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
