import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'C:/Users/arthur.maia/AppData/Local/Temp/kits-provar-fCTmCc';
const larguraArg = Number(process.argv[2] ?? 1440);

const SCRIPT = () => {
  const secs = [...document.querySelectorAll('[data-secao]')];
  const px = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  // A "tinta" de uma seção: a caixa que engloba todo descendente VISÍVEL com
  // área. É contra ela que se mede o vão que a pessoa VÊ.
  const tinta = (sec) => {
    let topo = Number.POSITIVE_INFINITY;
    let base = Number.NEGATIVE_INFINITY;
    let achou = false;
    const anda = (el) => {
      for (const f of el.children) {
        const e = getComputedStyle(f);
        if (e.display === 'none' || e.visibility === 'hidden' || Number(e.opacity) === 0) continue;
        if (e.position === 'fixed') continue;
        const r = f.getBoundingClientRect();
        const temFundo =
          e.backgroundColor !== 'rgba(0, 0, 0, 0)' && e.backgroundColor !== 'transparent';
        const temImagem = e.backgroundImage !== 'none';
        const ehTinta =
          f.childElementCount === 0
            ? (f.textContent || '').trim().length > 0 ||
              ['IMG', 'VIDEO', 'SVG', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON'].includes(f.tagName)
            : temFundo || temImagem;
        if (r.height > 0 && r.width > 0 && ehTinta) {
          achou = true;
          topo = Math.min(topo, r.top);
          base = Math.max(base, r.bottom);
        }
        if (f.childElementCount > 0) anda(f);
      }
    };
    anda(sec);
    return achou ? { topo, base } : null;
  };

  const out = [];
  for (const s of secs) {
    const r = s.getBoundingClientRect();
    const e = getComputedStyle(s);
    // O 1o filho é o proxy de raiz do compositor; o 2o o de corpo.
    const raiz = s.firstElementChild;
    const er = raiz ? getComputedStyle(raiz) : null;
    const corpo = raiz ? raiz.querySelector(':scope > [data-ds-corpo]') : null;
    const ec = corpo ? getComputedStyle(corpo) : null;
    const peca = corpo ? corpo.firstElementChild : null;
    const ep = peca ? getComputedStyle(peca) : null;
    const t = tinta(s);
    out.push({
      papel: s.getAttribute('data-secao'),
      origem: s.getAttribute('data-origem'),
      topo: Math.round(r.top + window.scrollY),
      base: Math.round(r.bottom + window.scrollY),
      altura: Math.round(r.height),
      // paddings/margins de cada camada do envelope
      sec: { pt: px(e.paddingTop), pb: px(e.paddingBottom), mt: px(e.marginTop), mb: px(e.marginBottom), disp: e.display },
      raiz: er ? { tag: raiz.tagName, pt: px(er.paddingTop), pb: px(er.paddingBottom), mt: px(er.marginTop), mb: px(er.marginBottom) } : null,
      corpo: ec ? { pt: px(ec.paddingTop), pb: px(ec.paddingBottom), mt: px(ec.marginTop), mb: px(ec.marginBottom) } : null,
      peca: ep ? { tag: peca.tagName, cls: (peca.className || '').toString().slice(0, 60), pt: px(ep.paddingTop), pb: px(ep.paddingBottom), mt: px(ep.marginTop), mb: px(ep.marginBottom) } : null,
      tintaTopo: t ? Math.round(t.topo + window.scrollY) : null,
      tintaBase: t ? Math.round(t.base + window.scrollY) : null,
    });
  }
  return {
    secoes: out,
    alturaTotal: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  };
};

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: larguraArg, height: 900 } });
const resultado = [];
for (const dir of readdirSync(BASE).filter((d) => d.startsWith('prj_'))) {
  const url = pathToFileURL(join(BASE, dir, 'index.html')).href;
  try {
    await pagina.goto(url, { waitUntil: 'load', timeout: 45000 });
    await pagina.waitForTimeout(1200);
    // rola até o fim para disparar revelação/lazy e assentar a altura
    await pagina.evaluate(async () => {
      const passo = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += passo) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    });
    const dados = await pagina.evaluate(SCRIPT);
    resultado.push({ prj: dir, ...dados });
    console.error(`ok ${dir} ${dados.secoes.length} secoes`);
  } catch (erro) {
    console.error(`FALHOU ${dir}: ${erro.message}`);
    resultado.push({ prj: dir, erro: String(erro.message) });
  }
}
await navegador.close();
writeFileSync(process.argv[3] ?? 'medida.json', JSON.stringify(resultado, null, 1));
console.error('gravado');
