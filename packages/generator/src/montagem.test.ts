import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REGRA_QUE_ABRE_PASSAGEM,
  alvosDoComportamento,
  ancorarNavNasSecoes,
  comportamentoAlcancaAPagina,
  destravarOpacidadeSemRevelador,
  envolverCamadaDePagina,
  envolverSecao,
  extrairCamadasDeFundo,
  extrairCorpo,
  limparEstadoRevelado,
  limparParaComposicao,
  limparTransformCongelado,
  reescreverRefsCss,
  reescreverRefsHtml,
  removerMarcasDeTerceiro,
  soltarRaizDaSecaoNoFluxo,
  trocarMonogramaDaOrigem,
} from './montagem.js';

test('extrairCorpo: documento completo vira só o corpo; fragmento passa direto', () => {
  const doc = `<!doctype html><html><head><title>x</title></head><body class="a">\n<div>oi</div>\n</body></html>`;
  assert.equal(extrairCorpo(doc), '<div>oi</div>');
  assert.equal(extrairCorpo('<div>solto</div>'), '<div>solto</div>');
});

test('limparParaComposicao: tira aviso interno do bundle e links de stylesheet', () => {
  const corpo = `<aside data-ds-aviso="referencia">aviso da galeria</aside>
<link rel="stylesheet" href="assets/css/styles.css">
<div>conteúdo real</div>`;
  assert.equal(limparParaComposicao(corpo), '<div>conteúdo real</div>');
});

test('reescreverRefs: assets ganham o namespace do componente', () => {
  assert.equal(
    reescreverRefsHtml('<img src="assets/img/a.png"><video poster="assets/p.jpg">', 'cmp_x'),
    '<img src="assets/cmp_x/img/a.png"><video poster="assets/cmp_x/p.jpg">',
  );
  // Relativo à FOLHA (assets/styles.css), não à página: `assets/cmp_x/…` aqui
  // resolveria para `assets/assets/…` e toda fonte/imagem do CSS composto
  // respondia 404 em silêncio.
  assert.equal(
    reescreverRefsCss('a{background:url(../img/b.png)}b{mask:url("assets/m.svg")}', 'cmp_x'),
    'a{background:url(cmp_x/img/b.png)}b{mask:url("cmp_x/m.svg")}',
  );
});

/**
 * Cada atributo é conferido SOZINHO, de propósito.
 *
 * A versão anterior casava a tag inteira com um regex terminado em `>`, então
 * qualquer atributo novo a invalidava mesmo estando correta — foi o que
 * aconteceu quando entrou o `data-secao-id`. Asserção por atributo sobrevive ao
 * próximo campo.
 */
test('envolverSecao: uma peça do kit declara procedência e id da seção', () => {
  const html = envolverSecao('<div/>', {
    role: 'hero',
    secaoId: 'sec_1',
    componentIds: ['cmp_a'],
  });
  assert.match(html, /data-secao="hero"/);
  assert.match(html, /data-secao-id="sec_1"/);
  assert.match(html, /data-origem="biblioteca"/);
  assert.match(html, /data-componente="cmp_a"/);
});

test('envolverSecao: várias peças cabem na MESMA seção', () => {
  const html = envolverSecao('<div/>', {
    role: 'features',
    secaoId: 'sec_2',
    componentIds: ['cmp_a', 'cmp_b'],
  });
  assert.match(html, /data-componente="cmp_a cmp_b"/, 'os ids saem na ordem, separados por espaço');
  assert.equal((html.match(/<section/g) ?? []).length, 1, 'é uma seção só, não duas');
});

test('envolverSecao: seção sem peça é "gerado"; seção pela metade é "misto"', () => {
  assert.match(envolverSecao('<div/>', { role: 'cta', componentIds: [] }), /data-origem="gerado"/);
  assert.match(
    envolverSecao('<div/>', { role: 'cta', componentIds: ['cmp_a'], criouAlgo: true }),
    /data-origem="misto"/,
  );
});

