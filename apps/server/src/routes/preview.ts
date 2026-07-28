import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import {
  CaptureManifest,
  CapturedAsset,
  RejeitadosManifest,
  type ScrollBehavior,
  SegmentScrollFile,
  SegmentStatesFile,
  type StoredState,
  assetRoutePrefix,
  construirIndiceAssets,
  libraryComponentBundleDir,
  reescreverParaLocal,
  vaultCaptureManifest,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultExtractedDir,
  vaultRejeitadosPath,
  vaultSegmentBundlesDir,
  vaultSegmentScroll,
  vaultSegmentStates,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  MIME_BUNDLE,
  framesDoMovimento,
  lerBundleInfo,
  lerRepresentacaoDeDir,
} from '../lib/bundle-v2.js';
import { resolverEstadosV2 } from '../lib/estados-v2.js';

/**
 * Parse TOLERANTE do manifesto V2: daqui só interessa o campo `assets`. O schema
 * completo `CaptureManifestV2` é grande e versiona rápido — validá-lo inteiro
 * derrubaria o reescritor por divergências que não afetam os assets.
 */
const ManifestoV2SoAssets = z.object({ assets: z.array(CapturedAsset) });

/**
 * Assets LOCAIS do manifesto de captura. Tenta o V1 (`capture/`) primeiro; sem
 * ele, cai no manifesto do motor V2 (`capture-v2/`) — o `localPath` é o mesmo
 * formato content-addressed, e a rota `/api/asset` já serve `capture-v2/assets/`
 * como fallback. Sem manifesto (ou ilegível), devolve `null`.
 */
const lerAssetsLocais = (dsId: `ds_${string}`): CapturedAsset[] | null => {
  const pathV1 = vaultCaptureManifest(dsId);
  if (existsSync(pathV1)) {
    try {
      const manifest = CaptureManifest.parse(JSON.parse(readFileSync(pathV1, 'utf8')));
      return (manifest.assets ?? []).filter((a) => !a.status || a.status === 'local');
    } catch {
      return null;
    }
  }
  const pathV2 = vaultCaptureV2Manifest(dsId);
  if (!existsSync(pathV2)) return null;
  try {
    const manifest = ManifestoV2SoAssets.parse(JSON.parse(readFileSync(pathV2, 'utf8')));
    return manifest.assets.filter((a) => !a.status || a.status === 'local');
  } catch {
    return null;
  }
};

/**
 * Reescritor de refs para o LOCAL. Lê o índice de assets do manifesto de captura
 * (V1 ou V2) e devolve uma função que troca as URLs da origem pela rota do vault.
 * Quando não há manifesto/assets (extração antiga ou rápida), devolve `null` — o
 * preview cai no comportamento de sempre (refs da origem via `<base>`), sem quebrar.
 */
const lerReescritor = (dsId: string): ((t: string) => string) | null => {
  const locais = lerAssetsLocais(dsId as `ds_${string}`);
  if (locais === null || locais.length === 0) return null;
  const index = construirIndiceAssets(locais);
  const prefix = assetRoutePrefix(dsId);
  return (t: string) => reescreverParaLocal(t, index, prefix).text;
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

/**
 * CSP do preview. O `sandbox allow-scripts` (sem `allow-same-origin`,
 * `allow-forms`, `allow-popups`, `allow-top-navigation`, `allow-downloads`) já
 * bloqueia acesso ao app/cookies, envio de formulário, popup, navegação superior
 * e download — a lista de AÇÕES perigosas. Somamos diretivas explícitas que
 * fecham o vetor de exfiltração e o conteúdo ativo indesejado:
 *
 * - `connect-src 'none'`  → sem fetch/XHR/WebSocket (o replay não faz nenhum).
 * - `form-action 'none'`  → nenhum destino de formulário.
 * - `base-uri 'none'`     → ninguém sequestra a base.
 * - `object-src 'none'`   → sem plugins/objetos.
 * - `frame-src 'none'`    → sem frames externos aninhados.
 *
 * Não restringimos `img/font/style/media/script` por origem: sob a origem OPACA
 * do sandbox, `'self'` não casa com os próprios assets locais (servidos pela rota
 * do vault, que para o documento opaco é outra origem), e travar por origem
 * quebraria os assets locais, o fallback externo declarado e o CSS/JS inline do
 * replay. O bloqueio de exfiltração real é o `connect-src 'none'`.
 */
const CSP_SANDBOX =
  "sandbox allow-scripts; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";

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
 * Lê os estados capturados de um segmento (o HTML de cada estado, no vault).
 * Estados do V2 referenciam o blob em `capture-v2/` — a resolução acontece aqui,
 * para o runtime de replay receber sempre HTML inline.
 */
const lerEstados = (dsId: string, segId: string): StoredState[] => {
  const path = vaultSegmentStates(dsId as `ds_${string}`, segId);
  if (!existsSync(path)) return [];
  try {
    const states = SegmentStatesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).states;
    return resolverEstadosV2(dsId as `ds_${string}`, states);
  } catch {
    return [];
  }
};

