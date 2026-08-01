import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createSecureHttpFetcher } from './assets.js';
import { capturarRede } from './browser.js';
import { DEFAULT_LIMITS } from './config.js';
import { corridaComTimeout } from './telemetria.js';

/**
 * Testes do CONTROLE de rede sob orçamento (commit 2): timeout individual de
 * download, drenagem que não fica presa num corpo infinito (regra 18),
 * continuação dos demais quando um trava (regra 7). Sem navegador — a captura de
 * rede é dirigida por um `page` falso que emite respostas sob nosso controle.
 */

// biome-ignore lint/suspicious/noExplicitAny: fakes de Playwright, não tipados
type Any = any;

const contadorStub = () => {
  const n: Record<string, number> = {};
  return {
    inc: (k: string, q = 1): void => {
      n[k] = (n[k] ?? 0) + q;
    },
    n,
  };
};

/** Fecha um servidor forçando os sockets (keep-alive não segura o teardown). */
const fecharServidor = (s: Any): Promise<void> => {
  s.closeAllConnections?.();
  return new Promise<void>((r) => s.close(() => r()));
};

test('corridaComTimeout: resolve o valor a tempo', async () => {
  const r = await corridaComTimeout(Promise.resolve(7), 100);
  assert.equal(r, 7);
});

test('corridaComTimeout: devolve null e abandona quando estoura', async () => {
  const t0 = Date.now();
  const r = await corridaComTimeout(new Promise<number>(() => {}), 30); // nunca resolve
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 300, 'cortou perto do timeout');
});

test('corridaComTimeout: rejeição ANTES do timeout é propagada', async () => {
  await assert.rejects(() => corridaComTimeout(Promise.reject(new Error('x')), 100), /x/);
});

test('corridaComTimeout: rejeição TARDIA do abandonado não vira unhandled', async () => {
  // Rejeita depois do timeout — não deve derrubar o processo.
  const p = new Promise<number>((_, rej) => setTimeout(() => rej(new Error('tarde')), 40));
  const r = await corridaComTimeout(p, 10);
  assert.equal(r, null);
  await new Promise((res) => setTimeout(res, 60)); // deixa a rejeição tardia acontecer
});

test('fetcher seguro: download que NÃO responde é cortado pelo timeout individual', async () => {
  // Servidor que aceita a conexão e nunca responde.
  const servidor = createServer(() => {
    /* pendura de propósito */
  });
  await new Promise<void>((r) => servidor.listen(0, r));
  const porta = (servidor.address() as Any).port;
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  const cont = contadorStub();
  try {
    const fetcher = createSecureHttpFetcher(
      { ...DEFAULT_LIMITS, assetTimeoutMs: 120 },
      { contador: cont },
    );
    const t0 = Date.now();
    const r = await fetcher(`http://localhost:${porta}/travado.png`);
    assert.equal(r, null, 'download travado devolve null');
    // O que este teste prova é que o download NÃO FICA PRESO — o servidor
    // pendura para sempre, então sem o corte a espera seria infinita. A margem
    // é generosa de propósito: o limiar anterior era de 800ms sobre um timeout
    // de 120ms, e essa folga de 7x não sobrevive à suíte inteira rodando em
    // paralelo (medido: 1,4s a 2,0s no `pnpm test`, 157ms rodando sozinho).
    // Um teste que reprova por a máquina estar ocupada não mede o código, mede
    // a CPU — e ensina a ignorar o vermelho. 30x ainda separa "cortou" de
    // "ficou pendurado", que é a única distinção que importa aqui.
    assert.ok(Date.now() - t0 < 4_000, 'cortou pelo timeout, não ficou preso');
    assert.ok((cont.n.timeouts ?? 0) >= 1, 'contou timeout');
    assert.ok((cont.n.downloadsAbortados ?? 0) >= 1, 'contou download abortado');
  } finally {
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
    await fecharServidor(servidor);
  }
});

