/**
 * Exporta o acervo (vault, biblioteca, sites e o banco) num zip portátil.
 *
 * Uso: pnpm acervo:exportar          (ou duplo clique no EXPORTAR-ACERVO.bat)
 *
 * O zip vai para a Área de Trabalho e é importado na outra máquina pelo
 * IMPORTAR-ACERVO.bat, que reescreve os caminhos absolutos do banco para a
 * raiz de lá. O banco entra como SNAPSHOT consistente (backup nativo do
 * SQLite, WAL incluído), então dá para exportar com o app aberto.
 *
 * O que NÃO entra: cache/ e workspace/ (regeneráveis), queue/ (a fila de uma
 * máquina não significa nada na outra) e qualquer arquivo solto na pasta de
 * dados. A chave da Anthropic NUNCA entra: ela mora em apps/server/.env,
 * fora da pasta de dados.
 *
 * A compactação usa a ferramenta do sistema (Compress-Archive no Windows,
 * `zip` no resto) — mesma decisão do download de sites no server: não vale
 * uma dependência nova para zipar pasta.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSqlite } from '@ds/indexer';
import {
  FORMATO_ACERVO,
  type ManifestoAcervo,
  configPath,
  dbPath,
  getRoot,
  libraryDir,
  projectsDir,
  vaultDir,
} from '@ds/shared';

const say = (texto: string) => console.log(`  ${texto}`);
const die = (texto: string): never => {
  console.error(`\n  [ERRO] ${texto}\n`);
  process.exit(1);
};

const contar = (tabela: string): number => {
  try {
    const linha = getSqlite().prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number };
    return linha.n;
  } catch {
    return 0;
  }
};

const zipar = (pastaOrigem: string, destino: string): void => {
  if (process.platform === 'win32') {
    // Aspas simples do PowerShell: apóstrofo em nome de usuário vira ''.
    const psPath = (p: string) => p.replaceAll("'", "''");
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path '${psPath(pastaOrigem)}\\*' -DestinationPath '${psPath(destino)}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) die('Falha ao compactar (Compress-Archive). Tire um print desta janela.');
  } else {
    const r = spawnSync('zip', ['-r', '-q', destino, '.'], { cwd: pastaOrigem, stdio: 'inherit' });
    if (r.error || r.status !== 0) {
      die('Falha ao compactar. O comando `zip` está instalado? (ex.: apt install zip)');
    }
  }
  if (!existsSync(destino)) die('A compactação terminou mas o zip não apareceu.');
};

const main = async (): Promise<void> => {
  const raiz = getRoot();
  if (!existsSync(dbPath())) {
    die('Nenhum acervo nesta máquina (o banco ainda não existe). Use o app primeiro.');
  }

  const contagens = {
    designSystems: contar('design_systems'),
    componentes: contar('library_components'),
    kits: contar('kits'),
    sites: contar('projects'),
  };
  if (contagens.designSystems === 0 && contagens.componentes === 0 && contagens.sites === 0) {
    die('O acervo está vazio — nada para exportar. Extraia um site primeiro.');
  }

  say(
    `Acervo: ${contagens.designSystems} design systems, ${contagens.componentes} componentes, ` +
      `${contagens.kits} kits, ${contagens.sites} sites.`,
  );

  const temp = mkdtempSync(join(tmpdir(), 'ds-acervo-'));
  const staging = join(temp, 'acervo');
  mkdirSync(staging);

  try {
    say('Copiando vault, biblioteca e sites...');
    const pastas: ReadonlyArray<[string, string]> = [
      [vaultDir(), 'vault'],
      [libraryDir(), 'library'],
      [projectsDir(), 'projects'],
    ];
    for (const [origem, nome] of pastas) {
      if (existsSync(origem)) cpSync(origem, join(staging, nome), { recursive: true });
    }

    say('Tirando um snapshot consistente do banco...');
    await getSqlite().backup(join(staging, 'ecosystem.db'));
    if (existsSync(configPath())) cpSync(configPath(), join(staging, 'ecosystem.config.json'));

    const manifesto: ManifestoAcervo = {
      formato: FORMATO_ACERVO,
      exportadoEm: new Date().toISOString(),
      raizOrigem: raiz,
      plataforma: process.platform,
      contagens,
    };
    writeFileSync(join(staging, 'acervo.json'), JSON.stringify(manifesto, null, 2));

    const agora = new Date();
    const dois = (n: number) => String(n).padStart(2, '0');
    const stamp = `${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}`;
    const desktop = existsSync(join(homedir(), 'Desktop')) ? join(homedir(), 'Desktop') : homedir();
    const destino = join(desktop, `acervo-design-system-${stamp}.zip`);
    rmSync(destino, { force: true });

    say('Compactando...');
    zipar(staging, destino);

    const mb = statSync(destino).size / (1024 * 1024);
    say('');
    say(`Pronto: ${destino} (${mb.toFixed(1)} MB)`);
    say('Mande esse arquivo para a outra pessoa (WhatsApp, Drive...).');
    say('Lá, é só arrastar o zip para cima do IMPORTAR-ACERVO.bat.');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
};

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
