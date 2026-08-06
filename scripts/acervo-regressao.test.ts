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
import { getRoot } from '@ds/shared';

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
