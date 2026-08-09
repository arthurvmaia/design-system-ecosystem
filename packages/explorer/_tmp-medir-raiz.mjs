/*
  Mede a PADDING-BLOCK da RAIZ DA PECA — o primeiro filho de [data-ds-corpo].
  E ali, e so ali, que o vao entre secoes nasce: e a distancia que aquela peca
  tinha para as VIZINHAS dela no site de origem, e nao o ritmo interno dela.
*/
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'C:/Users/arthur.maia/AppData/Local/Temp/kits-provar-fCTmCc';
const largura = Number(process.argv[2] ?? 1440);

const SCRIPT = () => {
  const px = (v) => Math.round(Number.parseFloat(v) || 0);
  const out = [];
  for (const s of document.querySelectorAll('[data-secao]')) {
    const raizes = [...s.children].filter((c) => c.hasAttribute('data-ds-raiz'));
    const criados = [...s.children].filter((c) => c.hasAttribute('data-ds-criado'));
    const pecas = [];
    for (const r of raizes) {
      for (const corpo of r.querySelectorAll(':scope > [data-ds-corpo]')) {
        for (const p of corpo.children) {
          const e = getComputedStyle(p);
          pecas.push({
            tag: p.tagName.toLowerCase(),
            cls: (p.className || '').toString().slice(0, 70),
            pt: px(e.paddingTop),
            pb: px(e.paddingBottom),
            mt: px(e.marginTop),
            mb: px(e.marginBottom),
            minH: e.minHeight,
            pos: e.position,
            alturaCaixa: Math.round(p.getBoundingClientRect().height),
            // sinais de que o padding e ESTRUTURAL (pista de rolagem), nao respiro
            temStickyDentro: [...p.querySelectorAll('*')].some(
              (x) => getComputedStyle(x).position === 'sticky',
            ),
            temAbsolutoDentro: [...p.children].some(
              (x) => getComputedStyle(x).position === 'absolute',
            ),
            nFilhos: p.childElementCount,
          });
        }
      }
    }
    out.push({
      papel: s.getAttribute('data-secao'),
      origem: s.getAttribute('data-origem'),
      nRaizes: raizes.length,
      nCriados: criados.length,
      altura: Math.round(s.getBoundingClientRect().height),
      pecas,
    });
  }
  return out;
};

const nav = await chromium.launch();
const pg = await nav.newPage({ viewport: { width: largura, height: 900 } });
const res = [];
for (const dir of readdirSync(BASE).filter((d) => d.startsWith('prj_'))) {
  try {
    await pg.goto(pathToFileURL(join(BASE, dir, 'index.html')).href, { waitUntil: 'load', timeout: 45000 });
    await pg.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    await pg.waitForTimeout(900);
    res.push({ prj: dir, secoes: await pg.evaluate(SCRIPT) });
    console.error('ok ' + dir);
  } catch (e) {
    console.error('FALHOU ' + dir + ': ' + e.message);
  }
}
await nav.close();
writeFileSync(process.argv[3], JSON.stringify(res, null, 1));
console.error('gravado');
