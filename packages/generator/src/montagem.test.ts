import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  envolverSecao,
  extrairCorpo,
  limparParaComposicao,
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
  assert.equal(
    reescreverRefsCss('a{background:url(../img/b.png)}b{mask:url("assets/m.svg")}', 'cmp_x'),
    'a{background:url(assets/cmp_x/img/b.png)}b{mask:url("assets/cmp_x/m.svg")}',
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
