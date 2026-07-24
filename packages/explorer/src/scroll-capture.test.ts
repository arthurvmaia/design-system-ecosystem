import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LIMITS } from './config.js';
import { type PaginaAmostravel, amostrarScroll } from './scroll-capture.js';

/**
 * Testa a orquestração da amostragem SEM navegador: um `page` falso responde às
 * expressões (marcar / altura / rolar / amostrar) modelando o efeito. Prova o
 * pipeline amostra → classificação e o respeito ao AbortSignal da fase.
 */

// biome-ignore lint/suspicious/noExplicitAny: quadro cru, como vem do in-page
type Any = any;

const quadro = (p: number, over: Record<string, Any>): Any => ({
  ref: '0',
  progress: p,
  scrollY: Math.round(p * 2000),
  id: 'hero',
  classes: ['reveal'],
  box: { x: 0, y: 100, w: 300, h: 200 },
  opacity: '1',
  transform: 'none',
  filter: 'none',
  position: 'static',
  top: 'auto',
  zIndex: 'auto',
  visible: true,
  ...over,
});

/** `page` falso: interpreta a expressão pelo trecho distintivo da função. */
const fakePage = (frames: (p: number) => Any[]): PaginaAmostravel => ({
  evaluate: async (expr: string): Promise<Any> => {
    if (expr.includes('window.scrollTo')) {
      return Number(expr.match(/\)\((\d+)\)$/)?.[1] ?? 0); // SCROLL_TO → devolve y
    }
    if (expr.includes('setAttribute')) return 1; // MARK → 1 candidato
    if (expr.includes('scrollHeight')) return 2000; // HEIGHT
    const p = Number(expr.match(/"progress":([0-9.]+)/)?.[1] ?? 0);
    return frames(p); // SAMPLE
  },
  waitForTimeout: async (): Promise<void> => {},
});

test('amostrarScroll: fade in → viewport-reveal (pipeline completo sem navegador)', async () => {
  // opacity = min(1, p*2): 0→0, 0.5→1, e fica. Reveal clássico.
  const page = fakePage((p) => [quadro(p, { opacity: String(Math.min(1, p * 2)) })]);
  const bs = await amostrarScroll(page, DEFAULT_LIMITS, new AbortController().signal);
  assert.ok(
    bs.some((b) => b.kind === 'viewport-reveal'),
    'classificou reveal a partir das amostras',
  );
  const rev = bs.find((b) => b.kind === 'viewport-reveal');
  assert.equal(rev?.target.id, 'hero', 'religação ao alvo pelo id');
});

test('amostrarScroll: parallax por translateY vinculado ao progresso', async () => {
  const page = fakePage((p) => [
    quadro(p, { transform: `matrix(1, 0, 0, 1, 0, ${(-60 * p).toFixed(1)})` }),
  ]);
  const bs = await amostrarScroll(page, DEFAULT_LIMITS, new AbortController().signal);
  assert.ok(bs.some((b) => b.kind === 'parallax'));
});

test('amostrarScroll: página que não rola → nada', async () => {
  const page: PaginaAmostravel = {
    evaluate: async (expr: string): Promise<Any> => {
      if (expr.includes('setAttribute')) return 3;
      if (expr.includes('scrollHeight')) return 10; // < 40: não rola
      return 0;
    },
    waitForTimeout: async (): Promise<void> => {},
  };
  const bs = await amostrarScroll(page, DEFAULT_LIMITS, new AbortController().signal);
  assert.deepEqual(bs, []);
});

test('amostrarScroll: sinal já abortado → não amostra (respeita o orçamento)', async () => {
  let amostras = 0;
  const page = fakePage((p) => {
    amostras++;
    return [quadro(p, {})];
  });
  const ac = new AbortController();
  ac.abort();
  const bs = await amostrarScroll(page, DEFAULT_LIMITS, ac.signal);
  assert.deepEqual(bs, [], 'nada classificado');
  assert.equal(amostras, 0, 'nenhum ponto foi amostrado após o corte');
});

test('amostrarScroll: adaptação insere pontos onde há mudança (mais que os fixos)', async () => {
  const pontos = new Set<number>();
  // Mudança concentrada no meio: força a inserção adaptativa ali.
  const page = fakePage((p) => {
    pontos.add(p);
    const op = p < 0.45 ? 0 : p > 0.55 ? 1 : (p - 0.45) * 10;
    return [quadro(p, { opacity: String(Math.min(1, Math.max(0, op))) })];
  });
  await amostrarScroll(page, DEFAULT_LIMITS, new AbortController().signal);
  assert.ok(pontos.size > 9, `amostrou além dos 9 pontos fixos (${pontos.size})`);
  assert.ok(pontos.size <= DEFAULT_LIMITS.maxScrollSamples, 'respeitou o teto de amostras');
});
