import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ElementDescriptor } from '@ds/explorer';
import type { PaginaV2 } from '../browser/page.js';
import type { RawAssinaturaEstado } from '../mapper/raw.js';
import type { Candidato } from './candidates.js';
import { assinaturaDoEstado, construirGrafoDeEstados, houveMudanca } from './state-graph.js';

/**
 * Estes testes existem por causa do defeito mais silencioso do V1: ele desfazia a
 * interação com `mouse.move(0,0)` + `Escape` e **seguia sem conferir**. Provar que
 * o V2 confere exige simular uma página que NÃO fecha o modal — e isso não precisa
 * de Chromium, precisa de uma `PaginaV2` falsa. É exatamente por isso que a
 * interface existe.
 */

const desc = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
  ref: '0',
  tag: 'button',
  role: null,
  type: null,
  href: null,
  text: 'Abrir',
  ariaLabel: null,
  classes: [],
  id: null,
  tabindex: null,
  cursor: 'pointer',
  hasListeners: true,
  listenerTypes: ['click'],
  disabled: false,
  ariaExpanded: null,
  ariaHaspopup: null,
  ariaControls: null,
  download: false,
  targetBlank: false,
  box: { x: 0, y: 0, w: 100, h: 40 },
  inViewport: true,
  dataAttrs: {},
  ...over,
});

const cand = (over: Partial<Candidato> = {}): Candidato => ({
  hash: 'h1',
  descriptor: desc(),
  score: 10,
  evidencias: ['<button>'],
  acoes: ['abrir-modal'],
  barradas: [],
  ...over,
});

const assinatura = (over: Partial<RawAssinaturaEstado> = {}): RawAssinaturaEstado => ({
  htmlHash: 'base',
  htmlBytes: 10_000,
  nodeCount: 100,
  htmlClasses: '',
  bodyClasses: '',
  bodyStyle: '',
  overflow: 'visible',
  overlays: [],
  expandidos: 0,
  selecionados: 0,
  detalhesAbertos: 0,
  focado: '',
  scrollY: 0,
  scrollX: 0,
  ...over,
});

/** Página falsa: registra as operações e responde ao que o grafo pergunta. */
type Simulacao = {
  /** Estado interno visível pela assinatura. */
  estado: RawAssinaturaEstado;
  /** Log de operações, na ordem. */
  log: string[];
};

const paginaFalsa = (
  sim: Simulacao,
  ganchos: {
    aoClicar?: (sim: Simulacao) => void;
    aoEscape?: (sim: Simulacao) => void;
    aoCliqueFora?: (sim: Simulacao) => void;
    /** Torna o elemento inalcançável (simula estar coberto). */
    inalcancavel?: boolean;
  } = {},
): PaginaV2 => ({
  evaluate: async <T>(expr: string): Promise<T> => {
    if (expr.includes('scrollIntoView')) {
      sim.log.push('centro');
      return (
        ganchos.inalcancavel === true
          ? {
              x: 50,
              y: 20,
              box: { x: 0, y: 0, w: 100, h: 40 },
              dentroDaViewport: true,
              alcancavel: false,
              pointerEvents: 'auto',
              scrollY: 0,
            }
          : {
              x: 50,
              y: 20,
              box: { x: 0, y: 0, w: 100, h: 40 },
              dentroDaViewport: true,
              alcancavel: true,
              pointerEvents: 'auto',
              scrollY: 0,
            }
      ) as T;
    }
    if (expr.includes('preventScroll')) {
      sim.log.push('focar');
      return true as T;
    }
    if (expr.includes('activeElement') && expr.includes('blur')) {
      sim.log.push('blur');
      return true as T;
    }
    if (expr.includes('outerHTML') && !expr.includes('role="dialog"')) {
      return '<div>escopo</div>' as T;
    }
    if (expr.includes('role="dialog"')) {
      return (sim.estado.overlays.length > 0 ? '<div role="dialog">modal</div>' : '') as T;
    }
    return null as T;
  },
  screenshot: async () => new Uint8Array([1, 2, 3]),
  mouse: {
    move: async (x) => {
      sim.log.push(x > 1000 ? 'mover-neutro' : 'mover');
    },
    click: async (x, y) => {
      // Clique no canto inferior direito é o "clique fora" da restauração.
      if (x > 1000 && y > 600) {
        sim.log.push('clique-fora');
        ganchos.aoCliqueFora?.(sim);
        return;
      }
      sim.log.push('clique');
      ganchos.aoClicar?.(sim);
    },
    down: async () => {},
    up: async () => {},
  },
  keyboard: {
    press: async (t) => {
      sim.log.push(`tecla:${t}`);
      if (t === 'Escape') ganchos.aoEscape?.(sim);
    },
  },
  esperar: async () => {},
  viewport: () => ({ width: 1440, height: 900 }),
  url: () => 'https://exemplo.test/',
});

