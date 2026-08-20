/**
 * A PASTA DO CLIENTE: o que ele recebe, e nada além.
 *
 * Uso:
 *   pnpm marca:entregar <job_id> --para "<pasta>"
 *
 * ## Por que isto é um comando, e não uma cópia à mão
 *
 * Porque a pasta de entrega é uma DECISÃO, não um gesto. Quem monta à mão
 * decide de novo a cada cliente — e no dia em que decidir diferente, um cliente
 * recebe o `pedido.json` e outro não. Aqui a decisão está escrita, é a mesma
 * sempre, e muda num lugar só.
 *
 * ## O que fica de fora, e por quê
 *
 * A pasta do job tem o retrato do pedido, o razão de crédito, a folha de
 * conferência e o símbolo cru antes do recorte. Nada disso é do cliente: são os
 * nossos registros de como a marca foi feita e quanto custou. Mandá-los junto
 * não é transparência, é ruído — quem abre a pasta procurando a logo tem de
 * achar a logo.
 *
 * ## Por que os nomes são em português e dizem QUANDO usar
 *
 * `logotipo-fundo-preto.png` é o nome que o motor usa. "Logo para fundo
 * escuro.png" é o nome que responde à pergunta de quem está montando um slide.
 * A tradução acontece aqui, na fronteira, e não no motor: lá dentro os nomes
 * precisam ser estáveis e sem espaço.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PedidoDeMarca, ehJobId, marcaDir, marcaPedidoPath } from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

/**
 * O que vai na pasta do cliente: o arquivo do motor, e o nome que ele leva lá.
 *
 * `obrigatorio` decide o que acontece quando falta. A logo faltando é entrega
 * incompleta e para o comando; um criativo faltando não é — nem toda marca tem.
 */
const ENTREGA: readonly {
  readonly de: string;
  readonly pasta: string;
  readonly para: string;
  readonly obrigatorio: boolean;
}[] = [
  { de: 'apresentacao.pdf', pasta: '', para: 'Apresentacao da marca.pdf', obrigatorio: true },
  {
    de: 'logotipo.png',
    pasta: 'Logo',
    para: 'Logo principal (fundo claro).png',
    obrigatorio: true,
  },
  {
    de: 'logotipo-negativo.png',
    pasta: 'Logo',
    para: 'Logo para fundo escuro.png',
    obrigatorio: true,
  },
  {
    de: 'logotipo-fundo-branco.png',
    pasta: 'Logo',
    para: 'Logo com fundo branco.png',
    obrigatorio: true,
  },
  {
    de: 'logotipo-fundo-preto.png',
    pasta: 'Logo',
    para: 'Logo de uma cor so (carimbo, bordado).png',
    obrigatorio: true,
  },
  {
    de: 'lockup-horizontal.png',
    pasta: 'Logo',
    para: 'Logo com o nome ao lado.png',
    obrigatorio: true,
  },
  {
    de: 'lockup-vertical.png',
    pasta: 'Logo',
    para: 'Logo com o nome embaixo.png',
    obrigatorio: false,
  },
  { de: 'nome-por-extenso.png', pasta: 'Logo', para: 'So o nome.png', obrigatorio: false },
  { de: 'favicon.ico', pasta: 'Icone do site', para: 'favicon.ico', obrigatorio: true },
  { de: 'favicon-16.png', pasta: 'Icone do site', para: 'icone-16.png', obrigatorio: false },
  { de: 'favicon-32.png', pasta: 'Icone do site', para: 'icone-32.png', obrigatorio: false },
  { de: 'favicon-48.png', pasta: 'Icone do site', para: 'icone-48.png', obrigatorio: false },
  {
    de: 'favicon-180.png',
    pasta: 'Icone do site',
    para: 'icone-180 (iPhone).png',
    obrigatorio: false,
  },
  {
    de: 'favicon-512.png',
    pasta: 'Icone do site',
    para: 'icone-512 (aplicativo).png',
    obrigatorio: false,
  },
  /**
   * As artes da marca são BANNERS DE SITE.
   *
   * Havia também um "Post para redes" aqui, e ele era o mesmo pixel recortado
   * em quadrado. Post de rede para tráfego pago é outro produto — outra copy,
   * outra oferta, outro CTA —, e entregá-lo como um recorte do banner promete
   * ao cliente uma coisa que a pasta não tem.
   */
  {
    de: 'artes/conceito-1-site.png',
    pasta: 'Artes prontas',
    para: 'Banner do site 1.png',
    obrigatorio: false,
  },
  {
    de: 'artes/conceito-2-site.png',
    pasta: 'Artes prontas',
    para: 'Banner do site 2.png',
    obrigatorio: false,
  },
];

