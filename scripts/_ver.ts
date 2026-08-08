/** Abre um site gerado e mede o que a regra de aceite não alcança sem navegador. */
import { chromium } from 'playwright';
const url = process.argv[2];
const saida = process.argv[3];
const principal = async (): Promise<void> => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1900, height: 1000 } });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const vw = window.innerWidth;
    let minX = Number.POSITIVE_INFINITY;
    let cortados = 0;
    for (const e of document.querySelectorAll('h1,h2,h3,p,span,a,button,li')) {
      if (e.children.length > 0) continue;
      const t = (e.textContent ?? '').trim();
      if (t.length < 4) continue;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      if (s.position === 'fixed' || r.width < 20 || r.height < 8) continue;
      if (r.x < minX) minX = r.x;
      if (r.x < 0 || r.right > vw) cortados++;
    }
    let invisiveis = 0;
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e);
      if (Number.parseFloat(s.opacity) < 0.05 && e.getBoundingClientRect().height > 20)
        invisiveis++;
    }
    return {
      vw,
      textoMaisAEsquerda: Number.isFinite(minX) ? Math.round(minX) : null,
      cortadosNaBorda: cortados,
      animacoes: document.getAnimations().length,
      invisiveis,
      titulo: document.title,
      favicon: !!document.querySelector('link[rel="icon"]'),
      secoes: document.querySelectorAll('[data-secao]').length,
      comportamento: !!document.querySelector('[data-ds-comportamento]'),
      alturaPx: document.documentElement.scrollHeight,
    };
  });
  console.log(JSON.stringify(m, null, 1));
  if (saida) await p.screenshot({ path: saida, fullPage: false });
  await b.close();
};
void principal();