// ── Assinatura e mudança ────────────────────────────────────────────────────

test('a assinatura ignora o scroll — rolar não é trocar de estado', () => {
  const a = assinaturaDoEstado(assinatura({ scrollY: 0 }));
  const b = assinaturaDoEstado(assinatura({ scrollY: 3000 }));
  assert.equal(a, b);
});

test('a assinatura muda com overlay, aria-expanded, classe do body e overflow', () => {
  const base = assinaturaDoEstado(assinatura());
  const comOverlay = assinaturaDoEstado(
    assinatura({
      overlays: [{ ref: '3', tag: 'div', classes: 'modal', box: { x: 0, y: 0, w: 600, h: 400 } }],
    }),
  );
  assert.notEqual(base, comOverlay);
  assert.notEqual(base, assinaturaDoEstado(assinatura({ expandidos: 1 })));
  assert.notEqual(base, assinaturaDoEstado(assinatura({ bodyClasses: 'modal-open' })));
  assert.notEqual(base, assinaturaDoEstado(assinatura({ overflow: 'hidden' })));
});

test('a assinatura não muda com a ORDEM dos overlays', () => {
  const o1 = { ref: '1', tag: 'div', classes: 'a', box: { x: 0, y: 0, w: 10, h: 10 } };
  const o2 = { ref: '2', tag: 'div', classes: 'b', box: { x: 0, y: 0, w: 20, h: 20 } };
  assert.equal(
    assinaturaDoEstado(assinatura({ overlays: [o1, o2] })),
    assinaturaDoEstado(assinatura({ overlays: [o2, o1] })),
  );
});

test('variação mínima de HTML não conta como estado novo — contador não é interação', () => {
  const antes = assinatura({ htmlHash: 'a', htmlBytes: 100_000 });
  const depois = assinatura({ htmlHash: 'b', htmlBytes: 100_050 });
  assert.equal(houveMudanca(antes, depois).mudou, false);
});

test('<details open> conta como estado — accordion nativo sem ARIA', () => {
  const antes = assinatura({ detalhesAbertos: 0 });
  const depois = assinatura({ detalhesAbertos: 1 });
  const r = houveMudanca(antes, depois);
  assert.equal(r.mudou, true, 'o accordion nativo é a forma mais comum em site institucional');
  assert.ok(r.motivos.some((m) => /<details>/.test(m)));
  assert.notEqual(assinaturaDoEstado(antes), assinaturaDoEstado(depois));
});

test('overlay aparecendo é sempre mudança, com motivo', () => {
  const r = houveMudanca(
    assinatura(),
    assinatura({
      overlays: [{ ref: '1', tag: 'div', classes: 'modal', box: { x: 0, y: 0, w: 600, h: 400 } }],
    }),
  );
  assert.equal(r.mudou, true);
  assert.ok(r.motivos.includes('overlay apareceu'));
});

// ── Ciclo completo ──────────────────────────────────────────────────────────

