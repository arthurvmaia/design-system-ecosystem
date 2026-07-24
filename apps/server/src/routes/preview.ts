import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import {
  CaptureManifest,
  RejeitadosManifest,
  SegmentStatesFile,
  type StoredState,
  assetRoutePrefix,
  construirIndiceAssets,
  libraryComponentBundleDir,
  reescreverParaLocal,
  vaultCaptureManifest,
  vaultExtractedDir,
  vaultRejeitadosPath,
  vaultSegmentStates,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * Reescritor de refs para o LOCAL. Lê o índice de assets do manifesto de captura
 * e devolve uma função que troca as URLs da origem pela rota do vault. Quando não
 * há manifesto/assets (extração antiga ou rápida), devolve `null` — o preview cai
 * no comportamento de sempre (refs da origem via `<base>`), sem quebrar.
 */
const lerReescritor = (dsId: string): ((t: string) => string) | null => {
  const path = vaultCaptureManifest(dsId as `ds_${string}`);
  if (!existsSync(path)) return null;
  try {
    const manifest = CaptureManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    const locais = (manifest.assets ?? []).filter((a) => !a.status || a.status === 'local');
    if (locais.length === 0) return null;
    const index = construirIndiceAssets(locais);
    const prefix = assetRoutePrefix(dsId);
    return (t: string) => reescreverParaLocal(t, index, prefix).text;
  } catch {
    return null;
  }
};

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

/** Lê os estados capturados de um segmento (o HTML de cada estado, no vault). */
const lerEstados = (dsId: string, segId: string): StoredState[] => {
  const path = vaultSegmentStates(dsId as `ds_${string}`, segId);
  if (!existsSync(path)) return [];
  try {
    return SegmentStatesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).states;
  } catch {
    return [];
  }
};

/** Impede que HTML capturado feche o `<script>` do runtime de replay. */
const escaparParaScript = (json: string): string =>
  json.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const ROTULO_TRIGGER: Record<string, string> = {
  hover: 'Passe o mouse',
  focus: 'Foco',
  click: 'Clique',
  scroll: 'Ao rolar',
  timer: 'Automático',
  initial: 'Inicial',
};

/**
 * Envolve o corpo do preview com o runtime de REPLAY dos estados capturados.
 *
 * Reprodução honesta: em vez de depender do JS do site (que pode não religar num
 * fragmento), aplica os SNAPSHOTS que a exploração capturou — troca o HTML do
 * alvo para o estado escolhido, ou revela o portal (modal/menu) que a interação
 * abriu. Hover/foco puros já rodam pelo CSS incluído; os botões cobrem o que é
 * dirigido por JS. "Reiniciar" restaura o estado inicial de verdade.
 */
