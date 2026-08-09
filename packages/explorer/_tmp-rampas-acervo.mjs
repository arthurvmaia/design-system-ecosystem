/* A rampa de ESPACO de todo o acervo: quantos degraus sao respiro de verdade
   e quantos sao acidente que virou topo de escala. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const V = join(process.env.USERPROFILE, 'design-system-ecosystem', 'vault');

let nSites = 0;
let comAbsurdo = 0;
const saltos = [];
const topos = [];
const linhas = [];
for (const ds of readdirSync(V)) {
  const f = join(V, ds, 'capture-v2', 'manifest.json');
  if (!existsSync(f)) continue;
  let m;
  try { m = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const esp = (m.designTokens ?? []).filter((t) => t.eixo === 'espaco').map((t) => t);
  if (esp.length === 0) continue;
  nSites++;
  const vh = m.viewport?.height ?? 900;
  const vw = m.viewport?.width ?? 1440;
  const vals = esp.map((t) => t.valor);
  topos.push(vals.at(-1));
  for (let i = 1; i < vals.length; i++) saltos.push({ ds, de: vals[i - 1], para: vals[i], razao: vals[i] / vals[i - 1] });
  const acima = esp.filter((t) => t.valor > vh);
  if (acima.length) {
    comAbsurdo++;
    linhas.push(`  ${ds.slice(0, 12)} vh=${vh} vw=${vw} | degraus > altura da janela: ${acima.map((t) => `${Math.round(t.valor)}px(${t.ocorrencias} nos)`).join(', ')} | rampa: ${vals.map((v) => Math.round(v)).join(',')}`);
  }
}
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * f)]; };
console.log(`sites com rampa de espaco: ${nSites}`);
console.log(`sites com degrau MAIOR QUE A ALTURA DA JANELA: ${comAbsurdo}`);
for (const l of linhas) console.log(l);
console.log(`\nTOPO da rampa de espaco: mediana=${Math.round(q(topos, 0.5))}px p90=${Math.round(q(topos, 0.9))}px max=${Math.round(Math.max(...topos))}px`);
console.log(`RAZAO entre degraus vizinhos: mediana=${q(saltos.map((s) => s.razao), 0.5).toFixed(2)}x p90=${q(saltos.map((s) => s.razao), 0.9).toFixed(2)}x p99=${q(saltos.map((s) => s.razao), 0.99).toFixed(2)}x`);
console.log('\nOs 12 maiores saltos do acervo:');
for (const s of saltos.sort((a, b) => b.razao - a.razao).slice(0, 12))
  console.log(`  ${s.ds.slice(0, 12)} ${Math.round(s.de)} -> ${Math.round(s.para)} = ${s.razao.toFixed(1)}x`);
console.log('\nQuantos degraus do acervo passam de 240px (nenhum respiro de secao chega la):');
let n240 = 0, nTot = 0;
for (const ds of readdirSync(V)) {
  const f = join(V, ds, 'capture-v2', 'manifest.json');
  if (!existsSync(f)) continue;
  try {
    const m = JSON.parse(readFileSync(f, 'utf8'));
    for (const t of (m.designTokens ?? []).filter((x) => x.eixo === 'espaco')) { nTot++; if (t.valor > 240) n240++; }
  } catch {}
}
console.log(`  ${n240} de ${nTot} degraus (${((n240 / nTot) * 100).toFixed(1)}%)`);
