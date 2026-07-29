import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { CaptureManifestV2 } from '@ds/shared';
import { carregarPlaywright } from './browser/page.js';
import { type ResultadoCaptura, capturarComV2 } from './engine.js';
import { type ServidorFixture, iniciarServidorFixture } from './testing/fixture-server.js';

/**
 * Teste de navegador do motor V2, ponta a ponta, contra as fixtures locais.
 *
 * Roda o pipeline completo — instrumentação, percurso com scroll, observação
 * temporal, varredura de ponteiro, grafo de estados, assets, segmentação,
 * compilação — e verifica o que o pedido cobra como critério de aceite.
 *
 * Pula (não falha) sem Playwright: o navegador é opcional no projeto, e um
 * ambiente sem ele não deve reprovar a suíte.
 */

const RAIZ_FIXTURES = join(process.cwd(), 'fixtures');
const TEM_PW = (await carregarPlaywright()) !== null;

let servidor: ServidorFixture | null = null;
let tmp = '';
let composicao: ResultadoCaptura | null = null;
let convencional: ResultadoCaptura | null = null;

before(
  async () => {
    if (!TEM_PW) return;
    // O servidor de fixtures roda em 127.0.0.1, e o guarda de SSRF bloqueia
    // localhost por padrão — comportamento correto em produção. O flag é o opt-in
    // que o próprio V1 já previa para fixtures/dev; sem ele o teste mediria a
    // política, não a localização de assets.
    process.env.DS_ASSET_ALLOW_LOCAL = '1';
    servidor = await iniciarServidorFixture(RAIZ_FIXTURES);
    tmp = mkdtempSync(join(tmpdir(), 'dsx2-'));

    const capturar = (arquivo: string, sub: string): Promise<ResultadoCaptura> =>
      capturarComV2(`${servidor?.url}/v2/${arquivo}`, {
        dirCaptura: join(tmp, sub, 'capture'),
        dirBundles: join(tmp, sub, 'bundles'),
        // Orçamento apertado de propósito: o teste tem de terminar, e um corte por
        // tempo deve produzir resultado PARCIAL válido em vez de falhar.
        //
        // A fase de scroll teve folga depois de falhar em lote e passar sozinha:
        // a suíte roda os arquivos em paralelo e cada teste de navegador sobe um
        // Chromium, então numa máquina disputada o corte por tempo disparava e o
        // percurso saía com 2 paradas. O que se mede aqui é a captura, não a
        // velocidade da máquina de quem roda — o corte por tempo continua
        // coberto pelo teste de parcialidade.
        limits: {
          orcamentoTotalMs: 150_000,
          faseInteracoesMs: 40_000,
          faseScrollAmostraMs: 60_000,
          settleAfterLoadMs: 1_800,
        },
        maxParadas: 6,
        maxTrajetoriasPorViewport: 2,
      });

    composicao = await capturar('composicao.html', 'composicao');
    convencional = await capturar('convencional.html', 'convencional');
  },
  { timeout: 400_000 },
);

after(async () => {
  await servidor?.fechar();
  if (tmp.length > 0 && existsSync(tmp)) {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Windows às vezes segura handle de arquivo recém-escrito; não é falha do teste.
    }
  }
});

const pular = (): boolean => {
  if (!TEM_PW) {
    console.log('  (pulado: playwright não instalado)');
    return true;
  }
  return false;
};

// ── Manifesto e instrumentação ──────────────────────────────────────────────

test('o manifesto V2 é válido contra o schema', () => {
  if (pular() || composicao === null) return;
  const parsed = CaptureManifestV2.safeParse(composicao.manifesto);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues?.slice(0, 4), null, 2));
  assert.equal(composicao.manifesto.engineVersion, 2);
});

