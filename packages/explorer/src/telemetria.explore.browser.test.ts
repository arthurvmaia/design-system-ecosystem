import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { explorePage } from './explore.js';
import { Telemetria } from './telemetria.js';

/**
 * Integração da telemetria no `explorePage` (commit 3): o manifesto carrega o
 * relatório de telemetria (fases medidas, contadores), e quando o orçamento
 * TOTAL esgota a extração sai PARCIAL — válida, com o que foi capturado
 * preservado, e sinalizada para a Galeria — em vez de erro (regras 8-10).
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright opcional, não tipado
type Any = any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<section><h2>Bloco</h2><img id="im" src="/a.png" width="20" height="20">
<button id="b" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true')">Abrir</button></section>
</body></html>`;

const subirFixture = async (): Promise<{ base: string; fechar: () => Promise<void> }> => {
  const s = createServer((req: Any, res: Any) => {
    const u = (req.url ?? '').split('?')[0];
    if (u === '/a.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise<void>((r) => s.listen(0, r));
  const porta = (s.address() as Any).port;
  return {
    base: `http://localhost:${porta}`,
    fechar: () => {
      s.closeAllConnections?.();
      return new Promise<void>((r) => s.close(() => r()));
    },
  };
};

// Limites rápidos para o teste não esperar os settles longos de produção.
const rapidos = {
  settleAfterLoadMs: 20,
  settleAfterInteractionMs: 20,
  faseScrollLazyMs: 2000,
} as const;

test('explorePage: telemetria no manifesto (fases medidas, não parcial)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const fx = await subirFixture();
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  t.after(async () => {
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
    await fx.fechar();
  });

  const manifest = await explorePage(`${fx.base}/`, {
    exploration: { mode: 'deep', reasons: ['fixture'] },
    assetSink: () => {},
    limits: rapidos,
  });

  assert.ok(manifest.telemetry, 'manifesto traz telemetria');
  assert.equal(manifest.telemetry?.parcial, false, 'não parcial num orçamento folgado');
  const nomes = (manifest.telemetry?.fases ?? []).map((f) => f.nome);
  for (const n of ['abrir-navegador', 'carregar', 'interacoes', 'assets-rede', 'fechar']) {
    assert.ok(nomes.includes(n), `fase "${n}" foi medida`);
  }
  assert.ok((manifest.telemetry?.contadores.candidatos ?? 0) > 0, 'contou candidatos');
});

test('explorePage: orçamento total esgotado → PARCIAL válido, nada descartado (regras 8-10)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const fx = await subirFixture();
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  t.after(async () => {
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
    await fx.fechar();
  });

  // Orçamento total já esgotado: as fases cooperativas (interações, assets) cortam
  // na hora. NÃO deve lançar — deve devolver um manifesto parcial válido.
  const telExausta = new Telemetria({ total: 1, fases: {} });
  const manifest = await explorePage(`${fx.base}/`, {
    exploration: { mode: 'deep', reasons: ['fixture'] },
    assetSink: () => {},
    limits: rapidos,
    telemetria: telExausta,
  });

  assert.equal(manifest.telemetry?.parcial, true, 'marcada como parcial');
  assert.ok(manifest.telemetry?.faseInterrompida, 'registra a fase interrompida');
  assert.ok(Array.isArray(manifest.elements), 'manifesto válido: elements é array');
  assert.ok(Array.isArray(manifest.assets), 'manifesto válido: assets é array');
  assert.ok(
    manifest.warnings.some((w) => /PARCIAL/i.test(w)),
    'a Galeria recebe o aviso de corte por tempo, não um erro genérico',
  );
});
