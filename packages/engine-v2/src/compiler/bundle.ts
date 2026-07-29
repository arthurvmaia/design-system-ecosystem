import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type CapturedAsset,
  type RepresentationDecision,
  type StackEntry,
  derivarContrato,
  reescreverParaLocal,
} from '@ds/shared';
import type { RawJsInline } from '../mapper/raw.js';
import type { SegmentoV2 } from '../segment/segment-v2.js';
import { type ResultadoCss, organizarCss } from './css-organize.js';
import { type ResultadoJs, organizarJs, tagsDeScript } from './js-organize.js';
import { type ScriptDecidido, refDoScript } from './runtime-local.js';
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
  /**
   * Atributos crus de `<html>` e `<body>` da página de origem.
   *
   * Sem eles o bundle perde todo seletor que dependia do documento — e são
   * muitos, porque é onde moram tema (`class="dark"`), fundo e tipografia base
   * em qualquer site feito com utilitários.
   */
  documentoAttrs?: { html?: string; body?: string };
  /**
   * Os `<script src>` da página, JÁ DECIDIDOS — ver `runtime-local.ts`.
   *
   * Antes isto era uma lista de URLs e o bundle as emitia como estavam,
   * apontando para o CDN. Os arquivos já eram baixados para a captura e o
   * arquivo entregue os ignorava: o site só funcionava com internet, e só
   * enquanto aquele endereço existisse.
   *
   * Agora cada script vem com destino: levar (copiado para o bundle),
   * dispensar (a saída dele já foi materializada) ou remoto (não deu para
   * baixar, e isso é declarado).
   */
  scriptsExternos?: readonly ScriptDecidido[];
  /**
   * O HTML das camadas de fundo que passam atrás desta região, na ordem.
   *
   * Entram no corpo ANTES do nó da região, como irmãs — que é onde elas estão
   * no documento original. Reproduzir a posição importa: `position:fixed`,
   * `z-index` e contexto de empilhamento dependem da ordem entre irmãos, e um
   * fundo colocado depois do conteúdo cobriria o conteúdo em vez de ficar
   * atrás dele.
   */
  camadasDeFundo?: readonly string[];
  /**
   * URL original → caminho local dentro de `assets/`, para TODO asset baixado.
   *
   * Sem isto, o bundle saía com `<img src="https://origem…">` mesmo tendo o
   * arquivo em disco — o mesmo defeito dos scripts, e mais visível: as imagens
   * são o conteúdo. Um `.zip` aberto sem internet mostrava caixas cinzas, e a
   * dependência sumia no dia em que o site de origem trocasse de endereço.
   */
  assetsLocais?: ReadonlyMap<string, string>;
  /** Assets de que o segmento depende. */
  assets: readonly CapturedAsset[];
  stack: readonly StackEntry[];
  /** Frames gravados (caminhos relativos ao diretório de captura). */
  frames: readonly string[];
  /**
   * O diretório da CAPTURA, de onde os frames são copiados para dentro do
   * bundle.
   *
   * Sem ele o `<img>` da referência visual apontava para `frames/x.png`, que
   * mora em `capture-v2/frames/` — uma árvore IRMÃ da de bundles. O caminho
   * nunca resolvia a partir da pasta do bundle, contradizendo a promessa no
   * topo deste arquivo ("o `index.html` referencia só caminhos relativos
   * internos").
   *
   * No app o defeito não aparecia: a rota de prévia reescreve a raiz de
   * `frames/`, e a Biblioteca copia os frames na promoção. Ficava invisível até
   * alguém abrir o bundle direto — o `.zip` entregue ao cliente, ou a
   * comparação de pixel, que abre por `file://` e não reescreve nada.
   */
  dirFramesCaptura?: string;
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

/**
 * O documento do bundle.
 *
 * `attrsHtml`/`attrsBody` são os atributos REAIS de `<html>` e `<body>` da
 * página de origem, e a ausência deles era uma perda de fidelidade silenciosa:
 * o `<body>` saía pelado, então `body.dark .card`, `html[data-theme] .hero` e o
 * `class="bg-[#03020A] text-white"` que pintava o fundo simplesmente não
 * casavam mais. As regras continuavam no CSS, íntegras, e não valiam nada —
 * o pior tipo de falha, porque nada está faltando para quem lê o arquivo.
 */