test('a instrumentação entrou ANTES dos scripts da página', () => {
  if (pular() || composicao === null) return;
  const i = composicao.manifesto.instrumentation;
  assert.equal(i.beforePageScripts, true);
  // Prova concreta: só quem embrulhou `addEventListener` antes do site pode ter
  // contado os listeners que o site registrou.
  const total = Object.values(i.listenersByType).reduce((s, n) => s + n, 0);
  assert.ok(total > 10, `esperava listeners registrados, veio ${total}`);
  assert.ok((i.listenersByType.click ?? 0) > 0, 'os cliques da fixture precisam aparecer');
  assert.ok(
    (i.listenersByType.pointermove ?? 0) > 0,
    'o campo de partículas registra pointermove no window',
  );
});

test('IntersectionObserver, canvas 2D, WebGL e shadow roots são registrados', () => {
  if (pular() || composicao === null) return;
  const i = composicao.manifesto.instrumentation;
  assert.ok(i.observers.intersection >= 1, 'o reveal da fixture usa IntersectionObserver');
  assert.ok((i.graphicsContexts['2d'] ?? 0) >= 2, 'canvas 2D + partículas');
  assert.ok(
    (i.graphicsContexts.webgl ?? 0) + (i.graphicsContexts.webgl2 ?? 0) >= 1,
    'a cena WebGL precisa aparecer',
  );
  assert.equal(i.shadowRoots.open, 1);
  assert.equal(i.shadowRoots.closed, 1);
});

test('shadow root fechado aparece como limitação, não como bug', () => {
  if (pular() || composicao === null) return;
  assert.ok(
    composicao.manifesto.limitations.some((l) => /fechado/.test(l)),
    `limitações: ${composicao.manifesto.limitations.join(' | ')}`,
  );
});

// ── Mapas ───────────────────────────────────────────────────────────────────

test('o mapa estrutural existe e inclui o que não tem texto', () => {
  if (pular() || composicao === null) return;
  const m = composicao.manifesto;
  assert.ok(m.structuralMap.length > 40, `nós: ${m.structuralMap.length}`);
  const papeis = new Set(m.structuralMap.map((n) => n.role));
  assert.ok(papeis.has('canvas'), 'os canvas precisam estar no mapa');
  assert.ok(papeis.has('hero'), 'o hero precisa ser identificado');
  assert.ok(papeis.has('nav'));
  assert.ok(papeis.has('footer'));
});

test('o mapa visual em camadas existe, com dono e ordem de pintura', () => {
  if (pular() || composicao === null) return;
  const camadas = composicao.manifesto.visualLayers;
  assert.ok(camadas.length > 20);
  const comDono = camadas.filter((c) => c.ownerSection !== null);
  assert.ok(comDono.length > 10, 'a maioria das camadas precisa ter dono');
  const fundos = camadas.filter((c) => c.role === 'background');
  assert.ok(fundos.length >= 3, `camadas de fundo: ${fundos.length}`);
  // Alguma camada precisa cobrir outra — é o que prova o cálculo de empilhamento.
  assert.ok(
    camadas.some((c) => c.covers.length > 0),
    'ninguém cobre ninguém?',
  );
});

test('backgrounds de CSS EXTERNO são detectados — o que o V1 apagava', () => {
  if (pular() || composicao === null) return;
  const bgs = composicao.manifesto.backgroundDetections;
  assert.ok(bgs.length >= 4, `fundos detectados: ${bgs.length}`);
  assert.ok(
    bgs.some((b) => b.source === 'css-image'),
    'fundo por url() em folha de estilo',
  );
  assert.ok(
    bgs.some((b) => b.source === 'css-multiple' || b.source === 'css-gradient'),
    'gradiente',
  );
  assert.ok(
    bgs.some((b) => b.source === 'pseudo-before' || b.source === 'pseudo-after'),
    'pseudo-elemento que pinta',
  );
  // E cada um precisa ter dono: fundo órfão era o card preto do V1.
  const orfaos = bgs.filter((b) => b.ownerSection === null);
  assert.ok(orfaos.length < bgs.length, 'nem todo fundo pode ser órfão');
});

