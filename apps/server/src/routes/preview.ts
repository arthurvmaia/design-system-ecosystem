import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import {
  RejeitadosManifest,
  libraryComponentBundleDir,
  vaultExtractedDir,
  vaultRejeitadosPath,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * Composição de previews.
 *
 * O problema que esta rota resolve: um segmento é um fragmento de HTML, e um
 * fragmento não carrega nada do que o faz parecer o site — nem o CSS, nem as
 * fontes, nem as classes do `<body>`, nem o runtime do Tailwind quando o site
 * usa o CDN. A tentativa anterior montava o documento no cliente removendo os
 * `<script>` por segurança, e o resultado era a prévia crua: branco, texto
 * preto, nada do site.
 *
 * Aqui o documento é montado completo — head real COM scripts, atributos reais
 * do body, `<base>` apontando para o vault — e a segurança muda de lugar: em
 * vez de mutilar o documento, o iframe que o exibe roda com
 * `sandbox="allow-scripts"` SEM `allow-same-origin`. Origem opaca: o script do
 * site extraído roda (o Tailwind CDN compila, o Lucide desenha os ícones, as
 * animações acontecem) mas não alcança o app, os cookies ou o localStorage.
 * Como reforço, a resposta declara `Content-Security-Policy: sandbox` — se
 * alguém abrir a URL da prévia direto numa aba, as mesmas regras valem.
 *
 * As mutações da API ficam protegidas pelo próprio CORS: requisições de origem
 * opaca não passam no preflight (JSON e DELETE não são "simple requests" e o
 * servidor só aceita a origem do app).
 */

export const previewRoute = new Hono();

const CSP_SANDBOX = 'sandbox allow-scripts';

/**
 * Estilo neutro que entra ANTES do head do site, para perder de qualquer regra
 * real. Só existe para o caso de nada chegar: uma prévia sem CSS ainda aparece
 * legível em vez de colapsada.
 *
 * As regras `[data-ds-*]` vestem os segmentos de sistema (tipografia, botões,
 * cards, interações) — o embrulho deles usa classes do Tailwind que podem não
 * existir no CSS compilado do site, então o layout do mostruário não pode
 * depender delas.
 */
const ESTILO_BASE = `
html,body{margin:0;padding:0}
body{min-height:100vh;background:#ffffff;color:#111111;font-family:system-ui,-apple-system,sans-serif}
[data-ds-amostra]{display:flex;flex-direction:column;gap:24px;padding:32px;align-items:flex-start}
[data-ds-amostra="botoes"]{flex-direction:row;flex-wrap:wrap;align-items:center}
[data-ds-keyframes]{font-family:ui-monospace,monospace;font-size:12px;opacity:.65}
`;

/** Sobrescreve o fundo quando o modal pede contraste explícito. */
const overrideDeFundo = (bg: string | undefined): string => {
  if (bg === 'claro') return ' style="background:#ffffff;color:#111111"';
  if (bg === 'escuro') return ' style="background:#0b0b0e;color:#f5f5f4"';
  return '';
};

const lerHtmlDoVault = (dsId: string): string | null => {
  const path = join(vaultExtractedDir(dsId as `ds_${string}`), 'design-system.html');
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** O conteúdo do <head> do site, sem <base> (o nosso manda) e sem <title>. */
const extrairHead = (html: string): string => {
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  if (!m?.[1]) return '';
  return m[1].replace(/<base[^>]*>/gi, '').replace(/<title[\s\S]*?<\/title>/gi, '');
};

/** Os atributos do <body> — é neles que mora o fundo escuro de um site escuro. */
const extrairBodyAttrs = (html: string): string => {
  const m = /<body([^>]*)>/i.exec(html);
  return m?.[1] ?? '';
};

const compor = (opts: {
  titulo: string;
  head: string;
  bodyAttrs: string;
  corpo: string;
  base: string | null;
  bg?: string;
}): string => {
  const override = overrideDeFundo(opts.bg);
  // O override inline vence as classes do site — é o que faz o toggle
  // claro/escuro do modal funcionar até em site que declara o próprio fundo.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
${opts.base ? `<base href="${opts.base}"/>` : ''}
<style>${ESTILO_BASE}</style>
${opts.head}
</head>
<body${opts.bodyAttrs}${override}>
${opts.corpo}
</body>
</html>`;
};

/**
 * Página de fallback: aparece dentro do iframe no lugar da prévia. Nunca um
 * retângulo vazio — sempre a causa e o que fazer a respeito.
 */
const fallback = (titulo: string, causa: string, acao: string): string => `<!doctype html>
<html><head><meta charset="utf-8"/><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0e;color:#a8a29e;font-family:system-ui,sans-serif}
.box{max-width:480px;padding:40px;text-align:center}
.t{color:#e7e5e4;font-size:15px;font-weight:500}
.c{margin-top:10px;font-size:13px;line-height:1.6}
.a{margin-top:14px;font-size:12px;color:#78716c}
</style></head><body><div class="box">
<div class="t">${titulo}</div>
<div class="c">${causa}</div>
<div class="a">${acao}</div>
</div></body></html>`;

const responderHtml = (html: string, status: 200 | 404 = 200): Response =>
  new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP_SANDBOX,
      'X-Content-Type-Options': 'nosniff',
      // Curto: re-segmentar ou reclassificar muda o conteúdo do mesmo id.
      'Cache-Control': 'private, max-age=60',
    },
  });

/** Prévia de um segmento bruto da Galeria. */
previewRoute.get('/segment/:segId', (c) => {
  const segId = c.req.param('segId');
  const db = getDb();
  const seg = db.select().from(tables.segments).where(eq(tables.segments.id, segId)).get();

  if (!seg) {
    return responderHtml(
      fallback(
        'Segmento não encontrado',
        'Este segmento não existe mais — a extração pode ter sido re-segmentada ou removida.',
        'Volte à Galeria e atualize a página.',
      ),
      404,
    );
  }

  const html = lerHtmlDoVault(seg.designSystemId);
  if (html === null) {
    return responderHtml(
      fallback(
        'Extração incompleta',
        'O design-system.html desta extração não está no disco, então não há CSS nem fontes para renderizar a prévia.',
        'Extraia este site de novo: Extrair → cole a URL → processe a fila.',
      ),
      404,
    );
  }

  return responderHtml(
    compor({
      titulo: seg.name,
      head: extrairHead(html),
      bodyAttrs: extrairBodyAttrs(html),
      corpo: seg.htmlSnippet,
      base: `/vault/${seg.designSystemId}/`,
      bg: c.req.query('bg'),
    }),
  );
});

/** Prévia de um componente curado da Biblioteca. */
previewRoute.get('/component/:cmpId', (c) => {
  const cmpId = c.req.param('cmpId');
  const db = getDb();
  const cmp = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, cmpId))
    .get();

  if (!cmp) {
    return responderHtml(
      fallback(
        'Componente não encontrado',
        'Este componente não existe mais na Biblioteca.',
        'Atualize a página.',
      ),
      404,
    );
  }

  const bundleDir = libraryComponentBundleDir(cmpId as `cmp_${string}`);
  const bundleHtmlPath = join(bundleDir, 'index.html');
  if (!existsSync(bundleHtmlPath)) {
    return responderHtml(
      fallback(
        'Bundle ausente',
        'O arquivo deste componente sumiu do disco (library/). O registro continua no índice, mas não há o que renderizar.',
        'Remova este componente e curta o segmento de novo na Galeria.',
      ),
      404,
    );
  }

  const corpo = readFileSync(bundleHtmlPath, 'utf8');
  const cssPath = join(bundleDir, 'styles.css');
  const cssBundle = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  // Best effort: o head do design system de origem traz fontes e runtimes
  // (Tailwind CDN, Lucide). Se a extração já foi apagada, o styles.css filtrado
  // do bundle ainda carrega a maior parte do estilo — o componente sobrevive à
  // origem, só perde o que era do runtime.
  const htmlOrigem = cmp.designSystemId ? lerHtmlDoVault(cmp.designSystemId) : null;
  const head = htmlOrigem ? extrairHead(htmlOrigem) : '';
  const bodyAttrs = htmlOrigem ? extrairBodyAttrs(htmlOrigem) : '';
  const base = cmp.designSystemId && htmlOrigem ? `/vault/${cmp.designSystemId}/` : null;

  return responderHtml(
    compor({
      titulo: cmp.name,
      head: `${head}\n<style>${cssBundle}</style>`,
      bodyAttrs,
      corpo,
      base,
      bg: c.req.query('bg'),
    }),
  );
});

/** Prévia de um candidato REJEITADO (não está no banco — vive no rejeitados.json). */
previewRoute.get('/rejeitado/:dsId/:segId', (c) => {
  const dsId = c.req.param('dsId');
  const segId = c.req.param('segId');
  if (!dsId.startsWith('ds_')) return responderHtml(fallback('ID inválido', '', ''), 404);

  const path = vaultRejeitadosPath(dsId as `ds_${string}`);
  if (!existsSync(path)) {
    return responderHtml(
      fallback('Nada rejeitado aqui', 'Este design system não tem candidatos rejeitados.', ''),
      404,
    );
  }

  let rejeitados: Array<{ id: string; name: string; htmlSnippet: string }> = [];
  try {
    rejeitados = RejeitadosManifest.parse(JSON.parse(readFileSync(path, 'utf8'))).rejeitados;
  } catch {
    return responderHtml(fallback('Arquivo ilegível', 'rejeitados.json corrompido.', ''), 404);
  }

  const rej = rejeitados.find((r) => r.id === segId);
  if (!rej) {
    return responderHtml(
      fallback(
        'Componente não encontrado',
        'Este bloco rejeitado não existe mais.',
        'Re-segmente.',
      ),
      404,
    );
  }

  const html = lerHtmlDoVault(dsId as `ds_${string}`);
  if (html === null) {
    return responderHtml(
      fallback(
        'Extração incompleta',
        'O design-system.html não está no disco, então não há CSS para renderizar.',
        'Extraia este site de novo.',
      ),
      404,
    );
  }

  return responderHtml(
    compor({
      titulo: rej.name,
      head: extrairHead(html),
      bodyAttrs: extrairBodyAttrs(html),
      corpo: rej.htmlSnippet,
      base: `/vault/${dsId}/`,
      bg: c.req.query('bg'),
    }),
  );
});
