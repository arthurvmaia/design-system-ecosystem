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
  ehComponentId,
  ehDesignSystemId,
  ehProjectId,
  libraryComponentBundleDir,
  reescreverParaLocal,
  vaultCaptureAssetsDir,
  vaultCaptureManifest,
  vaultCaptureV2AssetsDir,
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
  framePathDoSegmento,
  framesDoMovimento,
  lerBundleInfo,
  lerRepresentacaoDeDir,
} from '../lib/bundle-v2.js';
import { resolverEstadosV2 } from '../lib/estados-v2.js';
import { montarDemoDeHover } from '../lib/hover-demo.js';
import { dirDaPrevia, montarPrevia } from '../lib/previa-do-kit.js';

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
 * vez de mutilar o documento, ela vem da CSP da resposta (`CSP_PREVIA`, logo
 * abaixo) e do portão. O script do site extraído roda (o Tailwind CDN compila,
 * o Lucide desenha os ícones, as animações acontecem) e não tem por onde mandar
 * nada para fora: `connect-src 'none'`.
 *
 * O documento é servido na MESMA origem do app, e isso é obrigatório desde que
 * o portão passou a exigir credencial: um documento de origem opaca pede os
 * próprios arquivos como se fosse outro site, o cookie `SameSite=Lax` não vai
 * junto, e a prévia inteira chega sem CSS. O porquê está por extenso no
 * `CSP_PREVIA`.
 *
 * As mutações da API seguem protegidas pelo CORS: JSON e DELETE não são "simple
 * requests" e o servidor só aceita a origem do app no preflight.
 */

export const previewRoute = new Hono();

/**
 * CSP do preview. Fecha exfiltração e conteúdo ativo indesejado:
 *
 * - `connect-src 'none'`  → sem fetch/XHR/WebSocket (o replay não faz nenhum).
 * - `form-action 'none'`  → nenhum destino de formulário.
 * - `base-uri 'none'`     → ninguém sequestra a base.
 * - `object-src 'none'`   → sem plugins/objetos.
 * - `frame-src 'none'`    → sem frames externos aninhados.
 *
 * Não restringimos `img/font/style/media/script` por origem: quebraria o
 * fallback externo declarado (Tailwind CDN, Iconify) que muitos bundles usam.
 * O bloqueio de exfiltração real é o `connect-src 'none'`.
 *
 * ## Por que NÃO tem mais `sandbox allow-scripts`
 *
 * Tinha, e isso quebrou TODA prévia do app no dia em que o portão entrou.
 * A conta é esta, e vale escrita por extenso porque o sintoma não aponta para a
 * causa:
 *
 * `sandbox` sem `allow-same-origin` dá ao documento uma origem OPACA. Para o
 * navegador, cada `assets/styles.css` que esse documento pede é uma requisição
 * **cross-site** — e o cookie da sessão é `SameSite=Lax`, que em cross-site não
 * viaja. O servidor então respondia 401 em JSON, e o Chrome bloqueava a
 * resposta (`ERR_BLOCKED_BY_ORB`). O documento carregava; o CSS, o JS e as
 * imagens dele, não. O que aparecia na tela era HTML cru: caixa branca com
 * texto preto miúdo, em toda peça da Galeria, da Biblioteca e do kit.
 *
 * O que o sandbox de fato impedia era o JS do site capturado alcançar o DOM do
 * app. Isso se perde aqui, e é uma perda real — o app abre HTML de terceiro.
 * Continuam de pé as duas coisas que importam mais: o portão (ninguém entra sem
 * credencial) e o `connect-src 'none'` (nada sai por fetch). A alternativa era
 * abrir os arquivos do acervo para quem não entrou, e essa é pior.
 */
/**
 * Hosts de DADOS de runtime que a prévia pode buscar — lista fechada e curta,
 * de propósito. O `connect-src 'none'` absoluto matava qualquer runtime de
 * cena que busca a própria cena por fetch (o UnicornStudio busca em
 * assets.unicorn.studio), e a prévia nunca podia mostrar o que prometia: o
 * operador julgava a peça por um render que não tinha como acontecer ali.
 * Só host EXPLICITAMENTE declarado entra; o resto continua bloqueado.
 */