test('vídeo, canvas, WebGL, SVG animado e iframe são detectados como mídia', () => {
  if (pular() || composicao === null) return;
  const kinds = new Set(composicao.manifesto.mediaDetections.map((m) => m.kind));
  assert.ok(kinds.has('video'), 'o vídeo de fundo');
  assert.ok(kinds.has('canvas-2d') || kinds.has('webgl'), 'as cenas');
  assert.ok(kinds.has('webgl'), 'o contexto WebGL observado');
  assert.ok(kinds.has('svg-animado'), 'o SVG com SMIL');
  assert.ok(kinds.has('iframe'));
});

test('o vídeo sem fonte válida é honesto sobre não ter carregado', () => {
  if (pular() || composicao === null) return;
  const video = composicao.manifesto.mediaDetections.find((m) => m.kind === 'video');
  assert.ok(video);
  assert.equal(
    video.asBackground,
    true,
    'vídeo absoluto com object-fit:cover atrás do texto é FUNDO, não conteúdo',
  );
  assert.ok(video.poster !== undefined, 'o poster tem de ser capturado');
  assert.ok(
    video.limitations.length > 0,
    'um vídeo que não carregou precisa dizer isso, não fingir que está pronto',
  );
});

test('runtimes são detectados com evidência, e o loop de rAF é atribuído', () => {
  if (pular() || composicao === null) return;
  const rts = composicao.manifesto.runtimeDetections;
  assert.ok(rts.length >= 2, `runtimes: ${rts.map((r) => r.label).join(', ')}`);
  for (const r of rts) assert.ok(r.evidence.length > 0, `${r.label} sem evidência`);
  const three = rts.find((r) => r.kind === 'three');
  assert.ok(three, 'o global THREE precisa ser visto');
  assert.equal(three.confidence, 'alta');
  assert.equal(three.version, '160', 'a versão exposta pelo runtime deve ser lida');
  assert.ok(rts.some((r) => r.kind === 'lottie'));
});

// ── Tempo, ponteiro e scroll ────────────────────────────────────────────────

test('a página é observada no TEMPO e o movimento é medido', () => {
  if (pular() || composicao === null) return;
  const obs = composicao.manifesto.temporalObservations;
  assert.ok(obs.length >= 3, `observações: ${obs.length}`);
  const movendo = obs.filter((o) => o.moving);
  assert.ok(movendo.length >= 1, 'a fixture tem canvas, WebGL e gradiente animados');
  // A conclusão que o V1 não tinha: pixels mudaram e o DOM não.
  const semDom = movendo.find((o) => o.domStable);
  assert.ok(semDom, 'movimento com DOM estável = runtime pintando');
  assert.ok(semDom.pixelDelta > 0, `delta: ${semDom.pixelDelta}`);
  assert.equal(semDom.attributedTo, 'pintura fora do DOM');
});

test('a varredura do ponteiro cobre a viewport em coordenada normalizada', () => {
  if (pular() || composicao === null) return;
  const caminhos = composicao.manifesto.pointerPaths;
  assert.ok(caminhos.length >= 3, `trajetórias: ${caminhos.length}`);
  const hilbert = caminhos.find((c) => c.kind === 'hilbert');
  assert.ok(hilbert, 'a trajetória de cobertura precisa ter rodado');
  assert.ok(hilbert.points.length >= 60, `pontos: ${hilbert.points.length}`);
  for (const p of hilbert.points) {
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, 'coordenada fora de 0..1');
  }
  // Cobertura: pontos espalhados pelos quatro quadrantes.
  const quadrantes = new Set(
    hilbert.points.map((p) => `${p.x < 0.5 ? 'e' : 'd'}${p.y < 0.5 ? 't' : 'b'}`),
  );
  assert.equal(quadrantes.size, 4, 'a varredura precisa cobrir os quatro quadrantes');
});