test('fetcher seguro: um travado NÃO bloqueia outro que responde (regra 7)', async () => {
  const travado = createServer(() => {});
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const rapido = createServer((_req: Any, res: Any) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((r) => travado.listen(0, r));
  await new Promise<void>((r) => rapido.listen(0, r));
  const pT = (travado.address() as Any).port;
  const pR = (rapido.address() as Any).port;
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  try {
    // O que importa aqui é o ISOLAMENTO: um download travado devolve null por
    // timeout e o outro devolve os bytes normalmente, sem um contaminar o outro.
    //
    // Havia também um teto de tempo de parede (900ms) dizendo provar
    // paralelismo. Não provava: com `Promise.all` e timeout de 150ms, a versão
    // em série levaria ~155ms e passaria igual. Só rendia falha intermitente
    // quando a máquina estava ocupada rodando o resto da suíte.
    //
    // O timeout subiu de 150ms para 1,5s pelo MESMO motivo, uma volta depois:
    // com a suíte cheia disputando a máquina, até um `localhost` passa de
    // 150ms, e aí o servidor RÁPIDO também estourava — o teste falhava dizendo
    // que o rápido não devolveu bytes, quando o que faltou foi CPU. O número
    // não é o que está sendo afirmado aqui; a separação entre os dois é.
    const fetcher = createSecureHttpFetcher({ ...DEFAULT_LIMITS, assetTimeoutMs: 1_500 });
    const [rT, rR] = await Promise.all([
      fetcher(`http://localhost:${pT}/a.png`),
      fetcher(`http://localhost:${pR}/b.png`),
    ]);
    assert.equal(rT, null, 'o travado devolve null');
    assert.ok(rR && rR.bytes.byteLength > 0, 'o rápido devolve os bytes');
  } finally {
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
    await fecharServidor(travado);
    await fecharServidor(rapido);
  }
});

// ── Captura de rede com corpo infinito (regra 18) ────────────────────────────

const respostaFake = (opts: {
  url: string;
  mime: string;
  tipo?: string;
  body: () => Promise<Uint8Array>;
}): Any => ({
  ok: () => true,
  status: () => 200,
  url: () => opts.url,
  headers: () => ({ 'content-type': opts.mime }),
  body: opts.body,
  request: () => ({ url: () => opts.url, resourceType: () => opts.tipo ?? 'image' }),
});

test('capturarRede: corpo que nunca termina NÃO prende a drenagem (regra 18)', async () => {
  let handler: (res: Any) => void = () => {};
  const page = {
    on: (_e: string, h: (res: Any) => void): void => {
      handler = h;
    },
  } as Any;
  const cont = contadorStub();
  const rede = capturarRede(page, { ...DEFAULT_LIMITS, drainBodyTimeoutMs: 40 }, cont);

  // Uma resposta com corpo infinito e uma normal.
  handler(
    respostaFake({
      url: 'http://cdn.x/infinito.png',
      mime: 'image/png',
      body: () => new Promise(() => {}),
    }),
  );
  handler(
    respostaFake({
      url: 'http://cdn.x/ok.png',
      mime: 'image/png',
      body: async () => Uint8Array.from([1, 2, 3]),
    }),
  );

  const t0 = Date.now();
  await rede.aguardar(300);
  assert.ok(Date.now() - t0 < 600, 'a drenagem não ficou presa no corpo infinito');
  assert.equal(rede.mapa.has('http://cdn.x/ok.png'), true, 'a resposta normal foi capturada');
  assert.equal(rede.mapa.has('http://cdn.x/infinito.png'), false, 'a infinita foi abandonada');
  assert.ok((cont.n.timeouts ?? 0) >= 1, 'contou o timeout do corpo infinito');
  assert.ok((cont.n.downloadsOk ?? 0) >= 1, 'contou o download que deu certo');
});

test('capturarRede: aguardar tem timeout PRÓPRIO mesmo sem corpo resolver', async () => {
  let handler: (res: Any) => void = () => {};
  const page = {
    on: (_e: string, h: (res: Any) => void): void => {
      handler = h;
    },
  } as Any;
  const rede = capturarRede(
    page,
    { ...DEFAULT_LIMITS, drainBodyTimeoutMs: 100_000 },
    contadorStub(),
  );
  handler(
    respostaFake({
      url: 'http://cdn.x/lento.png',
      mime: 'image/png',
      body: () => new Promise(() => {}),
    }),
  );
  const t0 = Date.now();
  await rede.aguardar(50); // timeout da drenagem menor que o do corpo
  assert.ok(Date.now() - t0 < 400, 'aguardar respeitou o próprio timeout');
});
