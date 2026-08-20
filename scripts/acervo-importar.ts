/**
 * Importa um acervo exportado noutra máquina, reescrevendo os caminhos.
 *
 * Uso: pnpm acervo:importar [caminho/do/zip]
 *      (ou arraste o zip para cima do IMPORTAR-ACERVO.bat)
 *
 * Sem argumento, procura o acervo-design-system-*.zip mais novo na Área de
 * Trabalho e em Downloads e pede confirmação antes de usar.
 *
 * Se já existir acervo nesta máquina, NADA é apagado: a pasta de dados
 * inteira vira um backup ao lado (design-system-ecosystem.backup-<data>)
 * antes de o acervo novo entrar.
 *
 * O banco de origem guarda caminhos absolutos da outra máquina. Depois de
 * extrair, TODAS as colunas de texto de TODAS as tabelas passam por uma
 * varredura que troca a raiz antiga pela local (nas formas crua,
 * JSON-escapada e com barras normais), e a importação FALHA ALTO se sobrar
 * qualquer ocorrência — melhor do que entregar uma galeria meio quebrada.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { getSqlite, runMigrations } from '@ds/indexer';
import {
  ITENS_ACERVO,
  ManifestoAcervo,
  type ParDeSubstituicao,
  configPath,
  dbPath,
  escaparParaLike,
  getRoot,
  paresDeSubstituicao,
  substituirRaiz,
} from '@ds/shared';

const say = (texto: string) => console.log(`  ${texto}`);
/**
 * Anotação no LADO ESQUERDO, e não no retorno da seta.
 *
 * O TypeScript só usa uma função que nunca retorna para ESTREITAR o que vem
 * depois dela quando a anotação está na variável. Com `= (t: string): never =>`,
 * a chamada continua sendo só uma chamada: tudo o que vem depois segue
 * "possibly undefined", e foi por isso que este arquivo tinha quatro erros de
 * tipo em cima de guardas que já existiam e já funcionavam.
 *
 * A mesma armadilha está anotada em `criativo-compor.ts`.
 */
const die: (texto: string) => never = (texto) => {
  console.error(`\n  [ERRO] ${texto}\n`);
  process.exit(1);
};

const perguntarSimNao = async (pergunta: string): Promise<boolean> => {
  const rl = createInterface({ input: stdin, output: stdout });
  const resposta = (await rl.question(`  ${pergunta} (s/n) `)).trim().toLowerCase();
  rl.close();
  return resposta.startsWith('s');
};

// ── Localizar o zip ──────────────────────────────────────────────────────────

const acharZip = async (argumento: string | undefined): Promise<string> => {
  if (argumento !== undefined && argumento !== '') {
    if (!existsSync(argumento)) die(`Não achei o arquivo: ${argumento}`);
    return argumento;
  }

  const candidatos: Array<{ caminho: string; mtime: number }> = [];
  for (const pasta of [join(homedir(), 'Desktop'), join(homedir(), 'Downloads')]) {
    if (!existsSync(pasta)) continue;
    for (const nome of readdirSync(pasta)) {
      if (/^acervo-design-system.*\.zip$/i.test(nome)) {
        const caminho = join(pasta, nome);
        candidatos.push({ caminho, mtime: statSync(caminho).mtimeMs });
      }
    }
  }
  if (candidatos.length === 0) {
    die(
      'Nenhum acervo-design-system-*.zip na Área de Trabalho ou em Downloads.\n' +
        '  Baixe o zip que te mandaram e rode de novo — ou arraste o zip para\n' +
        '  cima do IMPORTAR-ACERVO.bat.',
    );
  }
  candidatos.sort((a, b) => b.mtime - a.mtime);
  // O `die` acima garante que a lista não está vazia, mas ele guarda o
  // COMPRIMENTO e o índice é outra coisa: `noUncheckedIndexedAccess` não liga
  // as duas, e tem razão — uma lista não-vazia continua podendo ter um buraco.
  const primeiro = candidatos[0];
  if (primeiro === undefined) die('Não achei nenhum zip de acervo para importar.');
  const escolhido = primeiro.caminho;
  const usar = await perguntarSimNao(`Encontrei ${basename(escolhido)}. Importar esse?`);
  if (!usar) die('Cancelado. Nada foi alterado.');
  return escolhido;
};