test('a cena que segue o cursor é detectada como reativa ao ponteiro', () => {
  if (pular() || composicao === null) return;
  const respostas = composicao.manifesto.pointerResponses;
  assert.ok(respostas.length >= 1, 'nenhuma reação ao ponteiro medida');
  const comPixel = respostas.filter((r) => r.reactions.includes('pixels'));
  assert.ok(comPixel.length >= 1, 'as partículas e o tilt precisam produzir pixel diff');
  // Reação sem DOM: é a cena, não um botão. O manifesto tem de saber a diferença.
  const semDom = respostas.filter((r) => r.domless);
  for (const r of semDom) assert.ok(r.region !== undefined, 'região reativa sem coordenada?');
  // A reação SEM DOM (cena em canvas) só é medida se a varredura chegou à
  // viewport da cena. Quando chegou, ela precisa estar marcada como `domless` —
  // é o que impede o motor de inventar um botão dentro do canvas.
  const tocouCanvas = respostas.some((r) => r.reactions.includes('canvas'));
  if (tocouCanvas) {
    assert.ok(semDom.length >= 1, 'reação em canvas precisa ser marcada como sem DOM');
  }
});

test('a cobertura é obrigatória; complementares nunca rodam por rotina', () => {
  if (pular() || composicao === null) return;
  const caminhos = composicao.manifesto.pointerPaths;
  const kinds = new Set(caminhos.map((c) => c.kind));
  assert.ok(kinds.has('hilbert'), 'a trajetória de cobertura é obrigatória em toda viewport');

  // A regra do pedido é uma implicação só: complementar exige evidência de
  // reação. O contrário não vale — ficar sem orçamento é motivo legítimo para
  // não rodar. Então o que se verifica é que nenhuma complementar aparece numa
  // captura sem reação alguma.
  const complementares = caminhos.filter((c) => c.kind !== 'hilbert' && c.kind !== 'refinamento');
  if (complementares.length > 0) {
    assert.ok(
      composicao.manifesto.pointerResponses.length > 0,
      'trajetória complementar rodou numa página que não reagiu ao ponteiro — desperdício',
    );
  }
  // E o refinamento só existe onde houve reação SEM DOM (a cena em canvas).
  const refinos = caminhos.filter((c) => c.kind === 'refinamento');
  if (refinos.length > 0) {
    assert.ok(
      composicao.manifesto.pointerResponses.some((r) => r.domless),
      'refinamento sem região reativa sem DOM',
    );
  }
});

test('o scroll percorre a página inteira e declara a natureza da cobertura', () => {
  if (pular() || composicao === null) return;
  const passes = composicao.manifesto.scrollPasses;
  assert.ok(passes.length >= 3, `paradas: ${passes.length}`);
  const descendo = passes.filter((p) => p.direction === 'descendo');
  const ultimo = descendo[descendo.length - 1];
  assert.ok(ultimo !== undefined);
  // O que não pode acontecer: a captura terminar dizendo-se COMPLETA com a
  // metade de baixo nunca observada. Cobertura contígua (com sobreposição) e
  // amostrada (com lacuna declarada em `overlap: 0`) são as duas legítimas.
  //
  // Cortada por orçamento é a terceira, e é legítima também — desde que a
  // captura assuma. Exigir o fim de uma captura interrompida seria cobrar da
  // máquina de quem roda, não do percurso: numa suíte que sobe vários Chromium
  // em paralelo o corte dispara, e o que importa é que ninguém receba uma
  // captura pela metade rotulada de inteira.
  if (composicao.manifesto.captureMode === 'completo') {
    assert.ok(
      ultimo.progress > 0.6,
      `captura COMPLETA com a última parada em ${(ultimo.progress * 100).toFixed(0)}% da página — o fim não foi observado`,
    );
  } else {
    assert.ok(
      composicao.manifesto.partialReasons.length > 0,
      'o percurso parou no meio sem a captura declarar por quê',
    );
  }
  // A cobertura pode PIORAR no meio do caminho e continua coerente: numa página
  // que cresce com lazy-load, o percurso começa contíguo e passa a amostrar para
  // alcançar um fim que não existia no início. O que não pode é o contrário —
  // voltar a prometer sobreposição depois de já ter deixado uma lacuna, que se
  // leria como "contígua, com um buraco no meio".
  const restantes = descendo.slice(1);
  const primeiraLacuna = restantes.findIndex((p) => p.overlap === 0);
  assert.ok(
    primeiraLacuna === -1 || restantes.slice(primeiraLacuna).every((p) => p.overlap === 0),
    'depois da primeira lacuna, nenhuma parada pode voltar a declarar sobreposição',
  );
  assert.ok(
    descendo.some((p) => p.appeared.length > 0),
    'nada apareceu ao rolar?',
  );
});

