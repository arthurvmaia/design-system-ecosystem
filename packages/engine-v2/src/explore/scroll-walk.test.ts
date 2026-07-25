import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaginaV2 } from '../browser/page.js';
import { SOBREPOSICAO_PADRAO, percorrerComScroll, posicoesDeParada } from './scroll-walk.js';

/** Página falsa com scroll: responde ao `ROLAR_PARA_FN` e cresce por lazy-load. */
const paginaComScroll = (opts: {
  pageHeight: number;
  viewportHeight?: number;
  /** Altura extra que "carrega" a cada parada (lazy-load). */
  crescePorParada?: number;
  /** Simula body travado: rolar não move nada. */
  travado?: boolean;
}): { page: PaginaV2; posicoes: number[] } => {
  const vh = opts.viewportHeight ?? 900;
  let altura = opts.pageHeight;
  let y = 0;
  const posicoes: number[] = [];
  const page: PaginaV2 = {
    evaluate: async <T>(expr: string): Promise<T> => {
      if (expr.includes('scrollTo')) {
        const alvo = Number(/\((\d+)\)\s*$/.exec(expr.trim())?.[1] ?? '0');
        if (opts.travado !== true) y = Math.min(alvo, Math.max(0, altura - vh));
        if (opts.crescePorParada !== undefined) altura += opts.crescePorParada;
        posicoes.push(y);
        return { scrollY: y, pageHeight: altura, viewportHeight: vh } as T;
      }
      return null as T;
    },
    screenshot: async () => new Uint8Array(),
    mouse: {
      move: async () => {},
      click: async () => {},
      down: async () => {},
      up: async () => {},
    },
    keyboard: { press: async () => {} },
    esperar: async () => {},
    viewport: () => ({ width: 1440, height: vh }),
    url: () => 'https://exemplo.test/',
  };
  return { page, posicoes };
};

const trabalhoVazio = async (): Promise<{
  visible: string[];
  appeared: string[];
  temporalIds: string[];
  pointerPathIds: string[];
  assetsLoaded: string[];
}> => ({ visible: [], appeared: [], temporalIds: [], pointerPathIds: [], assetsLoaded: [] });

// ── Sobreposição (puro) ─────────────────────────────────────────────────────

test('as paradas se sobrepõem em 20–30% da viewport, como o pedido exige', () => {
  const vh = 900;
  const pos = posicoesDeParada(5000, vh);
  assert.equal(pos[0], 0);
  for (let i = 1; i < pos.length; i++) {
    const passo = (pos[i] as number) - (pos[i - 1] as number);
    // A última parada é clampada ao fim da página e pode ter passo menor.
    if (i < pos.length - 1) {
      const sobreposicaoReal = 1 - passo / vh;
      assert.ok(
        sobreposicaoReal >= 0.2 && sobreposicaoReal <= 0.3,
        `parada ${i}: sobreposição ${(sobreposicaoReal * 100).toFixed(0)}% fora de 20–30%`,
      );
    }
  }
});

test('a última parada mostra o fim da página, sem passar dele', () => {
  const pos = posicoesDeParada(5000, 900);
  assert.equal(pos[pos.length - 1], 5000 - 900);
});

test('página menor que a viewport tem uma parada só', () => {
  assert.deepEqual(posicoesDeParada(500, 900), [0]);
});

test('o teto de paradas é respeitado (página infinita não gira sem fim)', () => {
  assert.equal(posicoesDeParada(1_000_000, 900, SOBREPOSICAO_PADRAO, 5).length, 5);
});

test('página mais alta que o teto permite é AMOSTRADA de ponta a ponta, não só no topo', () => {
  const vh = 900;
  // 18 viewports de página, orçamento para 6 paradas: percorrer contiguamente
  // cobriria 4 mil dos 16 mil pixels e a metade de baixo nunca seria observada.
  const pos = posicoesDeParada(vh * 18, vh, SOBREPOSICAO_PADRAO, 6);
  assert.equal(pos.length, 6);
  assert.equal(pos[0], 0, 'começa no topo');
  const ultimo = pos[pos.length - 1] as number;
  assert.ok(
    ultimo >= vh * 17 - vh,
    `a última parada (${ultimo}) precisa alcançar o fim da página (${vh * 17})`,
  );
  // E os passos são maiores que a viewport: há lacuna, e o percurso declara isso
  // em `overlap: 0` para o consumidor não supor cobertura contígua.
  const passo = (pos[1] as number) - (pos[0] as number);
  assert.ok(passo > vh, `passo ${passo} deveria exceder a viewport na amostragem`);
});

