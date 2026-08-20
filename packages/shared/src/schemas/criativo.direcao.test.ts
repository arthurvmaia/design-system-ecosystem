import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coresDerivadas } from './cores-da-peca.js';
import { DirecaoDeMarca, PedidoCriativo, coresDoPedido } from './criativo.js';

/**
 * A DIREÇÃO DE MARCA no contrato.
 *
 * Ela existe porque a tela dos quatro passos mostrava logotipo, paleta,
 * tipografia e voz e escrevia "paleta, tipografia e voz vêm junto" — e o pedido
 * levava duas coisas: a grafia do nome e uma cor. O resto morria no navegador,
 * e a peça saía com o nome da marca numa fonte de sistema sobre um retângulo.
 */

const MINIMO = {
  marca: 'Sorriso Vivo',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', descricaoParaGerar: 'consultório com luz da manhã' },
  texto: { headline: 'Seu sorriso merece atenção' },
  tetoDeCreditos: 225,
} as const;

test('PROVA: pedido ANTERIOR a esta mudança continua passando, com direção vazia', () => {
  // Compatibilidade não é gentileza: há pedidos gravados em disco, e um deles
  // reprovando no parse trava um job pago que já tem arte produzida.
  const r = PedidoCriativo.safeParse(MINIMO);
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.deepEqual(r.data?.direcao, {
    coresDeApoio: [],
    logotipo: null,
    fonteTitulos: null,
    tom: '',
    estiloVisual: '',
    assinatura: null,
  });
});

test('a direção vazia não inventa nada: sem material, nenhum campo se preenche', () => {
  const d = DirecaoDeMarca.parse({});
  assert.equal(d.logotipo, null);
  assert.equal(d.assinatura, null);
  assert.equal(d.fonteTitulos, null);
  assert.deepEqual(d.coresDeApoio, []);
});

test('cor de apoio fora de #RRGGBB reprova no parse', () => {
  const r = DirecaoDeMarca.safeParse({ coresDeApoio: ['azul'] });
  assert.equal(r.success, false);
  assert.match(r.error?.issues[0]?.message ?? '', /#RRGGBB/);
});

test('no maximo 3 cores de apoio: a peça tem faixa, tinta e botão', () => {
  assert.equal(DirecaoDeMarca.safeParse({ coresDeApoio: ['#111111'] }).success, true);
  assert.equal(
    DirecaoDeMarca.safeParse({ coresDeApoio: ['#111111', '#222222', '#333333', '#444444'] })
      .success,
    false,
    'cor que a composição não tem onde pôr é campo que cobra e descarta',
  );
});

test('PROVA: a paleta do pedido tem UM dono para a cor principal', () => {
  // Guardar a principal também na direção criaria duas cópias da mesma verdade,
  // e a divergência delas apareceria como a peça saindo de outra cor.
  const pedido = PedidoCriativo.parse({
    ...MINIMO,
    corPrincipal: '#0a0a12',
    direcao: { coresDeApoio: ['#D0B178'] },
  });
  assert.deepEqual(coresDoPedido(pedido), ['#0a0a12', '#D0B178']);

  // Sem cor principal, o que sobra são as de apoio: nada é inventado no lugar.
  const semPrincipal = PedidoCriativo.parse({ ...MINIMO, direcao: { coresDeApoio: ['#D0B178'] } });
  assert.deepEqual(coresDoPedido(semPrincipal), ['#D0B178']);
});

test('PROVA: a tela e o compositor decidem o botão pela MESMA conta', () => {
  // `coresDerivadas` mora no contrato exatamente para isto: a prévia que
  // promete uma cor e a peça que entrega outra é o defeito que só aparece
  // depois de pago.
  const pedido = PedidoCriativo.parse({
    ...MINIMO,
    corPrincipal: '#0a0a12',
    direcao: { coresDeApoio: ['#D0B178'] },
  });
  const [principal, ...apoio] = coresDoPedido(pedido);
  const cores = coresDerivadas(principal as string, apoio);
  assert.equal(cores.acento, '#D0B178');
  assert.equal(cores.acentoVeioDaMarca, true);
});

test('PROVA: o tom é DIREÇÃO, e o texto da peça continua sendo só o que se digitou', () => {
  // Um tom colado na arte seria o "conteúdo inventado" que o resto deste
  // contrato existe para impedir.
  const pedido = PedidoCriativo.parse({
    ...MINIMO,
    direcao: { tom: 'direta, calorosa, sem gíria', estiloVisual: 'luz natural' },
  });
  assert.equal(pedido.texto.headline, 'Seu sorriso merece atenção');
  assert.equal(pedido.texto.cta, null, 'o tom não vira CTA');
});
