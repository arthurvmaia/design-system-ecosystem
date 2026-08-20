import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * "Upload vence geração" só vale se o upload EXISTIR.
 *
 * O contrato garante que um pedido de origem `upload` traz um caminho — não que
 * aquele caminho aponte para alguma coisa. A tela guardava só `file.name`, então
 * o pedido nascia citando um arquivo que não existia em lugar nenhum, e isso só
 * apareceria na hora de produzir, depois de a pessoa ter confirmado o gasto.
 */

const PEDIDO_COM_UPLOAD = {
  marca: 'Padaria do Bairro',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'upload', caminhoDoUpload: 'pao.png', descricaoParaGerar: null },
  texto: { semTexto: true, headline: null, cta: null },
  variacoes: 2,
  tetoDeCreditos: 225,
} as const;

const montar = async (t: { after: (fn: () => void) => void }) => {
  const root = join(tmpdir(), `ds-upl-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.ORBIS_SENHA_ACAO = 'acao';

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
    process.env.ORBIS_SENHA_ACAO = undefined;
  });
  ensureDataTree();

  const app = new Hono().route('/api/criativos', criativosRoute);

  const subir = async (
    chave: string,
    nome: string,
    conteudo: string,
    papel?: 'imagem' | 'logotipo',
  ) => {
    const fd = new FormData();
    fd.append('file', new Blob([conteudo], { type: 'image/png' }), nome);
    const q = papel === undefined ? '' : `?papel=${papel}`;
    return await app.request(`http://x/api/criativos/rascunhos/${chave}/arquivo${q}`, {
      method: 'POST',
      body: fd,
    });
  };

  const enviar = async (chave: string, pedido: unknown) =>
    await app.request('http://x/api/criativos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orbis-acao': 'acao' },
      body: JSON.stringify({ chaveDeEnvio: chave, pedido }),
    });

  return { shared, subir, enviar, root };
};

test('PROVA: pedido de upload SEM arquivo enviado nao entra', async (t) => {
  const { enviar } = await montar(t);
  const r = await enviar('sem-arquivo', PEDIDO_COM_UPLOAD);
  assert.equal(r.status, 400, 'citar um arquivo que nao existe nao pode virar job pago');
  const corpo = (await r.json()) as { error: string };
  assert.equal(corpo.error, 'upload_ausente');
});

test('o arquivo enviado vira o caminho do pedido, dentro da pasta do job', async (t) => {
  const { shared, subir, enviar } = await montar(t);

  const up = await subir('com-arquivo', 'pão da casa.png', 'bytes-de-mentira');
  assert.equal(up.status, 201);
  const { caminho } = (await up.json()) as { caminho: string };
  assert.ok(!caminho.includes(' '), 'o nome vai sanitizado para o disco');

  const r = await enviar('com-arquivo', PEDIDO_COM_UPLOAD);
  assert.equal(r.status, 202);
  const { job } = (await r.json()) as { job: { id: string } };

  // O caminho gravado é relativo à pasta do job, como o contrato pede.
  const retrato = JSON.parse(readFileSync(shared.criativoPedidoPath(job.id), 'utf8')) as {
    imagem: { caminhoDoUpload: string };
  };
  assert.equal(retrato.imagem.caminhoDoUpload, `upload/${caminho}`);

  // E o arquivo está LÁ, não só citado.
  const alvo = join(shared.criativoUploadDir(job.id), caminho);
  assert.ok(existsSync(alvo), 'o arquivo do cliente mudou de casa junto com o pedido');
  assert.equal(readFileSync(alvo, 'utf8'), 'bytes-de-mentira');
});

test('o rascunho e esvaziado depois de o pedido entrar', async (t) => {
  const { shared, subir, enviar } = await montar(t);
  await subir('limpa', 'foto.png', 'x');
  const r = await enviar('limpa', PEDIDO_COM_UPLOAD);
  assert.equal(r.status, 202);
  assert.equal(
    existsSync(shared.criativoRascunhoDir('rasc_naoimporta')) ||
      readdirSync(shared.criativosRascunhosDir()).length,
    0,
    'arquivo duplicado em dois lugares vira duvida sobre qual e o bom',
  );
});

test('reenviar TROCA o arquivo do rascunho, em vez de acumular', async (t) => {
  const { shared, subir, enviar } = await montar(t);
  await subir('troca', 'primeira.png', 'primeira');
  const segunda = await subir('troca', 'segunda.png', 'segunda');
  const { caminho } = (await segunda.json()) as { caminho: string };

  const r = await enviar('troca', PEDIDO_COM_UPLOAD);
  const { job } = (await r.json()) as { job: { id: string } };
  const dentro = readdirSync(shared.criativoUploadDir(job.id));
  assert.equal(dentro.length, 1, 'um envio, um arquivo');
  assert.equal(dentro[0], caminho);
  assert.equal(readFileSync(join(shared.criativoUploadDir(job.id), caminho), 'utf8'), 'segunda');
});

test('sem arquivo no corpo, a rota de upload recusa', async (t) => {
  const { subir } = await montar(t);
  const fd = new FormData();
  fd.append('nada', 'aqui');
  const { criativosRoute } = await import('./criativos.js');
  const { Hono } = await import('hono');
  const app = new Hono().route('/api/criativos', criativosRoute);
  const r = await app.request('http://x/api/criativos/rascunhos/k/arquivo', {
    method: 'POST',
    body: fd,
  });
  assert.equal(r.status, 400);
  void subir;
});