// Como nos testes de envolverSecao, cada atributo e cada propriedade do estilo
// é conferido SOZINHO: asserção por pedaço sobrevive ao próximo campo.
test('envolverCamadaDePagina: camada fixa atrás de tudo, sem roubar clique', () => {
  const html = envolverCamadaDePagina('<canvas id="p"></canvas>', {
    componentIds: ['cmp_fundo', 'cmp_brilho'],
  });
  assert.match(html, /data-ds-camadas-de-pagina/);
  assert.match(html, /aria-hidden="true"/, 'a camada é decorativa para o leitor de tela');
  assert.match(html, /data-componente="cmp_fundo cmp_brilho"/, 'os ids saem na ordem');
  assert.match(html, /position:fixed/, 'a camada atravessa a página inteira');
  assert.match(html, /inset:0/, 'cobre a viewport toda');
  assert.match(html, /z-index:-1/, 'fica atrás de todo o conteúdo');
  assert.match(html, /pointer-events:none/, 'fundo não rouba clique');
  assert.match(html, /overflow:hidden/, 'efeito que vaza não cria rolagem horizontal');
  assert.ok(html.includes('<canvas id="p"></canvas>'), 'o corpo vestido segue dentro da camada');
  assert.equal((html.match(/<div/g) ?? []).length, 1, 'um embrulho só, sem aninhamento extra');
});

test('REGRA_QUE_ABRE_PASSAGEM: todo embrulho do compositor fica transparente', () => {
  // O compositor copia para os proxies as classes de <html>/<body> da origem, e
  // entre elas vem a cor de fundo daquela página. Sem esta regra, cada peça
  // pinta um retângulo opaco e o fundo da página (camada herdada ou o body da
  // marca) some atrás de todas elas: é o "background não integrado".
  assert.match(REGRA_QUE_ABRE_PASSAGEM, /\[data-secao\] \[data-ds-corpo\]/, 'proxy de corpo');
  assert.match(REGRA_QUE_ABRE_PASSAGEM, /\[data-secao\]>\[data-ds-raiz\]/, 'proxy de raiz');
  assert.match(REGRA_QUE_ABRE_PASSAGEM, /^\[data-secao\],/, 'a própria section');
  assert.match(REGRA_QUE_ABRE_PASSAGEM, /\[data-ds-criado\]/, 'o envelope da seção criada');
  assert.match(REGRA_QUE_ABRE_PASSAGEM, /background-color:transparent!important/);
  assert.match(
    REGRA_QUE_ABRE_PASSAGEM,
    /background-image:none!important/,
    'gradiente da origem sai da frente',
  );
  // O proxy da PRÓPRIA camada não pode ser apagado: um fundo feito só de
  // gradiente no corpo vive ali, e ele não fica dentro de [data-secao].
  assert.ok(
    !REGRA_QUE_ABRE_PASSAGEM.includes('data-ds-camadas-de-pagina'),
    'a regra não alcança a própria camada',
  );
  // E a camada não carrega mais a regra embutida: ela virou BASE da página,
  // emitida sempre — página sem camada também precisa do fundo integrado.
  const html = envolverCamadaDePagina('<canvas id="p"></canvas>', { componentIds: ['cmp_fundo'] });
  assert.ok(!html.includes('<style'), 'a camada sai sem estilo embutido');
});

test('limparParaComposicao: a peça não arrasta o fundo da página de origem', () => {
  // O caso real: a barra de navegação de um site com canvas de tela cheia. O
  // motor embute as camadas fixas no bundle para a peça aparecer certa SOZINHA
  // na Galeria; numa página montada isso vira duplicata, e a nav, que tem
  // poucos pixels de altura, chegava carregando uma dobra inteira junto.
  const corpo = `<div data-ds-camadas-de-fundo="2">
<canvas id="webgl-bg" class="fixed inset-0 -z-20"></canvas>
<div class="fixed inset-0 -z-10"><div class="blur-grande"></div></div>
</div>
<nav id="navbar" class="sticky top-0"><a href="#">Início</a></nav>`;
  const limpo = limparParaComposicao(corpo);
  assert.ok(!limpo.includes('data-ds-camadas-de-fundo'), 'o bloco de fundo sai inteiro');
  assert.ok(!limpo.includes('webgl-bg'), 'o canvas de tela cheia vai junto');
  assert.ok(!limpo.includes('blur-grande'), 'os divs aninhados dentro do bloco também');
  assert.ok(limpo.startsWith('<nav id="navbar"'), 'sobra a navegação, e nada antes dela');
  assert.ok(limpo.endsWith('</nav>'), 'e nada depois: sem div órfão de fechamento');
});

test('limparParaComposicao: sem fechamento à vista, não corta nada', () => {
  // HTML quebrado acontece. Cortar até o fim do documento apagaria conteúdo que
  // nada tem a ver com o bloco, o que é pior que deixar o bloco.
  const corpo = '<div data-ds-camadas-de-fundo="1"><canvas></canvas><section>texto</section>';
  assert.ok(limparParaComposicao(corpo).includes('texto'), 'o resto do corpo sobrevive');
});

