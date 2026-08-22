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

  // A contenção agora é `dentroDaRaiz`, e não `startsWith` de texto. O caso que
  // a conta antiga deixava passar é o IRMÃO com prefixo comum: com a pasta em
  // `job_ab`, um caminho que resolvesse para `job_abc/` era aprovado porque as
  // duas strings começam igual.
  const irmao = await chamar(
    `/api/criativos/${job.id}/arquivo?caminho=${encodeURIComponent(`../${job.id}c/segredo.png`)}`,
  );
  assert.ok(irmao.status >= 400, 'irmao com prefixo comum nao passa');

  // A allow-list de extensão confia no NOME do arquivo. Sem `nosniff`, o
  // navegador pode reclassificar o conteúdo e executar o que declaramos imagem.
  assert.equal(boa.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(boa.headers.get('Content-Security-Policy'), null, 'imagem continua servida inline');
});

/**
 * A peça não pode sumir da tela porque a fila foi esvaziada.
 *
 * A fila é caixa de entrada, não arquivo: o `fila:limpar` a zera. Enquanto a
 * listagem saía só de lá, cada faxina levava junto a peça PAGA — os arquivos
 * ficavam em `criativos/<job_id>/` e ninguém mais os alcançava pela interface.
 */
test('peca sem registro na fila continua aparecendo, vinda do disco', async (t) => {
  const root = join(tmpdir(), `ds-cri-orfa-${randomUUID().slice(0, 8)}`);
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

  // Nada é enfileirado: este job é exatamente o que a faxina deixou para trás.
  const orfa = shared.criativosDir('job_orfa1');
  mkdirSync(orfa, { recursive: true });
  writeFileSync(join(orfa, 'v1.png'), 'png-de-mentira');
  writeFileSync(
    shared.criativoPedidoPath('job_orfa1'),
    JSON.stringify({
      marca: 'Padaria do Bairro',
      tipo: 'imagem',
      formato: 'feed-1x1',
      imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'pão na cesta' },
      texto: { semTexto: true, headline: null, cta: null },
      variacoes: 1,
      tetoDeCreditos: 90,
      autorizacoesDeClaim: {},
    }),
  );
  writeFileSync(
    join(orfa, 'resultado.json'),
    JSON.stringify({
      variacoes: [{ caminho: 'v1.png', estado: 'aprovada', motivo: null }],
      custoGasto: 75,
    }),
  );

  // Uma pasta sem resultado: não há o que mostrar, e não houve perda.
  mkdirSync(shared.criativosDir('job_vazia1'), { recursive: true });

  const app = new Hono().route('/api/criativos', criativosRoute);
  const lista = (await (await app.request('http://x/api/criativos')).json()) as {
    items: {
      id: string;
      label: string;
      aprovadas: number;
      custoGasto: number | null;
      pedido: { marca: string };
    }[];
  };

  const achada = lista.items.find((i) => i.id === 'job_orfa1');
  assert.ok(achada !== undefined, 'a peca paga continua na lista mesmo sem registro na fila');
  assert.equal(achada.pedido.marca, 'Padaria do Bairro', 'o retrato do pedido sobreviveu');
  assert.equal(achada.custoGasto, 75, 'o gasto continua auditavel');
  assert.equal(achada.aprovadas, 1);
  assert.match(achada.label, /recuperado do disco/, 'a tela diz de onde isso veio');

  assert.equal(
    lista.items.find((i) => i.id === 'job_vazia1'),
    undefined,
    'pasta sem resultado nao vira item fantasma',
  );

  // E o download continua funcionando para ela.
  const arquivo = await app.request('http://x/api/criativos/job_orfa1/arquivo?caminho=v1.png');
  assert.equal(arquivo.status, 200);
});

/**
 * `.svg` e `.pdf` estão na lista de tipos servidos e são os dois que EXECUTAM
 * quando o navegador abre a URL direto. Como imagem eles são inertes, então a
 * prévia continua funcionando — o que se tira é a capacidade de rodar script no
 * contexto do aplicativo.
 */
test('svg aprovado abre em sandbox, e continua sendo servido', async (t) => {
  const root = join(tmpdir(), `ds-cri-svg-${randomUUID().slice(0, 8)}`);
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
  const job = shared.enqueueJob('criativo', 'Criativo: símbolo', {
    marca: 'Marca',
    tipo: 'imagem',
    formato: 'feed-1x1',
    imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'símbolo' },
    texto: { semTexto: true, headline: null, cta: null },
    variacoes: 1,
    tetoDeCreditos: 80,
    autorizacoesDeClaim: {},
  });

  const pasta = shared.criativosDir(job.id);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'simbolo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(
    join(pasta, 'resultado.json'),
    JSON.stringify({
      variacoes: [{ caminho: 'simbolo.svg', estado: 'aprovada', motivo: null }],
      custoGasto: 75,
    }),
  );

  const app = new Hono().route('/api/criativos', criativosRoute);
  const r = await app.request(`http://x/api/criativos/${job.id}/arquivo?caminho=simbolo.svg`);
  assert.equal(r.status, 200, 'o svg aprovado continua baixando');
  assert.equal(r.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(r.headers.get('Content-Security-Policy'), 'sandbox');
});
