import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O ENTREGÁVEL: um projeto que se publica, não uma pasta de arquivos soltos.
 *
 * ## O que mudou, e por quê
 *
 * O download era a pasta gerada compactada crua — `index.html`, `assets/`,
 * `midia/` e, junto, os relatórios internos da conferência. O dono apontou o
 * que faltava: *"o cliente precisa do projeto para fazer deploy e subir
 * isso"*. Uma pasta de arquivos soltos não diz onde se publica, não abre local
 * sem alguém saber servir estático, e vem com arquivos que não são do site.
 *
 * Então a exportação passa a MONTAR um projeto: o site, mais o que transforma
 * o site em coisa publicável — leia-me com os três caminhos de publicação,
 * `package.json` com um servidor local de zero dependências, as configurações
 * dos dois hosts estáticos mais usados, `.gitignore`, e o resumo do que foi
 * VERIFICADO com o que ficou pendente.
 *
 * ## O que fica de fora, de propósito
 *
 * `aceite.json`, `aceite-navegador.json`, `estados-derivados.json` e
 * `ajustes.json` são instrumentos NOSSOS: medição, estado derivado, histórico
 * de retoque. Eles viajavam no zip e não significam nada para quem recebe — o
 * que interessa deles vira `ENTREGA.md`, em português. O `assets/ajustes.css`
 * continua indo: aquilo é folha de estilo do site, é a última da cascata.
 *
 * ## Zero dependência, de propósito
 *
 * O `npm start` roda um servidor de 30 linhas em Node puro. Um `npx serve`
 * exigiria rede na hora de abrir; uma dependência exigiria `npm install` antes
 * de ver o próprio site. Quem recebe abre a pasta, roda um comando e vê.
 */

/** Os arquivos que são instrumento nosso e não parte do site entregue. */
const INSTRUMENTOS = new Set([
  'aceite.json',
  'aceite-navegador.json',
  'estados-derivados.json',
  'ajustes.json',
]);

type Veredito = { codigo: string; titulo: string; estado: string; motivo: string };
type Aceite = { aprovado?: boolean; vereditos?: Veredito[] };

/** O nome da pasta/pacote: legível, sem acento e sem espaço. */
export const nomeDePacote = (marca: string): string => {
  const limpo = marca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return limpo === '' ? 'site' : limpo;
};

const SERVIDOR = `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// Servidor estático de zero dependências: é só para VER o site na sua máquina
// antes de publicar. Em produção quem serve é a hospedagem.
const RAIZ = new URL('.', import.meta.url).pathname.replace(/^\\/([A-Za-z]:)/, '$1');
const PORTA = Number(process.env.PORT ?? 3000);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const pedido = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // \`normalize\` + o prefixo barrado impedem que \`../\` saia da pasta.
  const relativo = normalize(pedido === '/' ? 'index.html' : pedido.replace(/^\\/+/, ''));
  if (relativo.startsWith('..')) {
    res.writeHead(403).end('fora da pasta');
    return;
  }
  try {
    const corpo = await readFile(join(RAIZ, relativo));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(relativo).toLowerCase()] ?? 'application/octet-stream' });
    res.end(corpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Não achei <code>' + relativo + '</code>.</p>');
  }
}).listen(PORTA, () => {
  console.log('Site no ar em http://localhost:' + PORTA);
});
`;

const leiaMe = (marca: string, pacote: string): string => `# ${marca}

O site da ${marca}, pronto para publicar. É um site **estático**: HTML, CSS,
imagens e vídeo. Não precisa de banco, de servidor de aplicação nem de build.

## Ver na sua máquina

\`\`\`bash
npm start
\`\`\`

Abre em <http://localhost:3000>. Precisa só do Node instalado — não há
dependências para instalar.

Se preferir, abrir o \`index.html\` direto no navegador também funciona para
uma olhada rápida, mas alguns navegadores bloqueiam fontes e vídeo em
\`file://\`; o \`npm start\` mostra o site como ele fica publicado.

## Publicar

Três caminhos, do mais rápido ao mais controlado. Em todos, o que se publica é
**esta pasta inteira**, e a "pasta de publicação" é a raiz (\`.\`).

**1. Arrastar e soltar.** Em <https://app.netlify.com/drop> ou
<https://vercel.com/new>, arraste esta pasta para a janela. O site sobe em
segundos e você recebe um endereço. Depois é só apontar o seu domínio.

**2. Por Git.** Esta pasta já é um projeto: dê \`git init\`, suba para o
GitHub e conecte o repositório na Netlify ou na Vercel. Os arquivos
\`netlify.toml\` e \`vercel.json\` já dizem a elas o que fazer — nenhum comando
de build, publicar a raiz. Para GitHub Pages, ative Pages apontando para a
branch; o arquivo \`.nojekyll\` já está aqui para o Pages não esconder as
pastas que começam com \`_\`.

**3. Hospedagem própria (FTP, cPanel, S3, Nginx).** Copie o conteúdo desta
pasta para a raiz pública do servidor (\`public_html\`, \`www\`, o bucket). Nada
mais é necessário.

## O que é cada coisa

| Arquivo | O que é |
|---|---|
| \`index.html\` | a página |
| \`assets/\` | os estilos, os scripts e as fontes |
| \`assets/ajustes.css\` | **os seus retoques** — é a última folha da cascata, o que estiver aqui vence |
| \`midia/\` | as suas imagens e vídeos |
| \`ENTREGA.md\` | o que foi verificado nesta versão, e o que ficou pendente |

## Mexer no site

Para trocar cor, tamanho ou espaçamento, escreva em \`assets/ajustes.css\`:
ela é a última da cascata, então o que estiver ali vence sem precisar de
\`!important\`, e desfazer é apagar o bloco. Para trocar texto ou imagem,
edite o \`index.html\` e os arquivos de \`midia/\`.

---

Gerado pelo Orbis. Pacote: \`${pacote}\`.
`;