test('o upload NAO passa pela credencial de acao: ele ainda nao gasta nada', async (t) => {
  // Quem cobra a credencial é o pedido, que é o que enfileira. Pedi-la antes
  // faria a pessoa assinar duas vezes o mesmo gasto.
  const { subir } = await montar(t);
  const r = await subir('sem-senha', 'foto.png', 'x');
  assert.equal(r.status, 201);
});

/**
 * O LOGOTIPO percorre o mesmo caminho do arquivo da peça, e por isso ele tem os
 * mesmos modos de falhar. Dois deles custam material: um logotipo prometido que
 * nunca chegou entrega uma peça sem a marca, e dois arquivos de mesmo nome na
 * mesma pasta fazem um apagar o outro.
 */

const PEDIDO_COM_LOGOTIPO = {
  marca: 'Sorriso Vivo',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', descricaoParaGerar: 'consultório com luz da manhã' },
  texto: { headline: 'Seu sorriso merece atenção' },
  tetoDeCreditos: 225,
  corPrincipal: '#0a0a12',
  direcao: { logotipo: 'a-tela-so-marca-que-tem', coresDeApoio: ['#D0B178'] },
} as const;

test('PROVA: pedido que DECLARA logotipo sem o arquivo nao entra', async (t) => {
  // Seguir calado entregaria uma peça sem a marca que o pedido prometeu, e o
  // contrário do que se pediu não pode passar por omissão.
  const { enviar } = await montar(t);
  const r = await enviar('logo-sem-arquivo', PEDIDO_COM_LOGOTIPO);
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as { error: string }).error, 'logotipo_ausente');
});

test('o logotipo vira caminho relativo a pasta do job, como o contrato pede', async (t) => {
  const { shared, subir, enviar } = await montar(t);
  const up = await subir('logo-ok', 'marca.png', 'pixels-da-logo', 'logotipo');
  assert.equal(up.status, 201);
  const { caminho, papel } = (await up.json()) as { caminho: string; papel: string };
  assert.equal(papel, 'logotipo');

  const r = await enviar('logo-ok', PEDIDO_COM_LOGOTIPO);
  assert.equal(r.status, 202);
  const { job } = (await r.json()) as { job: { id: string } };

  const retrato = JSON.parse(readFileSync(shared.criativoPedidoPath(job.id), 'utf8')) as {
    direcao: { logotipo: string; coresDeApoio: string[] };
  };
  assert.equal(retrato.direcao.logotipo, `upload/${caminho}`);
  assert.deepEqual(retrato.direcao.coresDeApoio, ['#D0B178'], 'a paleta viaja junto');
  assert.ok(existsSync(join(shared.criativoUploadDir(job.id), caminho)));
});

test('PROVA: a imagem e o logotipo tem GAVETAS separadas, um nao apaga o outro', async (t) => {
  // Com um slot só, mandar a foto derrubaria a logo e o pedido nasceria
  // prometendo uma marca que não está lá.
  const { shared, subir, enviar } = await montar(t);
  const foto = (await (await subir('duas-gavetas', 'foto.png', 'a-foto', 'imagem')).json()) as {
    caminho: string;
  };
  const logo = (await (await subir('duas-gavetas', 'marca.png', 'a-logo', 'logotipo')).json()) as {
    caminho: string;
  };

  const r = await enviar('duas-gavetas', {
    ...PEDIDO_COM_LOGOTIPO,
    imagem: { origem: 'upload', caminhoDoUpload: foto.caminho },
  });
  assert.equal(r.status, 202);
  const { job } = (await r.json()) as { job: { id: string } };
  const dir = shared.criativoUploadDir(job.id);
  assert.equal(readFileSync(join(dir, foto.caminho), 'utf8'), 'a-foto');
  assert.equal(readFileSync(join(dir, logo.caminho), 'utf8'), 'a-logo');
});

test('PROVA: os dois campos do pedido nunca apontam para o MESMO arquivo', async (t) => {
  // `nomeSeguro` prefixa o instante, então a colisão é rara — não impossível:
  // dois envios no mesmo milissegundo com o mesmo nome original dariam o mesmo
  // arquivo, um sobrescreveria o outro e um dos dois campos ficaria mentindo.
  const { shared, subir, enviar } = await montar(t);
  await subir('mesmo-nome', 'logo.png', 'a-foto-do-produto', 'imagem');
  const logo = (await (
    await subir('mesmo-nome', 'logo.png', 'a-logo-da-marca', 'logotipo')
  ).json()) as { caminho: string };

  const r = await enviar('mesmo-nome', {
    ...PEDIDO_COM_LOGOTIPO,
    imagem: { origem: 'upload', caminhoDoUpload: 'qualquer-coisa.png' },
  });
  assert.equal(r.status, 202);
  const { job } = (await r.json()) as { job: { id: string } };
  const retrato = JSON.parse(readFileSync(shared.criativoPedidoPath(job.id), 'utf8')) as {
    imagem: { caminhoDoUpload: string };
    direcao: { logotipo: string };
  };
  assert.notEqual(
    retrato.imagem.caminhoDoUpload,
    retrato.direcao.logotipo,
    'dois campos apontando para o mesmo arquivo é um dos dois perdido',
  );
  const dir = shared.criativoUploadDir(job.id);
  assert.equal(readdirSync(dir).length, 2, 'os dois arquivos sobrevivem');
  assert.equal(readFileSync(join(dir, logo.caminho), 'utf8'), 'a-logo-da-marca');
});

test('papel desconhecido recusa, em vez de guardar num lugar que ninguem le', async (t) => {
  const { subir } = await montar(t);
  const r = await subir('papel-torto', 'x.png', 'x', 'assinatura' as 'imagem');
  assert.equal(r.status, 400);
  assert.equal(((await r.json()) as { error: string }).error, 'papel_desconhecido');
});
