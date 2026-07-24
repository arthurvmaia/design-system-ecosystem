/**
 * Fixtures de comportamento de scroll — páginas isoladas, cada uma com UM efeito
 * bem definido, para testar captura, classificação, reprodução e validação sem
 * depender de nenhum site externo. Genéricas (sem nome de site).
 *
 * Cada função devolve o HTML completo de uma página alta o bastante para rolar.
 */

const doc = (titulo: string, head: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
<style>*{margin:0;box-sizing:border-box}body{font-family:system-ui}
.spacer{height:120vh}.bloco{height:60vh;display:flex;align-items:center;justify-content:center;font-size:24px}
${head}</style></head><body>${body}</body></html>`;

/** reveal por IntersectionObserver: adiciona a classe `vis` (opacity 0→1). */
export const revealIO = (): string =>
  doc(
    'reveal',
    `.card{opacity:0;transform:translateY(40px);transition:opacity .5s,transform .5s}
.card.vis{opacity:1;transform:translateY(0)}`,
    `<div class="spacer">role</div>
<section class="bloco"><div id="alvo" class="card">Revelo ao entrar</div></section>
<div class="spacer"></div>
<script>
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('vis')})},{threshold:.3});
io.observe(document.getElementById('alvo'));
</script>`,
  );

/** class-toggle puro: IO liga/desliga a classe `ativo` (sem opacity). */
export const classToggle = (): string =>
  doc(
    'class-toggle',
    '.item.ativo{outline:3px solid #b91c1c}',
    `<div class="spacer"></div>
<section class="bloco"><div id="alvo" class="item">Ganho classe ao aparecer</div></section>
<div class="spacer"></div>
<script>
new IntersectionObserver(function(es){es.forEach(function(e){e.target.classList.toggle('ativo',e.isIntersecting)})},{threshold:.5}).observe(document.getElementById('alvo'));
</script>`,
  );

/** sticky simples: a barra fica presa no topo durante a seção. */
export const sticky = (): string =>
  doc(
    'sticky',
    `.wrap{height:250vh;position:relative}
.barra{position:sticky;top:0;height:64px;background:#111;color:#fff;display:flex;align-items:center;padding:0 20px}`,
    `<div class="spacer"></div>
<div class="wrap"><div id="alvo" class="barra">Fico presa</div><div class="bloco">conteúdo</div></div>
<div class="spacer"></div>`,
  );

/** parallax: um listener de scroll desloca o alvo em ritmo menor (translateY). */
export const parallax = (): string =>
  doc(
    'parallax',
    `.camada{position:relative;height:80vh;overflow:hidden;background:#eee}
#alvo{position:absolute;inset:0;background:linear-gradient(#f00,#00f);will-change:transform}`,
    `<div class="spacer"></div>
<div class="camada"><div id="alvo"></div></div>
<div class="spacer"></div>
<script>
addEventListener('scroll',function(){document.getElementById('alvo').style.transform='translateY('+(scrollY*0.3)+'px)'},{passive:true});
</script>`,
  );

/** opacity por progresso: fade contínuo vinculado ao scroll (scrub). */
export const opacityProgress = (): string =>
  doc(
    'opacity-progress',
    '#alvo{position:fixed;top:40%;left:40%;font-size:40px}',
    `<div style="height:300vh"></div>
<div id="alvo">FADE</div>
<script>
var max=document.documentElement.scrollHeight-innerHeight;
addEventListener('scroll',function(){var p=scrollY/max;document.getElementById('alvo').style.opacity=String(1-Math.abs(p-0.5)*2)},{passive:true});
</script>`,
  );

/** scale por progresso: cresce conforme rola. */
export const scaleProgress = (): string =>
  doc(
    'scale-progress',
    '#alvo{position:fixed;top:40%;left:40%;width:120px;height:120px;background:#b91c1c;will-change:transform}',
    `<div style="height:300vh"></div>
<div id="alvo"></div>
<script>
var max=document.documentElement.scrollHeight-innerHeight;
addEventListener('scroll',function(){var p=scrollY/max;document.getElementById('alvo').style.transform='scale('+(1+p)+')'},{passive:true});
</script>`,
  );

/** tema por seção: o fundo do body muda conforme a seção ativa. */
export const sectionTheme = (): string =>
  doc(
    'section-theme',
    `section{height:100vh;display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px}
#s1{background:#0b0b0e}#s2{background:#7c2d12}#s3{background:#134e4a}`,
    `<section id="s1" data-tema="escuro">um</section>
<section id="s2" data-tema="quente">dois</section>
<section id="s3" data-tema="frio">três</section>
<script>
var secs=[...document.querySelectorAll('section')];
new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)document.body.style.background=getComputedStyle(e.target).background})},{threshold:.6}).observe;
secs.forEach(function(s){new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)document.body.setAttribute('data-tema',e.target.getAttribute('data-tema'))})},{threshold:.6}).observe(s)});
</script>`,
  );

/** sequência de cards: vários revelam em cadência. */
export const cardSequence = (): string =>
  doc(
    'card-sequence',
    `.g{display:grid;gap:24px;padding:40px}
.c{height:180px;background:#ddd;opacity:0;transform:translateY(30px);transition:.4s}
.c.vis{opacity:1;transform:none}`,
    `<div class="spacer"></div>
<div class="g">${Array.from({ length: 6 }, (_, i) => `<div class="c" id="c${i}">card ${i}</div>`).join('')}</div>
<div class="spacer"></div>
<script>
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('vis')})},{threshold:.2});
document.querySelectorAll('.c').forEach(function(c){io.observe(c)});
</script>`,
  );

/** scroll horizontal dentro de uma seção pinada (translateX conforme rola). */
export const horizontalScroll = (): string =>
  doc(
    'horizontal-scroll',
    `.pin{position:sticky;top:0;height:100vh;overflow:hidden}
.trilha{display:flex;height:100vh;will-change:transform}
.painel{min-width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;font-size:40px}
.outer{height:400vh}`,
    `<div class="spacer"></div>
<div class="outer"><div class="pin"><div id="alvo" class="trilha">
<div class="painel" style="background:#f87171">A</div><div class="painel" style="background:#60a5fa">B</div><div class="painel" style="background:#34d399">C</div>
</div></div></div>
<div class="spacer"></div>
<script>
var outer=document.querySelector('.outer');
addEventListener('scroll',function(){
  var r=outer.getBoundingClientRect();var prog=Math.min(1,Math.max(0,-r.top/(outer.offsetHeight-innerHeight)));
  document.getElementById('alvo').style.transform='translateX(-'+(prog*200)+'vw)';
},{passive:true});
</script>`,
  );

/** runtime externo declarado: um <script src> com "gsap" no nome (não embutido). */
export const externalRuntime = (): string =>
  doc(
    'external-runtime',
    '',
    `<div class="spacer"></div>
<section class="bloco" data-scroll data-speed="2"><div id="alvo">efeito por GSAP</div></section>
<div class="spacer"></div>
<script src="https://cdn.example.com/gsap.min.js"></script>
<script src="https://cdn.example.com/ScrollTrigger.min.js"></script>`,
  );

/** Todas as fixtures, por nome. */
export const SCROLL_FIXTURES: Record<string, () => string> = {
  revealIO,
  classToggle,
  sticky,
  parallax,
  opacityProgress,
  scaleProgress,
  sectionTheme,
  cardSequence,
  horizontalScroll,
  externalRuntime,
};