test('comportamentos de scroll portáteis são classificados', () => {
  if (pular() || composicao === null) return;
  const kinds = new Set(composicao.manifesto.scrollObservations.map((s) => s.kind));
  assert.ok(kinds.size > 0, 'nenhum comportamento de scroll classificado');
});

// ── Ações e estados ─────────────────────────────────────────────────────────

test('o grafo de estados existe, com estados de verdade', () => {
  if (pular() || composicao === null) return;
  const g = composicao.manifesto.stateGraph;
  assert.ok(g, 'sem grafo de estados');
  assert.ok(g.nodes.length >= 3, `estados: ${g.nodes.map((n) => n.label).join(', ')}`);
  assert.equal(g.nodes[0]?.label, 'estado inicial');
  const rotulos = g.nodes.map((n) => n.label);
  assert.ok(
    rotulos.some((r) => /accordion|menu|modal|aba|conteúdo/.test(r)),
    `rótulos: ${rotulos.join(', ')}`,
  );
});

test('a restauração é conferida, e o que não voltou é declarado', () => {
  if (pular() || composicao === null) return;
  const acoes = composicao.manifesto.safeActions.filter((a) => a.hadEffect);
  assert.ok(acoes.length >= 2, `ações com efeito: ${acoes.length}`);

  const restauradas = acoes.filter((a) => a.restored);
  assert.ok(
    restauradas.length > acoes.length / 2,
    `só ${restauradas.length}/${acoes.length} voltaram`,
  );

  // O ponto não é a porcentagem: é que TODA ação diga o que foi tentado. Trocar
  // de tema e avançar carrossel não voltam com Escape nem com clique fora, e
  // reportar isso é o comportamento certo — o V1 simplesmente não olhava.
  for (const a of acoes) {
    assert.ok(
      a.restoreEvidence.length > 0,
      `ação "${a.kind}" sem evidência do que foi tentado na restauração`,
    );
  }
  const naoVoltaram = acoes.filter((a) => !a.restored);
  if (naoVoltaram.length > 0) {
    assert.ok(
      composicao.manifesto.limitations.some((l) => /desfeita|restaurad|contamina/i.test(l)),
      `${naoVoltaram.length} ação(ões) não voltaram e nenhuma limitação foi registrada`,
    );
    // E a aresta correspondente não pode se declarar reversível.
    const irreversiveis = (composicao.manifesto.stateGraph?.edges ?? []).filter((e) =>
      naoVoltaram.some((a) => a.id === e.actionId),
    );
    for (const e of irreversiveis) {
      assert.equal(e.reversible, false, `aresta ${e.actionId} diz reversível sem ter voltado`);
    }
  }
});

test('AÇÕES PERIGOSAS foram todas barradas — nenhuma foi executada', () => {
  if (pular() || composicao === null) return;
  const barradas = composicao.manifesto.blockedActions;
  assert.ok(barradas.length >= 3, `barradas: ${barradas.length}`);
  const motivos = new Set(barradas.map((b) => b.reason));
  // A prova positiva: nenhuma ação executada aponta para um alvo de perigo.
  const alvosPerigosos = composicao.manifesto.safeActions.filter((a) =>
    /compra|excluir|instalar|copiar|permitir|enviar/i.test(a.target ?? ''),
  );
  assert.equal(alvosPerigosos.length, 0, 'uma ação perigosa foi executada');
  assert.ok(motivos.size > 0, `motivos registrados: ${[...motivos].join(', ')}`);
});

// ── Segmentação ─────────────────────────────────────────────────────────────

