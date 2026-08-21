/**
 * Re-captura um design system que já está no acervo, no MESMO `ds_id`.
 *
 * Uso:
 *   pnpm reextrair <ds_id>          # um site
 *   pnpm reextrair --todos          # o acervo inteiro
 *   pnpm reextrair --todos --continuar   # retoma, pulando o que já foi refeito
 *   pnpm reextrair <ds_id> --seco   # só diz o que faria
 *   pnpm reextrair --descartar-anterior  # joga fora as cópias de segurança
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
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { capturarComV2, persistirCapturaV2 } from '@ds/engine-v2';
import { eq, getDb, runMigrations, tables } from '@ds/indexer';
import {
  type DesignSystemId,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultDir,
  vaultDsDir,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
  vaultSegmentValidation,
} from '@ds/shared';
import { tamanhoDe } from './acervo-limpar-orfas.js';
import { executadoDireto } from './executado-direto.js';
import { comPisoDoSite, historicoDeFasesDoAcervo } from './historico-de-fases.js';
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

/**
 * Rename com paciência para o Windows.
 *
 * EPERM transitório é rotina aqui: antivírus e indexador seguram por instantes
 * um arquivo recém-escrito, e o rename da troca falhou EXATAMENTE assim na
 * primeira fila real desta máquina — a exceção derrubou o processo no site 5
 * de 7 e deixou um vault meio-trocado (capture-v2 nova, bundles ausentes).
 * Esperar e tentar de novo resolve o transitório; o erro persistente sobe.
 */