const leiaMe = (nome: string, cor: string, temArtes: boolean): string =>
  [
    `${nome.toUpperCase()} — SUA MARCA`,
    '',
    'Comece pela "Apresentacao da marca.pdf". Ela explica o sistema inteiro em',
    'poucas paginas: as versoes da logo, a cor, a letra, o que fazer e o que',
    'evitar. Se voce so tiver cinco minutos, leia esse arquivo.',
    '',
    '',
    'QUAL LOGO USAR, E QUANDO',
    '',
    '  Logo principal (fundo claro)      Sobre branco, papel, slide claro.',
    '  Logo para fundo escuro            Sobre foto escura ou sobre a cor da marca.',
    '                                    Use esta quando o fundo for escuro: a',
    '                                    principal SOME em cima da cor da marca.',
    '  Logo com fundo branco             Quando voce precisa de um retangulo branco',
    '                                    solido atras (marketplace, alguns sistemas).',
    '  Logo de uma cor so                Carimbo, bordado, gravacao, fax. Uma tinta.',
    '  Logo com o nome ao lado           Barra de topo de site, assinatura de e-mail.',
    '  Logo com o nome embaixo           Espaco estreito e alto.',
    '  So o nome                         Quando o simbolo ja apareceu perto.',
    '',
    'Todos os arquivos de logo tem fundo TRANSPARENTE, menos o "com fundo branco".',
    'Isso quer dizer que voce pode colocar por cima de qualquer coisa.',
    '',
    '',
    'O ICONE DO SITE',
    '',
    '  favicon.ico       E o arquivo que o site usa. Entregue este ao seu',
    '                    desenvolvedor: ele ja tem tres tamanhos dentro.',
    '  icone-180         Para quando alguem salva seu site na tela do iPhone.',
    '  icone-512         Para aplicativo e para o Google.',
    '',
    '',
    'A SUA COR',
    '',
    `  ${cor}`,
    '',
    'Copie esse codigo e cole em qualquer programa (Canva, Word, PowerPoint,',
    'Instagram). E a mesma cor em todos eles.',
    '',
    ...(temArtes
      ? [
          '',
          'ARTES PRONTAS',
          '',
          'Sao exemplos reais, prontos para publicar: os banners para o site e os',
          'posts para as redes. Eles mostram como a marca fica aplicada de verdade.',
          '',
        ]
      : []),
    '',
    'DUVIDAS COMUNS',
    '',
    '  "Posso mudar a cor da logo?"',
    '  Nao. Para uma cor so, use a "Logo de uma cor so".',
    '',
    '  "Posso esticar para caber?"',
    '  Nao. Diminua ou aumente sempre pelos dois lados juntos (segure Shift na',
    '  maioria dos programas). Logo esticada e a primeira coisa que se percebe.',
    '',
    '  "Preciso da logo em vetor (SVG/AI)?"',
    '  Para fachada, veiculo ou impressao muito grande, sim. Ela ainda nao esta',
    '  neste pacote: veja a ultima pagina da apresentacao.',
    '',
  ].join('\r\n');

const principal = (): void => {
  const jobId = process.argv[2];
  const iPara = process.argv.indexOf('--para');
  const destinoCru = iPara >= 0 ? process.argv[iPara + 1] : undefined;
  if (jobId === undefined || !ehJobId(jobId) || destinoCru === undefined) {
    morrer('Uso: pnpm marca:entregar <job_id> --para "<pasta>"');
  }

  const dir = marcaDir(jobId as string);
  const pedido = PedidoDeMarca.parse(
    JSON.parse(readFileSync(marcaPedidoPath(jobId as string), 'utf8')),
  );
  const resultado = JSON.parse(readFileSync(join(dir, 'resultado.json'), 'utf8')) as {
    cor: { hex: string };
  };

  const destino = resolve(join(destinoCru as string, pedido.nome));
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });

  let copiados = 0;
  let temArtes = false;
  const faltando: string[] = [];
  for (const item of ENTREGA) {
    const origem = join(dir, item.de);
    if (!existsSync(origem)) {
      if (item.obrigatorio) faltando.push(item.de);
      continue;
    }
    const pasta = item.pasta === '' ? destino : join(destino, item.pasta);
    mkdirSync(pasta, { recursive: true });
    copyFileSync(origem, join(pasta, item.para));
    copiados += 1;
    if (item.pasta === 'Artes prontas') temArtes = true;
  }

  if (faltando.length > 0) {
    /**
     * Entrega incompleta não vira pasta pela metade.
     *
     * O cliente não tem como saber que faltou alguma coisa: ele abre, vê
     * arquivos, e assume que é isso. Parar aqui e dizer o que falta é o único
     * jeito de a falha aparecer para quem pode consertá-la.
     */
    rmSync(destino, { recursive: true, force: true });
    morrer(
      [
        `Falta o essencial para entregar: ${faltando.join(', ')}.`,
        'Nao montei a pasta: uma entrega pela metade parece completa para quem recebe.',
        `Rode antes: pnpm marca:montar ${jobId} --simbolo simbolo-original.png`,
        `E depois:   pnpm marca:apresentar ${jobId}`,
      ].join('\n  '),
    );
  }

  writeFileSync(
    join(destino, 'LEIA-ME.txt'),
    leiaMe(pedido.nome, resultado.cor.hex, temArtes),
    'utf8',
  );

  console.log('');
  console.log(`  ${pedido.nome} — ${copiados + 1} arquivos em ${destino}`);
  console.log('  Comece pelo LEIA-ME.txt; ele explica qual logo usar em cada lugar.');
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
