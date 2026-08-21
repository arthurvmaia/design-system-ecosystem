const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const raiz = path.resolve(process.argv[2]);
const T = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
};
const s = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const a = path.join(raiz, rel);
  if (!a.startsWith(raiz) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) {
    r.writeHead(404);
    r.end();
    return;
  }
  r.writeHead(200, { 'content-type': T[path.extname(a)] || 'application/octet-stream' });
  fs.createReadStream(a).pipe(r);
});
s.listen(0, async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`http://127.0.0.1:${s.address().port}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await p.waitForTimeout(1500);
  console.log(
    JSON.stringify(
      await p.evaluate(() => {
        const out = [...document.querySelectorAll('section[data-secao]')].map((sec) => {
          const cs = getComputedStyle(sec);
          const filho = sec.firstElementChild;
          const fcs = filho ? getComputedStyle(filho) : null;
          return {
            id: sec.dataset.secaoId,
            opac: cs.opacity,
            vis: cs.visibility,
            tf: cs.transform,
            attrs: sec.getAttributeNames().join(','),
            filho: filho
              ? `${filho.tagName}.${(filho.className || '').toString().slice(0, 40)} op=${fcs.opacity} tf=${fcs.transform.slice(0, 30)} attrs=${filho.getAttributeNames().join(',')}`
              : null,
          };
        });
        // quem estoura a largura
        const larg = [];
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.right > 1441 || r.left < -1)
            larg.push(
              `${el.tagName}.${(el.className || '').toString().slice(0, 50)} [${Math.round(r.left)},${Math.round(r.right)}]`,
            );
        }
        return { out, larg: larg.slice(0, 12) };
      }),
      null,
      1,
    ),
  );
  await b.close();
  s.close();
});
