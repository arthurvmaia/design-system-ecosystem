import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ScrollBehavior } from '@ds/shared';
import { DEFAULT_LIMITS } from './config.js';
import { amostrarScroll } from './scroll-capture.js';

/**
 * Captura de scroll em navegador REAL contra as fixtures (item 11): prova que a
 * amostragem + classificação reconhecem reveal, sticky, parallax, class-toggle,
 * sequência de cards e progressões, sem depender de nenhum site externo.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright opcional, não tipado
type Any = any;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

test('captura de scroll nas fixtures (navegador real)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const { SCROLL_FIXTURES } = await import(
    pathToFileURL(join(REPO, 'fixtures/scroll-fixtures.ts')).href
  );

  const servidor = createServer((req: Any, res: Any) => {
    const nome = (req.url ?? '/').slice(1).split('?')[0];
    const fx = SCROLL_FIXTURES[nome];
    res.writeHead(fx ? 200 : 404, { 'Content-Type': 'text/html' });
    res.end(fx ? fx() : 'nao encontrado');
  });
  await new Promise<void>((r) => servidor.listen(0, r));
  const porta = (servidor.address() as Any).port;
  const base = `http://localhost:${porta}`;

  const browser = await pw.chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    servidor.closeAllConnections?.();
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  const limits = { ...DEFAULT_LIMITS, scrollSettleMs: 90, maxScrollSamples: 12 };
  const capturar = async (nome: string): Promise<ScrollBehavior[]> => {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}/${nome}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(200);
      return await amostrarScroll(page, limits, new AbortController().signal);
    } finally {
      await page.close();
    }
  };

  const noAlvo = (bs: ScrollBehavior[]): ScrollBehavior[] =>
    bs.filter((b) => b.target.id === 'alvo');

  await t.test('reveal por IntersectionObserver → reveal/class-toggle no alvo', async () => {
    const bs = await capturar('revealIO');
    const alvo = noAlvo(bs);
    assert.ok(alvo.length > 0, 'capturou comportamento no alvo');
    assert.ok(
      alvo.some((b) => b.kind === 'viewport-reveal' || b.kind === 'class-toggle'),
      `esperava reveal/class-toggle, veio ${alvo.map((b) => b.kind).join(',')}`,
    );
  });

  await t.test('sticky → kind sticky com pin', async () => {
    const bs = await capturar('sticky');
    const st = noAlvo(bs).find((b) => b.kind === 'sticky');
    assert.ok(st, `esperava sticky, veio ${bs.map((b) => b.kind).join(',')}`);
    assert.equal(st?.pin, true);
  });

  await t.test('parallax → translateY vinculado ao progresso', async () => {
    const bs = await capturar('parallax');
    assert.ok(
      noAlvo(bs).some((b) => b.kind === 'parallax'),
      `esperava parallax, veio ${bs.map((b) => b.kind).join(',')}`,
    );
  });

  await t.test('class-toggle → ganha a classe ativo', async () => {
    const bs = await capturar('classToggle');
    assert.ok(noAlvo(bs).some((b) => b.kind === 'class-toggle'));
  });

  await t.test('sequência de cards → vários comportamentos', async () => {
    const bs = await capturar('cardSequence');
    assert.ok(bs.length >= 2, `esperava vários, veio ${bs.length}`);
  });

  await t.test('scale por progresso → progress-scale', async () => {
    const bs = await capturar('scaleProgress');
    assert.ok(
      noAlvo(bs).some((b) => b.kind === 'progress-scale'),
      `veio ${bs.map((b) => b.kind).join(',')}`,
    );
  });
});
