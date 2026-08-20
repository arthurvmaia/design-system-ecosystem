import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CODIGOS_DA_REGUA,
  PedidoCriativo,
  problemasDaEntregaCriativa,
  tetoComFolga,
} from './criativo.js';

/**
 * O teto do job não pode nascer igual à estimativa.
 *
 * `problemasDaEntregaCriativa` recusa fechar um job cujo gasto passou do teto.
 * Com teto == estimativa o pedido nasce sem margem: uma variação a mais — a
 * tentativa que o cliente tem direito de pedir, ou uma peça refeita depois de
 * falha técnica — deixa o job aberto para sempre, com a arte paga em disco e
 * nenhum caminho para fechá-lo.
 */

/** A folha mínima: "aprovada" só fecha quando alguém mediu alguma coisa. */
/**
 * Uma folha COMPLETA. O portão cobra a régua inteira, então testar com folha
 * parcial seria testar um portão que não é o que roda.
 */
const FOLHA = CODIGOS_DA_REGUA.map((codigo) => ({
  codigo,
  titulo: `regra ${codigo}`,
  estado: 'passou' as const,
  motivo: '',
}));

test('o teto cabe uma variacao a mais que a estimativa', () => {
  const custo = 75;
  const estimativa = custo * 2;
  const teto = tetoComFolga(custo, 2);
  assert.equal(teto, 225);
  assert.ok(teto > estimativa, 'teto igual a estimativa e teto sem folga');
  assert.equal(teto - estimativa, custo, 'a folga e UMA variacao, nao uma porcentagem inventada');
});

test('a folga acompanha o numero de variacoes', () => {
  assert.equal(tetoComFolga(75, 1), 150);
  assert.equal(tetoComFolga(75, 4), 375);
});

test('teto zerado reprova COM o caminho do campo, que e o que da voz a tela', () => {
  // Enquanto o custo medido não chega, o teto sai 0. O pedido tem de reprovar —
  // e a issue precisa apontar `tetoDeCreditos`, porque é por esse caminho que a
  // tela busca a frase que explica o que aconteceu (`VOZ_POR_CAMPO`). Se o Zod
  // mudasse o path, a tela cairia no texto genérico sem ninguém notar.
  const r = PedidoCriativo.safeParse({
    marca: 'Padaria do Bairro',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'pão na cesta' },
    texto: { semTexto: true, headline: null, cta: null },
    variacoes: 2,
    tetoDeCreditos: tetoComFolga(0, 2),
  });
  assert.equal(r.success, false, 'sem custo medido, o pedido nao nasce');
  const caminhos = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  assert.ok(caminhos.includes('tetoDeCreditos'), `esperava tetoDeCreditos, veio ${caminhos}`);
});

test('PROVA: com a folga, a tentativa a mais ainda FECHA o job', () => {
  // É a conta inteira, do teto ao portão de entrega: duas variações estimadas,
  // uma terceira produzida, e o job continua podendo ser concluído.
  const pedido = PedidoCriativo.parse({
    marca: 'Padaria do Bairro',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'pão na cesta' },
    texto: { semTexto: true, headline: null, cta: null },
    variacoes: 2,
    tetoDeCreditos: tetoComFolga(75, 2),
  });

  const problemas = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [
        { caminho: 'v1.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
        { caminho: 'v2.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
        { caminho: 'v3.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
      ],
      custoGasto: 225,
    },
    pedido,
    existe: () => true,
  });
  assert.deepEqual(problemas, [], 'a terceira variacao cabe no teto e o job fecha');
});

/**
 * O portão do teto passou a olhar o RAZÃO.
 *
 * Antes ele comparava o teto contra o `custoGasto` do `resultado.json` — um
 * número que quem produz escreve e que nascia zerado. `0 > teto` nunca dispara:
 * a régua do orçamento existia e não valia nada.
 */
const pedidoDeTeto = (teto: number) =>
  PedidoCriativo.parse({
    marca: 'Padaria do Bairro',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'pão na cesta' },
    texto: { semTexto: true, headline: null, cta: null },
    variacoes: 2,
    tetoDeCreditos: teto,
  });

const entregaDe = (custoGasto: number) => ({
  variacoes: [{ caminho: 'v1.png', estado: 'aprovada', motivo: null, conferencia: FOLHA }],
  custoGasto,
});

test('PROVA: o razao acusa o estouro que o resultado escondia', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaDe(0),
    pedido: pedidoDeTeto(150),
    existe: () => true,
    razao: { gasto: 300, empenhado: 0 },
  });
  assert.ok(
    p.some((m) => m.includes('300') && m.includes('150')),
    `esperava o estouro pelo razao, veio: ${JSON.stringify(p)}`,
  );
});

test('PROVA: reserva em voo na hora de fechar e dinheiro sem dono', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaDe(75),
    pedido: pedidoDeTeto(225),
    existe: () => true,
    razao: { gasto: 75, empenhado: 75 },
  });
  assert.ok(
    p.some((m) => m.includes('empenhados')),
    JSON.stringify(p),
  );
});

test('PROVA: a entrega nao pode afirmar um custo que o razao nao sustenta', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaDe(0),
    pedido: pedidoDeTeto(225),
    existe: () => true,
    razao: { gasto: 75, empenhado: 0 },
  });
  assert.ok(
    p.some((m) => m.includes('não sustentam')),
    JSON.stringify(p),
  );
});

test('razao e entrega de acordo, dentro do teto: fecha', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaDe(150),
    pedido: pedidoDeTeto(225),
    existe: () => true,
    razao: { gasto: 150, empenhado: 0 },
  });
  assert.deepEqual(p, []);
});

test('PROVA: sem a folga, a mesma terceira variacao TRAVA o job', () => {
  // O comportamento de antes, para o contraste ficar medido e não teórico.
  const pedidoApertado = PedidoCriativo.parse({
    marca: 'Padaria do Bairro',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'pão na cesta' },
    texto: { semTexto: true, headline: null, cta: null },
    variacoes: 2,
    tetoDeCreditos: 150,
  });

  const problemas = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [
        { caminho: 'v1.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
        { caminho: 'v2.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
        { caminho: 'v3.png', estado: 'aprovada', motivo: null, conferencia: FOLHA },
      ],
      custoGasto: 225,
    },
    pedido: pedidoApertado,
    existe: () => true,
  });
  assert.ok(problemas.length > 0, 'o job com teto justo nao fecha');
});