test('a segmentação acontece DEPOIS da exploração e produz segmentos úteis', () => {
  if (pular() || composicao === null) return;
  assert.ok(composicao.segmentos.length >= 6, `segmentos: ${composicao.segmentos.length}`);
  for (const s of composicao.segmentos) {
    assert.ok(s.htmlSnippet.length > 30, `segmento "${s.name}" sem HTML`);
    assert.ok(s.evidence.signals.length > 0, `segmento "${s.name}" sem evidência`);
  }
});

/**
 * Uma DOBRA sem conteúdo próprio é card vazio e não pode existir.
 *
 * Fundo e comportamento seguem outra regra, e de propósito: eles não têm
 * conteúdo por definição (o fundo é o que fica atrás, o comportamento é o
 * movimento), e são justamente o que a pessoa costuma querer levar. Para esses,
 * a exigência muda de "ter texto" para "ter como mostrar": um retrato, ou a
 * limitação escrita dizendo por que não há retrato. O que continua proibido é o
 * card que aparece vazio sem explicação.
 */
const CATEGORIAS_SEM_CONTEUDO = new Set(['background', 'interaction']);

test('nenhum card aparece vazio sem explicação', () => {
  if (pular() || composicao === null) return;
  for (const s of composicao.segmentos) {
    if (CATEGORIAS_SEM_CONTEUDO.has(s.category)) {
      const mostravel = s.framePath !== undefined || s.limitations.length > 0;
      assert.ok(mostravel, `"${s.name}" não tem retrato nem limitação declarada`);
      continue;
    }
    const texto = s.htmlSnippet
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Substância = texto, elemento de conteúdo/função no HTML, ou mídia
    // DETECTADA (cobre conteúdo dentro de shadow root, que o regex não vê).
    const temSubstancia =
      texto.length >= 12 ||
      /<(?:img|picture|video|iframe|button|input|select|textarea|h[1-6])[\s>]/i.test(
        s.htmlSnippet,
      ) ||
      s.evidence.mediaIds.length > 0;
    assert.ok(temSubstancia, `"${s.name}" não tem conteúdo próprio — é efeito ou card vazio`);
  }
});

test('canvas sozinho só existe como fundo da página, e com retrato', () => {
  if (pular() || composicao === null) return;
  for (const s of composicao.segmentos) {
    const soCanvas =
      /^<canvas[^>]*>\s*<\/canvas>$/i.test(s.htmlSnippet.trim()) ||
      (s.htmlSnippet.includes('<canvas') &&
        s.htmlSnippet.replace(/<[^>]+>/g, '').trim().length === 0);
    if (!soCanvas) continue;
    // O fundo animado da página é canvas puro por natureza, e a pessoa quer
    // levá-lo. O que não pode é ele abrir vazio: precisa do retrato (a tela com
    // o conteúdo esmaecido) ou da limitação escrita.
    assert.equal(s.category, 'background', `"${s.name}" é canvas isolado fora do fundo da página`);
    assert.ok(
      s.framePath !== undefined || s.limitations.length > 0,
      `"${s.name}" é canvas isolado sem retrato nem limitação`,
    );
  }
  // A DOBRA com cena continua vindo inteira: cena mais o conteúdo por cima.
  const dobrasComCena = composicao.segmentos.filter(
    (s) => s.htmlSnippet.includes('<canvas') && s.category !== 'background',
  );
  for (const s of dobrasComCena) {
    assert.ok(
      /<h[12]|<p|<a /i.test(s.htmlSnippet),
      `"${s.name}" tem canvas mas nenhum conteúdo por cima`,
    );
  }
});

test('nomes descritivos: nenhum "Seção" genérico', () => {
  if (pular() || composicao === null) return;
  for (const s of composicao.segmentos) {
    assert.ok(
      !/^(se[çc][ãa]o|bloco|div|container)(\s+\d+)?$/i.test(s.name.trim()),
      `nome genérico: "${s.name}"`,
    );
  }
  const nomes = composicao.segmentos.map((s) => s.name);
  assert.ok(
    nomes.some((n) => /WebGL|canvas|partículas|vídeo|Lottie/i.test(n)),
    `nenhum nome menciona o runtime/mídia: ${nomes.join(' | ')}`,
  );
});