/** Lê os comportamentos de scroll de um segmento (associados na segmentação). */
const lerScroll = (dsId: string, segId: string): ScrollBehavior[] => {
  const path = vaultSegmentScroll(dsId as `ds_${string}`, segId);
  if (!existsSync(path)) return [];
  try {
    return SegmentScrollFile.parse(JSON.parse(readFileSync(path, 'utf8'))).behaviors;
  } catch {
    return [];
  }
};

/** Impede que HTML capturado feche o `<script>` do runtime de replay. */
const escaparParaScript = (json: string): string =>
  json.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

/**
 * Runtime de reprodução de SCROLL. Diferente do replay de estados (botões): aqui
 * o comportamento é dirigido por SCROLL REAL numa área alta. Reveal/class-toggle
 * por IntersectionObserver; parallax/progress-* por listener de scroll
 * interpolando os keyframes; sticky por position:sticky. Reiniciar restaura o
 * estado inicial; "Voltar ao topo" rola de volta; respeita prefers-reduced-motion
 * (aplica o estado final sem animar). Sticky/runtime externo aparecem como aviso.
 */
const montarScrollReplay = (
  corpo: string,
  behaviors: ScrollBehavior[],
): { corpo: string; head: string } => {
  const reproduziveis = behaviors.filter((b) => b.kind !== 'external-scroll-runtime');
  const externos = behaviors.filter((b) => b.kind === 'external-scroll-runtime');
  const avisoExterno = externos.length
    ? `<span class="ds-sc-ext">${externos.length} efeito(s) por runtime externo (${externos
        .map((b) => b.sourceRuntime)
        .filter(Boolean)
        .join(', ')}) — detectado, não reproduzido</span>`
    : '';

  const head = `<style>
#ds-sc-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  padding:8px 12px;background:rgba(10,10,14,.92);color:#e7e5e4;font:500 12px/1.3 system-ui,sans-serif;backdrop-filter:blur(6px);border-bottom:1px solid rgba(255,255,255,.08)}
#ds-sc-bar .ds-sc-tit{opacity:.7}
.ds-sc-btn{cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;border-radius:999px;padding:4px 10px;font:inherit}
#ds-sc-msg{opacity:.7;margin-left:auto}
.ds-sc-ext{opacity:.7;font-style:italic}
#ds-sc-scroll{height:100vh;overflow-y:auto;padding-top:44px;scroll-behavior:auto}
.ds-sc-spacer{height:120vh;display:flex;align-items:flex-start;justify-content:center;padding-top:12px;color:rgba(120,120,120,.5);font:12px system-ui}
</style>`;

  const runtime = `<script>(function(){
  var B = ${escaparParaScript(JSON.stringify(reproduziveis))};
  var cont = document.getElementById('ds-sc-scroll');
  var alvo = document.getElementById('ds-sc-alvo');
  var msg = document.getElementById('ds-sc-msg');
  if(!cont || !alvo){ return; }
  var reduz = false; try{ reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var vistos = new WeakSet(); var salvos = [];
  function guardar(el){ if(vistos.has(el)) return; vistos.add(el); salvos.push({el:el, css:el.getAttribute('style')||'', cls:el.className}); }
  function acharAlvo(t){
    if(t.id){ var e=document.getElementById(t.id); if(e) return e; }
    if(t.classes && t.classes.length){ try{ var e=alvo.querySelector('.'+t.classes.join('.')); if(e) return e; }catch(_){} }
    return null;
  }
  function num(s){ var m=String(s).match(/-?[0-9.]+/); return m?parseFloat(m[0]):0; }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function scrub(b, el, p){
    var ks=b.keyframes; if(!ks||!ks.length) return;
    var i=0; while(i<ks.length-1 && ks[i+1].progress < p) i++;
    var k0=ks[i], k1=ks[Math.min(i+1,ks.length-1)];
    var span=(k1.progress-k0.progress)||1; var t=Math.min(1,Math.max(0,(p-k0.progress)/span));
    var prop=Object.keys(k0.properties)[0]; if(!prop) return;
    if(prop==='opacity'){ el.style.opacity=String(lerp(num(k0.properties.opacity),num(k1.properties.opacity),t)); }
    else if(prop==='transform'){ var v=lerp(num(k0.properties.transform),num(k1.properties.transform),t);
      el.style.transform = /scale/.test(k0.properties.transform)?'scale('+v+')':'translateY('+v+'px)'; }
    else if(prop==='filter'){ el.style.filter='blur('+lerp(num(k0.properties.filter),num(k1.properties.filter),t)+'px)'; }
  }
  function fim(b, el){ if(b.classesAdicionadas) b.classesAdicionadas.forEach(function(c){el.classList.add(c)}); if(b.keyframes&&b.keyframes.length) scrub(b,el,1); }
  function inicio(b, el){ if(b.classesAdicionadas) b.classesAdicionadas.forEach(function(c){el.classList.remove(c)}); if(b.keyframes&&b.keyframes.length) scrub(b,el,0); }
  var scrubs=[]; var ios=[];
  function montar(){
    B.forEach(function(b){
      var el=acharAlvo(b.target); if(!el) return; guardar(el);
      if(b.kind==='sticky'){ el.style.position='sticky'; el.style.top='44px'; return; }
      if(b.trigger==='viewport' || b.kind==='class-toggle' || b.kind==='viewport-reveal' || b.kind==='viewport-hide'){
        if(reduz){ fim(b,el); return; }
        var io=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting) fim(b,el); else inicio(b,el); })},{root:cont,threshold:0.25});
        io.observe(el); ios.push(io);
      } else { if(reduz){ fim(b,el); } else { scrubs.push({b:b,el:el}); } }
    });
  }
  function progressoEl(el){ var r=el.getBoundingClientRect(), cr=cont.getBoundingClientRect(); var top=r.top-cr.top; return Math.min(1,Math.max(0,1-(top+r.height)/(cr.height+r.height))); }
  function onScroll(){ for(var i=0;i<scrubs.length;i++){ scrub(scrubs[i].b, scrubs[i].el, progressoEl(scrubs[i].el)); } }
  cont.addEventListener('scroll', onScroll, {passive:true});
  montar(); onScroll();
  function reiniciar(){ ios.forEach(function(o){o.disconnect()}); ios=[]; scrubs=[]; salvos.forEach(function(s){ if(s.css) s.el.setAttribute('style',s.css); else s.el.removeAttribute('style'); s.el.className=s.cls; }); vistos=new WeakSet(); salvos=[]; cont.scrollTop=0; montar(); onScroll(); msg.textContent='Reiniciado.'; }
  document.getElementById('ds-sc-reset').addEventListener('click', reiniciar);
  document.getElementById('ds-sc-top').addEventListener('click', function(){ cont.scrollTop=0; });
  msg.textContent = B.length + ' efeito(s) de scroll' + (reduz?' (movimento reduzido)':'');
})();</script>`;

  const barra = `<div id="ds-sc-bar" role="toolbar" aria-label="Efeitos de scroll">
<span class="ds-sc-tit">Role para reproduzir:</span>
<button type="button" class="ds-sc-btn" id="ds-sc-reset">Reiniciar</button>
<button type="button" class="ds-sc-btn" id="ds-sc-top">Voltar ao topo</button>
${avisoExterno}
<span id="ds-sc-msg" aria-live="polite"></span>
</div>
<div id="ds-sc-scroll">
<div class="ds-sc-spacer">role para baixo ↓</div>
<div id="ds-sc-alvo">${corpo}</div>
<div class="ds-sc-spacer" style="height:90vh"></div>
</div>`;

  return { corpo: `${barra}\n${runtime}`, head };
};

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
 * Loop visual de uma referência (modal): cicla as amostras que a observação
 * temporal capturou, com o aviso LEGÍVEL. É reprodução honesta do movimento —
 * são os pixels reais gravados, não o runtime re-executado, e a página diz isso.
 */
