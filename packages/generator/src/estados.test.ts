import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { StoredState } from '@ds/shared';
import {
  CSS_DO_ALTERNADOR,
  SCRIPT_DO_ALTERNADOR,
  acharAncoras,
  analisar,
  avisosDosEstados,
  derivarEstados,
  diferencaDeAtributos,
  ehRuido,
  impressaoDigital,
  lerEstadosDoBundle,
  limparHtmlDeEstado,
  podarEstadosJaVivos,
} from './estados.js';

const estado = (parcial: Partial<StoredState> & { id: string; html: string }): StoredState => ({
  trigger: 'click',
  label: 'estado capturado',
  method: 'swap-html',
  ...parcial,
});

const contador = (): (() => string) => {
  let n = 0;
  return () => {
    n += 1;
    return `orb-${n}`;
  };
};

const derivar = (
  corpo: string,
  estados: StoredState[],
  copia?: Record<string, { rotulo?: string; texto?: string }>,
  nomes: string[] = [],
) =>
  derivarEstados({
    pecaId: 'cmp_teste',
    corpo,
    estados,
    copiaPorEstado: new Map(Object.entries(copia ?? {})),
    nomesDaOrigem: nomes,
    proximaAncora: contador(),
  });

// ───────────────────────────── Limpeza ──────────────────────────────────────

test('1. a instrumentação da captura não faz o estado parecer diferente', () => {
  // Medido: `data-dsx2`/`data-dsx-scroll` aparecem em 100/100 estados, e o
  // index.html do bundle JÁ os teve limpos. Sem o passo 3 da limpeza, todo
  // estado do acervo pareceria um delta.
  const corpo = '<div class="a"><span class="b">oi</span></div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a" data-dsx2="101"><span class="b" data-dsx-scroll="22">oi</span></div>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'sem-delta');
  assert.equal(r.corpo, corpo, 'nada foi marcado');
  assert.equal(r.templates, '');
});

test('2. script embutido no estado nunca chega à página', () => {
  const corpo = '<div class="a"><button class="b">ok</button></div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a aberto"><script>alert(1)</script><button class="b">ok</button></div>',
    }),
  ]);
  const tudo = r.corpo + r.templates + JSON.stringify(r.derivados);
  assert.ok(!tudo.includes('<script'), 'nada de script');
  assert.ok(!tudo.includes('alert(1)'));
});

test('3. limparHtmlDeEstado tira script, on* e data-dsx*', () => {
  const limpo = limparHtmlDeEstado(
    '<div data-dsx2="9" onmouseover="f()" class="x"><!-- nota --><script src="a.js"></script>oi</div>',
  );
  assert.ok(!limpo.includes('data-dsx2'));
  assert.ok(!limpo.includes('onmouseover'));
  assert.ok(!limpo.includes('script'));
  assert.ok(!limpo.includes('nota'));
  assert.ok(limpo.includes('class="x"'));
});

// ───────────────────────────── Ancoragem ────────────────────────────────────

test('4. cinco chevrons idênticos dão AMBÍGUO, não o primeiro', () => {
  // O caso real do FAQ: 4 estados de chevron `<svg>` e 5 chevrons idênticos no
  // corpo. Escolher o primeiro é chute, e chute aqui é clique errado.
  const item = '<div class="linha"><svg class="ch" viewBox="0 0 24 24"></svg></div>';
  const corpo = `<section>${item.repeat(5)}</section>`;
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<svg class="ch girado" viewBox="0 0 24 24"></svg>' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'ambiguo');
  assert.ok(!r.corpo.includes('data-orbis-ancora'));
});

test('5. acharAncoras acha por impressão digital estável', () => {
  const corpo = '<ul><li data-k="a">um</li><li data-k="b">dois</li></ul>';
  const alvo = impressaoDigital('<li data-k="b" class="ativo">', 'dois');
  const achados = acharAncoras(corpo, alvo);
  assert.equal(achados.length, 1, 'a classe é instável e não entra na impressão');
});