const HOSTS_DE_RUNTIME = ['https://assets.unicorn.studio'];

const CSP_PREVIA = `connect-src ${HOSTS_DE_RUNTIME.join(' ')}; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`;

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

/**
 * Reporta ao app a altura REAL do conteúdo.
 *
 * Sem isso o preview é uma janela de altura fixa e uma seção alta aparece
 * cortada — foi o que fazia o detalhe "não descer". Mede o rodapé do filho mais
 * baixo do body em vez de `scrollHeight` porque o `min-height:100vh` do estilo
 * base infla o documento: um botão sozinho reportaria uma tela inteira.
 *
 * O documento é sandbox de origem opaca, então quem escuta confere
 * `event.source` (não dá para conferir origem). A mensagem é só um número.
 */
const REPORTE_DE_ALTURA = `<script>(function(){
var ultimo=0;
function medir(){
  var filhos=document.body?document.body.children:[],base=window.scrollY||0,max=0;
  for(var i=0;i<filhos.length;i++){
    var e=filhos[i];
    if(!e.getBoundingClientRect)continue;
    var cs=getComputedStyle(e);
    if(cs.position==='fixed')continue; // fundo fixo não define a altura do bloco
    var b=e.getBoundingClientRect().bottom+base;
    if(b>max)max=b;
  }
  if(max<=0)max=document.documentElement.scrollHeight;
  var h=Math.round(Math.min(12000,Math.max(80,max)));
  // O fundo do documento viaja junto: quem exibe usa a MESMA cor na moldura, e
  // a sobra ao redor de um componente curto deixa de parecer buraco preto.
  var fundo='';
  try{
    var cs=getComputedStyle(document.body);
    fundo=cs.backgroundColor;
    if(!fundo||fundo==='rgba(0, 0, 0, 0)'||fundo==='transparent'){
      fundo=getComputedStyle(document.documentElement).backgroundColor||'';
    }
  }catch(e){}
  if(Math.abs(h-ultimo)>4){ultimo=h;try{parent.postMessage({tipo:'ds-preview-altura',altura:h,fundo:fundo},'*');}catch(e){}}
}
addEventListener('load',medir);addEventListener('resize',medir);
try{if(window.ResizeObserver&&document.body)new ResizeObserver(medir).observe(document.body);}catch(e){}
setTimeout(medir,150);setTimeout(medir,700);setTimeout(medir,2000);
})()</script>`;

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
${REPORTE_DE_ALTURA}
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
  function reiniciar(){ ios.forEach(function(o){o.disconnect()}); ios=[]; scrubs=[]; salvos.forEach(function(s){ if(s.css) s.el.setAttribute('style',s.css); else s.el.removeAttribute('style'); s.el.className=s.cls; }); vistos=new WeakSet(); salvos=[]; cont.scrollTop=0; montar(); onScroll(); msg.textContent='Reiniciado.'; }
  document.getElementById('ds-sc-reset').addEventListener('click', reiniciar);
  document.getElementById('ds-sc-top').addEventListener('click', function(){ cont.scrollTop=0; });

  // ── Demonstração automática ────────────────────────────────────────────
  // Rolar à mão já reproduzia entrada e saída, mas exigia descobrir isso. A
  // demonstração desce até passar do bloco e volta, então a pessoa vê o efeito
  // INTEIRO (aparecer e desaparecer) sem fazer nada. Continua sendo o scroll de
  // verdade: nada é simulado, só a rolagem é automatizada.
  var rodando = false, passe = 0, ultimoTop = -1;
  function encerrar(texto){
    rodando = false; passe++;
    msg.textContent = texto;
  }
  function animarAte(destino, ms, aoFim){
    var meuPasse = passe, inicioTop = cont.scrollTop, t0 = 0;
    function passo(ts){
      if(meuPasse !== passe) return; // alguém assumiu o controle
      if(!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / ms);
      // easing suave nas duas pontas, para o movimento não parecer robô
      var e = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
      cont.scrollTop = inicioTop + (destino - inicioTop) * e;
      ultimoTop = cont.scrollTop;
      if(p < 1) requestAnimationFrame(passo); else if(aoFim) aoFim();
    }
    requestAnimationFrame(passo);
  }
  // Quem rolar por conta própria (pessoa, teclado ou script) assume o controle
  // na hora: a demonstração para de puxar a página de volta. Detecta pela
  // posição ter mudado para um valor que a própria demonstração não escreveu.
  cont.addEventListener('scroll', function(){
    if(rodando && Math.abs(cont.scrollTop - ultimoTop) > 2){
      encerrar(B.length + ' efeito(s) de scroll. Role para ver de novo.');
    }
  }, {passive:true});
  function demonstrar(){
    if(rodando || reduz) return;
    passe++;
    rodando = true;
    msg.textContent = 'Reproduzindo entrada e saída…';
    cont.scrollTop = 0; ultimoTop = 0;
    var alvoEl = document.getElementById('ds-sc-alvo');
    var desceAte = alvoEl ? alvoEl.offsetTop + alvoEl.offsetHeight : cont.scrollHeight;
    animarAte(desceAte, 2600, function(){
      setTimeout(function(){
        if(!rodando) return;
        animarAte(0, 1600, function(){
          encerrar(B.length + ' efeito(s) de scroll. Role para ver de novo.');
        });
      }, 500);
    });
  }
  var btnDemo = document.getElementById('ds-sc-demo');
  if(btnDemo) btnDemo.addEventListener('click', demonstrar);

  montar(); onScroll();
  msg.textContent = B.length + ' efeito(s) de scroll' + (reduz?' (movimento reduzido)':'');
  // Espera o layout assentar antes de rodar sozinho.
  if(!reduz) setTimeout(demonstrar, 600);
})();</script>`;

  const barra = `<div id="ds-sc-bar" role="toolbar" aria-label="Efeitos de scroll">
