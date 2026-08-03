import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoot } from '@ds/shared/paths';
import { config as carregarEnv } from 'dotenv';

/**
 * Abre este app para quem está fora, pelo túnel da Cloudflare.
 *
 * ## O que ele faz, e por que nesta ordem
 *
 * 1. Confere a credencial. Sem `ORBIS_SENHA` o servidor no ar seria um acervo
 *    aberto, então isto para antes de subir qualquer coisa.
 * 2. Compila o app web. O servidor passa a servir os arquivos compilados na
 *    MESMA porta da API: uma origem só, sem CORS para acertar e com o cookie da
 *    sessão no modo restrito.
 * 3. Sobe o servidor e o `cloudflared` juntos, e imprime o endereço público.
 *
 * ## O que ele NÃO faz
 *
 * Não roda a fila. Extrair e gerar continuam parando no `PROCESSAR`, como
 * sempre. Quem abrir o link vê o app inteiro e pede o que quiser; o pedido
 * espera você.
 *
 * **E não publica a suíte inteira, só o app de design system.** Isto precisa
 * ficar dito em voz alta, porque a suíte agora tem três frentes e o nome do
 * comando não diferencia. Um túnel da Cloudflare aponta para UM endereço, e as
 * três frentes moram em portas diferentes: o portal na 4000, esta tela na 5173
 * com a API na 8787, e o app de lojas na 3000. O que sai por este link é o que
 * este servidor serve, e ele serve o design system.
 *
 * Para as três saírem por um link só, este servidor precisaria servir o portal
 * na raiz e encaminhar as outras duas por caminho (`/design-system`, `/lojas`),
 * o que exige ensinar cada app a viver debaixo de um sub-caminho: hoje os dois
 * assumem que moram em `/`, e o endereço de cada arquivo deles quebraria. É
 * trabalho de verdade, e fica anotado como pendência em vez de meio-feito.
 *
 * O túnel vive enquanto este comando estiver rodando. Fechou a janela, o
 * endereço morre — e isso é uma característica, não um defeito: o que está no ar
 * é o SEU computador, e você decide quando.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ehWindows = process.platform === 'win32';

// O `.env` mora em `apps/server`, não na raiz. Sem o caminho explícito, o
// dotenv procura no diretório de onde o comando foi chamado, não acha nada, e o
// script acusa falta de credencial com a credencial configurada — que é o pior
// tipo de erro: o certo, sobre a coisa errada.
carregarEnv({ path: join(raiz, 'apps', 'server', '.env'), quiet: true });

const erro = (...linhas: string[]): never => {
  console.error(`\n  ${linhas.join('\n  ')}\n`);
  process.exit(1);
};

// ── 1. A credencial ─────────────────────────────────────────────────────────
const senha = process.env.ORBIS_SENHA ?? '';
if (senha === '') {
  erro(
    'Não vou abrir este app sem credencial.',
    '',
    'Defina ORBIS_SENHA em apps/server/.env (esse arquivo não vai para o git).',
    'Opcional: ORBIS_SENHA_VISITA cria uma segunda credencial, que vê tudo e',
    'não muda nada. É a que você manda para quem só vai olhar.',
  );
}
const temVisita = (process.env.ORBIS_SENHA_VISITA ?? '') !== '';

// ── 2. O cloudflared ────────────────────────────────────────────────────────
const achou = spawnSync(ehWindows ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
if (achou.status !== 0) {
  erro(
    'Preciso do cloudflared, e ele não está instalado.',
    '',
    ehWindows
      ? 'Instale com:  winget install --id Cloudflare.cloudflared'
      : 'Instale com:  brew install cloudflared',
    '',
    'É um programa só, sem conta e sem cartão. Ele abre uma conexão de dentro',
    'para fora e a Cloudflare devolve um endereço público — nada de mexer no',
    'roteador nem de expor a sua máquina.',
  );
}

// ── 3. Compilar o app ───────────────────────────────────────────────────────
console.log('\n  Compilando o app…');
const build = spawnSync('pnpm', ['--filter', '@ds/web', 'build'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: ehWindows,
});
if (build.status !== 0) erro('A compilação falhou. O erro está acima.');

const dist = join(raiz, 'apps', 'web', 'dist', 'index.html');
if (!existsSync(dist)) erro('Compilou, mas não achei apps/web/dist/index.html.');

// ── 4. Servidor e túnel ─────────────────────────────────────────────────────
const porta = process.env.PORT ?? '8787';

let tunel: ReturnType<typeof spawn> | null = null;

/**
 * A suíte já está de pé?
 *
 * Este comando nasceu quando o app era um só e ele mesmo subia o servidor. Com
 * três frentes, o normal é a pessoa já ter clicado no INICIAR: subir um segundo
 * servidor na mesma porta morre em EADDRINUSE, e as outras duas frentes não
 * seriam publicadas de jeito nenhum, porque este script nunca soube subi-las.
 *
 * Então: se a 8787 já responde, aproveitamos o que está rodando; se não,
 * subimos o servidor como sempre.
 */
