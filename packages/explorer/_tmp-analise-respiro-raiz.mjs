import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pq = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
const cnt = (a, f) => a.filter(f).length;

const raizes = [];
for (const site of d) for (const s of site.secoes) for (const p of s.pecas) raizes.push({ prj: site.prj.slice(4, 12), papel: s.papel, ...p });

const pts = raizes.map((r) => r.pt);
const pbs = raizes.map((r) => r.pb);
const todos = [...pts, ...pbs];
console.log(`=== ${raizes.length} raizes de peca, ${todos.length} lados (pt+pb) ===`);
console.log(`padding-block da RAIZ: min=${Math.min(...todos)} p25=${pq(todos,.25)} MEDIANA=${med(todos)} p75=${pq(todos,.75)} p90=${pq(todos,.9)} max=${Math.max(...todos)}`);
console.log(`zeros: ${cnt(todos,v=>v===0)} (${(cnt(todos,v=>v===0)/todos.length*100).toFixed(0)}%)  >96: ${cnt(todos,v=>v>96)} (${(cnt(todos,v=>v>96)/todos.length*100).toFixed(0)}%)  >160: ${cnt(todos,v=>v>160)}  >400: ${cnt(todos,v=>v>400)}`);

console.log('\nHISTOGRAMA dos lados (px):');
const faixas = [[0,0],[1,23],[24,47],[48,79],[80,95],[96,127],[128,159],[160,199],[200,299],[300,499],[500,1e9]];
for (const [a,b] of faixas) {
  const n = cnt(todos, (v) => v >= a && v <= b);
  console.log(`  ${String(a).padStart(4)}-${b>1e8?'inf ':String(b).padStart(4)}  ${String(n).padStart(4)}  ${'#'.repeat(Math.round(n / 4))}`);
}

console.log('\nOS VALORES MAIS FREQUENTES (o degrau que as origens escolheram):');
const freq = new Map();
for (const v of todos) freq.set(v, (freq.get(v) ?? 0) + 1);
for (const [v, n] of [...freq].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(v).padStart(5)}px  x${n}`);

console.log('\nPADDING DA RAIZ x SINAL DE ROLAGEM (o caso em que o padding NAO e respiro):');
const grandes = raizes.filter((r) => Math.max(r.pt, r.pb) > 200);
console.log(`  raizes com padding-block > 200px: ${grandes.length}`);
for (const r of grandes) console.log(`    ${r.prj} ${r.papel.padEnd(12)} pt=${r.pt} pb=${r.pb} altura=${r.alturaCaixa} sticky-dentro=${r.temStickyDentro} abs=${r.temAbsolutoDentro} | ${r.tag}.${r.cls.slice(0,40)}`);

console.log('\nRAIZES COM STICKY DENTRO (padding pode ser pista de rolagem):');
const st = raizes.filter((r) => r.temStickyDentro);
console.log(`  ${st.length} de ${raizes.length}; padding-block delas: mediana=${med(st.flatMap(r=>[r.pt,r.pb]))} max=${Math.max(0,...st.flatMap(r=>[r.pt,r.pb]))}`);

console.log('\nSIMULACAO: e se o padding-block da RAIZ fosse limitado a um TETO?');
// emenda = pb(A) + pt(B) para vizinhos na mesma pagina
for (const teto of [48, 64, 80, 96, 120]) {
  let antes = [], depois = [];
  for (const site of d) {
    const seq = site.secoes.map((s) => s.pecas[0]).filter(Boolean);
    for (let i = 0; i + 1 < seq.length; i++) {
      antes.push(seq[i].pb + seq[i + 1].pt);
      depois.push(Math.min(seq[i].pb, teto) + Math.min(seq[i + 1].pt, teto));
    }
  }
  console.log(`  teto=${String(teto).padStart(3)}px -> emenda(so raiz): antes med=${med(antes)} p90=${pq(antes,.9)} max=${Math.max(...antes)} | depois med=${med(depois)} p90=${pq(depois,.9)} max=${Math.max(...depois)} | >160 antes=${cnt(antes,v=>v>160)} depois=${cnt(depois,v=>v>160)}`);
}

console.log('\nSECOES CRIADAS vs BIBLIOTECA:');
let nCriado = 0, nBib = 0;
for (const site of d) for (const s of site.secoes) { if (s.nCriados > 0) nCriado++; if (s.nRaizes > 0) nBib++; }
console.log(`  secoes com peca de biblioteca: ${nBib}; com HTML criado: ${nCriado}`);