<span class="ds-sc-tit">Efeitos de scroll:</span>
<button type="button" class="ds-sc-btn" id="ds-sc-demo">Reproduzir de novo</button>
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
      'Content-Security-Policy': CSP_PREVIA,
      'X-Content-Type-Options': 'nosniff',
      // Curto: re-segmentar ou reclassificar muda o conteúdo do mesmo id.
      'Cache-Control': 'private, max-age=60',
    },
  });

/**
 * Palco do HOVER: liga a classe derivada num elemento de cada vez.
 *
 * Percorre os alvos em ordem, segura cada um por um tempo e destaca com um
 * contorno, para ficar claro QUEM está sendo demonstrado. Passar o mouse de
 * verdade continua funcionando (o `:hover` original está lá); a demonstração só
 * mostra sozinha o que a pessoa veria se passasse.
 */
const montarHoverReplay = (
  corpo: string,
  cssTexts: readonly string[],
): { corpo: string; head: string } | null => {
  const demo = montarDemoDeHover(cssTexts);
  if (demo === null) return null;

  const head = `<style>
#ds-hv-bar{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;gap:8px;align-items:center;
padding:8px 12px;background:#0b0b0e;color:#e7e5e4;font:12px system-ui;border-bottom:1px solid #26262b}
.ds-hv-btn{border:1px solid #3f3f46;background:#18181b;color:#e7e5e4;border-radius:999px;padding:4px 10px;font:12px system-ui;cursor:pointer}
#ds-hv-palco{padding-top:40px}
.ds-hv-foco{outline:2px solid #c62828 !important;outline-offset:2px !important}
${demo.estilo}
</style>`;

  const runtime = `<script>(function(){
  var SEL = ${escaparParaScript(JSON.stringify(demo.alvos))};
  var palco = document.getElementById('ds-hv-palco');
  var msg = document.getElementById('ds-hv-msg');
  if(!palco) return;
  var reduz=false; try{ reduz=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  // Só os alvos que EXISTEM neste segmento: o CSS é do site inteiro.
  var alvos = [];
  SEL.forEach(function(s){
    var achados;
    try{ achados = palco.querySelectorAll(s); }catch(e){ return; }
    for(var i=0;i<achados.length && alvos.length<24;i++){
      var el = achados[i];
      var r = el.getBoundingClientRect();
      if(r.width < 8 || r.height < 8) continue; // invisível não se demonstra
      if(alvos.indexOf(el) === -1) alvos.push(el);
    }
  });
  if(alvos.length === 0){ msg.textContent = 'Nenhum elemento deste bloco tem hover.'; return; }
  var i = -1, atual = null, timer = null, rodando = false;
  function limpar(){ if(atual){ atual.classList.remove('ds-hv'); atual.classList.remove('ds-hv-foco'); atual = null; } }
  function passo(){
    limpar();
    i = (i + 1) % alvos.length;
    atual = alvos[i];
    atual.classList.add('ds-hv');
    atual.classList.add('ds-hv-foco');
    try{ atual.scrollIntoView({block:'center', behavior:'smooth'}); }catch(e){}
    msg.textContent = 'Passando o mouse em ' + (i+1) + ' de ' + alvos.length;
    timer = setTimeout(passo, 1500);
  }
  function tocar(){ if(rodando) return; rodando = true; passo(); }
  function parar(){ rodando = false; if(timer) clearTimeout(timer); limpar(); msg.textContent = alvos.length + ' elemento(s) com hover. Passe o mouse para ver ao vivo.'; }
  document.getElementById('ds-hv-play').addEventListener('click', function(){ rodando ? parar() : tocar(); });
  msg.textContent = alvos.length + ' elemento(s) com hover.';
  if(!reduz) setTimeout(tocar, 500);
})();</script>`;

  const barra = `<div id="ds-hv-bar" role="toolbar" aria-label="Demonstração de hover">
<span>Hover:</span>
<button type="button" class="ds-hv-btn" id="ds-hv-play">Tocar / parar</button>
<span id="ds-hv-msg" aria-live="polite"></span>
</div>
<div id="ds-hv-palco">${corpo}</div>`;

  return { corpo: `${barra}\n${runtime}`, head };
};

