import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEDIDO_EM, VALIDA_ATE, estimar } from '@ds/creative';
import {
  PRESET_DO_PEDIDO,
  avisoDePedidoAoMagnific,
  custoDaTrava,
  lerEscolhaDeImagem,
  lerFluxoDoPedido,
  perguntaDaTrava,
} from './trava-de-imagem.js';

/** Um dia em que a tabela do motor ainda vale, e outro em que ela já venceu. */
const HOJE = MEDIDO_EM;
const DEPOIS_DE_VENCER = '2099-01-01';

test('via expressa SEM escolha recusa, e devolve a pergunta para a tela mostrar', () => {
  const r = lerEscolhaDeImagem({}, 'expressa', HOJE);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.erro, 'imagens_nao_decidido');
  assert.equal(r.pergunta, perguntaDaTrava(HOJE));
  assert.deepEqual(r.opcoes, ['desenho', 'magnific']);
});

/**
 * O NÚMERO DA PERGUNTA sai do motor, e este teste existe porque o anterior
 * travava o número ERRADO.
 *
 * Ele cobrava `1.600` na frase, e a tabela medida diz que o preset `video-curto`
 * custa 520 por peça de 8s com áudio (40/s mais 200 de áudio nativo). O teste
 * ficava verde e a pessoa lia um preço 3× maior antes de decidir gastar. Um
 * teste que trava um número escrito à mão não protege o número: protege o erro.
 *
 * Agora ele compara a frase com a MESMA conta que o motor faz. Remedida a
 * tabela, os dois lados andam juntos e não há nada para atualizar aqui.
 */
test('a pergunta diz o CUSTO, e o custo vem da tabela MEDIDA do motor', () => {
  const imagem = estimar({
    presetId: 'imagem-padrao',
    transporte: 'mcp',
    quantidade: 1,
    resolucao: '2k',
    hoje: HOJE,
  });
  const video = estimar({
    presetId: 'video-curto',
    transporte: 'mcp',
    segundos: 8,
    comAudio: true,
    hoje: HOJE,
  });
  assert.ok(imagem.ok && video.ok);
  if (!imagem.ok || !video.ok) return;

  const frase = perguntaDaTrava(HOJE);
  assert.ok(frase.includes(String(imagem.creditos)), 'custo por imagem');
  assert.ok(frase.includes(String(video.creditos)), 'custo do vídeo');
  assert.ok(frase.includes(MEDIDO_EM), 'e quando isso foi medido');

  /* o número que estava travado à mão, e que a tabela desmente */
  assert.equal(video.creditos, 520);
  assert.equal(frase.includes('1.600'), false, 'o preço antigo não pode voltar');
});

test('o custo da trava e o do motor sao a MESMA conta', () => {
  const custo = custoDaTrava(HOJE);
  assert.equal(custo.ok, true);
  if (!custo.ok) return;
  assert.equal(custo.imagem, 75);
  assert.equal(custo.video, 520);
  assert.equal(custo.medidoEm, MEDIDO_EM);
  assert.equal(custo.validaAte, VALIDA_ATE);
});

/**
 * TABELA VENCIDA tira a OPÇÃO paga, e não a marca.
 *
 * Preço que ninguém consegue dizer não autoriza gasto: pedir um sim sobre um
 * número que virou ficção é o oposto do que esta trava existe para fazer. O que
 * some é a opção, não o caminho — o desenho local continua inteiro.
 */
test('tabela vencida derruba a opcao paga, nos DOIS fluxos', () => {
  for (const fluxo of ['expressa', 'wizard'] as const) {
    const r = lerEscolhaDeImagem({}, fluxo, DEPOIS_DE_VENCER);
    assert.equal(r.ok, false, fluxo);
    if (r.ok) return;
    assert.equal(r.erro, 'preco_indisponivel');
    assert.deepEqual(r.opcoes, ['desenho'], 'só sobra o que não gasta');
    assert.match(r.pergunta, /venceu/);
  }
  /* e pedir magnific na mão também não passa */
  assert.equal(lerEscolhaDeImagem({ imagens: 'magnific' }, 'wizard', DEPOIS_DE_VENCER).ok, false);
  /* mas o desenho local continua inteiro: a marca não deixa de ser criada */
  const desenho = lerEscolhaDeImagem({ imagens: 'desenho' }, 'expressa', DEPOIS_DE_VENCER);
  assert.equal(desenho.ok && desenho.escolha, 'desenho');
});

test('wizard sem escolha JA vem com magnific: quem preencheu tudo demonstrou a intencao', () => {
  const r = lerEscolhaDeImagem({}, 'wizard', HOJE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.escolha, 'magnific');
});

test('no wizard a pessoa ainda pode pedir desenho: o padrao nao e uma imposicao', () => {
  const r = lerEscolhaDeImagem({ imagens: 'desenho' }, 'wizard', HOJE);
  assert.equal(r.ok && r.escolha, 'desenho');
});

test('escolha explicita vale nos dois caminhos', () => {
  for (const origem of ['expressa', 'wizard'] as const) {
    assert.equal(lerEscolhaDeImagem({ imagens: 'magnific' }, origem, HOJE).ok, true);
    assert.equal(lerEscolhaDeImagem({ imagens: 'desenho' }, origem, HOJE).ok, true);
  }
});

test('valor invalido nao passa por escolha: na expressa ele recusa', () => {
  assert.equal(lerEscolhaDeImagem({ imagens: 'sim' }, 'expressa', HOJE).ok, false);
  assert.equal(lerEscolhaDeImagem({ imagens: true }, 'expressa', HOJE).ok, false);
  assert.equal(lerEscolhaDeImagem(null, 'expressa', HOJE).ok, false);
});

test('o fluxo PADRAO e o que pergunta: esquecer de declarar nao pode liberar gasto', () => {
  assert.equal(lerFluxoDoPedido({}), 'expressa');
  assert.equal(lerFluxoDoPedido(null), 'expressa');
  assert.equal(lerFluxoDoPedido({ fluxo: 'qualquer' }), 'expressa');
  assert.equal(lerFluxoDoPedido({ fluxo: 'wizard' }), 'wizard');
  assert.equal(lerEscolhaDeImagem({}).ok, false, 'sem fluxo, o padrao pergunta');
});

test('o aviso do magnific nao promete o que o servidor nao faz', () => {
  const a = avisoDePedidoAoMagnific('prj_1', HOJE);
  assert.ok(a.includes('DESENHADAS'), 'diz o que aconteceu de fato agora');
  assert.ok(a.includes('pedido'), 'e que o Magnific ficou como pedido');
  assert.ok(a.includes('prj_1'));
});

/**
 * E ele nomeia o PRESET, não "o Magnific".
 *
 * Um recado sem preset deixa a escolha do modelo para quem for atender, e foi
 * exatamente assim que a frente de Lojas passou meses gerando por um modelo que
 * o produto nunca declarou. Com o preset escrito, atender é executar.
 */
test('o pedido nomeia o preset e o custo, para atender ser executar e nao decidir', () => {
  const a = avisoDePedidoAoMagnific('prj_1', HOJE);
  assert.ok(a.includes(PRESET_DO_PEDIDO), 'o preset do catálogo');
  assert.ok(a.includes('75'), 'quanto custa cada imagem');
  assert.match(a, /razão/, 'e que o gasto passa pelo razão');
});

test('tabela vencida: o pedido DIZ que nao soube estimar, em vez de calar', () => {
  const a = avisoDePedidoAoMagnific('prj_1', DEPOIS_DE_VENCER);
  assert.match(a, /NÃO pôde ser estimado/);
  assert.match(a, /venceu/);
});
