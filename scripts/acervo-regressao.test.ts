/**
 * Regressão sobre o ACERVO REAL, não sobre fixtures.
 *
 * Os 121 testes sintéticos do motor passavam com todos os defeitos que a
 * auditoria encontrou no acervo, porque montavam os cenários à mão e nenhum
 * reproduzia o dado real. Este arquivo usa as capturas de verdade como suíte:
 * cada conserto de fase ganha aqui a asserção que teria pego o defeito.
 *
 * Roda só onde o acervo existe (a máquina do dono). Num runner limpo, pula
 * declarando o motivo: pular calado leria como cobertura.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cssDaOrigem, medirBundle } from '@ds/generator';
import { type StructuralNode, type VisualLayer, getRoot } from '@ds/shared';

/**
 * O manifesto da captura, na FORMA QUE ESTE TESTE LÊ.
 *
 * `JSON.parse` devolve `any`, e `any` apaga a conferência de tipo de tudo o que
 * encosta nele: os callbacks abaixo saíam com parâmetro implícito e o
 * `subtreeTextLength` era lido de um `{}` sem ninguém reclamar. Um teste que
 * afirma coisas sobre um objeto sem tipo afirma sobre `any`.
 *
 * A forma é a MÍNIMA que este arquivo usa, e não o schema inteiro de propósito:
 * um espelho completo do contrato envelheceria em silêncio ao lado dele. Os
 * tipos que importam vêm do contrato, então mudar `VisualLayer` ou
 * `StructuralNode` quebra este teste — que é o que se quer.
 */
type ManifestoLido = {
  structuralMap?: StructuralNode[];
  visualLayers?: VisualLayer[];
  viewport?: { width: number; height: number };
  pageHeight?: number;
  mediaDetections?: { fingerprint: { hash: string } }[];
};

const raiz = getRoot();
const vault = join(raiz, 'vault');
const temAcervo = existsSync(vault) && readdirSync(vault).some((n) => n.startsWith('ds_'));

const sites = temAcervo ? readdirSync(vault).filter((n) => n.startsWith('ds_')) : [];

test('fase 0: a retenção medida no acervo real nunca passa de 100', { skip: !temAcervo }, () => {
  let medidos = 0;
  for (const ds of sites) {
    const bundles = join(vault, ds, 'segments', 'bundles');
    const assets = join(vault, ds, 'capture-v2', 'assets');
    if (!existsSync(bundles) || !existsSync(assets)) continue;
    for (const seg of readdirSync(bundles).filter((n) => n.startsWith('seg_'))) {
      const m = medirBundle(join(bundles, seg), { dirAssetsCaptura: assets });
      if (m === null || m.retencao === null) continue;
      medidos++;
      assert.ok(
        m.retencao <= 100,
        `${ds}/${seg}: retenção ${m.retencao}% é aritmética, não fidelidade`,
      );
    }
  }
  assert.ok(medidos > 0, 'o acervo existe mas nenhum bundle pôde ser medido');
});

test(
  'fase 0: as cópias .orig.css não entram no denominador do acervo',
  { skip: !temAcervo },
  () => {
    let conferidos = 0;
    for (const ds of sites) {
      const assets = join(vault, ds, 'capture-v2', 'assets');
      const dirCss = join(assets, 'css');
      if (!existsSync(dirCss)) continue;
      const nomes = readdirSync(dirCss).filter((n) => n.endsWith('.css'));
      const origs = nomes.filter((n) => n.endsWith('.orig.css'));
      if (origs.length === 0) continue;
      conferidos++;
      // O denominador tem de ser exatamente o texto das folhas SEM as cópias.
      // Se as cópias voltarem a contar, os bytes dobram e a igualdade quebra.
      const soDeVerdade = nomes
        .filter((n) => !n.endsWith('.orig.css'))
        .map((n) => `\n${readFileSync(join(dirCss, n), 'utf8')}`)
        .join('');
      const denominador = cssDaOrigem({ dirAssetsCaptura: assets });
      assert.equal(
        denominador.length,
        soDeVerdade.length,
        `${ds}: o denominador conta ${denominador.length} bytes; as folhas sem cópia somam ${soDeVerdade.length}`,
      );
    }
    assert.ok(conferidos > 0, 'nenhum site do acervo tem cópias .orig.css para conferir');
  },
);

test(
  'fase 0: toda captura do acervo tem a stack gravada no banco',
  { skip: !temAcervo },
  async () => {
    const { getDb, tables } = await import('@ds/indexer');
    const linhas = getDb()
      .select({ id: tables.designSystems.id, stackJson: tables.designSystems.stackJson })
      .from(tables.designSystems)
      .all();
    assert.ok(linhas.length > 0, 'o banco do acervo está vazio');
    for (const l of linhas) {
      assert.notEqual(
        l.stackJson,
        null,
        `${l.id}: stack_json NULL — o fio do stack voltou a ser cortado (rode pnpm stack:backfill)`,
      );
    }
  },
);

