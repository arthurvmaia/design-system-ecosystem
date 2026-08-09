/*
  A EMENDA QUE OS SITES DE ORIGEM USAM — a regua honesta para o alvo.

  Antes de normalizar a emenda do site gerado por um numero escolhido, mede-se o
  numero que os sites CAPTURADOS praticam entre as proprias secoes. O mapa
  estrutural guarda pageBox {x,y,w,h} de cada no, quem e pai de quem e onde ha
  texto/midia — da para reconstruir a emenda de tinta da pagina de origem sem
  reabrir navegador nenhum.
*/
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const V = join(process.env.USERPROFILE, 'design-system-ecosystem', 'vault');

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pq = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };

const todasEmendas = [];
const porSite = [];
for (const ds of readdirSync(V)) {
  const f = join(V, ds, 'capture-v2', 'manifest.json');
  if (!existsSync(f)) continue;
  let m;
  try { m = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const nos = m.structuralMap ?? [];
  const vw = m.viewport?.width ?? 0;
  if (nos.length === 0 || vw === 0) continue;

  const porHash = new Map(nos.map((n) => [n.fingerprint.hash, n]));
  const filhos = new Map();
  for (const n of nos) {
    const p = typeof n.parent === 'string' ? n.parent : null;
    if (p === null) continue;
    if (!filhos.has(p)) filhos.set(p, []);
    filhos.get(p).push(n);
  }

  // Candidatas a SECAO da pagina: largura quase cheia, altura de peso, e
  // profundidade rasa. Pega a profundidade que rende mais candidatas.
  const cand = nos.filter(
    (n) => n.pageBox && n.pageBox.w >= vw * 0.9 && n.pageBox.h >= 180 && n.visible !== false && n.depth <= 8,
  );
  if (cand.length < 3) continue;
  const porProf = new Map();
  for (const n of cand) porProf.set(n.depth, [...(porProf.get(n.depth) ?? []), n]);
  let secs = [];
  for (const [, lista] of porProf) if (lista.length > secs.length) secs = lista;
  if (secs.length < 3) continue;
  secs = secs.filter((s) => s.pageBox.y >= 0).sort((a, b) => a.pageBox.y - b.pageBox.y);

  // Tinta de uma secao: uniao das caixas dos descendentes com texto proprio ou
  // midia, presa a caixa da propria secao.
  const tintaDe = (sec) => {
    let topo = Infinity, base = -Infinity;
    const pilha = [sec];
    const vistos = new Set();
    while (pilha.length) {
      const n = pilha.pop();
      if (vistos.has(n.fingerprint.hash)) continue;
      vistos.add(n.fingerprint.hash);
      const temTinta = (n.ownText ?? '').trim().length > 0 || (n.mediaTags ?? []).length > 0;
      if (temTinta && n.pageBox && n.visible !== false) {
        const t = Math.max(n.pageBox.y, sec.pageBox.y);
        const b = Math.min(n.pageBox.y + n.pageBox.h, sec.pageBox.y + sec.pageBox.h);
        if (b > t) { topo = Math.min(topo, t); base = Math.max(base, b); }
      }
      for (const f of filhos.get(n.fingerprint.hash) ?? []) pilha.push(f);
    }
    return topo === Infinity ? null : { topo, base };
  };

  const vaos = [];
  for (let i = 0; i + 1 < secs.length; i++) {
    const a = secs[i], b = secs[i + 1];
    // Só emendas de secoes que se sucedem de verdade (sem sobreposicao grande).
    if (b.pageBox.y < a.pageBox.y + a.pageBox.h - 4) continue;
    const ta = tintaDe(a), tb = tintaDe(b);
    if (!ta || !tb) continue;
    const vao = Math.round(tb.topo - ta.base);
    if (vao < -8 || vao > 1200) continue;
    vaos.push(vao);
  }
  if (vaos.length >= 2) {
    todasEmendas.push(...vaos);
    porSite.push({ ds: ds.slice(0, 12), n: vaos.length, med: med(vaos), min: Math.min(...vaos), max: Math.max(...vaos) });
  }
}

console.log(`sites de origem com emenda mensuravel: ${porSite.length}`);
console.log(`emendas medidas: ${todasEmendas.length}`);
console.log(`\nEMENDA DE TINTA NAS PAGINAS DE ORIGEM (o que designers humanos praticam):`);
console.log(`  min=${Math.min(...todasEmendas)} p10=${pq(todasEmendas,.1)} p25=${pq(todasEmendas,.25)} MEDIANA=${med(todasEmendas)} p75=${pq(todasEmendas,.75)} p90=${pq(todasEmendas,.9)} max=${Math.max(...todasEmendas)}`);
const c = (f) => todasEmendas.filter(f).length;
console.log(`  >160px: ${c((v) => v > 160)} (${((c((v) => v > 160) / todasEmendas.length) * 100).toFixed(0)}%)   <8px: ${c((v) => v < 8)} (${((c((v) => v < 8) / todasEmendas.length) * 100).toFixed(0)}%)`);
console.log(`\nMEDIANA POR SITE (a emenda tipica de cada origem):`);
const meds = porSite.map((s) => s.med);
console.log(`  min=${Math.min(...meds)} p25=${pq(meds,.25)} MEDIANA=${med(meds)} p75=${pq(meds,.75)} max=${Math.max(...meds)}`);
console.log(`\nAmplitude DENTRO de cada origem (max-min), mediana: ${med(porSite.map((s) => s.max - s.min))}px`);
console.log(`\n20 primeiras origens:`);
for (const s of porSite.slice(0, 20)) console.log(`  ${s.ds} n=${String(s.n).padStart(2)} min=${String(s.min).padStart(4)} med=${String(s.med).padStart(4)} max=${String(s.max).padStart(4)}`);