const responde = async (p: number, caminho = '/'): Promise<boolean> => {
  try {
    const r = await fetch(`http://localhost:${p}${caminho}`);
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
};

let servidor: ReturnType<typeof spawn> | null = null;

const subirServidorSePreciso = async (): Promise<void> => {
  if (await responde(Number(porta), '/health')) {
    console.log('  Servidor já estava de pé; vou usar o que está rodando.');
    return;
  }
  console.log(`  Subindo o servidor na porta ${porta}…`);
  servidor = spawn('pnpm', ['--filter', '@ds/server', 'start'], {
    cwd: raiz,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: ehWindows,
  });
  servidor.stdout?.on('data', (b: Buffer) => process.stdout.write(`  [servidor] ${b}`));

  // Se o servidor cair, os túneis têm de cair junto. Sem isto o comando seguia
  // e imprimia um endereço público apontando para o nada, ou pior, para OUTRO
  // servidor que já estivesse na mesma porta. Um endereço que responde a coisa
  // errada é mais perigoso que um endereço que não responde.
  servidor.on('exit', (codigo) => {
    if (codigo === 0) return;
    console.error(`\n  O servidor encerrou com código ${codigo}. Não vou publicar nada.`);
    tunel?.kill();
    process.exit(1);
  });
};

const encerrar = (): void => {
  servidor?.kill();
  tunel?.kill();
};
process.on('SIGINT', () => {
  console.log('\n  Fechando o túnel. O endereço para de responder agora.\n');
  encerrar();
  process.exit(0);
});

// Espera o servidor responder antes de abrir o túnel: apontar o túnel para uma
// porta muda produz um "Bad Gateway" que parece defeito do túnel e não é.
const esperarServidor = async (): Promise<void> => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${porta}/health`);
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  erro('O servidor não respondeu em 30 segundos. Veja o log acima.');
};

/** As três frentes que saem por túnel. Criativos ainda não existe. */
type Frente = 'portal' | 'designSystem' | 'lojas';

const NOME_DA_FRENTE: Record<Frente, string> = {
  portal: 'portal',
  designSystem: 'design system',
  lojas: 'lojas shopify',
};

/**
 * Qual porta local cada frente atende.
 *
 * O design system sai pela 8787, e não pela 5173: em produção o próprio
 * servidor entrega o app compilado na mesma porta da API, uma origem só, sem
 * CORS para acertar e com o cookie da sessão no modo restrito.
 */
const PORTA_DA_FRENTE: Record<Frente, number> = { portal: 4000, designSystem: 8787, lojas: 3000 };

/** O cloudflared imprime o endereço no meio de um bloco decorado. Extrai. */
const ENDERECO = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const olhar =
  (qual: Frente) =>
  (b: Buffer): void => {
    const texto = b.toString();

    // Os erros do cloudflared PASSAM. A versão anterior engolia tudo que não
    // fosse o endereço, e quando o túnel falhava a janela ficava com um
    // endereço bonito e nenhuma pista: o log estava lá e ninguém via.
    for (const linha of texto.split('\n')) {
      if (/\bERR\b|\bWRN\b/.test(linha)) {
        console.error(`  [${NOME_DA_FRENTE[qual]}] ${linha.trim()}`);
      }
    }

    const achado = texto.match(ENDERECO);
    if (achado === null) return;
    registrarEndereco(qual, achado[0]);
  };

/**
 * Um túnel por frente, e o portal costurando as três.
 *
 * Servir as três por caminho num túnel só exigiria ensinar cada app a viver
 * debaixo de um sub-caminho, e os dois assumem que moram na raiz: o endereço de
 * cada arquivo deles quebraria. Três túneis custam três processos e nenhuma
 * reescrita, e quem recebe continua com UM link para abrir, o do portal.
 *
 * Os endereços vão para um arquivo que o servidor lê e o portal consulta. Sem
 * ele, os cartões voltam a apontar para as portas locais, que é o certo quando
 * não há túnel.
 */
/**
 * Onde os endereços públicos ficam para o servidor achar.
 *
 * O mesmo caminho que `apps/server/src/routes/enderecos.ts` lê. Ele é repetido
 * aqui, em vez de importado, porque importar um módulo de ROTA para dentro de um
 * script de linha de comando arrastaria o Hono inteiro junto: uma linha de
 * acoplamento por um caminho de arquivo é o troco mais barato.
 */
const arquivoDeEnderecos = (): string => join(getRoot(), 'tunel.json');

const enderecos: Record<Frente, string | undefined> = {
  portal: undefined,
  designSystem: undefined,
  lojas: undefined,
};

const registrarEndereco = (qual: Frente, url: string): void => {
  if (enderecos[qual] !== undefined) return;
  enderecos[qual] = url;
  writeFileSync(
    arquivoDeEnderecos(),
    JSON.stringify({ ...enderecos, gravadoEm: Date.now() }, null, 2),
    'utf8',
  );
  console.log(`  [túnel] ${NOME_DA_FRENTE[qual]} no ar`);
  if (
    enderecos.portal !== undefined &&
    enderecos.designSystem !== undefined &&
    enderecos.lojas !== undefined
  ) {
    mostrarQuadro();
  }
};

const mostrarQuadro = (): void => {
  console.log(`
  ┌────────────────────────────────────────────────────────────────
  │  Mande SÓ este: ${enderecos.portal}
  │
  │  É o portal, e de lá saem as três frentes. Ele já sabe o
  │  endereço público de cada uma; quem recebe não precisa de
  │  mais nenhum link.
  │
  │  design system : ${enderecos.designSystem}
  │  lojas shopify : ${enderecos.lojas}
  │
  │  O Orbis pede a credencial antes de mostrar qualquer coisa.
  │${
    temVisita
      ? `
  │  Você entra com ORBIS_SENHA (faz tudo).
  │  Eles entram com ORBIS_SENHA_VISITA (veem tudo, mudam nada).`
      : `
  │  Só existe a credencial de administrador, então quem entrar
  │  pode MUDAR o seu acervo. Para convidar alguém só para olhar,
  │  defina ORBIS_SENHA_VISITA no .env e rode de novo.`
  }
  │
  │  Os três endereços vivem enquanto esta janela estiver aberta.
  │  Ctrl+C encerra.
  └────────────────────────────────────────────────────────────────
`);
};

// `main` existe por um motivo chato e concreto: o `tsx` compila este script
// para CJS, e CJS não aceita `await` no topo do arquivo.
const main = async (): Promise<void> => {
  await subirServidorSePreciso();
  await esperarServidor();

  /*
   * As outras duas frentes precisam estar de pé ANTES de abrir os túneis.
   *
   * Este script só sabe subir o servidor, e é assim desde quando o app era um
   * só. Abrir um túnel para uma porta morta produz o pior resultado possível:
   * um endereço público bonito que devolve erro, e a pessoa que recebeu o link
   * conclui que o app está quebrado. Melhor recusar e dizer o que fazer.
   */
  const faltando: string[] = [];
  if (!(await responde(PORTA_DA_FRENTE.portal))) faltando.push('portal (4000)');
  if (!(await responde(PORTA_DA_FRENTE.lojas))) faltando.push('lojas shopify (3000)');
  if (faltando.length > 0) {
    console.error(`\n  Não vou publicar: ${faltando.join(' e ')} não está de pé.`);
    console.error('  Clique no INICIAR primeiro, deixe a suíte subir, e rode isto de novo.\n');
    encerrar();
    process.exit(1);
  }

  console.log('  As três frentes responderam. Abrindo os túneis…\n');

  // `--protocol http2` em vez do QUIC padrão.
  //
  // O QUIC roda sobre UDP na porta 7844, e muita rede doméstica ou corporativa
  // bloqueia ou estrangula UDP. Medido aqui: o handshake não completava, o
  // cloudflared imprimia o endereço mesmo assim, e a URL respondia "Error 1033"
  // — que parece defeito do túnel e é defeito da rede. O `http2` sai por TCP na
  // 443, a mesma porta de qualquer site, e passa onde o QUIC não passa.
  //
  // Custa um pouco de latência em conexão ruim. Um endereço mais lento é melhor
  // que um endereço que não abre.
  const tuneis = (Object.keys(PORTA_DA_FRENTE) as Frente[]).map((frente) => {
    const processo = spawn(
      'cloudflared',
      ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${PORTA_DA_FRENTE[frente]}`],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: ehWindows },
    );
    processo.stdout?.on('data', olhar(frente));
    processo.stderr?.on('data', olhar(frente)); // o endereço sai no stderr
    return processo;
  });
  tunel = tuneis[0] ?? null;

  for (const processo of tuneis) {
    processo.on('exit', (codigo) => {
      console.log(`
  Um dos túneis encerrou (código ${codigo ?? 0}).`);
      for (const outro of tuneis) if (outro !== processo) outro.kill();
      encerrar();
      process.exit(codigo ?? 0);
    });
  }
};

void main();
