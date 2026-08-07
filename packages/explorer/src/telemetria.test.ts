import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LIMITS } from './config.js';
import { Telemetria, resolveOrcamento, sinalComTimeout, urlParaLog } from './telemetria.js';

/** Relógio controlável para as partes puras (sem timer real). */
const relogio = (inicial = 0) => {
  let t = inicial;
  return {
    now: () => t,
    avancar: (ms: number): void => {
      t += ms;
    },
  };
};

test('restanteTotal e tetoFase clampam ao total (regra 13)', () => {
  const c = relogio(1000);
  const tel = new Telemetria({ total: 10_000, fases: { a: 3000 } }, c.now);
  assert.equal(tel.restanteTotal(), 10_000);
  c.avancar(4000); // 4s decorridos
  assert.equal(tel.restanteTotal(), 6000);
  assert.equal(tel.tetoFase('a'), 3000, 'min(3000, 6000)');
  assert.equal(tel.tetoFase('b'), 6000, 'sem teto de fase → total, clampado ao restante');
  c.avancar(4000); // 8s decorridos, 2s restam
  assert.equal(tel.tetoFase('a'), 2000, 'teto da fase clampado ao que resta do total');
});

test('deveIniciar barra fase cara perto do fim (regra 14)', () => {
  const c = relogio(0);
  const tel = new Telemetria({ total: 5000, fases: {} }, c.now);
  c.avancar(4000); // 1s restante
  assert.equal(tel.deveIniciar(3000), false, 'não inicia fase que precisa de 3s');
  assert.equal(tel.deveIniciar(500), true, 'inicia o que cabe');
});

test('contadores e registrar alimentam o relatório', () => {
  const c = relogio(0);
  const tel = new Telemetria({ total: 5000, fases: {} }, c.now);
  tel.inc('requests', 3);
  tel.inc('downloadsOk');
  tel.registrar('segmentar', 480);
  c.avancar(1200);
  const r = tel.relatorio();
  assert.equal(r.contadores.requests, 3);
  assert.equal(r.contadores.downloadsOk, 1);
  assert.equal(r.contadores.timeouts, undefined, 'contador zero não polui o relatório');
  assert.equal(r.fases.find((f) => f.nome === 'segmentar')?.ms, 480);
  assert.equal(r.totalMs, 1200);
  assert.equal(r.parcial, false);
});

test('marcarParcial: a primeira interrupção define fase e motivo', () => {
  const tel = new Telemetria({ total: 5000, fases: {} });
  tel.marcarParcial('assets-rede', 'timeout');
  tel.marcarParcial('validar', 'outro'); // não sobrescreve
  const r = tel.relatorio();
  assert.equal(r.parcial, true);
  assert.equal(r.faseInterrompida, 'assets-rede');
  assert.equal(r.motivo, 'timeout');
});

test('perdoarCorte: desfaz o parcial da fase perdoada e só dela', () => {
  const tel = new Telemetria({ total: 5000, fases: {} });
  tel.marcarParcial('v2-percurso', 'orçamento da fase esgotado');
  assert.equal(tel.perdoarCorte('v2-compilar'), false, 'outra fase não perdoa este corte');
  assert.equal(tel.parcial, true);
  assert.equal(tel.perdoarCorte('v2-percurso'), true);
  assert.equal(tel.parcial, false);
  assert.equal(tel.relatorio().faseInterrompida, undefined);
});

test('perdoarCorte: sem corte não perdoa nada; corte posterior volta a marcar', () => {
  const tel = new Telemetria({ total: 5000, fases: {} });
  assert.equal(tel.perdoarCorte('v2-percurso'), false);
  tel.marcarParcial('v2-percurso', 'orçamento');
  tel.perdoarCorte('v2-percurso');
  tel.marcarParcial('v2-compilar', 'orçamento');
  assert.equal(tel.parcial, true, 'o perdão não imuniza cortes futuros');
  assert.equal(tel.faseCortada, 'v2-compilar');
});

test('fase que termina normalmente devolve valor e não é parcial', async () => {
  const tel = new Telemetria({ total: 5000, fases: { a: 1000 } });
  const r = await tel.fase('a', async () => 42);
  assert.equal(r.valor, 42);
  assert.equal(r.abortada, false);
  assert.equal(tel.parcial, false);
  assert.ok(tel.relatorio().fases.some((f) => f.nome === 'a' && !f.abortada));
});