const montarReplay = (corpo: string, states: StoredState[]): { corpo: string; head: string } => {
  const dados = states.map((s) => ({
    id: s.id,
    label: s.label || ROTULO_TRIGGER[s.trigger] || s.trigger,
    trigger: s.trigger,
    method: s.method ?? 'swap-html',
    html: s.html,
    portalHtml: s.portalHtml ?? null,
  }));

  const botoes = dados
    .map(
      (s) =>
        `<button type="button" class="ds-rp-btn" data-estado="${s.id}" aria-pressed="false">${
          ROTULO_TRIGGER[s.trigger] ?? 'Ver'
        }: ${escaparHtml(s.label)}</button>`,
    )
    .join('');

  const head = `<style>
#ds-rp-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  padding:8px 12px;background:rgba(10,10,14,.92);color:#e7e5e4;font:500 12px/1.3 system-ui,sans-serif;backdrop-filter:blur(6px);border-bottom:1px solid rgba(255,255,255,.08)}
#ds-rp-bar .ds-rp-tit{opacity:.7;margin-right:2px}
.ds-rp-btn{cursor:pointer;border:1px solid rgba(255,255,255,.16);background:transparent;color:inherit;border-radius:999px;padding:4px 10px;font:inherit}
.ds-rp-btn[aria-pressed="true"]{background:#b91c1c;border-color:#b91c1c;color:#fff}
.ds-rp-btn.ds-rp-reset{background:rgba(255,255,255,.08)}
#ds-rp-msg{opacity:.7;margin-left:auto}
#ds-rp-alvo{padding-top:52px}
#ds-rp-portal:empty{display:none}
</style>`;

  const runtime = `<script>(function(){
  var estados = ${escaparParaScript(JSON.stringify(dados))};
  var alvo = document.getElementById('ds-rp-alvo');
  var portal = document.getElementById('ds-rp-portal');
  var msg = document.getElementById('ds-rp-msg');
  if(!alvo){return;}
  var inicial = alvo.innerHTML;
  function marcar(id){ document.querySelectorAll('.ds-rp-btn[data-estado]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-estado')===id?'true':'false'); }); }
  function reiniciar(){ try{ alvo.innerHTML=inicial; if(portal){portal.innerHTML='';} marcar(''); msg.textContent='Estado inicial.'; }catch(e){ msg.textContent='Erro ao reiniciar.'; } }
  function aplicar(st){
    try{
      if(st.method==='portal' && st.portalHtml){ if(portal){portal.innerHTML=st.portalHtml;} }
      else if(st.html){ alvo.innerHTML=st.html; if(portal && st.portalHtml){portal.innerHTML=st.portalHtml;} }
      else if(portal && st.portalHtml){ portal.innerHTML=st.portalHtml; }
      marcar(st.id); msg.textContent='Reproduzindo: '+st.label;
    }catch(e){ msg.textContent='Não foi possível reproduzir este estado.'; }
  }
  document.querySelectorAll('.ds-rp-btn').forEach(function(b){
    b.addEventListener('click', function(){
      var id=b.getAttribute('data-estado');
      if(id==='__reset__'){ reiniciar(); return; }
      var st=null; for(var i=0;i<estados.length;i++){ if(estados[i].id===id){st=estados[i];break;} }
      if(st){ aplicar(st); }
    });
  });
  msg.textContent = estados.length + ' estado(s) capturado(s).';
})();</script>`;

  const barra = `<div id="ds-rp-bar" role="toolbar" aria-label="Interações capturadas">
<span class="ds-rp-tit">Interações capturadas:</span>
<button type="button" class="ds-rp-btn ds-rp-reset" data-estado="__reset__">Reiniciar</button>
${botoes}
<span id="ds-rp-msg" aria-live="polite"></span>
</div>
<div id="ds-rp-portal"></div>
<div id="ds-rp-alvo">${corpo}</div>`;

  return { corpo: `${barra}\n${runtime}`, head };
};

/** Escapa texto para uso seguro dentro do rótulo de um botão. */
const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  // Assets locais: reescreve head/corpo/estados para a rota do vault quando há
  // cópias no manifesto. `<base>` é solta quando reescrevemos (as refs viram
  // absolutas: /api/asset/... locais, ou origem para o que sobrou externo).
  const rw = lerReescritor(seg.designSystemId);
  const reescreve = (t: string): string => (rw ? rw(t) : t);

  // Modo replay (`?replay=1`): quando o segmento tem estados capturados, injeta a
  // barra de interações e o runtime que os reproduz. Sem o parâmetro, a prévia
  // fica limpa — é a que o card da Galeria usa como miniatura. Os estados também
  // passam pela reescrita, para o conteúdo revelado (accordion/modal) usar local.
  const querReplay = c.req.query('replay') === '1';
  const estados = querReplay
    ? lerEstados(seg.designSystemId, seg.id).map((s) => ({
        ...s,
        html: reescreve(s.html),
        portalHtml: s.portalHtml ? reescreve(s.portalHtml) : undefined,
      }))
    : [];
  const corpo = reescreve(seg.htmlSnippet);
  const replay = estados.length > 0 ? montarReplay(corpo, estados) : null;

  return responderHtml(
    compor({
      titulo: seg.name,
      head: `${reescreve(extrairHead(html))}${replay ? replay.head : ''}`,
      bodyAttrs: extrairBodyAttrs(html),
      corpo: replay ? replay.corpo : corpo,
      base: rw ? null : `/vault/${seg.designSystemId}/`,
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