// ── Extrair ──────────────────────────────────────────────────────────────────

const extrair = (zip: string, destino: string): void => {
  if (process.platform === 'win32') {
    const psPath = (p: string) => p.replaceAll("'", "''");
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${psPath(zip)}' -DestinationPath '${psPath(destino)}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) die('Falha ao extrair o zip (Expand-Archive).');
  } else {
    const r = spawnSync('unzip', ['-q', zip, '-d', destino], { stdio: 'inherit' });
    if (r.error || r.status !== 0) {
      die('Falha ao extrair. O comando `unzip` está instalado? (ex.: apt install unzip)');
    }
  }
};

// ── Estado do destino ────────────────────────────────────────────────────────

const temConteudo = (pasta: string): boolean => existsSync(pasta) && readdirSync(pasta).length > 0;

const temAcervoLocal = (raiz: string): boolean =>
  existsSync(dbPath()) &&
  (temConteudo(join(raiz, 'vault')) ||
    temConteudo(join(raiz, 'library')) ||
    temConteudo(join(raiz, 'projects')));

const FECHE_O_APP =
  'Não consegui mexer na pasta de dados — o app parece estar aberto.\n' +
  '  Feche a janela preta do INICIAR (e o PROCESSAR, se estiver rodando) e tente de novo.';

// ── Reescrita do banco ───────────────────────────────────────────────────────

/**
 * Varre todas as tabelas reais (fora sqlite_*, FTS e o diário do drizzle) e
 * aplica os pares em toda coluna com afinidade de texto. Depois verifica com
 * LIKE (caso-insensível) que nenhuma agulha sobrou — inclusive uma variação
 * de caixa que o REPLACE, caso-sensível, teria deixado passar.
 */