const documento = (opts: {
  titulo: string;
  css: readonly string[];
  corpo: string;
  scripts: string;
  inline: readonly { type: string; content: string }[];
  csp?: string;
  attrsHtml?: string;
  attrsBody?: string;
}): string => {
  const attrs = (a: string | undefined): string =>
    a !== undefined && a.trim() !== '' ? ` ${a.trim()}` : '';
  // `lang` só é imposto quando a origem não trouxe um: sobrescrever o idioma
  // declarado pelo site muda como o leitor de tela pronuncia o conteúdo.
  const html = /\blang\s*=/.test(opts.attrsHtml ?? '')
    ? `<html${attrs(opts.attrsHtml)}>`
    : `<html lang="pt-BR"${attrs(opts.attrsHtml)}>`;

  return [
    '<!doctype html>',
    html,
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
    `<body${attrs(opts.attrsBody)}>`,
    opts.corpo,
    opts.scripts,
    '</body>',
    '</html>',
  ]
    .filter((l) => l.length > 0)
    .join('\n');
};

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

  // ── As referências de asset apontam para DENTRO do bundle ───────────────
  //
  // O HTML do segmento vem com URLs absolutas da origem (`absolutizeRefs`
  // durante a captura, para a prévia carregar). Os arquivos já foram baixados —
  // e o bundle continuava referenciando o endereço remoto. Um `.zip` aberto sem
  // internet mostrava caixas cinzas no lugar das imagens, e a dependência
  // desapareceria de vez no dia em que o site de origem mudasse de lugar.
  const jaCopiadosAssets = new Set<string>();
  const mapaDeAssets = new Map(entrada.assetsLocais ?? []);
  const reescrita =
    mapaDeAssets.size > 0
      ? reescreverParaLocal(svg.html, mapaDeAssets, 'assets/')
      : { text: svg.html, locais: 0, externos: 0, externosUrls: [] as string[] };
  const corpoLocalizado = reescrita.text;
  if (reescrita.externos > 0) {
    avisos.push(
      `${reescrita.externos} asset(s) continuam apontando para a origem (ex.: ${reescrita.externosUrls[0]}): não foram baixados na captura.`,
    );
  }

  // Os arquivos que a reescrita passou a apontar precisam ESTAR aqui: apontar
  // para um caminho local que nao existe troca uma imagem remota por uma imagem
  // quebrada, o que e pior.
  if (mapaDeAssets.size > 0 && entrada.dirAssetsCaptura !== undefined) {
    for (const [, localPath] of mapaDeAssets) {
      if (!corpoLocalizado.includes(localPath)) continue;
      if (jaCopiadosAssets.has(localPath)) continue;
      try {
        const bytes = readFileSync(join(entrada.dirAssetsCaptura, localPath));
        arquivos.push(escrever(dir, `assets/${localPath}`, bytes));
        jaCopiadosAssets.add(localPath);
      } catch {
        avisos.push(`Asset referenciado e ausente da captura: ${localPath}.`);
      }
    }
  }

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
  //
  // As camadas de fundo primeiro, o conteúdo depois — a ordem do documento
  // original. Uma referência visual não recebe camada: ela é um frame, e
  // sobrepor um fundo a uma imagem só produziria confusão.
  const camadas = (entrada.camadasDeFundo ?? []).filter((c) => c.trim().length > 0);
  const fundo =
    camadas.length > 0
      ? `<div data-ds-camadas-de-fundo="${camadas.length}">\n${camadas.join('\n')}\n</div>\n`
      : '';
  if (camadas.length > 0) {
    avisos.push(
      `${camadas.length} camada(s) de fundo da página recompostas atrás da região, na posição original.`,
    );
  }

  // O frame da referência visual VEM PARA DENTRO do bundle.
  //
  // Ele mora em `capture-v2/frames/`, uma árvore irmã da de bundles, e o
  // `<img src="frames/x.png">` nunca resolvia a partir daqui. Passava
  // despercebido porque a prévia do app reescreve a raiz e a Biblioteca copia
  // os frames na promoção — mas o `.zip` entregue ao cliente abria com a imagem
  // quebrada, que é justamente a única coisa que uma referência visual TEM.
  //
  // Só a referência visual: é o único bundle cujo HTML exibe o frame. Copiar em
  // todos poria um PNG de sobra dentro de cada peça portátil, que nunca o abre.
  let frameNoBundle: string | null = null;
  const primeiroFrame =
    segmento.representation.type === 'referencia-visual' ? entrada.frames[0] : undefined;
  if (primeiroFrame !== undefined && entrada.dirFramesCaptura !== undefined) {
    const rel = primeiroFrame.replace(/\\/g, '/');
    if (!rel.split('/').includes('..')) {
      try {
        const bytes = readFileSync(join(entrada.dirFramesCaptura, primeiroFrame));
        arquivos.push(escrever(dir, rel, bytes));
        frameNoBundle = rel;
      } catch {
        avisos.push(
          `O frame da referência visual não estava na captura (${primeiroFrame}): o bundle abre sem a imagem.`,
        );
      }
    }
  }

  const corpo =
    segmento.representation.type === 'referencia-visual'
      ? [
          avisoDeReferencia(segmento.representation),
          // Frame de fallback como imagem: é o que se vê, e é honesto.
          frameNoBundle !== null
            ? `<img src="${frameNoBundle}" alt="${segmento.name.replace(/"/g, '&quot;')}" style="display:block;max-width:100%;height:auto">`
            : '<p style="font:14px system-ui;padding:16px">Sem frame de fallback disponível.</p>',
        ].join('\n')
      : `${fundo}${corpoLocalizado}`;

  // ── Os scripts da página, com o destino decidido ────────────────────────
  //
  // Os externos vêm ANTES dos inline organizados, como no documento original:
  // script inline quase sempre depende do runtime já ter carregado.
  //
  // O que foi marcado para LEVAR é copiado para dentro do bundle e passa a ser
  // referenciado por caminho relativo. É o que faz o `.zip` entregue ao cliente
  // continuar funcionando offline, e daqui a um ano, quando o CDN de origem já
  // não responder pelo mesmo endereço.
  const scriptsDecididos = entrada.scriptsExternos ?? [];
  const refsDeScript: string[] = [];
  for (const d of scriptsDecididos) {
    const ref = refDoScript(d);
    if (ref === null) {
      avisos.push(d.motivo);
      continue;
    }
    if (d.decisao === 'levar' && d.localPath !== undefined) {
      if (!jaCopiados.has(d.localPath) && entrada.dirAssetsCaptura !== undefined) {
        try {
          const bytes = readFileSync(join(entrada.dirAssetsCaptura, d.localPath));
          arquivos.push(escrever(dir, `assets/${d.localPath}`, bytes));
          jaCopiados.add(d.localPath);
        } catch {
          // O arquivo sumiu entre a captura e a compilação: cai para remoto em
          // vez de emitir um caminho que não existe.
          avisos.push(
            `Script marcado para viajar não estava mais na captura (${d.localPath}); o bundle voltou a apontar para a origem.`,
          );
          refsDeScript.push(d.url);
          continue;
        }
      }
    }
    if (d.decisao === 'remoto') avisos.push(d.motivo);
    refsDeScript.push(ref);
  }
  const levados = scriptsDecididos.filter((d) => d.decisao === 'levar').length;
  if (levados > 0) {
    avisos.push(
      `${levados} script(s) de runtime viajam dentro do bundle: ele não depende mais do endereço de origem para isso.`,
    );
  }
  const tagDeScript = (src: string): string =>
    `<script src="${src.replace(/"/g, '&quot;')}"></script>`;
  const tagsExternas = refsDeScript.map(tagDeScript).join('\n');

  // A cápsula roda sob `script-src 'self'` (ver CSP_CAPSULA): script remoto ali
  // é bloqueado pelo navegador, em silêncio. Então ela leva só os que estão
  // dentro do bundle — e o que ficou de fora é dito, em vez de virar uma tag
  // que não executa.
  const refsLocais = refsDeScript.filter((r) => !/^(https?:)?\/\//i.test(r));
  const tagsExternasLocais = refsLocais.map(tagDeScript).join('\n');
  const remotosForaDaCapsula = refsDeScript.length - refsLocais.length;

  // ── As partes comuns aos DOIS documentos ────────────────────────────────
  //
  // Isto existe por causa de um defeito que custou caro para achar. O
  // `runtime.html` era montado com uma lista própria de argumentos, e a cada
  // melhoria do `index.html` ele ficava um passo atrás — em silêncio.
  //
  // O sintoma final: a Galeria mostrava os cards de um site ESCURO com fundo
  // BRANCO. Causa: o `index.html` recebia os atributos de `<html>`/`<body>` da
  // origem (é onde mora `class="bg-[#03020A] text-white"`), e a cápsula não.
  // O mesmo `<body>`, nos dois arquivos do mesmo bundle:
  //
  //   index.html    class="bg-[#03020A] text-white …"   →  rgb(3, 2, 10)
  //   runtime.html  (sem atributo nenhum)               →  branco
  //
  // A cápsula tinha perdido também as camadas de fundo e os scripts
  // localizados, pelo mesmo motivo.
  //
  // Agora as partes comuns são UMA variável cada. A diferença entre os dois
  // documentos passa a ser só o que de fato os distingue: a CSP e os scripts
  // de runtime. Duas listas de argumentos que precisam concordar acabam
  // discordando; uma só, não.
  const comum = {
    css: caminhosCss,
    inline: js.inline,
    attrsHtml: entrada.documentoAttrs?.html,
    attrsBody: entrada.documentoAttrs?.body,
  };

  arquivos.push(
    escrever(
      dir,
      'index.html',
      documento({
        ...comum,
        titulo: segmento.name,
        corpo,
        scripts: [tagsExternas, tagsDeScript(js.arquivos)].filter((s) => s.length > 0).join('\n'),
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
          ...comum,
          titulo: `${segmento.name} — cápsula`,
          // A cápsula leva SÓ a menor unidade funcional: o HTML do segmento com
          // o fundo que passa atrás dele, não a página. Levar a página inteira
          // é o que o pedido proíbe.
          corpo,
          // Os scripts de runtime ENTRAM ALÉM dos que o documento já levava:
          // a cápsula existe para o runtime inicializar isolado, mas o que faz
          // a região desenhar (o script do fundo, a biblioteca de ícones) é o
          // mesmo do índice, e já está localizado.
          scripts: [tagsExternasLocais, scriptsDoRuntime, tagsDeScript(js.arquivos)]
            .filter((s) => s.length > 0)
            .join('\n'),
          csp: CSP_CAPSULA,
        }),
      ),
    );
    if (remotosForaDaCapsula > 0) {
      avisos.push(
        `${remotosForaDaCapsula} script(s) remotos ficaram fora da cápsula: a política de segurança dela só executa o que está dentro do bundle. Eles seguem no index.html.`,
      );
    }
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
