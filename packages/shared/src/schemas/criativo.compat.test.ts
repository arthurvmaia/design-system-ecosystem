import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PedidoCriativo, ResultadoCriativo } from './criativo.js';

/**
 * A prova de que "aditivo" é verdade, e não intenção.
 *
 * O contrato vai crescer fase a fase. Cada campo novo é uma chance de quebrar o
 * que já está em disco: `criativos/<job>/pedido.json` e `resultado.json` foram
 * escritos com o contrato de ONTEM, e são a única prova de um gasto que já
 * aconteceu. Um schema que passa a exigir o campo novo transforma material pago
 * em arquivo ilegível.
 *
 * As fixtures abaixo são LITERAIS e CONGELADAS de propósito: elas não importam
 * nada do schema. Se alguém tornar um campo obrigatório, elas param de casar —
 * que é exatamente o alarme que se quer.
 */

/** Um pedido escrito antes de `preset` e `estimativa` existirem. */
const PEDIDO_DE_ONTEM = {
  marca: 'Café da Estação',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: {
    origem: 'gerar',
    caminhoDoUpload: null,
    descricaoParaGerar: 'xícara fumegando na mesa de madeira',
  },
  texto: { semTexto: false, headline: 'Aberto desde as sete', cta: 'Venha tomar um café' },
  restricoes: '',
  variacoes: 2,
  tetoDeCreditos: 150,
  autorizacoesDeClaim: {},
} as const;

/** Um resultado escrito pelo mesmo contrato antigo. */
const RESULTADO_DE_ONTEM = {
  variacoes: [
    { caminho: 'v1.png', estado: 'aprovada', motivo: null },
    { caminho: 'v2.png', estado: 'reprovada', motivo: 'texto ilegível no tamanho real' },
  ],
  custoGasto: 150,
} as const;

test('PROVA: pedido escrito antes dos campos novos continua parseando', () => {
  const r = PedidoCriativo.safeParse(PEDIDO_DE_ONTEM);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('os campos novos entram com default, sem inventar valor', () => {
  const r = PedidoCriativo.parse(PEDIDO_DE_ONTEM);
  assert.equal(r.preset, null, 'preset ausente vira null, e o motor resolve');
  assert.equal(r.estimativa, null, 'estimativa que ninguem registrou nao vira zero');
});

test('resultado escrito antes dos campos novos continua parseando', () => {
  const r = ResultadoCriativo.safeParse(RESULTADO_DE_ONTEM);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('chave desconhecida no arquivo antigo nao derruba a leitura', () => {
  // `z.object` descarta o que não conhece. É o que permite ler um arquivo
  // gravado por uma versão MAIS NOVA do contrato sem explodir.
  const r = PedidoCriativo.safeParse({ ...PEDIDO_DE_ONTEM, campoDoFuturo: 'seja o que for' });
  assert.equal(r.success, true);
});

test('e as garantias antigas continuam de pe', () => {
  // O aditivo não pode ter afrouxado nada: teto continua obrigatório, e upload
  // com descrição de geração continua sendo pedido ambíguo.
  const semTeto = { ...PEDIDO_DE_ONTEM } as Record<string, unknown>;
  semTeto.tetoDeCreditos = undefined;
  assert.equal(PedidoCriativo.safeParse(semTeto).success, false, 'teto continua obrigatorio');

  const ambiguo = {
    ...PEDIDO_DE_ONTEM,
    imagem: {
      origem: 'upload',
      caminhoDoUpload: 'produto.png',
      descricaoParaGerar: 'um produto bonito',
    },
  };
  assert.equal(
    PedidoCriativo.safeParse(ambiguo).success,
    false,
    'upload que tambem manda gerar continua reprovando',
  );
});
