const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const raiz = path.resolve(process.argv[2]);
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

const servidor = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const alvo = path.join(raiz, rel);
  if (!alvo.startsWith(raiz) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
  fs.createReadStream(alvo).pipe(res);
});

servidor.listen(0, async () => {
  const base = 'http://127.0.0.1:' + servidor.address().port + '/index.html';
  const b = await chromium.launch();
  const erros = [];
  for (const [w, h, nome] of [[1440, 900, 'desk'], [390, 844, 'mob']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => erros.push(nome + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') erros.push(nome + ' console: ' + m.text()); });
    p.on('requestfailed', (r) => erros.push(nome + ' req: ' + r.url().split('/').pop() + ' ' + (r.failure() || {}).errorText));
    await p.goto(base, { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(os.tmpdir(), 'val-' + nome + '.png'), fullPage: true });
    const info = await p.evaluate(() => {
      const secs = [...document.querySelectorAll('section[data-secao]')].map((s) => ({ id: s.dataset.secaoId, papel: s.dataset.secao, h: Math.round(s.getBoundingClientRect().height) }));
      const imgs = [...document.images].map((i) => ({ src: (i.currentSrc || i.src || '(vazio)').split('/').slice(-1)[0], ok: i.naturalWidth > 0 }));
      const brutas = document.body.innerText.match(/Aris|Open Design|Mina Kovac|asimov|Elena R\.|Câmara Escura|huashu|hyperframes|Capturando/gi) || [];
      return {
        secs,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        largura: document.documentElement.scrollWidth + '/' + window.innerWidth,
        quebradas: imgs.filter((i) => !i.ok).map((i) => i.src),
        totalImgs: imgs.length,
        brutas: [...new Set(brutas)],
        ancoras: ['trabalhos', 'servicos', 'orcamento'].map((id) => id + ':' + !!document.getElementById(id)).join(' '),
        h1: (document.querySelector('h1') || {}).innerText,
        linksMortos: [...document.querySelectorAll('a[href="#"]')].length,
      };
    });
    console.log(nome, JSON.stringify(info));
    await p.close();
  }
  console.log('ERROS', JSON.stringify([...new Set(erros)].slice(0, 12), null, 1));
  await b.close();
  servidor.close();
});
