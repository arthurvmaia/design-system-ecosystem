/* A emenda entre secoes, separando os DOIS defeitos:
   (A) a rampa de espaco envenenada por padding-% (2 sites), e
   (B) a soma dos respiros de origem (todos os sites).            */
import { readFileSync } from 'node:fs';
const m2 = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const raiz = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const ENVENENADOS = ['01KZJ8KX', '01KZJ8NV'];

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pq = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
const cnt = (a, f) => a.filter(f).length;

const emendas = [];
for (const site of m2) {
  if (site.erro) continue;
  const id = site.prj.slice(4, 12);
  for (let i = 0; i + 1 < site.secoes.length; i++) {
    const a = site.secoes[i], b = site.secoes[i + 1];
    if (a.vazioBase === null || b.vazioTopo === null) continue;
    emendas.push({ id, de: a.papel, para: b.papel, vao: a.vazioBase + b.vazioTopo + (b.topo - a.base), venenoso: ENVENENADOS.includes(id) });
  }
}
for (const [rot, filtro] of [['TODOS OS 20', () => true], ['OS 18 LIMPOS (sem a rampa envenenada)', (e) => !e.venenoso], ['OS 2 ENVENENADOS', (e) => e.venenoso]]) {
  const v = emendas.filter(filtro).map((e) => e.vao);
  console.log(`\n### ${rot} — ${v.length} emendas`);
  console.log(`  min=${Math.min(...v)} p10=${pq(v,.1)} p25=${pq(v,.25)} MEDIANA=${med(v)} p75=${pq(v,.75)} p90=${pq(v,.9)} max=${Math.max(...v)}`);
  console.log(`  >160px: ${cnt(v,x=>x>160)} (${(cnt(v,x=>x>160)/v.length*100).toFixed(0)}%)  >240: ${cnt(v,x=>x>240)}  >320: ${cnt(v,x=>x>320)}`);
  console.log(`  <8px: ${cnt(v,x=>x<8)} (${(cnt(v,x=>x<8)/v.length*100).toFixed(0)}%)  <24: ${cnt(v,x=>x<24)}  <48: ${cnt(v,x=>x<48)}`);
  console.log(`  amplitude DENTRO do mesmo site (mediana): ${med([...new Set(emendas.filter(filtro).map(e=>e.id))].map((id)=>{const w=emendas.filter(e=>e.id===id).map(e=>e.vao); return Math.max(...w)-Math.min(...w);}))}px`);
}

// SIMULACAO do conserto proposto, so nos 18 limpos
console.log(`\n\n### SIMULACAO — padding-block da RAIZ preso a [piso, teto] pela emenda da pagina`);
console.log(`(a emenda ALVO e a mediana dos degraus de espaco que as origens usam para respiro de secao)`);
const seq = [];
for (const site of raiz) {
  const id = site.prj.slice(4, 12);
  const s = site.secoes.map((x) => x.pecas[0]).filter(Boolean);
  for (let i = 0; i + 1 < s.length; i++) seq.push({ id, pb: s[i].pb, pt: s[i + 1].pt, venenoso: ENVENENADOS.includes(id) });
}
for (const [rot, f] of [['18 limpos', (x) => !x.venenoso], ['todos os 20', () => true]]) {
  const sub = seq.filter(f);
  const antes = sub.map((x) => x.pb + x.pt);
  console.log(`\n  -- ${rot}: ${sub.length} emendas --`);
  console.log(`     ANTES  med=${med(antes)} p90=${pq(antes,.9)} max=${Math.max(...antes)} | >160:${cnt(antes,v=>v>160)} ==0:${cnt(antes,v=>v===0)}`);
  for (const [piso, teto] of [[24, 64], [24, 80], [32, 80], [32, 96]]) {
    const dep = sub.map((x) => Math.min(Math.max(x.pb, piso / 2), teto) + Math.min(Math.max(x.pt, piso / 2), teto));
    console.log(`     piso=${piso} teto=${teto}: med=${med(dep)} p90=${pq(dep,.9)} max=${Math.max(...dep)} | >160:${cnt(dep,v=>v>160)} <8:${cnt(dep,v=>v<8)} | mexeu em ${cnt(sub.map((x,i)=>antes[i]!==dep[i]?1:0),v=>v===1)}/${sub.length}`);
  }
}