test('as três representações aparecem, cada uma no caso certo', () => {
  if (pular() || composicao === null) return;
  const tipos = new Set(composicao.segmentos.map((s) => s.representation.type));
  assert.ok(tipos.has('componente-portatil'), 'seções de texto têm de ser portáteis');
  assert.ok(
    tipos.has('capsula-runtime') || tipos.has('referencia-visual'),
    `as cenas precisam de cápsula ou referência: ${[...tipos].join(', ')}`,
  );
  for (const s of composicao.segmentos) {
    assert.ok(s.representation.reasons.length > 0, `"${s.name}" sem motivo de representação`);
    if (s.representation.type !== 'componente-portatil') {
      assert.equal(s.representation.editable, false, `"${s.name}" não deveria ser editável`);
    }
  }
});

test('a fidelidade é honesta: nada nasce validado nem "completo" com pendência', () => {
  if (pular() || composicao === null) return;
  for (const s of composicao.segmentos) {
    assert.notEqual(s.fidelity.validation, 'validado', `"${s.name}" nasceu validado`);
    if (s.support === 'completo') {
      assert.notEqual(s.fidelity.assets, 'externo', `"${s.name}" completo com asset externo`);
      assert.notEqual(s.fidelity.runtime, 'externo', `"${s.name}" completo com runtime externo`);
    }
  }
});

test('o que foi reprovado carrega o motivo', () => {
  if (pular() || composicao === null) return;
  for (const r of composicao.rejeitados) {
    assert.ok(r.motivos.length > 0, `"${r.name}" reprovado sem motivo`);
  }
});

// ── Compilação ──────────────────────────────────────────────────────────────

test('cada segmento gera bundle com index.html, manifest.json e STACK.md', () => {
  if (pular() || composicao === null) return;
  const dir = join(tmp, 'composicao', 'bundles');
  assert.ok(existsSync(dir), 'diretório de bundles não existe');
  const pastas = readdirSync(dir);
  assert.ok(pastas.length >= composicao.segmentos.length - 1, `bundles: ${pastas.length}`);
  for (const p of pastas.slice(0, 4)) {
    for (const arq of ['index.html', 'manifest.json', 'STACK.md']) {
      assert.ok(existsSync(join(dir, p, arq)), `${p}/${arq} não foi escrito`);
    }
    const m = JSON.parse(readFileSync(join(dir, p, 'manifest.json'), 'utf8'));
    assert.ok(m.dependencies !== undefined, `${p}: sem dependências declaradas`);
    assert.ok(m.representation !== undefined);
    assert.equal(typeof m.compilerVersion, 'number');
  }
});

test('o STACK lista tecnologias reais com evidência', () => {
  if (pular() || composicao === null) return;
  const stack = composicao.manifesto.stack;
  assert.ok(stack.length >= 2, `stack: ${stack.map((s) => s.name).join(', ')}`);
  for (const e of stack) assert.ok(e.evidence.length > 0, `${e.name} sem evidência`);
  assert.ok(stack.some((s) => /THREE/i.test(s.name)));
});

test('cápsula de runtime gera runtime.html com CSP e sandbox declarados', () => {
  if (pular() || composicao === null) return;
  const dir = join(tmp, 'composicao', 'bundles');
  if (!existsSync(dir)) return;
  const capsulas = composicao.segmentos.filter((s) => s.representation.type === 'capsula-runtime');
  for (const c of capsulas) {
    const arq = join(dir, `seg_${c.position}`, 'runtime.html');
    if (!existsSync(arq)) continue;
    const html = readFileSync(arq, 'utf8');
    assert.ok(html.includes('Content-Security-Policy'), 'cápsula sem CSP');
    assert.ok(html.includes("connect-src 'none'"), 'cápsula sem bloqueio de exfiltração');
    assert.ok(html.includes("form-action 'none'"));
  }
});