test('extrairCamadasDeFundo: devolve o miolo inteiro, com os aninhados', () => {
  // O inverso da limpeza: é daqui que a página herda o fundo quando o kit não
  // traz peça de fundo nenhuma (o vão preto do hero nasceu dessa assimetria).
  const doc = `<body><div data-ds-camadas-de-fundo="2">
<canvas id="webgl-bg" class="fixed inset-0 -z-20"></canvas>
<div class="fixed inset-0 -z-10"><div class="blur-grande"></div></div>
</div>
<nav id="navbar">Início</nav></body>`;
  const miolo = extrairCamadasDeFundo(doc);
  assert.ok(miolo !== null);
  assert.ok(miolo.includes('webgl-bg'), 'o canvas vem');
  assert.ok(miolo.includes('blur-grande'), 'o div aninhado vem');
  assert.ok(!miolo.includes('data-ds-camadas-de-fundo'), 'sem o embrulho do bundle');
  assert.ok(!miolo.includes('navbar'), 'e nada além do bloco');
});

test('extrairCamadasDeFundo: sem bloco (ou sem fechamento) devolve null', () => {
  assert.equal(extrairCamadasDeFundo('<nav>só conteúdo</nav>'), null);
  assert.equal(
    extrairCamadasDeFundo('<div data-ds-camadas-de-fundo="1"><canvas></canvas>'),
    null,
    'bloco quebrado não vira fundo pela metade',
  );
  assert.equal(
    extrairCamadasDeFundo('<div data-ds-camadas-de-fundo="0"></div>'),
    null,
    'bloco vazio não vira camada',
  );
});

test('limparTransformCongelado: tira só o transform, e só de quem tem data-parallax', () => {
  // A captura grava o estado do DOM no instante do print: um elemento de
  // parallax chega com o translate daquela rolagem. O script da origem viaja
  // junto e reaplica o valor certo — o congelado só faz a peça nascer torta.
  const html =
    '<div data-parallax="0.5" style="transform: translate(9.9px, -9.8px); opacity: 1">a</div>' +
    '<div class="cartao" style="transform: rotate(3deg)">b</div>';
  const limpo = limparTransformCongelado(html);
  assert.ok(!limpo.includes('translate(9.9px'), 'o congelado saiu');
  assert.ok(limpo.includes('opacity: 1'), 'as outras declarações ficam');
  assert.ok(limpo.includes('rotate(3deg)'), 'transform estático de design não é tocado');
});

test('limparTransformCongelado: style que só tinha transform sai inteiro', () => {
  const limpo = limparTransformCongelado(
    '<div data-parallax="1" style="transform: translateY(4px)">a</div>',
  );
  assert.ok(!limpo.includes('style='), 'atributo vazio não fica para trás');
  assert.ok(limpo.includes('data-parallax="1"'), 'o resto da tag sobrevive');
});

test('envolverSecao: nav sticky de origem declara data-fixa-no-topo', () => {
  const html = envolverSecao('<nav class="sticky top-0">Menu</nav>', {
    role: 'nav',
    secaoId: 'sec_1',
    componentIds: ['cmp_nav'],
    fixaNoTopo: true,
  });
  assert.ok(html.includes('data-fixa-no-topo'), 'o atributo casa com a regra do CSS base');
  const sem = envolverSecao('<nav>Menu</nav>', {
    role: 'nav',
    componentIds: ['cmp_nav'],
  });
  assert.ok(!sem.includes('data-fixa-no-topo'), 'sem sticky na origem, nada muda');
});