// ── Percurso (com página falsa) ──────────────────────────────────────────────

test('o percurso registra uma parada por viewport, com progresso crescente', async () => {
  const { page } = paginaComScroll({ pageHeight: 4500 });
  const passes = await percorrerComScroll(page, { trabalho: trabalhoVazio, ascendente: false });
  const descendo = passes.filter((p) => p.direction === 'descendo');
  assert.ok(descendo.length >= 5, `esperava >=5 paradas, veio ${descendo.length}`);
  for (let i = 1; i < descendo.length; i++) {
    assert.ok(
      (descendo[i]?.progress ?? 0) >= (descendo[i - 1]?.progress ?? 0),
      'o progresso deve crescer na descida',
    );
  }
  assert.equal(descendo[0]?.overlap, 0, 'a primeira parada não sobrepõe nada');
  assert.equal(descendo[1]?.overlap, SOBREPOSICAO_PADRAO);
});

test('`appeared` marca o que ficou visível AGORA, sem repetir', async () => {
  const { page } = paginaComScroll({ pageHeight: 3000 });
  let n = 0;
  const passes = await percorrerComScroll(page, {
    ascendente: false,
    trabalho: async () => {
      n++;
      // O mesmo "a" aparece em todas; "b1", "b2"… são novos a cada parada.
      return {
        visible: ['a', `b${n}`],
        appeared: [],
        temporalIds: [],
        pointerPathIds: [],
        assetsLoaded: [],
      };
    },
  });
  assert.deepEqual(passes[0]?.appeared, ['a', 'b1']);
  assert.deepEqual(passes[1]?.appeared, ['b2'], '"a" já tinha sido visto');
});

test('a passagem ascendente roda e é resumida', async () => {
  const { page } = paginaComScroll({ pageHeight: 9000 });
  const passes = await percorrerComScroll(page, {
    trabalho: trabalhoVazio,
    maxParadasAscendente: 3,
  });
  const subindo = passes.filter((p) => p.direction === 'subindo');
  const descendo = passes.filter((p) => p.direction === 'descendo');
  assert.equal(subindo.length, 3);
  assert.ok(subindo.length < descendo.length, 'a subida é resumida, não um espelho da descida');
  // A subida começa embaixo e termina no topo.
  assert.ok((subindo[0]?.scrollY ?? 0) > (subindo[subindo.length - 1]?.scrollY ?? 1));
});

test('body travado não gira sem fim — o percurso encerra por não avançar', async () => {
  const { page } = paginaComScroll({ pageHeight: 20_000, travado: true });
  const passes = await percorrerComScroll(page, { trabalho: trabalhoVazio, ascendente: false });
  assert.ok(passes.length <= 2, `esperava encerrar rápido, veio ${passes.length} paradas`);
});

test('lazy-load que aumenta a página é acompanhado, sob o teto de paradas', async () => {
  const { page } = paginaComScroll({ pageHeight: 3000, crescePorParada: 900 });
  const passes = await percorrerComScroll(page, {
    trabalho: trabalhoVazio,
    ascendente: false,
    maxParadas: 6,
  });
  assert.equal(passes.length, 6, 'a página cresceu, o percurso acompanhou até o teto');
  // A altura relida a cada parada é o que permite isso: com um total fixo, o
  // percurso teria parado na terceira.
  assert.ok((passes[5]?.scrollY ?? 0) > 3000 - 900);
});

test('AbortSignal encerra o percurso e preserva o que já foi registrado', async () => {
  const { page } = paginaComScroll({ pageHeight: 20_000 });
  const ac = new AbortController();
  let n = 0;
  const passes = await percorrerComScroll(page, {
    signal: ac.signal,
    ascendente: false,
    trabalho: async () => {
      n++;
      if (n === 3) ac.abort();
      return trabalhoVazio();
    },
  });
  assert.equal(passes.length, 3, 'as três paradas feitas ficam; nada é descartado');
});

test('o trabalho recebe o contexto da parada (scroll, progresso, direção, altura)', async () => {
  const { page } = paginaComScroll({ pageHeight: 2700 });
  const contextos: string[] = [];
  await percorrerComScroll(page, {
    ascendente: false,
    trabalho: async (ctx) => {
      contextos.push(`${ctx.indice}:${ctx.scrollY}:${ctx.direcao}:${ctx.pageHeight}`);
      return trabalhoVazio();
    },
  });
  assert.equal(contextos[0], '0:0:descendo:2700');
  assert.ok(contextos[1]?.startsWith('1:675:descendo'), `veio ${contextos[1]}`);
});
