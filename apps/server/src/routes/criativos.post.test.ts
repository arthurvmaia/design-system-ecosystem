import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A ponte que faltava, e as travas que ela precisa ter para não custar dinheiro
 * duas vezes.
 *
 * As duas telas de pedido terminavam num aviso escrito: "não enfileirei nada".
 * Ligar o botão sem idempotência trocaria um defeito honesto por um caro —
 * clicar duas vezes abriria dois jobs, e cada job gasta crédito de verdade.
 */

const PEDIDO = {
  marca: 'Café da Estação',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', caminhoDoUpload: null, descricaoParaGerar: 'xícara na mesa' },
  texto: { semTexto: true, headline: null, cta: null },
  variacoes: 2,
  tetoDeCreditos: 225,
  estimativa: 150,
} as const;

const montar = async (t: { after: (fn: () => void) => void }) => {
  const root = join(tmpdir(), `ds-post-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.ORBIS_SENHA_ACAO = 'a-credencial-da-acao';

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
  const enviar = async (corpo: unknown, senha: string | null = 'a-credencial-da-acao') =>
    await app.request('http://x/api/criativos', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(senha === null ? {} : { 'x-orbis-acao': senha }),
      },
      body: JSON.stringify(corpo),
    });
  const subir = async (chave: string, nome: string, conteudo: string) => {
    const fd = new FormData();
    fd.append('file', new Blob([conteudo], { type: 'image/png' }), nome);
    return await app.request(`http://x/api/criativos/rascunhos/${chave}/arquivo`, {
      method: 'POST',
      body: fd,
    });
  };

  return { shared, app, enviar, subir };
};

test('sem a credencial da acao, o pedido nao entra: 428', async (t) => {
  const { enviar } = await montar(t);
  const r = await enviar({ chaveDeEnvio: 'k1', pedido: PEDIDO }, null);
  assert.equal(r.status, 428, 'a sessao e legitima; falta confirmar ESTE gasto');
});

test('credencial errada tambem nao entra', async (t) => {
  const { enviar } = await montar(t);
  const r = await enviar({ chaveDeEnvio: 'k1', pedido: PEDIDO }, 'chute');
  assert.equal(r.status, 428);
});

test('PROVA: duas tentativas da MESMA chave devolvem o MESMO job', async (t) => {
  const { enviar } = await montar(t);

  const primeira = await enviar({ chaveDeEnvio: 'clique-unico', pedido: PEDIDO });
  assert.equal(primeira.status, 202, 'o primeiro cria');
  const a = (await primeira.json()) as { job: { id: string }; repetido: boolean };
  assert.equal(a.repetido, false);

  const segunda = await enviar({ chaveDeEnvio: 'clique-unico', pedido: PEDIDO });
  assert.equal(segunda.status, 200, 'o segundo NAO cria');
  const b = (await segunda.json()) as { job: { id: string }; repetido: boolean };
  assert.equal(b.job.id, a.job.id, 'duplo clique nao pode virar dois jobs pagos');
  assert.equal(b.repetido, true);
});

test('mesma chave com pedido DIFERENTE e conflito, nao substituicao', async (t) => {
  const { enviar } = await montar(t);
  await enviar({ chaveDeEnvio: 'k', pedido: PEDIDO });
  const r = await enviar({ chaveDeEnvio: 'k', pedido: { ...PEDIDO, variacoes: 8 } });
  assert.equal(r.status, 409, 'sobrescrever seria trocar o pedido de alguem em silencio');
});

/**
 * A comparação tem de enxergar o ANINHADO.
 *
 * A primeira versão comparava com `JSON.stringify(a, Object.keys(a).sort())`,
 * achando que o segundo argumento ordenava chaves. Ele é uma lista de chaves
 * PERMITIDAS, aplicada recursivamente: como a lista só tinha o topo, `imagem`,
 * `texto` e `autorizacoesDeClaim` viravam `{}`.
 *
 * O teste acima passava por construção — ele varia `variacoes`, que é do topo,
 * o único lugar que a função enxergava.
 */
test('PROVA: pedido que difere so na HEADLINE e conflito, nao repetido', async (t) => {
  const { enviar } = await montar(t);
  await enviar({
    chaveDeEnvio: 'k',
    pedido: { ...PEDIDO, texto: { semTexto: false, headline: 'Aberto às sete', cta: null } },
  });
  const r = await enviar({
    chaveDeEnvio: 'k',
    pedido: { ...PEDIDO, texto: { semTexto: false, headline: 'METADE DO PREÇO', cta: 'Corra' } },
  });
  assert.equal(r.status, 409, 'produzir o texto velho seria cobrar por uma peça que ninguém pediu');
});