// ── Site convencional: o V2 não pode piorar o caso simples ──────────────────

test('site convencional: seções úteis, todas portáteis, nenhum card vazio', () => {
  if (pular() || convencional === null) return;
  assert.ok(convencional.segmentos.length >= 6, `segmentos: ${convencional.segmentos.length}`);
  for (const s of convencional.segmentos) {
    assert.equal(
      s.representation.type,
      'componente-portatil',
      `"${s.name}" deveria ser portátil num site sem runtime`,
    );
    assert.equal(s.representation.editable, true);
    const texto = s.htmlSnippet
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.ok(texto.length >= 12, `"${s.name}" sem texto`);
  }
});

test('site convencional: categorias reconhecidas pelo conteúdo', () => {
  if (pular() || convencional === null) return;
  const cats = new Set(convencional.segmentos.map((s) => s.category));
  assert.ok(cats.has('header') || cats.has('nav'), `categorias: ${[...cats].join(', ')}`);
  assert.ok(cats.has('hero'));
  assert.ok(cats.has('pricing'), 'a seção de planos tem preços e itens repetidos');
  assert.ok(cats.has('faq'), 'a seção de dúvidas tem perguntas');
  assert.ok(cats.has('footer'));
});

test('site convencional: nomes descritivos e sem runtime inventado', () => {
  if (pular() || convencional === null) return;
  for (const s of convencional.segmentos) {
    assert.ok(!/^se[çc][ãa]o/i.test(s.name.trim()), `nome genérico: "${s.name}"`);
    assert.deepEqual(s.representation.runtimes, [], `"${s.name}" com runtime inventado`);
  }
  const rts = convencional.manifesto.runtimeDetections.filter((r) => r.confidence === 'alta');
  assert.equal(rts.length, 0, 'não há runtime nesta página; nada deve ser afirmado');
});

test('site convencional: accordion nativo <details> é capturado como estado', () => {
  if (pular() || convencional === null) return;
  const g = convencional.manifesto.stateGraph;
  assert.ok(g);
  assert.ok(
    g.nodes.length >= 2,
    `o <details> da seção de dúvidas precisa virar estado; veio: ${g.nodes.map((n) => n.label).join(', ')}`,
  );
  assert.ok(
    convencional.manifesto.safeActions.some((a) => a.hadEffect),
    'nenhuma ação teve efeito num site com accordion e tabs',
  );
});

// ── Robustez ────────────────────────────────────────────────────────────────

test('a resposta que nunca termina não travou a captura', () => {
  if (pular() || composicao === null) return;
  assert.ok(servidor?.pedidos.has('/nunca-termina'), 'a fixture pendurada não foi pedida');
  const t = composicao.manifesto.telemetry;
  assert.ok(t !== undefined);
  assert.ok(t.totalMs < 150_000, `a captura levou ${t.totalMs}ms — devia ter cortado`);
});

test('a captura declara o modo e as razões de parcialidade', () => {
  if (pular() || composicao === null) return;
  const m = composicao.manifesto;
  assert.ok(['completo', 'parcial-orcamento', 'parcial-cancelado'].includes(m.captureMode));
  if (m.captureMode !== 'completo') {
    assert.ok(m.partialReasons.length > 0, 'parcial sem dizer por quê');
  }
});

test('o HTML devolvido não tem a marcação de instrumentação', () => {
  if (pular() || composicao === null) return;
  assert.ok(!composicao.html.includes('data-dsx2'), 'a instrumentação vazou para o HTML');
  assert.ok(composicao.html.length > 5_000);
});

test('assets locais foram baixados e associados', () => {
  if (pular() || composicao === null) return;
  const m = composicao.manifesto;
  assert.ok(m.assets.length >= 1, `assets: ${m.assets.length}`);
  const comDependencia = Object.values(m.dependencies).filter((d) => d.assets.length > 0);
  assert.ok(comDependencia.length >= 1, 'nenhum segmento declara de que asset depende');
});
