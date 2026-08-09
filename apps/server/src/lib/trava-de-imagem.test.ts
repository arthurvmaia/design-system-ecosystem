import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PERGUNTA_DA_TRAVA,
  avisoDePedidoAoMagnific,
  lerEscolhaDeImagem,
  lerFluxoDoPedido,
} from './trava-de-imagem.js';

test('via expressa SEM escolha recusa, e devolve a pergunta para a tela mostrar', () => {
  const r = lerEscolhaDeImagem({}, 'expressa');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.erro, 'imagens_nao_decidido');
  assert.equal(r.pergunta, PERGUNTA_DA_TRAVA);
  assert.deepEqual(r.opcoes, ['desenho', 'magnific']);
});

test('a pergunta diz o CUSTO: sem o número ela não ajuda a decidir', () => {
  assert.ok(/75/.test(PERGUNTA_DA_TRAVA), 'custo por imagem');
  assert.ok(/1\.600/.test(PERGUNTA_DA_TRAVA), 'custo do vídeo');
});

test('wizard sem escolha JA vem com magnific: quem preencheu tudo demonstrou a intencao', () => {
  const r = lerEscolhaDeImagem({}, 'wizard');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.escolha, 'magnific');
});

test('no wizard a pessoa ainda pode pedir desenho: o padrao nao e uma imposicao', () => {
  const r = lerEscolhaDeImagem({ imagens: 'desenho' }, 'wizard');
  assert.equal(r.ok && r.escolha, 'desenho');
});

test('escolha explicita vale nos dois caminhos', () => {
  for (const origem of ['expressa', 'wizard'] as const) {
    assert.equal(lerEscolhaDeImagem({ imagens: 'magnific' }, origem).ok, true);
    assert.equal(lerEscolhaDeImagem({ imagens: 'desenho' }, origem).ok, true);
  }
});

test('valor invalido nao passa por escolha: na expressa ele recusa', () => {
  assert.equal(lerEscolhaDeImagem({ imagens: 'sim' }, 'expressa').ok, false);
  assert.equal(lerEscolhaDeImagem({ imagens: true }, 'expressa').ok, false);
  assert.equal(lerEscolhaDeImagem(null, 'expressa').ok, false);
});

test('o fluxo PADRAO e o que pergunta: esquecer de declarar nao pode liberar gasto', () => {
  assert.equal(lerFluxoDoPedido({}), 'expressa');
  assert.equal(lerFluxoDoPedido(null), 'expressa');
  assert.equal(lerFluxoDoPedido({ fluxo: 'qualquer' }), 'expressa');
  assert.equal(lerFluxoDoPedido({ fluxo: 'wizard' }), 'wizard');
  assert.equal(lerEscolhaDeImagem({}).ok, false, 'sem fluxo, o padrao pergunta');
});

test('o aviso do magnific nao promete o que o servidor nao faz', () => {
  const a = avisoDePedidoAoMagnific('prj_1');
  assert.ok(a.includes('DESENHADAS'), 'diz o que aconteceu de fato agora');
  assert.ok(a.includes('pedido'), 'e que o Magnific ficou como pedido');
  assert.ok(a.includes('prj_1'));
});