test('a classe de revelação só sai quando o script que a reaplica viaja junto', () => {
  const html = '<div class="reveal is-visible"><p class="fade in-view">oi</p></div>';

  // 1. Sem script nenhum: NADA sai. Este é o caso perigoso — o CSS deixa
  //    `.reveal` em `opacity:0`, e sem observador o elemento ficaria invisível
  //    para sempre. Página parada é ruim; página vazia é pior.
  const semScript = limparEstadoRevelado(html, []);
  assert.equal(semScript.limpas, 0);
  assert.equal(semScript.html, html, 'o HTML sai intocado');

  // 2. Com script que observa mas NÃO cita a classe: também não sai. Observador
  //    existe para muita coisa — contador, lazy-load, menu que muda no scroll.
  const outroObservador = limparEstadoRevelado(html, [
    'new IntersectionObserver((e)=>{ e.forEach(x=>x.target.dataset.visto=1) })',
  ]);
  assert.equal(outroObservador.limpas, 0);

  // 3. Com as duas provas: a classe sai e o observador volta a ter o que fazer.
  const comScript = limparEstadoRevelado(html, [
    "const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('is-visible')}));",
  ]);
  assert.equal(comScript.limpas, 1, 'só o elemento que tinha a classe');
  assert.deepEqual(comScript.classes, ['is-visible']);
  assert.ok(!comScript.html.includes('is-visible'), 'o estado final saiu');
  assert.ok(comScript.html.includes('class="reveal"'), 'e o resto da classe fica');
  assert.ok(comScript.html.includes('in-view'), 'classe que o script não cita permanece');
});

test('a limpeza não mexe em classe de aba, menu ou carrossel', () => {
  // `active`/`show`/`open` também são estado, e de propósito ficaram fora da
  // lista: tirar uma delas não devolveria movimento, fecharia o que devia
  // estar aberto.
  const html = '<div class="tab active"><ul class="menu show open"></ul></div>';
  const r = limparEstadoRevelado(html, [
    "new IntersectionObserver(()=>{}); el.classList.add('active'); el.classList.add('show');",
  ]);
  assert.equal(r.limpas, 0);
  assert.equal(r.html, html);
});

/**
 * Logotipo de OUTRA empresa não entra no site do cliente.
 *
 * O caso: uma faixa "Em parceria com" de um template de museu, com os ícones
 * `simple-icons:britishmuseum` e `simple-icons:sothebys`, foi parar no hero de
 * um site de clube de futebol. Nada pegava: a troca de mídia só vê `<img>` e
 * `<video>` de `assets/<cmp>/`, e marca pictórica não tem texto para uma
 * varredura textual achar.
 *
 * O sinal que resolve já era gravado pela captura e ninguém lia: a COLEÇÃO do
 * ícone. `simple-icons` é um catálogo de logotipos de empresa.
 */
test('ícone de coleção de LOGOTIPO sai do corpo; ícone comum fica', () => {
  const corpo = [
    '<div class="parceiros">',
    '<iconify-icon icon="simple-icons:sothebys" data-ds-icone-origem="simple-icons:sothebys"></iconify-icon>',
    '<span data-ds-icone-origem="simple-icons:kickstarter" data-ds-icone="inline"><svg><path d="M0 0"/></svg></span>',
    '<iconify-icon icon="lucide:arrow-right" data-ds-icone-origem="lucide:arrow-right"></iconify-icon>',
    '<span class="rotulo">Em parceria com</span>',
    '</div>',
  ].join('\n');
  const r = removerMarcasDeTerceiro(corpo);
  assert.ok(!r.html.includes('sothebys'), 'a casca do iconify sai inteira');
  assert.ok(!r.html.includes('kickstarter'), 'o svg inline sai inteiro');
  assert.ok(r.html.includes('lucide:arrow-right'), 'seta não é marca: fica');
  assert.ok(r.html.includes('Em parceria com'), 'texto vizinho não é tocado');
  assert.deepEqual(r.removidas, ['simple-icons:sothebys', 'simple-icons:kickstarter']);
});

test('corpo sem marca de terceiro atravessa intacto', () => {
  const corpo = '<div><iconify-icon icon="lucide:star"></iconify-icon><span>oi</span></div>';
  const r = removerMarcasDeTerceiro(corpo);
  assert.equal(r.html, corpo);
  assert.deepEqual(r.removidas, []);
});

/**
 * Ícone de rede social FICA — foi um falso positivo medido.
 *
 * A primeira versão desta função tirou, junto com os quatro parceiros do museu,
 * o instagram/facebook/youtube/x do rodapé do site do clube. Mas ali o ícone da
 * rede não é marca de terceiro: é a placa do link do PRÓPRIO cliente, que tem
 * perfil nessas plataformas. A régua não é de que coleção veio — é para que
 * serve.
 */
