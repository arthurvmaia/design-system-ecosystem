import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'C:/Users/arthur.maia/AppData/Local/Temp/kits-provar-fCTmCc';

const REM = 16;
const litPx = (t) => {
  const m = /^([\d.]+)(px|rem)$/.exec(t.trim());
  if (!m) return null;
  return m[2] === 'rem' ? Number(m[1]) * REM : Number(m[1]);
};

let totalUso = 0;
let totalInflado = 0;
const piores = [];
console.log('site      | degraus de --marca-espaco (px)                                  | teto');
for (const prj of readdirSync(BASE).filter((d) => d.startsWith('prj_'))) {
  const marca = join(BASE, prj, 'assets/marca.css');
  if (!existsSync(marca)) continue;
  const css = readFileSync(marca, 'utf8');
  const escala = new Map();
  for (const m of css.matchAll(/--marca-espaco-(\d+)\s*:\s*([\d.]+)px/g)) escala.set(`--marca-espaco-${m[1]}`, Number(m[2]));
  const vals = [...escala.values()];
  console.log(
    `${prj.slice(4, 12)} | ${vals.map((v) => Math.round(v)).join(' ').padEnd(60)} | ${Math.max(...vals).toFixed(0)}px`,
  );

  // Onde a escala e CONSUMIDA: compara o degrau com o literal de fallback.
  const styles = join(BASE, prj, 'assets/styles.css');
  if (!existsSync(styles)) continue;
  const s = readFileSync(styles, 'utf8');
  for (const m of s.matchAll(/var\((--marca-espaco-\d+)\s*,\s*([^)]+)\)/g)) {
    const degrau = escala.get(m[1]);
    const orig = litPx(m[2]);
    if (degrau === undefined || orig === null || orig <= 0) continue;
    totalUso++;
    const fator = degrau / orig;
    if (fator >= 2) {
      totalInflado++;
      piores.push({ prj: prj.slice(4, 12), token: m[1], orig, degrau, fator });
    }
  }
}
console.log(`\nUSOS de --marca-espaco medidos: ${totalUso}`);
console.log(`usos em que o degrau da marca e >=2x o valor da ORIGEM: ${totalInflado} (${((totalInflado / totalUso) * 100).toFixed(0)}%)`);
const f = piores.map((p) => p.fator).sort((a, b) => a - b);
if (f.length) console.log(`fator de inflacao: mediana=${f[Math.floor(f.length / 2)].toFixed(1)}x  max=${f.at(-1).toFixed(1)}x`);
console.log('\nOS 20 PIORES (o que a peca tinha -> o que o motor escreveu):');
for (const p of piores.sort((a, b) => b.degrau - b.orig - (a.degrau - a.orig)).slice(0, 20))
  console.log(`  ${p.prj} ${p.token.padEnd(18)} ${String(Math.round(p.orig)).padStart(4)}px -> ${String(Math.round(p.degrau)).padStart(5)}px  (${p.fator.toFixed(1)}x, +${Math.round(p.degrau - p.orig)}px)`);

console.log('\nQUANTOS SITES TEM DEGRAU ABSURDO (>320px, que nenhum respiro de secao e):');
let n = 0;
for (const prj of readdirSync(BASE).filter((d) => d.startsWith('prj_'))) {
  const marca = join(BASE, prj, 'assets/marca.css');
  if (!existsSync(marca)) continue;
  const vals = [...readFileSync(marca, 'utf8').matchAll(/--marca-espaco-\d+\s*:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
  if (vals.some((v) => v > 320)) {
    n++;
    console.log(`  ${prj.slice(4, 12)} degraus > 320px: ${vals.filter((v) => v > 320).map((v) => Math.round(v)).join(', ')}`);
  }
}
console.log(`  => ${n}/20 sites`);