const renomearComPaciencia = async (origem: string, destino: string): Promise<void> => {
  const esperasMs = [200, 400, 800, 1600, 3200];
  for (let i = 0; ; i++) {
    try {
      renameSync(origem, destino);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const transitorio = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      const espera = esperasMs[i];
      if (!transitorio || espera === undefined) throw err;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
};

/** Guarda o diretório atual como `.anterior`, substituindo o guardado antes. */
const arquivar = async (dir: string): Promise<void> => {
  if (!existsSync(dir)) return;
  const anterior = `${dir}.anterior`;
  rmSync(anterior, { recursive: true, force: true });
  await renomearComPaciencia(dir, anterior);
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

export const reextrair = async (
  dsId: DesignSystemId,
  seco: boolean,
  /**
   * Conferir cada bundle contra o print da dobra ao final desta captura.
   *
   * Fica desligado numa fila longa, que é o caso para o qual esta ressalva foi
   * escrita: trinta sites em sequência cobrariam o orçamento de cada captura
   * para produzir um número que ninguém lê no meio da fila.
   *
   * Refazer UM site é o caso oposto, e o padrão precisava ser outro. Quem digita
   * o id de um design system está consertando aquele site e vai olhar o
   * resultado agora. Com a conferência desligada também aqui, o canal de pixel
   * do acervo inteiro ficou em `nao-rodou`: nem a captura parcial deixava rodar,
   * nem a reextração, e não havia caminho nenhum que produzisse a medida.
   */
  verificarVisual = true,
): Promise<Relato> => {
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

  // ── 1. Capturar, fora do lugar definitivo ────────────────────────────────
  // Aqui mora tudo que pode falhar por causas externas: rede, orçamento, site
  // fora do ar. Nada foi tocado no acervo ainda.
  let r: Awaited<ReturnType<typeof capturarComV2>>;
  try {
    r = await capturarComV2(url, {
      // Recaptura sabe quanto ESTE site custou da última vez: a mediana do
      // acervo reserva pelo site típico, e o site pesado saía cortado nas
      // fases finais rodada após rodada. Ver `comPisoDoSite`.
      historicoDeFases: comPisoDoSite(historicoDeFasesDoAcervo(), dsId),
      dirCaptura: tmpCaptura,
      dirBundles: tmpBundles,
      verificarVisual,
    });
  } catch (err) {
    // A coleta parcial fica para autópsia; a próxima passada sobrescreve.
    console.log(`
    coleta parcial preservada em ${tmp}`);
    return { ...base, erro: err instanceof Error ? err.message : String(err) };
  }

  // ── 2. Trocar, com volta ─────────────────────────────────────────────────
  //
  // A versão anterior tinha UM `try` cobrindo captura E troca, com o comentário
  // "o antigo continua no lugar: nada foi movido antes da captura terminar".
  // A frase estava certa sobre a captura e errada sobre o resto: `persistir` e
  // `segmentarEIndexar` rodam DEPOIS dos renames, e quando um deles falhava o
  // catch reportava erro com os arquivos novos já no lugar e o antigo já
  // arquivado — o estado misto que este script existe para evitar.
  //
  // Não é hipótese: aconteceu. Uma passada inteira falhou com
  // `FOREIGN KEY constraint failed` no `segmentarEIndexar`, e seis design
  // systems ficaram com a captura nova no disco, sem carimbo e sem os segmentos
  // no banco.
  //
  // Agora a troca tem volta: se o passo seguinte falhar, o anterior é
  // restaurado antes de o erro subir.
  const capturaDir = vaultCaptureV2Dir(dsId);
  const bundlesDir = vaultSegmentBundlesDir(dsId);
  await arquivar(capturaDir);
  await arquivar(bundlesDir);
  mkdirSync(dirname(capturaDir), { recursive: true });
  await renomearComPaciencia(tmpCaptura, capturaDir);
  await renomearComPaciencia(tmpBundles, bundlesDir);
  rmSync(tmp, { recursive: true, force: true });

  const desfazer = (): void => restaurarAnterior([capturaDir, bundlesDir]);

  try {
    const extraido = join(vaultExtractedDir(dsId), 'design-system.html');
    mkdirSync(vaultExtractedDir(dsId), { recursive: true });
    writeFileSync(extraido, r.html, 'utf8');

    persistirCapturaV2(dsId, r);
    const { total } = segmentarEIndexar(dsId);

    // A validacao em navegador pertence a captura que acabou de ser trocada.
    // Medido no acervo: depois de uma reextracao, 0 de 49 resultados casavam
    // com os segmentos novos, e o arquivo velho ficava fingindo cobrir a
    // captura nova. Sai junto com a troca; revalidar recria quando quiser.
    rmSync(vaultSegmentValidation(dsId), { force: true });

    return {
      ...base,
      ok: true,
      modo: r.manifesto.captureMode,
      depois: { segmentos: total, ...medirBundles(bundlesDir) },
      limitacoes: r.manifesto.limitations.slice(0, 3),
    };
  } catch (err) {
    desfazer();
    return {
      ...base,
      erro: `${err instanceof Error ? err.message : String(err)} (a captura anterior foi restaurada)`,
    };
  }
};

/**
 * Põe de volta o que estava lá antes da troca.
 *
 * É a volta do passo 2: cada `<dir>.anterior` volta a ser `<dir>`, e o que a
 * captura nova tinha escrito é descartado. Uma pasta sem `.anterior` é deixada
 * em paz — apagar seria transformar um erro no passo seguinte em perda de
 * dados, que é o oposto do que esta função existe para fazer.
 *
 * Está aqui fora, e não como fechamento dentro de `reextrair`, porque é o
 * caminho que só roda quando algo já deu errado: sem teste, ele só seria
 * exercitado no dia em que estivesse valendo.
 */
export const restaurarAnterior = (dirs: readonly string[]): void => {
  for (const dir of dirs) {
    const anterior = `${dir}.anterior`;
    if (!existsSync(anterior)) continue;
    rmSync(dir, { recursive: true, force: true });
    renameSync(anterior, dir);
  }
};

/**
 * Já foi refeito nesta rodada? O carimbo permite `--continuar`.
 *
 * "Nesta rodada" é a parte que quase ficou faltando. O carimbo não expirava, e
 * o efeito seria pior que o problema que ele resolve: depois de uma passada
 * completa, todo `--continuar` seguinte pularia o acervo inteiro em silêncio —
 * a pessoa veria "0 de 2 para refazer" e concluiria que já estava tudo pronto.
 *
 * Por isso a passada limpa os carimbos ao terminar sem falha: eles são estado
 * de UMA execução, não uma marca permanente no acervo.
 */
const carimbo = (dsId: DesignSystemId): string => join(vaultDsDir(dsId), '.reextraido');

/**
 * As cópias de segurança que a re-extração deixa (`capture-v2.anterior/`,
 * `bundles.anterior/`).
 *
 * Elas existem para você poder conferir antes de perder o anterior — mas
 * ninguém as recolhia: nem o `acervo:limpar-orfas` (que só olha pastas `ds_`
 * inteiras fora do banco), nem esta rodada. Ficariam no disco para sempre,
 * dobrando o tamanho de cada design system refeito.
 */
export const copiasAnteriores = (): string[] => {
  const raiz = vaultDir();
  if (!existsSync(raiz)) return [];
  const out: string[] = [];
  const ehPasta = (p: string): boolean => {
    // `existsSync` diz sim para arquivo. Um arquivo com nome de cópia entrando
    // numa lista que termina em `rmSync` recursivo apagaria dado do usuário.
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };

  for (const ds of readdirSync(raiz).filter((n) => n.startsWith('ds_'))) {
    for (const cand of [
      join(raiz, ds, 'capture-v2.anterior'),
      join(raiz, ds, 'segments', 'bundles.anterior'),
    ]) {
      if (ehPasta(cand)) out.push(cand);
    }
  }

  // O `pnpm regiao:recompilar` guarda de outro jeito: uma cópia POR BUNDLE,
  // dentro da própria pasta de bundles (`segments/bundles/seg_3.anterior`).
  // Ninguém as recolhia — ficavam para sempre, e o comando de descarte não as
  // via porque só procurava as duas formas de cima.
  for (const ds of readdirSync(raiz).filter((n) => n.startsWith('ds_'))) {
    const bundles = join(raiz, ds, 'segments', 'bundles');
    if (!ehPasta(bundles)) continue;
    for (const p of readdirSync(bundles).filter((n) => n.endsWith('.anterior'))) {
      const cand = join(bundles, p);
      if (ehPasta(cand)) out.push(cand);
    }
  }
  return out;
};

/**
 * A linha de comando.
 *
 * Numa função, e não no topo do módulo: o `tsx` compila para CJS, onde `await`
 * de primeiro nível não existe.
 */
const principal = async (): Promise<void> => {
  const seco = process.argv.includes('--seco');

  // Descartar as cópias de segurança é uma operação por si: quem já conferiu na
  // Galeria não deveria precisar rodar uma re-extração inteira para recuperar o
  // espaço.
  if (process.argv.includes('--descartar-anterior')) {
    const copias = copiasAnteriores();
    if (copias.length === 0) {
      console.log('\n  Nenhuma cópia anterior guardada.\n');
      return;
    }
    const bytes = copias.reduce((n, d) => n + tamanhoDe(d), 0);
    for (const d of copias) rmSync(d, { recursive: true, force: true });
    console.log(
      `\n  ${copias.length} cópia(s) descartada(s), ${(bytes / 1024 / 1024).toFixed(0)} MB liberados.\n`,
    );
    return;
  }

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

  // Um site é conserto e vai ser olhado agora; uma fila é manutenção em lote.
  // `DS_SEM_VERIFICACAO=1` desliga nos dois casos, como no `pnpm extrair`.
  // `--verificar` liga a comparação de pixel também em lote: é o que permite
  // conferir o acervo INTEIRO depois de uma mudança no compilador, sem abrir
  // site por site na mão.
  const verificarVisual =
    (pendentes.length === 1 || process.argv.includes('--verificar')) &&
    process.env.DS_SEM_VERIFICACAO !== '1';
  /**
   * O padrão do lote é dito em VOZ ALTA, e não deduzido do silêncio.
   *
   * Foi este padrão que deixou o acervo inteiro sem conferência de pixel: 57
   * capturas de 57 com `visualComparisons: []`. Quem rodou o comando não
   * escolheu desligar — a condição acima desligou —, e depois nada na tela nem
   * no manifesto dizia isso. A conta chegou na curadoria, onde a reprova por
   * divergência nunca disparou em peça alguma.
   */
  if (!verificarVisual && pendentes.length > 0) {
    console.log(
      '  A comparação de pixel NÃO vai rodar nesta rodada: em lote ela é desligada por padrão.',
    );
    console.log(
      '  Sem ela, "nenhuma divergência" quer dizer "ninguém olhou": a curadoria não reprova o que não foi medido.',
    );
    console.log('  Para conferir o acervo inteiro, rode de novo com --verificar.');
    console.log('');
  }

  const relatos: Relato[] = [];
  for (const [i, id] of pendentes.entries()) {
    process.stdout.write(`  [${i + 1}/${pendentes.length}] ${id} … `);
    const r = await reextrair(id, seco, verificarVisual);
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

  // Os carimbos são estado DESTA execução. Deixá-los faria todo `--continuar`
  // seguinte pular o acervo inteiro em silêncio: a pessoa leria "0 de 2 para
  // refazer" e concluiria que estava tudo pronto.
  //
  // Só são apagados quando a passada terminou sem falha — se algo falhou, o
  // `--continuar` ainda serve para retomar de onde parou, que é para isso que
  // eles existem.
  if (!seco && falhas.length === 0) {
    for (const id of pendentes) rmSync(carimbo(id), { force: true });
  }

  const copias = copiasAnteriores();
  console.log('');
  if (copias.length > 0 && !seco) {
    const bytes = copias.reduce((n, d) => n + tamanhoDe(d), 0);
    console.log(
      `  O anterior de cada um está guardado (${copias.length} pasta(s), ${(bytes / 1024 / 1024).toFixed(0)} MB).`,
    );
    console.log('  Confira na Galeria e, quando estiver satisfeito, descarte:');
    console.log('    pnpm reextrair --descartar-anterior');
  }
  console.log('  Rode `pnpm medir-fidelidade` para comparar com a linha de base.');
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
