import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { criativosRoute } from './criativos.js';

/**
 * O número de dinheiro sai da tabela medida, nunca da tela.
 *
 * A tela mostrava 75 por imagem e 300 por vídeo, escritos à mão em
 * `apps/web/src/routes/criativos/partes.ts`, com um comentário admitindo que o
 * de vídeo era chute. O preset de vídeo escolhido custa 520 por peça de 8s com
 * áudio — o chute errava por 73%, e era com ele que a tela montava o TETO do
 * pedido.
 */

const app = new Hono().route('/api/criativos', criativosRoute);

test('a rota devolve o custo medido, com a data da medicao', async () => {
  const r = await app.request('http://x/api/criativos/custos');
  assert.equal(r.status, 200);
  const corpo = (await r.json()) as {
    medidoEm: string;
    validaAte: string;
    porVariacao: { imagem: number; video: number };
    detalhe: { imagem: string; video: string };
  };

  assert.equal(corpo.porVariacao.imagem, 75, 'Nano Banana 2 em 2k: medido');
  assert.equal(corpo.porVariacao.video, 520, 'Veo 3.1 Lite 8s com audio: 40/s + 200 de audio');
  assert.match(corpo.medidoEm, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(corpo.validaAte > corpo.medidoEm);
  assert.match(corpo.detalhe.video, /Veo 3\.1 Lite/);
});

test('a rota de custos nao colide com a de arquivo', async () => {
  // `/custos` é um segmento só e `/:jobId/arquivo` são dois — mas a ordem de
  // registro em roteador é o tipo de coisa que quebra sem avisar.
  const r = await app.request('http://x/api/criativos/custos');
  assert.equal(r.status, 200, 'custos nao pode cair no handler de :jobId');
});