test('rede social do rodapé FICA; parceiro da origem sai, na mesma peça', () => {
  const corpo = [
    '<footer>',
    '<iconify-icon icon="simple-icons:instagram" data-ds-icone-origem="simple-icons:instagram"></iconify-icon>',
    '<iconify-icon icon="simple-icons:youtube" data-ds-icone-origem="simple-icons:youtube"></iconify-icon>',
    '<iconify-icon icon="simple-icons:sothebys" data-ds-icone-origem="simple-icons:sothebys"></iconify-icon>',
    '</footer>',
  ].join('\n');
  const r = removerMarcasDeTerceiro(corpo);
  assert.ok(r.html.includes('instagram'), 'o link social do cliente fica');
  assert.ok(r.html.includes('youtube'), 'o link social do cliente fica');
  assert.ok(!r.html.includes('sothebys'), 'o parceiro do site de origem sai');
  assert.deepEqual(r.removidas, ['simple-icons:sothebys']);
});

/**
 * A fileira que ficou oca some — e o rótulo dela vai junto.
 *
 * Apagar só os ícones deixou, no site do clube, um "OPERADO POR" sozinho sobre
 * nada: um título anunciando o vazio. Degradar para o vazio é justamente o que
 * a doutrina proíbe.
 */
test('fileira de parceiros que esvaziou some, com o rótulo dela', () => {
  const corpo = [
    '<div class="w-full border-t pt-8">',
    '<p class="uppercase">Operado por</p>',
    '<div class="flex flex-wrap gap-8">',
    '<iconify-icon icon="simple-icons:sothebys" data-ds-icone-origem="simple-icons:sothebys"></iconify-icon>',
    '<iconify-icon icon="simple-icons:artstation" data-ds-icone-origem="simple-icons:artstation"></iconify-icon>',
    '</div>',
    '</div>',
    '<p>Este parágrafo continua.</p>',
  ].join('\n');
  const r = removerMarcasDeTerceiro(corpo);
  assert.ok(!r.html.includes('Operado por'), 'o rótulo órfão sai junto com a fileira');
  assert.ok(!r.html.includes('border-t'), 'o embrulho da faixa sai também');
  assert.ok(r.html.includes('Este parágrafo continua.'), 'o conteúdo vizinho fica');
  assert.equal(r.removidas.length, 2);
});

test('poda não leva junto container que ainda tem conteúdo', () => {
  const corpo = [
    '<div class="parceiros">',
    '<iconify-icon icon="simple-icons:sothebys" data-ds-icone-origem="simple-icons:sothebys"></iconify-icon>',
    '<img src="assets/cmp_x/foto.jpg">',
    '</div>',
  ].join('\n');
  const r = removerMarcasDeTerceiro(corpo);
  assert.ok(r.html.includes('parceiros'), 'o container fica: ainda tem a foto');
  assert.ok(r.html.includes('foto.jpg'));
  assert.ok(!r.html.includes('sothebys'));
});

test('div que JÁ era vazio antes não é podado', () => {
  const corpo =
    '<div class="espacador"></div><div class="p"><iconify-icon data-ds-icone-origem="simple-icons:sothebys"></iconify-icon></div>';
  const r = removerMarcasDeTerceiro(corpo);
  assert.ok(r.html.includes('espacador'), 'vazio sem marca dentro não é tocado');
});

// ── O comportamento que viaja e não alcança nada ────────────────────────────

test('alvosDoComportamento lê o literal nas três aspas, com e sem All', () => {
  const alvos = alvosDoComportamento([
    "document.querySelectorAll('.scroll-item').forEach(fn)",
    'const c = document.querySelectorAll("[data-counter-target]");',
    'document.querySelector(`#topo`)',
  ]);
  assert.deepEqual(alvos, ['.scroll-item', '[data-counter-target]', '#topo']);
});

test('seletor montado por concatenação degrada para VIVO: não há o que provar', () => {
  // O literal que sobra (`.`) não pede classe, id nem atributo nenhum. Sem
  // exigência não há prova de morte, e o lado certo do erro é não acusar.
  const alvos = alvosDoComportamento(['document.querySelectorAll("." + nome)']);
  assert.equal(comportamentoAlcancaAPagina('<section data-secao="hero"></section>', alvos), true);
});

test('comportamentoAlcancaAPagina: a classe está na página', () => {
  const html = '<section data-secao="hero"><div class="scroll-item">oi</div></section>';
  assert.equal(comportamentoAlcancaAPagina(html, ['.scroll-item']), true);
});

/**
 * O caso do clube, reduzido: os dois seletores do único comportamento do kit
 * contra o HTML que a página de fato tem. Zero ocorrências dos dois.
 */