const entregaMd = (marca: string, aceite: Aceite | null, quando: string): string => {
  if (aceite === null) {
    return `# Entrega — ${marca}\n\nVersão de ${quando}.\n\nEsta versão não traz relatório de conferência.\n`;
  }
  const vereditos = aceite.vereditos ?? [];
  const passou = vereditos.filter((v) => v.estado === 'passou');
  const pendentes = vereditos.filter((v) => v.estado !== 'passou');
  const linhas = [
    `# Entrega — ${marca}`,
    '',
    `Versão de ${quando}.`,
    '',
    '## O que foi verificado',
    '',
    'Cada regra abaixo foi MEDIDA no navegador, em 1440px e em 390px — não é',
    'checklist preenchida à mão.',
    '',
    ...passou.map((v) => `- **${v.codigo}** ${v.titulo} — passou`),
  ];
  if (pendentes.length > 0) {
    linhas.push(
      '',
      '## O que ficou pendente',
      '',
      'Pendência é coisa que depende de material ou de decisão sua — está aqui',
      'por escrito em vez de passar em silêncio.',
      '',
      ...pendentes.map((v) => `- **${v.codigo}** ${v.titulo} — ${v.motivo || v.estado}`),
    );
  } else {
    linhas.push('', 'Nenhuma pendência.');
  }
  linhas.push('');
  return linhas.join('\n');
};

/**
 * Monta, num diretório novo, o projeto de entrega a partir da versão gerada.
 *
 * Devolve o caminho da PASTA do projeto (com o nome do pacote), que é o que
 * vira a raiz do zip — para quem descompacta encontrar uma pasta com nome, e
 * não trinta arquivos derramados na pasta de downloads.
 */
export const montarProjetoDeEntrega = (opcoes: {
  origem: string;
  destino: string;
  marca: string;
  versao: string;
}): string => {
  const pacote = nomeDePacote(opcoes.marca);
  const raiz = join(opcoes.destino, pacote);
  mkdirSync(raiz, { recursive: true });

  cpSync(opcoes.origem, raiz, { recursive: true });
  for (const nome of INSTRUMENTOS) rmSync(join(raiz, nome), { force: true });

  let aceite: Aceite | null = null;
  const caminhoDoAceite = join(opcoes.origem, 'aceite.json');
  if (existsSync(caminhoDoAceite)) {
    try {
      aceite = JSON.parse(readFileSync(caminhoDoAceite, 'utf8')) as Aceite;
    } catch {
      aceite = null;
    }
  }

  const quando = opcoes.versao.replace(/T/, ' ').replace(/-(\d\d)-(\d\d)-\d+Z?$/, ':$1:$2');
  const escrever = (nome: string, conteudo: string): void =>
    writeFileSync(join(raiz, nome), conteudo, 'utf8');

  escrever('README.md', leiaMe(opcoes.marca, pacote));
  escrever('ENTREGA.md', entregaMd(opcoes.marca, aceite, quando));
  escrever('servidor.mjs', SERVIDOR);
  escrever(
    'package.json',
    `${JSON.stringify(
      {
        name: pacote,
        version: '1.0.0',
        private: true,
        description: `Site da ${opcoes.marca}`,
        type: 'module',
        scripts: { start: 'node servidor.mjs', dev: 'node servidor.mjs' },
      },
      null,
      2,
    )}\n`,
  );
  // Sem comando de build e publicando a raiz: é o que um site estático pede,
  // e dizer isso por escrito evita a hospedagem tentar adivinhar.
  escrever('netlify.toml', '[build]\n  publish = "."\n  command = ""\n');
  escrever('vercel.json', `${JSON.stringify({ cleanUrls: true, trailingSlash: false }, null, 2)}\n`);
  // O Pages esconde pastas iniciadas por `_` quando acha que o site é Jekyll.
  escrever('.nojekyll', '');
  escrever('.gitignore', 'node_modules/\n.DS_Store\nThumbs.db\n');

  return raiz;
};