const paginaLoopVisual = (nome: string, dsId: string, pasta: string, frames: string[]): string => {
  const urls = frames.map((f) => `/api/preview/bundle/${dsId}/${pasta}/${f}`);
  return `<!doctype html>
<html><head><meta charset="utf-8"/><style>
body{margin:0;min-height:100vh;background:#0b0b0e;color:#e7e5e4;font-family:system-ui,sans-serif;display:flex;flex-direction:column}
.aviso{padding:10px 14px;background:rgba(185,28,28,.12);border-bottom:1px solid rgba(185,28,28,.35);font-size:12px;line-height:1.5;color:#fca5a5}
.aviso b{color:#fecaca}
.palco{flex:1;display:flex;align-items:center;justify-content:center;padding:16px}
.palco img{max-width:100%;max-height:80vh;display:block;border-radius:6px}
.controles{display:flex;gap:10px;align-items:center;padding:10px 14px;font-size:12px;color:#a8a29e;border-top:1px solid rgba(255,255,255,.06)}
.controles button{cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e7e5e4;border-radius:999px;padding:4px 12px;font:inherit}
</style></head><body>
<div class="aviso"><b>Referência visual:</b> ${escaparHtml(nome)} — loop das amostras capturadas.
Este item não é um componente editável; o movimento real é do runtime do site, que não foi reproduzido.</div>
<div class="palco"><img id="ds-loop" alt="Amostra da captura" src="${urls[0] ?? ''}"/></div>
<div class="controles">
<button type="button" id="ds-loop-toggle">Pausar</button>
<span id="ds-loop-info"></span>
</div>
<script>(function(){
  var urls=${escaparParaScript(JSON.stringify(urls))};
  var img=document.getElementById('ds-loop');
  var info=document.getElementById('ds-loop-info');
  var btn=document.getElementById('ds-loop-toggle');
  var i=0, rodando=true, timer=null;
  function mostrar(){ img.src=urls[i]; info.textContent='amostra '+(i+1)+' de '+urls.length; }
  function tique(){ i=(i+1)%urls.length; mostrar(); }
  function ligar(){ timer=setInterval(tique, 700); }
  btn.addEventListener('click', function(){
    rodando=!rodando;
    if(rodando){ ligar(); btn.textContent='Pausar'; }
    else { clearInterval(timer); btn.textContent='Continuar'; }
  });
  mostrar(); ligar();
})();</script>
</body></html>`;
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

  // A REPRESENTAÇÃO decide a prévia (motor V2). Cápsula de runtime e referência
  // visual não são um fragmento de HTML — servi-las como snippet é exatamente o
  // card preto que o V2 existe para eliminar. O documento do bundle é servido
  // DENTRO da rota de bundle, para as refs relativas (css/js/frames) resolverem
  // sem reescrita. Sem bundle (extração V1), o caminho clássico segue intacto.
  const bundle = lerBundleInfo(seg.designSystemId as `ds_${string}`, seg.position);
  if (bundle !== null && bundle.representation !== 'componente-portatil') {
    const arquivo = bundle.representation === 'capsula-runtime' ? 'runtime.html' : 'index.html';
    if (!existsSync(join(bundle.dir, arquivo))) {
      return responderHtml(
        fallback(
          'Bundle incompleto',
          `A representação deste segmento é "${bundle.representation}", mas o arquivo ${arquivo} não está no bundle — a compilação pode ter sido cortada por orçamento.`,
          'Extraia este site de novo para recompilar os bundles.',
        ),
        404,
      );
    }
    if (bundle.representation === 'capsula-runtime') {
      // A cápsula é viva no card e no modal: o runtime roda isolado nos dois.
      return c.redirect(
        `/api/preview/bundle/${seg.designSystemId}/${bundle.pasta}/${arquivo}`,
        302,
      );
    }
    // Referência visual: no MODAL (?replay=1), o movimento gravado vira um loop
    // das amostras temporais — o "loop visual" que a representação promete.
    // Sem amostras suficientes, o documento completo do bundle (frame + aviso).
    if (c.req.query('replay') === '1') {
      const frames = framesDoMovimento(seg.designSystemId as `ds_${string}`, bundle);
      if (frames.length >= 2) {
        return responderHtml(paginaLoopVisual(seg.name, seg.designSystemId, bundle.pasta, frames));
      }
      return c.redirect(
        `/api/preview/bundle/${seg.designSystemId}/${bundle.pasta}/${arquivo}`,
        302,
      );
    }
    // Miniatura do card: só o frame, limpa. O selo do card já diz que é
    // referência visual; a faixa de aviso espremida na miniatura só parecia
    // defeito. O aviso completo continua no modal e no bundle em disco.
    return c.redirect(
      `/api/preview/bundle/${seg.designSystemId}/${bundle.pasta}/${arquivo}?mini=1`,
      302,
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

  // Modo scroll (`?scroll=1`): reproduz os comportamentos de scroll capturados
  // (reveal/parallax/sticky/progress-*) com SCROLL REAL numa área alta. Tem
  // precedência sobre o replay de estados quando pedido e há comportamentos.
  const querScroll = c.req.query('scroll') === '1';
  const scroll = querScroll ? lerScroll(seg.designSystemId, seg.id) : [];
  const scrollReplay = scroll.length > 0 ? montarScrollReplay(corpo, scroll) : null;
  const replay = !scrollReplay && estados.length > 0 ? montarReplay(corpo, estados) : null;
  const modo = scrollReplay ?? replay;

  return responderHtml(
    compor({
      titulo: seg.name,
      head: `${reescreve(extrairHead(html))}${modo ? modo.head : ''}`,
      bodyAttrs: extrairBodyAttrs(html),
      corpo: modo ? modo.corpo : corpo,
      // Sem <base>: o design-system.html é absolutizado (refs absolutas), então a
      // base é inerte — e a CSP `base-uri 'none'` recusaria o elemento.
      base: null,
      bg: c.req.query('bg'),
    }),
  );
});

/**
 * Serve um arquivo de bundle (segmento ou Biblioteca) com todas as guardas.
 *
 * Os documentos (`runtime.html`/`index.html`) são servidos DENTRO do espaço de
 * caminho da rota de propósito: as refs relativas do bundle (css/js/svg/frames)
 * resolvem sozinhas — sem reescrita, sem `<base>` (que a CSP recusa).
 */
const servirArquivoDeBundle = (
  raizBundle: string,
  raizFrames: string | null,
  caminho: string,
  mini: boolean,
): Response => {
  // O caminho vem da URL — o resolvido tem de ficar DENTRO da raiz esperada.
  const raiz = raizFrames !== null && caminho.startsWith('frames/') ? raizFrames : raizBundle;
  const base = resolve(raiz);
  const alvo = resolve(base, caminho);
  if (alvo !== base && !alvo.startsWith(base + sep)) {
    return new Response(null, { status: 404 });
  }

  const ext = extname(alvo).toLowerCase();
  if (!existsSync(alvo)) {
    if (ext === '.html') {
      return responderHtml(
        fallback(
          'Arquivo do bundle ausente',
          'Este item aponta para um arquivo de bundle que não está no disco — a compilação pode ter sido cortada por orçamento.',
          'Extraia este site de novo para recompilar os bundles.',
        ),
        404,
      );
    }
    return new Response(null, { status: 404 });
  }

  if (ext === '.html') {
    // A CSP embutida (`<meta http-equiv>`) existe para o uso STANDALONE do
    // bundle (zip, disco). Servido aqui, o isolamento vem do header
    // CSP_SANDBOX + iframe sandbox — e sob a origem opaca do sandbox o
    // `'self'` do meta não casa com nada, o que mataria o css/js do próprio
    // bundle (o mesmo motivo documentado no CSP_SANDBOX acima).
    let html = readFileSync(alvo, 'utf8').replace(
      /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i,
      '',
    );
    // `mini` — miniatura de card: esconde a faixa de aviso (que espremida
    // parece defeito) e enquadra o frame. A honestidade não sai da tela: o
    // selo do card diz "visual" e o modal mostra o aviso completo.
    if (mini) {
      html = html.replace(
        '</head>',
        '<style>[data-ds-aviso]{display:none}body{margin:0;background:#0b0b0e}img{max-width:100%;height:auto;display:block}</style></head>',
      );
    }
    return responderHtml(html);
  }

  return new Response(readFileSync(alvo), {
    status: 200,
    headers: {
      'Content-Type': MIME_BUNDLE[ext] ?? 'application/octet-stream',
      'Content-Security-Policy': CSP_SANDBOX,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  });
};

/**
 * Arquivos do bundle de um segmento (motor V2). `frames/…` mora em
 * `capture-v2/frames/` — o bundle do segmento referencia o frame sem copiar.
 */
previewRoute.get('/bundle/:dsId/:pasta/:caminho{.+}', (c) => {
  const dsId = c.req.param('dsId');
  const pasta = c.req.param('pasta');
  if (!dsId.startsWith('ds_') || !/^seg_\d+$/.test(pasta)) {
    return new Response(null, { status: 404 });
  }
  return servirArquivoDeBundle(
    join(vaultSegmentBundlesDir(dsId as `ds_${string}`), pasta),
    vaultCaptureV2Dir(dsId as `ds_${string}`),
    c.req.param('caminho'),
    c.req.query('mini') === '1',
  );
});

/**
 * Arquivos do bundle de um componente CURADO (Biblioteca). A promoção copia o
 * bundle do segmento inteiro — inclusive os frames — então aqui não há raiz
 * externa: tudo vive em `library/<cmp>/bundle/` e sobrevive à exclusão da
 * extração original.
 */
previewRoute.get('/library-bundle/:cmpId/:caminho{.+}', (c) => {
  const cmpId = c.req.param('cmpId');
  if (!/^cmp_[a-z0-9]+$/i.test(cmpId)) {
    return new Response(null, { status: 404 });
  }
  return servirArquivoDeBundle(
    libraryComponentBundleDir(cmpId as `cmp_${string}`),
    null,
    c.req.param('caminho'),
    c.req.query('mini') === '1',
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

  // Componente curado do V2 com representação própria: o bundle copiado é o
  // componente — a cápsula roda o runtime isolado, a referência mostra o frame
  // com o aviso. Servir o raw.html aqui seria o card preto de volta, agora na
  // Biblioteca. A miniatura (`?mini=1` implícito no card) fica limpa.
  const representacao = lerRepresentacaoDeDir(bundleDir);
  if (representacao !== null && representacao !== 'componente-portatil') {
    const arquivo = representacao === 'capsula-runtime' ? 'runtime.html' : 'index.html';
    if (!existsSync(join(bundleDir, arquivo))) {
      return responderHtml(
        fallback(
          'Bundle incompleto',
          `A representação deste componente é "${representacao}", mas o arquivo ${arquivo} não está no bundle.`,
          'Remova o componente e faça a curadoria de novo a partir da Galeria.',
        ),
        404,
      );
    }
    const mini = representacao === 'referencia-visual' ? '?mini=1' : '';
    return c.redirect(`/api/preview/library-bundle/${cmpId}/${arquivo}${mini}`, 302);
  }

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

  // Prefere o HTML CRU (classes/ids originais) para o CSS externo do head casar;
  // cai no isolado (index.html) para componentes antigos sem raw.html.
  const rawPath = join(bundleDir, 'raw.html');
  const corpo = readFileSync(existsSync(rawPath) ? rawPath : bundleHtmlPath, 'utf8');
  const cssPath = join(bundleDir, 'styles.css');
  const cssBundle = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  // Best effort: o head do design system de origem traz fontes e runtimes
  // (Tailwind CDN, Lucide). Se a extração já foi apagada, o styles.css filtrado
  // do bundle ainda carrega a maior parte do estilo — o componente sobrevive à
  // origem, só perde o que era do runtime.
  // Head PORTÁTIL: quando o bundle tem `head.html` (CSS externo + fontes já
  // reescritos para a rota do bundle), usa-o — o componente funciona mesmo com a
  // extração de origem apagada. Senão, cai no head da origem (componente antigo).
  const bundleHeadPath = join(bundleDir, 'head.html');
  const htmlOrigem = cmp.designSystemId ? lerHtmlDoVault(cmp.designSystemId) : null;
  const head = existsSync(bundleHeadPath)
    ? readFileSync(bundleHeadPath, 'utf8')
    : htmlOrigem
      ? extrairHead(htmlOrigem)
      : '';
  const bodyAttrs = htmlOrigem ? extrairBodyAttrs(htmlOrigem) : '';

  return responderHtml(
    compor({
      titulo: cmp.name,
      head: `${head}\n<style>${cssBundle}</style>`,
      bodyAttrs,
      corpo,
      // Bundle usa URLs locais absolutas (/api/library-asset/...); sem <base>.
      base: null,
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
      base: null,
      bg: c.req.query('bg'),
    }),
  );
});