test('comportamentoAlcancaAPagina: nenhum alvo existe — o comportamento é morto', () => {
  const html = '<section data-secao="hero"><h1 class="titulo">Clube</h1></section>';
  assert.equal(comportamentoAlcancaAPagina(html, ['.scroll-item', '[data-counter-target]']), false);
});

test('comportamentoAlcancaAPagina: sem seletor nenhum, degrada para vivo', () => {
  assert.equal(comportamentoAlcancaAPagina('<section></section>', []), true);
});

/**
 * Sem alcance, a classe de revelação FICA — e a seção não some.
 *
 * O pior defeito que o banco de prova achou: em 8 de 12 kits uma seção inteira
 * saía com `opacity: 0` e ficava invisível PARA SEMPRE. As duas provas antigas
 * (existe IntersectionObserver, algum script cita a classe) diziam que o
 * revelador EXISTE, não que ele ENCONTRA alguém — e quando a peça que revela vem
 * de uma origem e as seções vêm de outra, `querySelectorAll` volta vazio.
 *
 * Perder a animação de entrada é uma perda pequena e visível. Uma seção em
 * branco é uma perda grande e silenciosa.
 */
test('revelação sem alcance na página: a classe NÃO é tirada', () => {
  const script = `document.querySelectorAll('.scroll-item').forEach(function(el){
    new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) e.target.classList.add('in-view'); }); }).observe(el);
  });`;
  // A página NÃO tem `.scroll-item` — o alvo do script não existe aqui.
  const html = '<section class="bloco in-view"><h2 class="in-view">Título</h2></section>';
  const r = limparEstadoRevelado(html, [script]);
  assert.equal(r.limpas, 0, 'nada foi tirado');
  assert.ok(r.html.includes('in-view'), 'a classe fica, e a seção continua visível');
});

test('revelação COM alcance: a classe é tirada e a animação volta', () => {
  const script = `document.querySelectorAll('.scroll-item').forEach(function(el){
    new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) e.target.classList.add('in-view'); }); }).observe(el);
  });`;
  // Agora a página TEM `.scroll-item`: o script acha quem revelar.
  const html = '<section class="scroll-item in-view"><h2>Título</h2></section>';
  const r = limparEstadoRevelado(html, [script]);
  assert.equal(r.limpas, 1);
  assert.ok(!r.html.includes('in-view'), 'a classe sai para o script reaplicá-la ao rolar');
  assert.ok(r.html.includes('scroll-item'), 'o alvo do script continua lá');
});

/**
 * O monograma da ORIGEM vira o logotipo da marca — em todas as peças.
 *
 * O dono viu o "M" na nav de um clube que tem escudo. Consertei aquele caso com
 * uma substituição escrita à mão, e ao medir o site sobravam OUTROS DOIS: o
 * mesmo monograma reaparece no avatar do depoimento e no balão de conversa.
 * Substituição por site conserta um lugar; o defeito é da classe.
 */
test('monograma da origem vira o logotipo da marca; conteúdo comum não é tocado', () => {
  const logo = { src: 'midia/escudo.png', alt: 'Clube' };
  const corpo = [
    '<div class="w-8 h-8 rounded-full bg-stone-800"><span class="font-serif">M</span></div>',
    '<div class="w-12 h-12 rounded-lg bg-blue-600">M</div>',
    '<div class="w-8 h-8 rounded-full bg-stone-800"><span>4</span></div>',
    '<div class="w-24 h-24 rounded-full"><span>GG</span></div>',
    '<div class="w-8 h-8 rounded-full"><span>Sócio</span></div>',
  ].join('\n');
  const r = trocarMonogramaDaOrigem(corpo, logo);
  assert.equal(r.trocados, 2, 'os dois selos de marca, e só eles');
  assert.equal((r.html.match(/midia\/escudo\.png/g) ?? []).length, 2);
  assert.ok(r.html.includes('>4<') || r.html.includes('<span>4</span>'), 'número de contador fica');
  assert.ok(r.html.includes('GG'), 'caixa grande não é selo de marca: fica');
  assert.ok(r.html.includes('Sócio'), 'palavra dentro da caixa não é monograma');
});

test('sem logotipo da marca, o monograma fica: círculo oco é pior', () => {
  const corpo = '<div class="w-8 h-8 rounded-full"><span>M</span></div>';
  const r = trocarMonogramaDaOrigem(corpo, null);
  assert.equal(r.trocados, 0);
  assert.equal(r.html, corpo);
});