/**
 * Todo o CSS que a prévia de fato carrega: os `<style>` do documento mais os
 * arquivos que os `<link>` apontam para o vault. É a fonte da demonstração de
 * hover — ler pelo CSSOM não serve, porque folha de outra origem não expõe as
 * regras, e é justamente nelas que mora o hover de site com CSS de build.
 */
const cssDoDocumento = (head: string, dsId: string): string[] => {
  const textos: string[] = [];
  for (const m of head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m[1]) textos.push(m[1]);
  }
  for (const m of head.matchAll(/<link[^>]+href="\/api\/asset\/([^"]+)"/gi)) {
    const rel = m[1];
    if (rel === undefined) continue;
    const semDs = rel.replace(`${dsId}/`, '');
    for (const dir of [
      vaultCaptureV2AssetsDir(dsId as `ds_${string}`),
      vaultCaptureAssetsDir(dsId as `ds_${string}`),
    ]) {
      const caminho = join(dir, semDs);
      if (!caminho.startsWith(dir)) continue; // guarda de travessia
      if (!existsSync(caminho)) continue;
      try {
        textos.push(readFileSync(caminho, 'utf8'));
      } catch {
        // arquivo ilegível: segue sem ele
      }
      break;
    }
  }
  return textos;
};

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
  //
  // A chave é COMPOSTA: a posição sozinha já serviu o bundle de outro segmento.
  // O print da dobra carrega o prefixo do hash da seção e resolve por
  // identidade; sem print (ou sem dono único), cai na posição como sempre.
  const dsId = seg.designSystemId as `ds_${string}`;
  const bundle = lerBundleInfo(dsId, {
    position: seg.position,
    framePath: framePathDoSegmento(dsId, seg.id),
  });
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

  // ── A prévia mostra O ARQUIVO QUE SERÁ ENTREGUE ───────────────────────────
  //
  // Este era o defeito mais traiçoeiro do conjunto. A prévia montava `head da
  // página de origem + snippet`: o CSS inteiro do site entrava por fora, e o
  // componente aparecia perfeito na Galeria mesmo quando o bundle estava com
  // uma fração do estilo. A pessoa escolhia pelo que via, e recebia outra coisa
  // no `.zip`. Nenhum erro em lugar nenhum.
  //
  // Agora o padrão é servir o `index.html` do bundle, com as refs relativas
  // dele resolvendo dentro da própria rota. O que se vê é o que se leva.
  //
  // Os modos de demonstração continuam pelo caminho antigo, porque precisam
  // injetar runtime no snippet: `?replay=1` (estados), `?scroll=1`
  // (comportamentos), `?hover=1`. E `?contexto=1` é o modo explícito de ver a
  // região dentro da página inteira — útil, desde que ninguém o confunda com o
  // entregável.
  const modoDeDemonstracao =
    c.req.query('replay') === '1' ||
    c.req.query('scroll') === '1' ||
    c.req.query('hover') === '1' ||
    c.req.query('contexto') === '1';

  if (bundle !== null && !modoDeDemonstracao && existsSync(join(bundle.dir, 'index.html'))) {
    const mini = c.req.query('mini') === '1' ? '?mini=1' : '';
    return c.redirect(
      `/api/preview/bundle/${seg.designSystemId}/${bundle.pasta}/index.html${mini}`,
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

  // Modo hover (`?hover=1`): reescreve as regras `:hover` do próprio site como
  // classe e as liga uma de cada vez. É a única forma honesta de MOSTRAR o
  // hover: o navegador não deixa ninguém acionar `:hover` por código.
  const cabecaOriginal = reescreve(extrairHead(html));
  const hoverDemo =
    c.req.query('hover') === '1' && !scrollReplay && !replay
      ? montarHoverReplay(corpo, cssDoDocumento(cabecaOriginal, seg.designSystemId))
      : null;
  const modo = scrollReplay ?? replay ?? hoverDemo;

  // O rótulo de PROCEDÊNCIA. Aqui embaixo o documento é sempre `head da origem +
  // recorte`: o CSS da página inteira entra por fora e a prévia mostra mais do
  // que a peça carrega consigo. Sem o rótulo, ela é indistinguível do
  // entregável, que foi exatamente o problema que a prévia tinha.
  //
  // Ele valia só no `?contexto=1`, que é o modo em que a pessoa PEDIU a página
  // de origem — justamente o caso em que ela já sabia. Quando não há bundle
  // nenhum ninguém pediu nada, e é aí que a prévia mente calada.
  const seloContexto =
    'Você está vendo esta região <strong>dentro da página de origem</strong>, com o estilo dela carregado por fora. Não é o arquivo que vai no site gerado.';
  const seloSemBundle =
    'Não existe pacote desta peça. Esta prévia usa o estilo da página de origem, então o que vai no site pode sair diferente do que você vê aqui.';
  const textoDoSelo =
    c.req.query('contexto') === '1' ? seloContexto : bundle === null ? seloSemBundle : '';
  const selo =
    textoDoSelo === ''
      ? ''
      : // `pointer-events:none` não é detalhe de estilo: o selo é texto, nada
        // nele se clica, e ele fica no topo com o z-index máximo. Sem isso ele
        // COME o clique dos controles do harness de rolagem que moram na mesma
        // faixa — foi o que quebrou `preview.scroll.browser.test.ts` quando o
        // selo passou a valer também sem `?contexto=1`. Aviso que impede a
        // pessoa de usar a tela deixa de ser aviso e vira obstáculo.
        `<div style="position:sticky;top:0;z-index:2147483647;pointer-events:none;font:12px/1.4 system-ui;padding:6px 12px;background:#0c4a6e;color:#e0f2fe;border-bottom:1px solid #0369a1">${textoDoSelo}</div>`;

  return responderHtml(
    compor({
      titulo: seg.name,
      head: `${cabecaOriginal}${modo ? modo.head : ''}`,
      bodyAttrs: extrairBodyAttrs(html),
      corpo: `${selo}${modo ? modo.corpo : corpo}`,
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
    // bundle (zip, disco). Servido aqui, o isolamento vem do header CSP_PREVIA,
    // e o meta sai porque a política mais restritiva de duas sempre vence: o
    // meta de um bundle antigo derrubaria o css/js do próprio bundle.
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
      'Content-Security-Policy': CSP_PREVIA,
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
  if (!ehDesignSystemId(dsId) || !/^seg_\d+$/.test(pasta)) {
    return new Response(null, { status: 404 });
  }
  return servirArquivoDeBundle(
    join(vaultSegmentBundlesDir(dsId), pasta),
    vaultCaptureV2Dir(dsId),
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
  if (!ehComponentId(cmpId)) {
    return new Response(null, { status: 404 });
  }
  return servirArquivoDeBundle(
    libraryComponentBundleDir(cmpId),
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
  if (!ehDesignSystemId(dsId)) return responderHtml(fallback('ID inválido', '', ''), 404);

  const path = vaultRejeitadosPath(dsId);
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

// ── A prévia do kit MONTADO ─────────────────────────────────────────────────
//
// Mostrar as peças juntas, já vestidas com a marca. É a única coisa que decide
// se um kit presta e a única que o app não sabia mostrar: cada peça sozinha ele
// já mostrava, o consolidado ele já resumia, mas duas origens brigando lado a
// lado só apareciam depois de gerar o site inteiro.
//
// Reusa `montarPaginaDoKit`, o mesmo caminho da geração final. Uma prévia
// aproximada mentiria exatamente onde mais dói.

/** Monta e redireciona para o `index.html` da prévia. */
previewRoute.get('/kit/:kitId', (c) => {
  const kitId = c.req.param('kitId');
  if (!/^kit_[A-Za-z0-9]+$/.test(kitId)) return new Response(null, { status: 404 });

  const cru = c.req.query('componentes');
  const componentIds =
    cru === undefined || cru.trim() === ''
      ? undefined
      : cru.split(',').filter((id) => /^cmp_[A-Za-z0-9]+$/.test(id));

  const projectId = c.req.query('projectId');
  const r = montarPrevia({
    kitId,
    componentIds,
    projectId: projectId !== undefined && ehProjectId(projectId) ? projectId : undefined,
  });

  if (!r.ok) {
    return responderHtml(fallback('Sem prévia', r.motivo, 'Ajuste o kit e tente de novo.'), 200);
  }
  // `Cache-Control` de zero no redirecionamento: a prévia é remontada a cada
  // pedido, e um 302 guardado devolveria o HTML da seleção anterior.
  return c.redirect(`/api/preview/kit-arquivo/${kitId}/index.html?v=${Date.now()}`, 302);
});

/**
 * Os avisos da ÚLTIMA montagem da prévia deste kit.
 *
 * `montarPaginaDoKit` sempre produziu avisos ricos (peça sem bundle em disco,
 * seção vazia, CSS sem escopo por falha de parse, fundo que não anima) e a
 * rota da prévia os descartava no redirect: a Bancada mostrava a página sem
 * nenhuma ressalva, e a pessoa julgava o kit sem saber o que degradou. A
 * montagem grava `avisos.json` ao lado do `index.html`; aqui só se lê.
 */
previewRoute.get('/kit/:kitId/avisos', (c) => {
  const kitId = c.req.param('kitId');
  if (!/^kit_[A-Za-z0-9]+$/.test(kitId)) return new Response(null, { status: 404 });
  const path = join(dirDaPrevia(kitId), 'avisos.json');
  if (!existsSync(path)) return c.json({ avisos: [], faltando: [] });
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      avisos?: unknown;
      faltando?: unknown;
    };
    return c.json({
      avisos: Array.isArray(raw.avisos) ? raw.avisos.filter((a) => typeof a === 'string') : [],
      faltando: Array.isArray(raw.faltando)
        ? raw.faltando.filter((f) => typeof f === 'string')
        : [],
    });
  } catch {
    return c.json({ avisos: [], faltando: [] });
  }
});

/** Arquivos da prévia montada. Mesma disciplina de caminho dos bundles. */
previewRoute.get('/kit-arquivo/:kitId/:caminho{.+}', (c) => {
  const kitId = c.req.param('kitId');
  if (!/^kit_[A-Za-z0-9]+$/.test(kitId)) return new Response(null, { status: 404 });
  return servirArquivoDeBundle(dirDaPrevia(kitId), null, c.req.param('caminho'), false);
});