const reescreverBanco = (pares: ParDeSubstituicao[]): void => {
  const sql = getSqlite();
  const tabelas = (
    sql
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite!_%' ESCAPE '!'
           AND name NOT LIKE 'components!_fts%' ESCAPE '!'
           AND name NOT LIKE '!_!_drizzle%' ESCAPE '!'`,
      )
      .all() as Array<{ name: string }>
  ).map((t) => t.name);

  let celulas = 0;
  for (const tabela of tabelas) {
    const colunas = (
      sql.prepare(`PRAGMA table_info("${tabela}")`).all() as Array<{ name: string; type: string }>
    ).filter((c) => c.type === '' || /CHAR|TEXT|CLOB/i.test(c.type));

    for (const coluna of colunas) {
      for (const par of pares) {
        const r = sql
          .prepare(
            `UPDATE "${tabela}" SET "${coluna.name}" = REPLACE("${coluna.name}", ?, ?)
             WHERE instr("${coluna.name}", ?) > 0`,
          )
          .run(par.de, par.para, par.de);
        celulas += r.changes;
      }
    }

    for (const coluna of colunas) {
      for (const par of pares) {
        const resto = sql
          .prepare(
            `SELECT COUNT(*) AS n FROM "${tabela}"
             WHERE "${coluna.name}" LIKE '%' || ? || '%' ESCAPE '!'`,
          )
          .get(escaparParaLike(par.de)) as { n: number };
        if (resto.n > 0) {
          die(
            `Sobraram ${resto.n} caminhos da máquina de origem em ${tabela}.${coluna.name}.\n  A importação parou para não deixar o acervo meio quebrado. Me mande print.`,
          );
        }
      }
    }
  }
  say(`Caminhos reescritos no banco (${celulas} valores atualizados).`);
};

/** Varre os .json do acervo em disco — defesa contra campo futuro com caminho absoluto. */
const reescreverJsons = (raiz: string, pares: ParDeSubstituicao[]): void => {
  const fila: string[] = [join(raiz, 'vault'), join(raiz, 'library'), join(raiz, 'projects')];
  const arquivos: string[] = existsSync(configPath()) ? [configPath()] : [];
  while (fila.length > 0) {
    const pasta = fila.pop() as string;
    if (!existsSync(pasta)) continue;
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, entrada.name);
      if (entrada.isDirectory()) fila.push(caminho);
      else if (entrada.name.endsWith('.json')) arquivos.push(caminho);
    }
  }
  let alterados = 0;
  for (const arquivo of arquivos) {
    const antes = readFileSync(arquivo, 'utf8');
    const depois = substituirRaiz(antes, pares);
    if (depois !== antes) {
      writeFileSync(arquivo, depois);
      alterados++;
    }
  }
  if (alterados > 0) say(`Caminhos reescritos em ${alterados} arquivos JSON.`);
};

// ── Fluxo principal ──────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const zip = await acharZip(process.argv[2]);
  const raiz = getRoot();

  say(`Extraindo ${basename(zip)}...`);
  const temp = mkdtempSync(join(tmpdir(), 'ds-importar-'));
  try {
    extrair(zip, temp);

    const manifestoPath = join(temp, 'acervo.json');
    if (!existsSync(manifestoPath)) {
      die(
        'Esse zip não parece um acervo exportado pelo EXPORTAR-ACERVO.bat\n' +
          '  (não tem o acervo.json dentro). Peça para a pessoa exportar de novo.',
      );
    }
    const manifesto = ManifestoAcervo.safeParse(JSON.parse(readFileSync(manifestoPath, 'utf8')));
    if (!manifesto.success) {
      die('O acervo.json dentro do zip está num formato que esta versão não entende.');
    }
    const { raizOrigem, plataforma, contagens } = manifesto.data;

    if ((plataforma === 'win32') !== (process.platform === 'win32')) {
      die(
        'Esse acervo veio de um sistema diferente (Windows ↔ Mac/Linux).\n' +
          '  Importar entre sistemas diferentes ainda não é suportado.',
      );
    }

    say(
      `Acervo de lá: ${contagens.designSystems} design systems, ${contagens.componentes} ` +
        `componentes, ${contagens.kits} kits, ${contagens.sites} sites.`,
    );

    // Protege o que já existe aqui: a pasta inteira vira backup, nada é apagado.
    const agora = new Date();
    const dois = (n: number) => String(n).padStart(2, '0');
    const stamp = `${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}`;
    if (temAcervoLocal(raiz)) {
      const backup = `${raiz}.backup-${stamp}`;
      say('');
      say('Esta máquina JÁ TEM um acervo (design systems, componentes ou sites).');
      say(`Ele NÃO será apagado: a pasta vira um backup em ${backup}`);
      const seguir = await perguntarSimNao('Substituir o acervo atual pelo importado?');
      if (!seguir) die('Cancelado. Nada foi alterado.');
      try {
        renameSync(raiz, backup);
      } catch {
        die(FECHE_O_APP);
      }
    } else if (existsSync(raiz)) {
      // Instalação zerada: abre espaço para o novo acervo. Mesmo assim o banco
      // é renomeado em vez de apagado — se a heurística de "zerada" errar,
      // nada se perde.
      try {
        if (existsSync(dbPath())) renameSync(dbPath(), `${dbPath()}.antigo-${stamp}`);
        for (const item of [...ITENS_ACERVO, 'ecosystem.db-wal', 'ecosystem.db-shm']) {
          rmSync(join(raiz, item), { recursive: true, force: true });
        }
      } catch {
        die(FECHE_O_APP);
      }
    }
    mkdirSync(raiz, { recursive: true });

    say('Colocando o acervo no lugar...');
    for (const item of ITENS_ACERVO) {
      const origem = join(temp, item);
      if (!existsSync(origem)) continue;
      const destino = join(raiz, item);
      try {
        renameSync(origem, destino);
      } catch {
        // Volumes diferentes (TEMP noutro disco): copia e apaga.
        cpSync(origem, destino, { recursive: true });
        rmSync(origem, { recursive: true, force: true });
      }
    }

    // Abrir o banco SÓ AGORA: getSqlite abre (e cacheia) o arquivo já movido,
    // e de quebra recria cache/, queue/ e workspace/ que não viajam no zip.
    if (raizOrigem === raiz) {
      say('Mesma raiz da origem — nenhum caminho para reescrever.');
    } else {
      say('Reescrevendo os caminhos da máquina de origem...');
      const pares = paresDeSubstituicao(raizOrigem, raiz);
      reescreverBanco(pares);
      reescreverJsons(raiz, pares);
    }

    // O banco importado pode ter vindo de um código mais antigo que o daqui.
    runMigrations();

    say('');
    say('Acervo importado. Abra o INICIAR.bat e confira a Galeria e a Biblioteca.');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
};

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