test('modal que abre e fecha: estado registrado, aresta reversível, restaurado', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  let aberto = false;
  const page = paginaFalsa(sim, {
    aoClicar: (s) => {
      aberto = !aberto;
      s.estado = assinatura({
        overlays: aberto
          ? [{ ref: '9', tag: 'div', classes: 'modal', box: { x: 0, y: 0, w: 600, h: 400 } }]
          : [],
        overflow: aberto ? 'hidden' : 'visible',
      });
    },
    aoEscape: (s) => {
      aberto = false;
      s.estado = assinatura();
    },
  });

  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    maxDepth: 1,
  });

  assert.equal(r.grafo.nodes.length, 2, 'inicial + modal aberto');
  assert.equal(r.grafo.nodes[1]?.label, 'modal aberto');
  assert.equal(r.grafo.edges.length, 1);
  assert.equal(r.grafo.edges[0]?.reversible, true);
  assert.equal(r.grafo.edges[0]?.kind, 'abrir-modal');
  assert.equal(r.acoes[0]?.hadEffect, true);
  assert.equal(r.acoes[0]?.restored, true);
  assert.equal(r.contaminado, false);
  assert.deepEqual(r.limitacoes, []);
});

test('modal que NÃO fecha: contaminação admitida, aresta não reversível', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, {
    // Abre e nunca mais fecha: nem Escape, nem clique fora, nem clique de novo.
    aoClicar: (s) => {
      s.estado = assinatura({
        overlays: [{ ref: '9', tag: 'div', classes: 'modal', box: { x: 0, y: 0, w: 600, h: 400 } }],
        overflow: 'hidden',
      });
    },
  });

  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    maxDepth: 1,
  });

  assert.equal(r.contaminado, true, 'o motor precisa ADMITIR que não voltou');
  assert.equal(r.acoes[0]?.restored, false);
  assert.equal(r.grafo.edges[0]?.reversible, false);
  assert.ok(
    r.limitacoes.some((l) => /não pôde ser desfeita/.test(l)),
    `limitações: ${r.limitacoes.join(' | ')}`,
  );
  // E a evidência precisa dizer o que foi TENTADO, não só que falhou.
  const ev = r.acoes[0]?.restoreEvidence ?? [];
  assert.ok(ev.includes('Escape'));
  assert.ok(ev.includes('clique fora'));
});

test('quando há como reestabelecer, a contaminação é resolvida em vez de admitida', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, {
    aoClicar: (s) => {
      s.estado = assinatura({
        overlays: [{ ref: '9', tag: 'div', classes: 'modal', box: { x: 0, y: 0, w: 600, h: 400 } }],
      });
    },
  });

  let recargas = 0;
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    maxDepth: 1,
    reestabelecer: async () => {
      recargas++;
      sim.estado = assinatura();
      return true;
    },
  });

  assert.equal(recargas, 1, 'a recarga é o único reset de verdade — usada uma vez');
  assert.equal(r.contaminado, false);
  assert.equal(r.acoes[0]?.restored, true);
  assert.ok(r.acoes[0]?.restoreEvidence.includes('página reestabelecida'));
});

test('elemento coberto por outro não é clicado — clicar erraria o alvo', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, { inalcancavel: true });

  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    maxDepth: 1,
  });

  assert.equal(r.grafo.nodes.length, 1, 'nenhum estado novo');
  assert.equal(r.acoes[0]?.hadEffect, false);
  assert.ok(
    r.acoes[0]?.restoreEvidence.some((e) => /coberto por outro/.test(e)),
    `evidência: ${r.acoes[0]?.restoreEvidence.join(' | ')}`,
  );
  assert.ok(!sim.log.includes('clique'), 'não deve haver clique nenhum');
});

test('ação sem efeito não cria nó nem aresta', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, { aoClicar: () => {} });
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    maxDepth: 1,
  });
  assert.equal(r.grafo.nodes.length, 1);
  assert.equal(r.grafo.edges.length, 0);
  assert.equal(r.acoes[0]?.hadEffect, false);
});