test('slot que já tem imagem não é trocado de novo', () => {
  const corpo = '<div class="w-8 h-8 rounded-full"><img src="midia/escudo.png" alt="x"></div>';
  const r = trocarMonogramaDaOrigem(corpo, { src: 'midia/outro.png', alt: 'y' });
  assert.equal(r.trocados, 0);
});

/**
 * A ORDEM das classes não importa — supor que importava deixou um passar.
 *
 * A primeira versão exigia `w-N` antes de `h-N`. No site do clube havia um
 * `h-10 w-10`, altura primeiro, e ele atravessou intacto: dois monogramas
 * trocados e um sobrando. Quem escreve utilitária não segue ordem nenhuma.
 */
test('monograma com a ALTURA declarada antes da largura também é trocado', () => {
  const logo = { src: 'midia/escudo.png', alt: 'Clube' };
  const corpo =
    '<div class="shrink-0 h-10 w-10 bg-gradient-to-br from-[#FBFCD4] rounded-xl flex items-center">M</div>';
  const r = trocarMonogramaDaOrigem(corpo, logo);
  assert.equal(r.trocados, 1);
  assert.ok(r.html.includes('midia/escudo.png'));
});

test('caixa quadrada SEM canto arredondado não é selo de marca', () => {
  const corpo = '<div class="w-10 h-10 bg-red-500">M</div>';
  const r = trocarMonogramaDaOrigem(corpo, { src: 'x.png', alt: 'y' });
  assert.equal(r.trocados, 0);
});

test('altura e largura DIFERENTES não são selo de marca', () => {
  const corpo = '<div class="w-10 h-16 rounded-full">M</div>';
  const r = trocarMonogramaDaOrigem(corpo, { src: 'x.png', alt: 'y' });
  assert.equal(r.trocados, 0, 'retângulo não é selo');
});

test('opacidade zero SEM revelador que alcance a pagina volta a aparecer', () => {
  // Medido nos 20 sites de prova: 362 trechos invisiveis, com classe de nome
  // revelador (gsap-fade-up, pc-hidden-content, stack-card). O script da origem
  // nao viajou ou nao alcanca ninguem, e o texto some para sempre.
  const html = '<div class="gsap-fade-up"><p>Texto que some</p></div>';
  const css = '.gsap-fade-up{opacity:0;transform:translateY(20px)}';
  // O script procura algo que NAO existe nesta pagina.
  const scripts = ["document.querySelectorAll('.nao-existe-aqui')"];
  const r = destravarOpacidadeSemRevelador(css, scripts, html);
  assert.deepEqual(r.destravadas, ['gsap-fade-up']);
  assert.ok(r.css.includes('opacity:1 !important'));
});

test('com revelador que ALCANCA, a opacidade zero fica: e estado inicial legitimo', () => {
  const html = '<div class="gsap-fade-up"><p>x</p></div>';
  const css = '.gsap-fade-up{opacity:0}';
  const scripts = ["document.querySelectorAll('.gsap-fade-up')"];
  const r = destravarOpacidadeSemRevelador(css, scripts, html);
  assert.deepEqual(r.destravadas, []);
  assert.equal(r.css, '');
});

test('classe que nao esta no HTML da peca nao vira regra: peso morto', () => {
  const html = '<div class="outra"><p>x</p></div>';
  const css = '.gsap-fade-up{opacity:0}';
  const r = destravarOpacidadeSemRevelador(css, ["document.querySelector('.nada')"], html);
  assert.deepEqual(r.destravadas, []);
});

test('seletor de ESTADO nao e destravado: hover descreve situacao, nao repouso', () => {
  const html = '<div class="cartao"><p>x</p></div>';
  const css = '.cartao:hover .selo{opacity:0}';
  const r = destravarOpacidadeSemRevelador(css, ["document.querySelector('.nada')"], html);
  assert.deepEqual(r.destravadas, []);
});

test('conteudo de HOVER nao e destravado: quebraria o desenho do cartao', () => {
  // Caso real de um site de prova: um cartao de preco que abre as vantagens
  // quando o ponteiro chega. `pointer-events:none` junto da opacidade zero e a
  // assinatura disso — quem nao recebe clique espera o ponteiro, nao um script.
  const html =
    '<div class="pricing-card"><div class="pc-hidden-content"><li>Vantagem</li></div></div>';
  const css =
    '.pc-hidden-content{opacity:0;pointer-events:none;transition:opacity .4s}' +
    '.pricing-card:hover .pc-hidden-content{opacity:1}';
  const r = destravarOpacidadeSemRevelador(css, ["document.querySelector('.nada')"], html);
  assert.deepEqual(r.destravadas, [], 'o hover fica como esta');
});

