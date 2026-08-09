import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { montarPaginaDoKit } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  DEFAULT_PROJECT_BRANDING,
  ProjectLayout,
  ROLE_CATEGORIES,
  type SectionRole,
  libraryComponentBundleDir,
} from '@ds/shared';
import { conferirNoNavegador } from './conferir-site.js';
import { executadoDireto } from './executado-direto.js';

/**
 * A peça da Biblioteca conferida SOZINHA, recortada e composta.
 *
 * ## Por que não bastava o que já existia
 *
 * As regras da Galeria (G1..G9) leem o bundle por análise estática, e há defeito
 * que a análise estática não alcança porque ele só nasce no RECORTE:
 *
 * - a seção sai com **zero pixel** porque na origem aquele bloco era posicionado
 *   por um orquestrador de rolagem que não viajou;
 * - o texto fica **apagado para sempre** porque a opacidade inicial dependia de
 *   um driver (GSAP, scroll-timeline, um `--var` alimentado por script);
 * - o bloco **rola por dentro** porque na origem ele era a página inteira.
 *
 * O banco de prova dos kits mede isso — mas mede num SITE, e ali o defeito chega
 * misturado com os das outras peças. Medido nos 20 kits: 68 trechos apagados e
 * 20 seções colapsadas, e ao rastrear cada um até a peça de origem, **21 peças**
 * respondiam por tudo. Uma delas sozinha por 21 ocorrências.
 *
 * É a diferença entre "este kit reprovou" e "esta peça não empresta forma". A
 * primeira frase não diz o que fazer; a segunda é uma decisão de curadoria.
 *
 * ## O que se mede, e por que só isso
 *
 * Três regras, e todas do mesmo tipo: **conteúdo que existe e ninguém vê**.
 *
 * | regra | o que cobra |
 * |---|---|
 * | S13 | nenhum texto fica apagado |
 * | S14 | nenhuma seção colapsa |
 * | S18 | nada rola dentro da página |
 *
 * Contraste (S4) e alvo de toque (S15) ficam de fora de propósito: eles dependem
 * da PALETA e do dispositivo do site que vai usar a peça, e reprovar a peça por
 * eles seria julgá-la por uma decisão que ainda não foi tomada.
 */

export type ConferenciaDaPeca = {
  cmpId: string;
  nome: string;
  category: string;
  /** Códigos reprovados (S13, S14, S18). Vazio = a peça sobrevive ao recorte. */
  reprovou: string[];
  /** O motivo do pior veredito, para a pessoa entender sem abrir nada. */
  motivo: string;
  erro: string | null;
};

/** O papel de seção que aceita esta categoria — a peça precisa de um para entrar. */
export const papelParaCategoria = (category: string): SectionRole | undefined => {
  for (const [papel, cats] of Object.entries(ROLE_CATEGORIES)) {
    if (cats.includes(category)) return papel as SectionRole;
  }
  return undefined;
};

/** As regras que só o recorte revela. Ver o bloco no topo. */
const REGRAS_DO_RECORTE = ['S13', 'S14', 'S18'] as const;

export const conferirPeca = async (
  peca: { id: string; name: string; category: string; designSystemId: string },
  raiz: string,
): Promise<ConferenciaDaPeca> => {
  const base: ConferenciaDaPeca = {
    cmpId: peca.id,
    nome: peca.name,
    category: peca.category,
    reprovou: [],
    motivo: '',
    erro: null,
  };
  const papel = papelParaCategoria(peca.category);
  if (papel === undefined) {
    // Categoria que papel nenhum aceita (fundo, comportamento) nunca vira seção,
    // então o recorte não a alcança e reprová-la seria inventar defeito.
    return base;
  }
  const out = join(raiz, peca.id);
  try {
    montarPaginaDoKit({
      projectId: 'prj_conferencia',
      titulo: peca.name,
      kit: {
        id: 'kit_conferencia',
        components: [
          {
            id: peca.id,
            name: peca.name,
            category: peca.category,
            kind: 'component',
            bundlePath: libraryComponentBundleDir(peca.id as `cmp_${string}`),
            designSystemId: peca.designSystemId,
          },
        ],
      },
      layout: ProjectLayout.parse({
        preferDesignSystemId: peca.designSystemId,
        secoes: [{ id: 'sec_1', nome: peca.name, papel, componentIds: [peca.id] }],
      }),
      branding: DEFAULT_PROJECT_BRANDING,
      outputDir: out,
    });
  } catch (err) {
    return { ...base, erro: err instanceof Error ? err.message : String(err) };
  }

  try {
    const larguras = await conferirNoNavegador(out);
    const piores = new Map<string, string>();
    for (const l of larguras) {
      for (const v of l.aceite.vereditos) {
        if (v.estado !== 'reprovou') continue;
        if (!REGRAS_DO_RECORTE.includes(v.codigo as (typeof REGRAS_DO_RECORTE)[number])) continue;
        if (!piores.has(v.codigo)) piores.set(v.codigo, `${l.largura}px — ${v.motivo}`);
      }
    }
    return {
      ...base,
      reprovou: [...piores.keys()].sort(),
      motivo: [...piores.values()][0] ?? '',
    };
  } catch (err) {
    return { ...base, erro: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
};

export const conferirBiblioteca = async (opcoes: {
  apenas?: string[];
  aoTerminarUma?: (r: ConferenciaDaPeca, i: number, total: number) => void;
}): Promise<ConferenciaDaPeca[]> => {
  const db = getDb();
  const pecas = db
    .select()
    .from(tables.libraryComponents)
    .all()
    .filter((p) => opcoes.apenas === undefined || opcoes.apenas.includes(p.id));
  const raiz = mkdtempSync(join(tmpdir(), 'conferir-peca-'));
  const saida: ConferenciaDaPeca[] = [];
  try {
    for (const [i, p] of pecas.entries()) {
      const r = await conferirPeca(
        { id: p.id, name: p.name, category: p.category, designSystemId: p.designSystemId },
        raiz,
      );
      saida.push(r);
      opcoes.aoTerminarUma?.(r, i + 1, pecas.length);
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
  return saida;
};

const principal = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const apenas = argv.filter((a) => a.startsWith('cmp_'));
  console.log('\n  Conferindo a Biblioteca: cada peça é recortada e composta sozinha.\n');
  const rs = await conferirBiblioteca({
    apenas: apenas.length > 0 ? apenas : undefined,
    aoTerminarUma: (r, i, total) => {
      if (r.erro !== null) {
        console.log(`  ${i}/${total} ⚠ ${r.nome.slice(0, 44)} — ${r.erro.slice(0, 80)}`);
        return;
      }
      if (r.reprovou.length === 0) return;
      console.log(`  ${i}/${total} ✗ ${r.nome.slice(0, 44)} — ${r.reprovou.join(', ')}`);
    },
  });

  const ruins = rs.filter((r) => r.reprovou.length > 0);
  console.log(
    `\n  ── ${rs.length} peça(s) conferidas, ${ruins.length} não sobrevive(m) ao recorte ──\n`,
  );
  for (const r of ruins) {
    console.log(
      `  ${r.reprovou.join(',').padEnd(12)} ${r.category.padEnd(12)} ${r.nome.slice(0, 46)}`,
    );
    console.log(`    ${r.motivo.slice(0, 150)}`);
  }
  console.log(
    '\n  Peça que não sobrevive ao recorte é decisão de CURADORIA: ela não empresta forma.\n',
  );
};

if (executadoDireto(import.meta.url)) void principal();