// ── Fase 3: invariantes de segmentação sobre os manifests REAIS ─────────────
//
// As funções de escolha são puras: rodam sobre o structuralMap/visualLayers
// gravados sem abrir navegador. Foi assim que a auditoria achou os defeitos, e
// é assim que eles não voltam.

test(
  'fase 3: nenhuma camada de página do acervo é local ou cheia de texto',
  { skip: !temAcervo },
  async () => {
    const { escolherCamadasDePagina } = await import('@ds/engine-v2');
    let conferidas = 0;
    for (const ds of sites) {
      const mPath = join(vault, ds, 'capture-v2', 'manifest.json');
      if (!existsSync(mPath)) continue;
      const m = JSON.parse(readFileSync(mPath, 'utf8')) as ManifestoLido;
      const nos = m.structuralMap ?? [];
      const porHash = new Map(nos.map((n) => [n.fingerprint.hash, n]));
      const r = escolherCamadasDePagina({
        camadas: m.visualLayers ?? [],
        nos,
        viewport: m.viewport ?? { width: 1440, height: 900 },
        pageHeight: m.pageHeight ?? 0,
        hashesComRuntime: new Set((m.mediaDetections ?? []).map((x) => x.fingerprint.hash)),
      });
      for (const h of [...r.comRuntime, ...r.soCss]) {
        conferidas++;
        const camada = (m.visualLayers ?? []).find((c) => c.fingerprint.hash === h);
        const no = porHash.get(h);
        const fixa = camada?.stacking?.position === 'fixed';
        const atravessa = (camada?.pageBox?.h ?? 0) >= (m.pageHeight ?? 0) * 0.7;
        assert.ok(fixa || atravessa, `${ds}: camada ${h.slice(0, 8)} não atravessa a página`);
        assert.ok(
          (no?.subtreeTextLength ?? 0) <= 40,
          `${ds}: camada ${h.slice(0, 8)} tem texto de conteúdo — é seção, não fundo`,
        );
      }
    }
    assert.ok(conferidas >= 0, 'invariante roda mesmo com zero camadas');
  },
);

test(
  'fase 3: nenhum <body>/<html> escolhido como seção nos manifests reais',
  { skip: !temAcervo },
  async () => {
    const { escolherSecoes } = await import('@ds/engine-v2');
    let sitesConferidos = 0;
    for (const ds of sites) {
      const mPath = join(vault, ds, 'capture-v2', 'manifest.json');
      if (!existsSync(mPath)) continue;
      sitesConferidos++;
      const m = JSON.parse(readFileSync(mPath, 'utf8'));
      const secoes = escolherSecoes(m.structuralMap ?? []);
      for (const s of secoes) {
        const tag = s.node.fingerprint.tag.toLowerCase();
        // Um <main> que é a PRIMEIRA DOBRA (hero de 720 px) é peça legítima; o
        // defeito era o main/body de página INTEIRA (98% da altura) duplicando
        // todos os outros segmentos.
        const atravessaAPagina =
          (s.pageBox?.h ?? 0) >= (m.pageHeight ?? Number.POSITIVE_INFINITY) * 0.7;
        assert.ok(
          !(['body', 'html', 'main'].includes(tag) && atravessaAPagina),
          `${ds}: <${tag}> de página inteira escolhido como peça (era o "pricing" de 23,8 KB do acervo)`,
        );
      }
    }
    assert.ok(sitesConferidos > 0);
  },
);

test(
  'fase 3: bytes de um segmento contidos em OUTRO segmento ficam abaixo de 5%',
  { skip: !temAcervo },
  async () => {
    // A medida da auditoria, agora como portão: 23% dos bytes dos segmentos-pai
    // estavam contidos no HTML de outro segmento (46% no pior site).
    const { getDb, tables } = await import('@ds/indexer');
    const linhas = getDb()
      .select({
        dsId: tables.segments.designSystemId,
        html: tables.segments.htmlSnippet,
        parentId: tables.segments.parentId,
      })
      .from(tables.segments)
      .all();
    const porSite = new Map();
    for (const l of linhas) {
      if (l.parentId !== null) continue;
      const lista = porSite.get(l.dsId) ?? [];
      lista.push(l.html);
      porSite.set(l.dsId, lista);
    }
    for (const [dsId, htmls] of porSite) {
      let total = 0;
      let contidos = 0;
      for (const h of htmls) {
        total += h.length;
        if (h.length < 40) continue;
        if (htmls.some((outro: string) => outro !== h && outro.includes(h))) contidos += h.length;
      }
      if (total === 0) continue;
      const fracao = contidos / total;
      assert.ok(
        fracao < 0.05,
        `${dsId}: ${(fracao * 100).toFixed(1)}% dos bytes duplicados entre segmentos (meta < 5%)`,
      );
    }
  },
);
