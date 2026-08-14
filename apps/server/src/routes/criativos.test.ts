import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A regra que esta rota existe para não quebrar: peça REPROVADA não vira
 * download. O arquivo pode estar em disco — a verificação é que barrou — e
 * servir assim mesmo transformaria "reprovada" em rótulo decorativo.
 */
test('criativos: a aprovada baixa, a reprovada diz o que falhou', async (t) => {
  const root = join(tmpdir(), `ds-cri-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree } = await import('@ds/indexer');
  const { criativosRoute } = await import('./criativos.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SO limpa o temp */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  const job = shared.enqueueJob('criativo', 'Criativo: Café da Estação', {
    marca: 'Café da Estação',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'xícara na mesa' },
    texto: { semTexto: false, headline: 'Aberto desde as sete', cta: 'Venha tomar um café' },
    variacoes: 2,
    tetoDeCreditos: 40,
    autorizacoesDeClaim: {},
  });

  const pasta = shared.criativosDir(job.id);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'boa.png'), 'png-de-mentira');
  writeFileSync(join(pasta, 'ruim.png'), 'png-de-mentira');
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify({
      variacoes: [
        { caminho: 'boa.png', estado: 'aprovada', motivo: null },
        { caminho: 'ruim.png', estado: 'reprovada', motivo: 'texto ilegível no tamanho real' },
      ],
      custoGasto: 12,
    }),
  );

  const app = new Hono().route('/api/criativos', criativosRoute);
  const chamar = async (u: string): Promise<Response> => await app.request(`http://x${u}`);

  const lista = (await (await chamar('/api/criativos')).json()) as {
    items: { id: string; aprovadas: number; custoGasto: number; pedido: { marca: string } }[];
  };
  const meu = lista.items.find((i) => i.id === job.id);
  assert.ok(meu !== undefined, 'o pedido aparece na lista');
  assert.equal(meu.aprovadas, 1, 'uma das duas passou');
  assert.equal(meu.custoGasto, 12, 'a conta do gasto vem junto: quem pôs teto tem direito de ver');
  assert.equal(meu.pedido.marca, 'Café da Estação');

  const boa = await chamar(`/api/criativos/${job.id}/arquivo?caminho=boa.png`);
  assert.equal(boa.status, 200);
  assert.equal(boa.headers.get('Content-Type'), 'image/png');

  const ruim = await chamar(`/api/criativos/${job.id}/arquivo?caminho=ruim.png`);
  assert.equal(ruim.status, 409, 'reprovada NÃO baixa');
  assert.match(
    JSON.stringify(await ruim.json()),
    /ileg/,
    'e a resposta diz o motivo, em vez de um 404 mudo',
  );

  // Só o que o RESULTADO declarou é servido: nome montado na URL não alcança
  // arquivo nenhum, mesmo existindo em disco.
  const intruso = await chamar(`/api/criativos/${job.id}/arquivo?caminho=resultado.json`);
  assert.equal(intruso.status, 404, 'arquivo não declarado não é servido');

  const travessia = await chamar(
    `/api/criativos/${job.id}/arquivo?caminho=${encodeURIComponent('../../ecosystem.db')}`,
  );
  assert.ok(travessia.status >= 400, 'travessia de caminho não passa');
});