test('6. o elemento que sumiu do corpo dá NÃO ACHADO', () => {
  const r = derivar('<div class="a">oi</div>', [
    estado({ id: 'st_1', html: '<aside class="b">outro</aside>' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'nao-achado');
});

test('7. o analisador não entra em script nem style', () => {
  const els = analisar('<div><script>var a = 1 < 2;</script><b>x</b></div>');
  assert.deepEqual(
    els.map((e) => e.nome),
    ['div', 'script', 'b'],
  );
});

// ─────────────────────────── Diferença e ruído ──────────────────────────────

test('8. id, href e name nunca entram no delta', () => {
  // `id` é maquinaria: o script do carrossel usa getElementById('active-card').
  const d = diferencaDeAtributos(
    '<div id="a" href="/x" name="n" class="c">',
    '<div id="b" href="/y" name="m" class="d">',
  );
  assert.deepEqual(Object.keys(d), ['class']);
});

test('9. N2 subpixel: width 24 para 25 é ruído', () => {
  assert.equal(ehRuido('width', '24', '25'), true);
  assert.equal(ehRuido('width', '24', '48'), false);
  assert.equal(ehRuido('style', 'width:18px', 'width:19px'), true);
});

test('10. N3 coordenada de mouse dentro do gradiente é ruído', () => {
  assert.equal(
    ehRuido(
      'style',
      'background:radial-gradient(400px at 32px 99.5px, #fff, #000)',
      'background:radial-gradient(400px at 157px 153.5px, #fff, #000)',
    ),
    true,
  );
});

test('11. N4 cor equivalente é ruído, alfa diferente é delta', () => {
  assert.equal(ehRuido('style', 'color:#e8e6e3', 'color:rgb(232, 230, 227)'), true);
  assert.equal(ehRuido('style', 'color:rgba(0,0,0,0.5)', 'color:rgb(0,0,0)'), false);
});

test('12. N5 asset equivalente: URL remota que é o MESMO arquivo local é ruído', () => {
  assert.equal(
    ehRuido(
      'src',
      'assets/image/59aa4679bd568a7f.png',
      'https://ds.asimov.academy/x/59aa4679bd568a7f_7a47bb.png',
    ),
    true,
  );
});

test('13. N6 glitch de texto não vira delta', () => {
  assert.equal(ehRuido('#texto', 'Aerea', 'AereN'), true);
  assert.equal(ehRuido('#texto', 'Ver os planos', 'Fechar'), false);
});

// ──────────────────────────── Risco 1: asset remoto ─────────────────────────

test('14. URL de outra empresa que NÃO casa com asset local derruba o estado', () => {
  const corpo = '<div class="a"><img src="assets/cmp_x/foto.png" alt=""></div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a"><img src="https://ds.asimov.academy/outra/coisa.png" alt=""></div>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'asset-remoto');
  assert.match(r.derivados[0]?.motivo ?? '', /ds\.asimov\.academy/);
  assert.ok(!r.corpo.includes('asimov'));
  assert.ok(!r.templates.includes('asimov'));
});

test('15. nenhuma string emitida contém "://"', () => {
  const corpo = '<div class="a"><button class="b">ok</button></div>';
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<div class="a aberta"><button class="b">ok</button></div>' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'ligado');
  assert.ok(!(r.corpo + r.templates).includes('://'));
});

test('16. foto JÁ trocada pela mídia do projeto não é reposta por clique', () => {
  // A troca de fotos roda imediatamente antes deste ponto no pipeline: quando
  // ela acontece, o src deixa de começar por `assets/`. Repor a foto da outra
  // empresa num clique furaria a S2 por um caminho novo.
  const corpo = '<div class="a"><img src="midia/hero.webp" alt=""></div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a"><img src="assets/cmp_x/foto-da-origem.png" alt=""></div>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'sem-delta');
  assert.match(r.derivados[0]?.motivo ?? '', /já foi trocada/);
});

// ───────────────────────────── Travas ───────────────────────────────────────

test('17. <details> com delta só de open é JÁ NATIVO', () => {
  // A maior família informativa do acervo. Ligar um handler por cima abriria e
  // fecharia no mesmo clique.
  const corpo = '<details class="g"><summary class="s">Pergunta</summary><p>Resposta</p></details>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<details class="g" open=""><summary class="s">Pergunta</summary><p>Resposta</p></details>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'ja-nativo');
  assert.equal(r.templates, '');
});

test('18. link de navegação não vira gatilho', () => {
  const corpo = '<div class="a"><a href="#hero" class="l">ir</a></div>';
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<div class="a viva"><a href="#hero" class="l">ir</a></div>' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'sem-gatilho');
});

test('19. a página não ganha id nenhum, e as alças são todas distintas', () => {
  const corpo =
    '<div class="a"><button class="b">um</button></div><div class="c"><button class="d">dois</button></div>';
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<div class="a on"><button class="b">um</button></div>' }),
    estado({ id: 'st_2', html: '<div class="c on"><button class="d">dois</button></div>' }),
  ]);
  assert.equal(r.corpo.match(/\bid="/g), null, 'nenhum id novo');
  const alcas = [...r.corpo.matchAll(/data-orbis-ancora="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(alcas).size, alcas.length, 'alças distintas');
  assert.equal(r.derivados.filter((d) => d.veredito === 'ligado').length, 2);
});

test('20. o portal é declarado e não consumido', () => {
  const corpo = '<div class="a">x</div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a">x</div>',
      hasPortal: true,
      portalHtml: '<div class="modal">oi</div>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'portal');
  assert.ok(!r.templates.includes('modal'));
});

test('21. htmlRef não resolvido não é chutado', () => {
  const r = derivar('<div class="a">x</div>', [
    estado({ id: 'st_1', html: '', htmlRef: 'states/st_1-escopo.html' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'nao-achado');
});

// ───────────────────────────── Texto ────────────────────────────────────────

test('22. delta de TEXTO sem o criativo cai, e o texto da origem não viaja', () => {
  const corpo = '<div class="a"><button class="b">Ver mais</button></div>';
  const r = derivar(corpo, [
    estado({
      id: 'st_1',
      html: '<div class="a"><button class="b">Ver menos da Asimov</button></div>',
    }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'precisa-texto');
  assert.equal(r.templates, '');
  assert.ok(!r.corpo.includes('Asimov'));
});

test('23. com o texto do criativo, o estado liga e o texto novo vai no template', () => {
  const corpo = '<div class="a"><button class="b">Ver mais</button></div>';
  const r = derivar(
    corpo,
    [estado({ id: 'st_1', html: '<div class="a"><button class="b">Ver menos</button></div>' })],
    { st_1: { texto: 'Mostrar menos' } },
  );
  assert.equal(r.derivados[0]?.veredito, 'ligado');
  assert.match(r.templates, /data-orbis-copia="orb-\d+"/);
  assert.ok(r.templates.includes('Mostrar menos'));
});

test('24. criativo que escreve o nome da empresa de origem é RECUSADO, não consertado', () => {
  const corpo = '<div class="a"><button class="b">Ver mais</button></div>';
  const r = derivar(
    corpo,
    [estado({ id: 'st_1', html: '<div class="a"><button class="b">Ver menos</button></div>' })],
    { st_1: { texto: 'Ver menos da Asimov' } },
    ['Asimov'],
  );
  assert.equal(r.derivados[0]?.veredito, 'texto-da-origem');
  assert.equal(r.templates, '');
});

// ───────────────────────────── Poda ─────────────────────────────────────────

test('25. o script da origem que já liga o clique poda o fio', () => {
  const corpo = '<div class="a"><button class="filtro-item">um</button></div>';
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<div class="a on"><button class="filtro-item">um</button></div>' }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'ligado');
  const podado = podarEstadosJaVivos({
    html: r.corpo + r.templates,
    derivados: r.derivados,
    scriptsLocais: [
      "document.querySelectorAll('.filtro-item').forEach(function(b){b.addEventListener('click',f)})",
    ],
  });
  assert.deepEqual(podado.podados, ['st_1']);
  assert.equal(podado.derivados[0]?.veredito, 'ja-tem-script');
  assert.ok(!podado.html.includes('data-orbis-gatilho'));
  assert.ok(!podado.html.includes('<template data-orbis-estado'));
});

test('26. script que não casa com o gatilho não poda nada', () => {
  const corpo = '<div class="a"><button class="filtro-item">um</button></div>';
  const r = derivar(corpo, [
    estado({ id: 'st_1', html: '<div class="a on"><button class="filtro-item">um</button></div>' }),
  ]);
  const podado = podarEstadosJaVivos({
    html: r.corpo + r.templates,
    derivados: r.derivados,
    scriptsLocais: ["document.querySelector('.carousel').addEventListener('click',f)"],
  });
  assert.deepEqual(podado.podados, []);
  assert.equal(podado.derivados[0]?.veredito, 'ligado');
});

// ───────────────────────────── Leitura e teto ───────────────────────────────

test('27. bundle sem states.json é silêncio, states.json inválido é aviso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'estados-'));
  assert.deepEqual(lerEstadosDoBundle(dir), { estados: [], aviso: null });
  writeFileSync(join(dir, 'states.json'), '{"segmentId":"errado"}', 'utf8');
  const lido = lerEstadosDoBundle(dir);
  assert.deepEqual(lido.estados, []);
  assert.match(lido.aviso ?? '', /schema/);
  writeFileSync(
    join(dir, 'states.json'),
    JSON.stringify({
      segmentId: 'seg_1',
      generatedAt: 1,
      states: [{ id: 'st_1', trigger: 'click', label: 'x', html: '<b>a</b>' }],
    }),
    'utf8',
  );
  assert.equal(lerEstadosDoBundle(dir).estados.length, 1);
});

test('28. o teto de 12 estados por peça vale', () => {
  const linhas = Array.from(
    { length: 14 },
    (_, i) => `<div class="c${i}"><button class="b${i}">${i}</button></div>`,
  ).join('');
  const estados = Array.from({ length: 14 }, (_, i) =>
    estado({
      id: `st_${i}`,
      html: `<div class="c${i} on"><button class="b${i}">${i}</button></div>`,
    }),
  );
  const r = derivar(linhas, estados);
  assert.equal(r.derivados.filter((d) => d.veredito === 'ligado').length, 12);
  assert.equal(r.derivados.filter((d) => d.veredito === 'excedeu').length, 2);
});

test('29. redesenho de mais de 8 elementos é estrutura diferente, não delta', () => {
  const filhos = Array.from({ length: 10 }, (_, i) => `<span class="s${i}">x</span>`).join('');
  const filhosOn = Array.from({ length: 10 }, (_, i) => `<span class="s${i} on">x</span>`).join('');
  const r = derivar(`<div class="a"><button class="b">t</button>${filhos}</div>`, [
    estado({ id: 'st_1', html: `<div class="a"><button class="b">t</button>${filhosOn}</div>` }),
  ]);
  assert.equal(r.derivados[0]?.veredito, 'estrutura-diferente');
});

test('30. o CSS e o script do alternador não trazem endereço nem travessão', () => {
  const tudo = CSS_DO_ALTERNADOR + SCRIPT_DO_ALTERNADOR;
  assert.ok(!tudo.includes('://'));
  assert.ok(!tudo.includes('—'), 'texto de tela sem travessão');
  assert.match(SCRIPT_DO_ALTERNADOR, /data-orbis-ancora/);
});

test('32. o script do alternador é JavaScript válido', () => {
  // Ele viaja como texto e só falha no navegador de quem recebeu o site: um
  // erro de sintaxe aqui só apareceria no cliente. O parser fecha essa porta.
  const miolo = /<script>([\s\S]*)<\/script>/.exec(SCRIPT_DO_ALTERNADOR)?.[1] ?? '';
  assert.ok(miolo.length > 0);
  assert.doesNotThrow(() => new Function(miolo));
});

test('31. o aviso conta os ligados e nomeia os que ficaram de fora', () => {
  const avisos = avisosDosEstados([
    {
      pecaId: 'c',
      estadoId: 'st_1',
      rotuloDaCaptura: 'menu aberto',
      veredito: 'ligado',
      motivo: 'ok',
    },
    {
      pecaId: 'c',
      estadoId: 'st_2',
      rotuloDaCaptura: 'chevron',
      veredito: 'ambiguo',
      motivo: 'dois iguais',
    },
    {
      pecaId: 'c',
      estadoId: 'st_3',
      rotuloDaCaptura: 'faq',
      veredito: 'sem-delta',
      motivo: 'ruído',
    },
  ]);
  assert.equal(avisos.length, 2, 'sem-delta é rotina e fica só no JSON');
  assert.match(avisos[0] ?? '', /1 estado/);
  assert.match(avisos[1] ?? '', /st_2/);
  assert.ok(!avisos.join('').includes('—'), 'texto de tela sem travessão');
});