test('estado repetido é deduplicado; voltar a um ancestral conta como ciclo', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  let aberto = false;
  const page = paginaFalsa(sim, {
    aoClicar: (s) => {
      aberto = !aberto;
      s.estado = aberto
        ? assinatura({
            overlays: [{ ref: '9', tag: 'div', classes: 'm', box: { x: 0, y: 0, w: 600, h: 400 } }],
          })
        : assinatura();
    },
    aoEscape: (s) => {
      aberto = false;
      s.estado = assinatura();
    },
  });

  // Dois candidatos que levam ao MESMO estado: o segundo deve deduplicar.
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand({ hash: 'a' }), cand({ hash: 'b', descriptor: desc({ ref: '1' }) })],
    maxDepth: 1,
  });

  assert.equal(r.grafo.nodes.length, 2, 'o segundo caminho não cria um nó igual');
  assert.equal(r.grafo.deduped, 1);
  assert.equal(r.grafo.edges.length, 2, 'mas as duas transições ficam registradas');
});

test('os tetos param a busca e marcam truncado', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  let n = 0;
  const page = paginaFalsa(sim, {
    aoClicar: (s) => {
      n++;
      s.estado = assinatura({ htmlHash: `h${n}`, htmlBytes: 10_000 + n * 5_000 });
    },
    aoEscape: (s) => {
      s.estado = assinatura();
    },
  });
  const candidatos = Array.from({ length: 10 }, (_, i) =>
    cand({ hash: `h${i}`, descriptor: desc({ ref: String(i) }) }),
  );
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos,
    maxDepth: 1,
    maxActions: 3,
  });
  assert.equal(r.grafo.truncated, true);
  assert.ok(r.acoes.length <= 3);
  assert.deepEqual(r.grafo.limits, { maxDepth: 1, maxStates: 40, maxActions: 3 });
});

test('AbortSignal já abortado encerra sem executar ação nenhuma', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, { aoClicar: () => {} });
  const ac = new AbortController();
  ac.abort();
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    signal: ac.signal,
  });
  assert.equal(r.acoes.length, 0);
  assert.equal(r.grafo.truncated, true);
  assert.equal(r.grafo.nodes.length, 1, 'o estado inicial sempre existe');
});

test('ações barradas são registradas mesmo sem a exploração chegar nelas', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim);
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [
      cand({
        acoes: [],
        barradas: [{ acao: 'abrir-modal', motivo: 'compra' }],
        descriptor: desc({ text: 'Comprar agora' }),
      }),
    ],
  });
  assert.equal(r.bloqueadas.length, 1);
  assert.equal(r.bloqueadas[0]?.reason, 'compra');
  assert.ok(r.bloqueadas[0]?.target.includes('Comprar agora'));
});

test('hover não gera nó de estado — hover é reação, não estado', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim);
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand({ acoes: ['hover'] })],
  });
  assert.equal(r.acoes.length, 0, 'só hover: nada a explorar aqui');
  assert.equal(r.grafo.nodes.length, 1);
});

test('o HTML e o portal do estado vão para o sink, não para o manifesto', async () => {
  const sim: Simulacao = { estado: assinatura(), log: [] };
  const page = paginaFalsa(sim, {
    aoClicar: (s) => {
      s.estado = assinatura({
        overlays: [{ ref: '9', tag: 'div', classes: 'm', box: { x: 0, y: 0, w: 600, h: 400 } }],
      });
    },
    aoEscape: (s) => {
      s.estado = assinatura();
    },
  });
  const gravados: string[] = [];
  const r = await construirGrafoDeEstados(page, async () => sim.estado, {
    candidatos: [cand()],
    sinkHtml: (nome, html) => {
      gravados.push(`${nome}:${html.length}`);
      return `states/${nome}`;
    },
    sinkFrame: (nome) => `frames/${nome}`,
  });
  assert.equal(r.grafo.nodes[1]?.htmlRef, 'states/st_1-escopo.html');
  assert.equal(r.grafo.nodes[1]?.portalHtmlRef, 'states/st_1-portal.html');
  assert.ok(r.grafo.nodes[1]?.frameRef?.startsWith('frames/st_1-'));
  assert.equal(gravados.length, 2);
});