test('fase que NUNCA resolve é cortada pelo teto → parcial (prova o controle)', async () => {
  const tel = new Telemetria({ total: 5000, fases: { presa: 30 } });
  const t0 = Date.now();
  const r = await tel.fase('presa', () => new Promise<never>(() => {})); // nunca resolve
  assert.equal(r.abortada, true);
  assert.equal(r.valor, undefined);
  assert.ok(Date.now() - t0 < 500, 'cortou perto do teto, não ficou preso');
  assert.equal(tel.parcial, true);
  assert.equal(tel.relatorio().faseInterrompida, 'presa');
});

test('fase: o fn cooperativo recebe o abort do orçamento', async () => {
  const tel = new Telemetria({ total: 5000, fases: { a: 25 } });
  let abortou = false;
  await tel.fase(
    'a',
    (signal) =>
      new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          abortou = true;
          resolve();
        });
      }),
  );
  assert.equal(abortou, true, 'o sinal da fase abortou e o fn observou');
  assert.equal(tel.parcial, true);
});

test('fase propaga ERRO real do fn (não engole como parcial)', async () => {
  const tel = new Telemetria({ total: 5000, fases: { a: 1000 } });
  await assert.rejects(
    () =>
      tel.fase('a', async () => {
        throw new Error('boom');
      }),
    /boom/,
  );
  assert.equal(tel.parcial, false, 'erro de verdade não marca parcial');
});

test('orçamento total esgotado → teto 0 → aborta na hora', async () => {
  const tel = new Telemetria({ total: 0, fases: {} });
  const r = await tel.fase('a', () => new Promise<never>(() => {}));
  assert.equal(r.abortada, true);
});

test('resolveOrcamento avisa quando a soma das fases fura o total (regra 13)', () => {
  const { avisos } = resolveOrcamento({ ...DEFAULT_LIMITS, orcamentoTotalMs: 1000 });
  assert.ok(avisos.length > 0, 'soma > total deve avisar, não silenciar');
});

test('resolveOrcamento sem aviso quando o total é folgado', () => {
  const { avisos } = resolveOrcamento({ ...DEFAULT_LIMITS, orcamentoTotalMs: 10_000_000 });
  assert.equal(avisos.length, 0);
});

test('sinalComTimeout dispara no timeout próprio', async () => {
  const { signal, limpar } = sinalComTimeout(undefined, 20);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(signal.aborted, true);
  limpar();
});

test('sinalComTimeout herda o abort da base (corte por fase)', () => {
  const base = new AbortController();
  const { signal, limpar } = sinalComTimeout(base.signal, 10_000);
  assert.equal(signal.aborted, false);
  base.abort(new Error('fase'));
  assert.equal(signal.aborted, true);
  limpar();
});

test('urlParaLog remove query e credenciais (regra 16)', () => {
  assert.equal(
    urlParaLog('https://user:pass@cdn.x.com/a/b.png?token=segredo'),
    'https://cdn.x.com/a/b.png',
  );
  assert.equal(urlParaLog('não-é-url'), '[url inválida]');
});

test('o orçamento total AMPLIA para o site grande, e nunca encolhe', () => {
  // O total era constante e 43 das 58 capturas do acervo saíam PARCIAIS. Um
  // número fixo não serve a sites que variam 100× em nós e 17× em altura.
  let agora = 0;
  const t = new Telemetria({ total: 180_000, fases: {} }, () => agora);

  assert.equal(t.restanteTotal(), 180_000);
  assert.ok(t.ampliarTotal(540_000, 'site 3× o típico'), 'ampliou');
  assert.equal(t.restanteTotal(), 540_000, 'o que resta acompanha');

  // Encolher é recusado: o objetivo é não estourar, e reduzir no meio do
  // caminho abortaria fase que já tinha sido autorizada a rodar.
  assert.equal(t.ampliarTotal(120_000, 'menor'), false, 'não encolhe');
  assert.equal(t.restanteTotal(), 540_000);

  // E fica registrado: ampliação silenciosa vira mistério na telemetria.
  assert.deepEqual(
    t.ampliacoesDoTotal().map((a) => a.para),
    [540_000],
  );

  agora = 100_000;
  assert.equal(t.restanteTotal(), 440_000, 'o decorrido desconta do total novo');
});
