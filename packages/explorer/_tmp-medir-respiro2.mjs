import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'C:/Users/arthur.maia/AppData/Local/Temp/kits-provar-fCTmCc';
const largura = Number(process.argv[2] ?? 1440);

const SCRIPT = () => {
  const px = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const onde = (el) => {
    const t = el.tagName.toLowerCase();
    const c = (el.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.');
    return c ? `${t}.${c}` : t;
  };
  const secs = [...document.querySelectorAll('[data-secao]')];

  // Percorre a seção e devolve o elemento de TINTA mais alto e o mais baixo,
  // com a caixa CLAMPADA à própria seção (tinta que vaza para fora da seção é
  // decoração absoluta, não define a emenda).
  const tintaDa = (sec) => {
    const rs = sec.getBoundingClientRect();
    let alto = null;
    let baixo = null;
    const anda = (el) => {
      for (const f of el.children) {
        const e = getComputedStyle(f);
        if (e.display === 'none' || e.visibility === 'hidden' || Number(e.opacity) === 0) continue;
        if (e.position === 'fixed') continue;
        const r = f.getBoundingClientRect();
        const temFundo = e.backgroundColor !== 'rgba(0, 0, 0, 0)' && e.backgroundImage !== 'none';
        const folha = f.childElementCount === 0;
        const ehTinta = folha
          ? (f.textContent || '').trim().length > 0 ||
            ['IMG', 'VIDEO', 'SVG', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON', 'HR'].includes(f.tagName)
          : temFundo;
        if (r.height > 0.5 && r.width > 0.5 && ehTinta) {
          const topo = Math.max(r.top, rs.top);
          const base = Math.min(r.bottom, rs.bottom);
          if (base > topo) {
            if (alto === null || topo < alto.y) alto = { y: topo, el: f };
            if (baixo === null || base > baixo.y) baixo = { y: base, el: f };
          }
        }
        if (f.childElementCount > 0) anda(f);
      }
    };
    anda(sec);
    return { alto, baixo, rs };
  };

  // Atribui o espaço: da borda da seção até a tinta, quem contribuiu com quanto.
  const cadeia = (el, sec, lado) => {
    const partes = [];
    let cur = el;
    while (cur && cur !== sec) {
      const pai = cur.parentElement;
      if (!pai) break;
      const ep = getComputedStyle(pai);
      const ec = getComputedStyle(cur);
      const p = lado === 'topo' ? px(ep.paddingTop) : px(ep.paddingBottom);
      const m = lado === 'topo' ? px(ec.marginTop) : px(ec.marginBottom);
      if (p !== 0 || m !== 0) {
        partes.push({
          quem: onde(pai),
          padding: p,
          margemDoFilho: m,
          ehSecao: pai === sec,
          ehProxy: pai.hasAttribute('data-ds-raiz') || pai.hasAttribute('data-ds-corpo'),
          ehCriado: pai.hasAttribute('data-ds-criado'),
        });
      }
      cur = pai;
    }
    return partes;
  };

  const out = [];
  for (const s of secs) {
    const rs = s.getBoundingClientRect();
    const es = getComputedStyle(s);
    const { alto, baixo } = tintaDa(s);
    const temSticky =
      [...s.querySelectorAll('*')].some((x) => getComputedStyle(x).position === 'sticky') ||
      es.position === 'sticky';
    out.push({
      papel: s.getAttribute('data-secao'),
      origem: s.getAttribute('data-origem'),
      topo: Math.round(rs.top + window.scrollY),
      base: Math.round(rs.bottom + window.scrollY),
      altura: Math.round(rs.height),
      posicao: es.position,
      temSticky,
      secPt: px(es.paddingTop),
      secPb: px(es.paddingBottom),
      secMt: px(es.marginTop),
      secMb: px(es.marginBottom),
      // espaço VAZIO no topo e no pé da seção (o que a pessoa vê como "vão")
      vazioTopo: alto ? Math.round(alto.y - rs.top) : null,
      vazioBase: baixo ? Math.round(rs.bottom - baixo.y) : null,
      quemTopo: alto ? onde(alto.el) : null,
      quemBase: baixo ? onde(baixo.el) : null,
      cadeiaTopo: alto ? cadeia(alto.el, s, 'topo') : [],
      cadeiaBase: baixo ? cadeia(baixo.el, s, 'base') : [],
    });
  }
  return {
    secoes: out,
    alturaTotal: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    scrollY: window.scrollY,
  };
};

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } });
const resultado = [];
for (const dir of readdirSync(BASE).filter((d) => d.startsWith('prj_'))) {
  const url = pathToFileURL(join(BASE, dir, 'index.html')).href;
  try {
    await pagina.goto(url, { waitUntil: 'load', timeout: 45000 });
    // scroll-behavior:smooth (do cssResponsivoBase) faz o retorno ao topo NAO
    // terminar antes da medida: sticky fica preso e tudo desloca. Desliga.
    await pagina.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    await pagina.waitForTimeout(1000);
    await pagina.evaluate(async () => {
      const passo = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += passo) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 110));
      }
      window.scrollTo(0, 0);
      for (let i = 0; i < 40 && window.scrollY !== 0; i++) {
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 600));
    });
    const dados = await pagina.evaluate(SCRIPT);
    resultado.push({ prj: dir, ...dados });
    console.error(`ok ${dir} ${dados.secoes.length} secoes scrollY=${dados.scrollY}`);
  } catch (erro) {
    console.error(`FALHOU ${dir}: ${erro.message}`);
    resultado.push({ prj: dir, erro: String(erro.message) });
  }
}
await navegador.close();
writeFileSync(process.argv[3] ?? 'medida.json', JSON.stringify(resultado, null, 1));
console.error('gravado');
