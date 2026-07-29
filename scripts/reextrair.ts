/**
 * Re-captura um design system que já está no acervo, no MESMO `ds_id`.
 *
 * Uso:
 *   pnpm reextrair <ds_id>          # um site
 *   pnpm reextrair --todos          # o acervo inteiro
 *   pnpm reextrair --todos --continuar   # retoma, pulando o que já foi refeito
 *   pnpm reextrair <ds_id> --seco   # só diz o que faria
 *
 * Por que existe: as correções do motor valem para captura NOVA. Um bundle
 * antigo aponta para o site de origem — scripts e imagens — e perde o conteúdo
 * no dia em que aquele endereço mudar. Só reabrindo a página é que ele passa a
 * carregar as bibliotecas e as fotos dentro de si.
 *
 * Duas garantias, e as duas importam:
 *
 * **O id não muda.** Kits e projetos referenciam `ds_...`; gerar um id novo
 * transformaria uma atualização numa duplicata, e o que a pessoa já montou
 * apontaria para a versão velha.
 *
 * **A troca é atômica.** A captura escreve num diretório temporário e só entra
 * no lugar do antigo quando termina inteira. Uma captura que falhe no meio —
 * rede caindo, orçamento estourando, site fora do ar — não pode deixar o design
 * system num estado que não é nem o de antes nem o de depois. O anterior fica
 * guardado em `*.anterior/` até você conferir.
 *
 * A triagem da Galeria daquele site é refeita: os segmentos são novos. As peças
 * já promovidas para a Biblioteca sobrevivem, porque são cópias autônomas.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { capturarComV2, persistirCapturaV2 } from '@ds/engine-v2';
import { getDb, runMigrations, tables } from '@ds/indexer';
import {
  type DesignSystemId,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultDir,
  vaultDsDir,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { segmentarEIndexar } from './segmentar.js';

type Relato = {
  dsId: string;
  url: string;
  ok: boolean;
  erro?: string;
  antes: { segmentos: number };
  depois: { segmentos: number; iconesInline: number; iconesVazios: number; scriptsLocais: number };
  modo: string;
  limitacoes: string[];
};

/** A URL que originou o design system, lida da captura anterior. */
const urlDoDs = (dsId: DesignSystemId): string | null => {
  const p = vaultCaptureV2Manifest(dsId);
  if (existsSync(p)) {
    try {
      const m = JSON.parse(readFileSync(p, 'utf8')) as {
        source?: { finalUrl?: unknown; url?: unknown };
      };
      const u = m.source?.finalUrl ?? m.source?.url;
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
    } catch {
      // manifesto ilegível: cai para o banco
    }
  }
  try {
    const row = getDb()
      .select()
      .from(tables.designSystems)
      .where(eq(tables.designSystems.id, dsId))
      .get();
    const u = row?.sourceUrl;
    return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
  } catch {
    return null;
  }
};

/** Quantos segmentos o design system tem hoje. */
const segmentosDe = (dsId: DesignSystemId): number => {
  try {
    return getDb()
      .select()
      .from(tables.segments)
      .where(eq(tables.segments.designSystemId, dsId))
      .all().length;
  } catch {
    return 0;
  }
};

/** Guarda o diretório atual como `.anterior`, substituindo o guardado antes. */
const arquivar = (dir: string): void => {
  if (!existsSync(dir)) return;
  const anterior = `${dir}.anterior`;
  rmSync(anterior, { recursive: true, force: true });
  renameSync(dir, anterior);
};

