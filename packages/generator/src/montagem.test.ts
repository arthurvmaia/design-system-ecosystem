import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REGRA_QUE_ABRE_PASSAGEM,
  envolverCamadaDePagina,
  envolverSecao,
  extrairCamadasDeFundo,
  extrairCorpo,
  limparParaComposicao,
  limparTransformCongelado,
  reescreverRefsCss,
  reescreverRefsHtml,
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