test('a nav passa a apontar para as secoes DESTA pagina', () => {
  // O dono clicou nos itens do menu e nada acontecia: os href vieram do site de
  // origem e apontam para ancoras e rotas que nao existem aqui.
  const html =
    '<nav><a href="#features">Funcionalidades</a><a href="/precos">Planos</a>' +
    '<a href="https://x.com/marca">Twitter</a><a href="mailto:a@b.c">Email</a>' +
    '<a href="/blog">Blog</a></nav>';
  const secoes = [
    { id: 'sec_1', papel: 'features', nome: 'Funcionalidades' },
    { id: 'sec_2', papel: 'pricing', nome: 'Planos' },
  ];
  const r = ancorarNavNasSecoes(html, secoes);
  assert.equal(r.ligados, 2);
  assert.ok(r.html.includes('href="#sec_1">Funcionalidades'));
  assert.ok(r.html.includes('href="#sec_2">Planos'));
  assert.ok(r.html.includes('https://x.com/marca'), 'link externo fica');
  assert.ok(r.html.includes('mailto:a@b.c'), 'contato fica');
  assert.ok(r.html.includes('href="/blog">Blog'), 'sem secao que case, nao inventa destino');
});

test('a nav casa pelo ROTULO do papel, nao so pelo nome da secao', () => {
  const html = '<nav><a href="/x">Perguntas frequentes</a></nav>';
  const r = ancorarNavNasSecoes(html, [{ id: 'sec_9', papel: 'faq', nome: 'Duvidas' }]);
  assert.equal(r.ligados, 1);
  assert.ok(r.html.includes('href="#sec_9"'));
});

test('acento e caixa nao atrapalham a ligacao', () => {
  const html = '<nav><a href="/x">PLANOS</a><a href="/y">contato</a></nav>';
  const r = ancorarNavNasSecoes(html, [
    { id: 'sec_1', papel: 'pricing', nome: 'Planos' },
    { id: 'sec_2', papel: 'contact', nome: 'Contato' },
  ]);
  assert.equal(r.ligados, 2);
});

test('ancora que ja aponta para uma secao desta pagina nao e mexida', () => {
  const html = '<nav><a href="#sec_7">Planos</a></nav>';
  const r = ancorarNavNasSecoes(html, [{ id: 'sec_1', papel: 'pricing', nome: 'Planos' }]);
  assert.equal(r.ligados, 0);
  assert.ok(r.html.includes('href="#sec_7"'));
});

test('soltarRaizDaSecaoNoFluxo: a raiz da peca volta ao fluxo, o de dentro fica', () => {
  // Um <header class="fixed top-0> e a coisa mais comum numa nav. Recortado
  // para dentro de uma <section> que so tem ele, a secao sai com ZERO pixel —
  // e isso reprovava S14 (secao colapsada), S19 (emenda negativa de -1447px) e
  // S18 (70px de conteudo em caixa de 0px) ao mesmo tempo.
  const r = soltarRaizDaSecaoNoFluxo(
    ':where([data-ds-raiz="d"], [data-ds-corpo="d"]):is(.fixed){position:fixed}' +
      ':where([data-ds-corpo="d"]) .absolute{position:absolute}' +
      ':where([data-ds-corpo="d"]) .cartao{position:relative}',
  );
  assert.deepEqual(r.classes, ['absolute', 'fixed']);
  assert.match(r.css, /\[data-secao\] \[data-ds-corpo\]>\.fixed/);
  assert.match(r.css, /position:relative!important/);
  assert.ok(!r.css.includes('.cartao'), 'quem ja esta no fluxo nao entra');
  // O alcance e o minimo: so o filho DIRETO do proxy, isto e, a raiz da peca.
  // Camada decorativa `fixed inset-0` dentro do hero continua intocada.
  assert.ok(!/\[data-ds-corpo\] \./.test(r.css), 'nada de descendente solto');
});

test('soltarRaizDaSecaoNoFluxo: sem peca fora do fluxo, nao emite regra', () => {
  const r = soltarRaizDaSecaoNoFluxo('.a{color:red}.b{position:relative}');
  assert.equal(r.css, '');
  assert.deepEqual(r.classes, []);
});