/** Conta o que saiu nos bundles novos — é o relatório que interessa. */
const medirBundles = (
  dirBundles: string,
): { iconesInline: number; iconesVazios: number; scriptsLocais: number } => {
  let inline = 0;
  let vazios = 0;
  let locais = 0;
  if (!existsSync(dirBundles)) return { iconesInline: 0, iconesVazios: 0, scriptsLocais: 0 };
  for (const pasta of readdirSync(dirBundles)) {
    const p = join(dirBundles, pasta, 'index.html');
    if (!existsSync(p)) continue;
    const h = readFileSync(p, 'utf8');
    inline += (h.match(/data-ds-icone="inline"/g) ?? []).length;
    vazios += (h.match(/data-ds-icone="nao-desenhado"/g) ?? []).length;
    locais += (h.match(/<script[^>]+src="assets\//g) ?? []).length;
  }
  return { iconesInline: inline, iconesVazios: vazios, scriptsLocais: locais };
};

export const reextrair = async (dsId: DesignSystemId, seco: boolean): Promise<Relato> => {
  const url = urlDoDs(dsId);
  const antes = { segmentos: segmentosDe(dsId) };
  const base: Relato = {
    dsId,
    url: url ?? '',
    ok: false,
    antes,
    depois: { segmentos: 0, iconesInline: 0, iconesVazios: 0, scriptsLocais: 0 },
    modo: '',
    limitacoes: [],
  };

  if (url === null) {
    return { ...base, erro: 'sem URL de origem (HTML colado ou manifesto ilegível)' };
  }
  // Sem linha no banco não há o que atualizar: o insert dos segmentos exige a
  // chave estrangeira, e falharia DEPOIS da captura — gastando minutos para
  // terminar em erro. Melhor recusar antes de abrir o navegador.
  const noBanco = getDb()
    .select()
    .from(tables.designSystems)
    .where(eq(tables.designSystems.id, dsId))
    .get();
  if (noBanco === undefined) {
    return {
      ...base,
      erro: 'este design system não está no app (a pasta no vault é resíduo de uma extração apagada)',
    };
  }
  if (seco) return { ...base, ok: true, modo: 'ensaio' };

  // A captura escreve FORA do lugar definitivo. Só entra quando termina.
  const tmp = join(vaultDir(), '.tmp', `reextracao-${dsId}`);
  rmSync(tmp, { recursive: true, force: true });
  const tmpCaptura = join(tmp, 'capture-v2');
  const tmpBundles = join(tmp, 'bundles');

  try {
    const r = await capturarComV2(url, {
      dirCaptura: tmpCaptura,
      dirBundles: tmpBundles,
      // A conferência de pixel fica de fora: numa fila de 30 sites ela cobraria
      // o orçamento de cada captura para produzir um número que ninguém vai ler
      // no meio da fila. O `pnpm medir-fidelidade` mede tudo no fim, de graça.
      verificarVisual: false,
    });

    // ── A troca ──────────────────────────────────────────────────────────
    // Daqui para baixo é rápido e local. O que podia falhar (rede, orçamento,
    // navegador) já falhou lá em cima, sem tocar no que estava no lugar.
    arquivar(vaultCaptureV2Dir(dsId));
    arquivar(vaultSegmentBundlesDir(dsId));
    mkdirSync(dirname(vaultCaptureV2Dir(dsId)), { recursive: true });
    renameSync(tmpCaptura, vaultCaptureV2Dir(dsId));
    renameSync(tmpBundles, vaultSegmentBundlesDir(dsId));
    rmSync(tmp, { recursive: true, force: true });

    const extraido = join(vaultExtractedDir(dsId), 'design-system.html');
    mkdirSync(vaultExtractedDir(dsId), { recursive: true });
    writeFileSync(extraido, r.html, 'utf8');

    persistirCapturaV2(dsId, r);
    const { total } = segmentarEIndexar(dsId);

    return {
      ...base,
      ok: true,
      modo: r.manifesto.captureMode,
      depois: { segmentos: total, ...medirBundles(vaultSegmentBundlesDir(dsId)) },
      limitacoes: r.manifesto.limitations.slice(0, 3),
    };
  } catch (err) {
    // O antigo continua no lugar: nada foi movido antes da captura terminar.
    rmSync(tmp, { recursive: true, force: true });
    return { ...base, erro: err instanceof Error ? err.message : String(err) };
  }
};

/** Já foi refeito nesta rodada? O carimbo permite `--continuar`. */
const carimbo = (dsId: DesignSystemId): string => join(vaultDsDir(dsId), '.reextraido');

/**
 * A linha de comando.
 *
 * Numa função, e não no topo do módulo: o `tsx` compila para CJS, onde `await`
 * de primeiro nível não existe.
 */
const principal = async (): Promise<void> => {
  const seco = process.argv.includes('--seco');
  const todos = process.argv.includes('--todos');
  const continuar = process.argv.includes('--continuar');
  const alvo = process.argv[2];

  runMigrations();

  // O acervo é o BANCO, não a pasta.
  //
  // A primeira versão listava `vault/ds_*` e saiu refazendo 30 extrações que o
  // app não mostra: apagar um design system remove a linha do banco e deixa os
  // arquivos para trás. O resultado era gastar minutos por site em pastas
  // órfãs e falhar no fim com `FOREIGN KEY constraint failed`, porque o insert
  // dos segmentos exige a linha que já não existia.
  //
  // Medido no acervo: 32 pastas, 2 linhas. A pasta é resíduo; a linha é o que
  // a pessoa vê.
  const idsDoBanco = getDb()
    .select()
    .from(tables.designSystems)
    .all()
    .map((l) => l.id as DesignSystemId);

  const ids: DesignSystemId[] = todos
    ? idsDoBanco
    : alvo?.startsWith('ds_')
      ? [alvo as DesignSystemId]
      : [];

  if (todos) {
    const pastas = readdirSync(vaultDir()).filter((n) => n.startsWith('ds_'));
    const orfas = pastas.length - idsDoBanco.length;
    if (orfas > 0) {
      console.log(
        `\n  ${orfas} pasta(s) no vault sem design system no app: são resíduo de extrações apagadas e ficaram de fora.`,
      );
    }
  }

  if (ids.length === 0) {
    console.error('\n  Uso: pnpm reextrair <ds_id>   (ou --todos)');
    console.error('  O id começa com ds_ e aparece na tela da Galeria.\n');
    process.exit(1);
  }

  const pendentes = continuar ? ids.filter((id) => !existsSync(carimbo(id))) : ids;
  console.log(
    `\n  ${pendentes.length} de ${ids.length} design system(s) para refazer${seco ? ' (ensaio)' : ''}.\n`,
  );

  const relatos: Relato[] = [];
  for (const [i, id] of pendentes.entries()) {
    process.stdout.write(`  [${i + 1}/${pendentes.length}] ${id} … `);
    const r = await reextrair(id, seco);
    relatos.push(r);
    if (!r.ok) {
      console.log(`falhou: ${r.erro}`);
      continue;
    }
    if (seco) {
      console.log(`ok (${r.url})`);
      continue;
    }
    if (!seco) writeFileSync(carimbo(id), String(Date.now()), 'utf8');
    console.log(
      `${r.antes.segmentos} → ${r.depois.segmentos} segmentos, ` +
        `${r.depois.iconesInline} ícones desenhados` +
        `${r.depois.iconesVazios > 0 ? ` (${r.depois.iconesVazios} vazios)` : ''}, ` +
        `${r.depois.scriptsLocais} scripts locais` +
        `${r.modo !== 'completo' ? `  [${r.modo}]` : ''}`,
    );
  }

  const ok = relatos.filter((r) => r.ok);
  const falhas = relatos.filter((r) => !r.ok);
  const parciais = ok.filter((r) => r.modo !== 'completo' && r.modo !== 'ensaio');

  console.log('');
  console.log(`  ${ok.length} refeitos, ${falhas.length} com falha, ${parciais.length} parciais.`);
  if (!seco) {
    console.log(
      `  ícones desenhados: ${ok.reduce((n, r) => n + r.depois.iconesInline, 0)}` +
        `, vazios: ${ok.reduce((n, r) => n + r.depois.iconesVazios, 0)}`,
    );
  }
  for (const f of falhas.slice(0, 8)) console.log(`    ${f.dsId}: ${f.erro}`);
  console.log('');
  console.log('  O anterior de cada um ficou em capture-v2.anterior/ e bundles.anterior/.');
  console.log('  Confira na Galeria e rode `pnpm medir-fidelidade` para comparar.');
  console.log('');
};

if (process.argv[1]?.includes('reextrair')) principal();