test('PROVA: trocar gerar por upload e conflito — "upload vence geracao" depende disso', async (t) => {
  const { subir, enviar } = await montar(t);
  await enviar({ chaveDeEnvio: 'k', pedido: PEDIDO });
  await subir('k', 'produto.png', 'bytes');
  const r = await enviar({
    chaveDeEnvio: 'k',
    pedido: {
      ...PEDIDO,
      imagem: { origem: 'upload', caminhoDoUpload: 'produto.png', descricaoParaGerar: null },
    },
  });
  assert.equal(
    r.status,
    409,
    'aceitar como repetido faria o motor GERAR com o arquivo do cliente parado no rascunho',
  );
});

test('a mesma forma com as chaves em outra ordem continua sendo repetido', async (t) => {
  const { enviar } = await montar(t);
  await enviar({ chaveDeEnvio: 'k', pedido: PEDIDO });
  const invertido = {
    imagem: { descricaoParaGerar: 'xícara na mesa', caminhoDoUpload: null, origem: 'gerar' },
    texto: { cta: null, headline: null, semTexto: true },
    estimativa: 150,
    tetoDeCreditos: 225,
    variacoes: 2,
    formato: 'feed-1x1',
    tipo: 'imagem',
    marca: 'Café da Estação',
  };
  const r = await enviar({ chaveDeEnvio: 'k', pedido: invertido });
  assert.equal(r.status, 200, 'ordem de chave nao muda o pedido');
});

test('o retrato do pedido nasce em disco junto com o job', async (t) => {
  const { shared, enviar } = await montar(t);
  const r = await enviar({ chaveDeEnvio: 'com-retrato', pedido: PEDIDO });
  const { job } = (await r.json()) as { job: { id: string } };

  const retrato = shared.criativoPedidoPath(job.id);
  assert.ok(existsSync(retrato), 'sem o retrato, uma faxina da fila apaga o teto e os claims');
  const lido = JSON.parse(readFileSync(retrato, 'utf8')) as {
    marca: string;
    tetoDeCreditos: number;
  };
  assert.equal(lido.marca, 'Café da Estação');
  assert.equal(lido.tetoDeCreditos, 225);
});

test('o contrato continua decidindo: pedido sem teto nao entra', async (t) => {
  const { enviar } = await montar(t);
  const semTeto = { ...PEDIDO } as Record<string, unknown>;
  semTeto.tetoDeCreditos = undefined;
  const r = await enviar({ chaveDeEnvio: 'k', pedido: semTeto });
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { problemas: { campo: string }[] };
  assert.ok(
    corpo.problemas.some((p) => p.campo === 'tetoDeCreditos'),
    'a recusa diz QUAL campo, para a tela levar a pessoa ate ele',
  );
});

test('upload que tambem manda gerar continua reprovando na porta', async (t) => {
  const { enviar } = await montar(t);
  const ambiguo = {
    ...PEDIDO,
    imagem: {
      origem: 'upload',
      caminhoDoUpload: 'produto.png',
      descricaoParaGerar: 'um produto bonito',
    },
  };
  const r = await enviar({ chaveDeEnvio: 'k', pedido: ambiguo });
  assert.equal(r.status, 400, 'o upload vence a geracao, e o pedido ambiguo nao entra');
});

test('PROVA: video nao e vendido enquanto nao houver como produzir e conferir', async (t) => {
  // A tela mostra 520 créditos por peça de vídeo. Não há rota que produza
  // `.mp4`, e o portão não sabe medir duração nem dimensão de vídeo: aceitar
  // seria cobrar por uma peça que sairia como imagem parada.
  const { enviar } = await montar(t);
  const r = await enviar({
    chaveDeEnvio: 'v',
    pedido: { ...PEDIDO, tipo: 'video', formato: 'reels-9x16' },
  });
  assert.equal(r.status, 400);
  const corpo = (await r.json()) as { error: string; message: string };
  assert.equal(corpo.error, 'video_ainda_nao');
  assert.match(corpo.message, /não sei entregar/);
});

test('sem chave de envio nao entra: e ela que impede o clique duplo', async (t) => {
  const { enviar } = await montar(t);
  const r = await enviar({ pedido: PEDIDO });
  assert.equal(r.status, 400);
});

test('o job criado aparece na listagem, com o pedido lido', async (t) => {
  const { app, enviar } = await montar(t);
  await enviar({ chaveDeEnvio: 'aparece', pedido: PEDIDO });

  const lista = (await (await app.request('http://x/api/criativos')).json()) as {
    items: { status: string; pedido: { marca: string } }[];
  };
  assert.equal(lista.items.length, 1);
  assert.equal(lista.items[0]?.status, 'pendente', 'nasce esperando o estudio, nao "pronto"');
  assert.equal(lista.items[0]?.pedido.marca, 'Café da Estação');
});
