/**
 * A APRESENTAÇÃO DA MARCA, em PDF, com todas as artes dela.
 *
 * Uso:
 *   pnpm marca:apresentar <job_id>
 *
 * ## Por que ela é obrigatória
 *
 * Regra do dono: **marca sem apresentação não é marca pronta**. Um punhado de
 * PNGs numa pasta obriga quem recebe a adivinhar qual é a logo, quando usar
 * cada versão e o que é a cor — que é exatamente o trabalho que contratar uma
 * marca vinha evitar. A apresentação é o que transforma arquivos em SISTEMA.
 *
 * ## O que ela custa
 *
 * Nada além do que já foi gasto. As artes que ela mostra são os estágios pagos
 * do pedido (direção de imagem e conceitos de banner), e tudo o mais nela —
 * as versões da logo, os favicons no tamanho real, a paleta com o contraste
 * medido, a tipografia, o faça/evite — é composição do que já existe.
 *
 * Os conceitos de banner aparecem em desktop E mobile, e são o MESMO pixel
 * composto duas vezes. É a frase "22 seções custam 9 gerações" acontecendo.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  comoDataUri,
  comporPeca,
  coresDerivadas,
  cssDaFonte,
  medirApresentacaoPronta,
  renderizarApresentacao,
} from '@ds/creative';
import { PedidoDeMarca, contrasteRatio, ehJobId, marcaDir, marcaPedidoPath } from '@ds/shared';
import { chromium } from 'playwright';
import { executadoDireto } from './executado-direto.js';

const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

/** A fonte da casa para a apresentação, quando a marca não escolheu uma. */
const FONTE_PADRAO = 'Sora';

const principal = async (): Promise<void> => {
  const jobId = process.argv[2];
  if (jobId === undefined || !ehJobId(jobId)) {
    morrer('Uso: pnpm marca:apresentar <job_id>');
  }
  const dir = marcaDir(jobId as string);
  const arquivoDoPedido = marcaPedidoPath(jobId as string);
  if (!existsSync(arquivoDoPedido)) morrer(`Não achei o pedido em ${arquivoDoPedido}.`);

  const pedido = PedidoDeMarca.parse(JSON.parse(readFileSync(arquivoDoPedido, 'utf8')));
  const resultado = JSON.parse(readFileSync(join(dir, 'resultado.json'), 'utf8')) as {
    cor: { hex: string; decidida: string; motivo: string };
  };
  const cor = resultado.cor.hex;
  const cores = coresDerivadas(cor);

  const precisa = (nome: string): string => {
    const caminho = join(dir, nome);
    if (!existsSync(caminho)) {
      morrer(
        [
          `Falta ${nome} em ${dir}.`,
          'A apresentação mostra as versões da marca: sem elas ela seria uma capa com páginas vazias.',
          `Rode antes: pnpm marca:montar ${jobId} --simbolo simbolo-original.png`,
        ].join('\n  '),
      );
    }
    return caminho;
  };

  const artesDir = join(dir, 'artes');
  const artes = existsSync(artesDir) ? readdirSync(artesDir) : [];
  const direcoes = artes.filter((a) => a.startsWith('direcao-')).sort();
  const bannersCrus = artes.filter((a) => a.startsWith('banner-')).sort();

  const fonteCss = await cssDaFonte(FONTE_PADRAO);
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    /**
     * Os conceitos de banner, compostos: desktop e mobile do MESMO pixel.
     *
     * O pixel gerado é matéria-prima; o conceito é ele com a marca, a copy e o
     * botão por cima. Mostrar o pixel cru seria mostrar a foto, não a aplicação
     * — e é a aplicação que o cliente precisa ver para saber o que recebeu.
     */
    const copyDosBanners = [
      { headline: 'Você entende o tratamento antes de ele começar', cta: 'Agendar avaliação' },
      { headline: 'A gente explica. Depois trata.', cta: 'Marcar horário' },
    ];
    const compostos: { titulo: string; legenda: string; imagem: string }[] = [];
    const paraOPacote: { nome: string; bytes: Uint8Array }[] = [];

    for (const [i, arquivo] of bannersCrus.entries()) {
      const copy = copyDosBanners[i] ?? copyDosBanners[0];
      if (copy === undefined) continue;
      for (const [formato, onde] of [
        ['banner-3x1', 'desktop'],
        ['feed-1x1', 'mobile'],
      ] as const) {
        const peca = await comporPeca(navegador, {
          formato,
          fundo: join(artesDir, arquivo),
          marca: pedido.nome,
          logotipo: precisa('logotipo-negativo.png'),
          headline: copy.headline,
          cta: copy.cta,
          assinatura: null,
          fonte: fonteCss === null ? null : { familia: FONTE_PADRAO, css: fonteCss },
          cores,
        });
        const nome = `conceito-${i + 1}-${onde}.png`;
        writeFileSync(join(artesDir, nome), peca.png);
        paraOPacote.push({ nome, bytes: peca.png });
        if (onde === 'desktop') {
          compostos.push({
            titulo: `Conceito ${i + 1}`,
            legenda: `${copy.headline} — com o botão "${copy.cta}". O mesmo pixel serve o banner largo do site e o quadrado das redes.`,
            imagem: `data:image/png;base64,${Buffer.from(peca.png).toString('base64')}`,
          });
        }
      }
    }

    const paleta = [
      {
        nome: 'Azul da marca',
        hex: cor,
        papel: 'Fundo de faixa, botão e títulos sobre claro',
        sobreBranco: contrasteRatio(cor, '#ffffff'),
      },
      {
        nome: 'Tinta sobre a marca',
        hex: cores.texto,
        papel: 'Texto quando o fundo é a cor da marca',
        sobreBranco: contrasteRatio(cores.texto, '#ffffff'),
      },
      {
        nome: 'Grafite',
        hex: '#141414',
        papel: 'Texto sobre fundo claro',
        sobreBranco: contrasteRatio('#141414', '#ffffff'),
      },
      {
        nome: 'Papel',
        hex: '#ffffff',
        papel: 'Fundo claro, e o fundo de referência do contraste',
        sobreBranco: 1,
      },
    ];

    const favicons = [16, 32, 48, 180]
      .filter((lado) => existsSync(join(dir, `favicon-${lado}.png`)))
      .map((lado) => ({ lado, imagem: comoDataUri(join(dir, `favicon-${lado}.png`)) }));

    const pendencias: string[] = [];
    if (resultado.cor.decidida === 'orbis') {
      pendencias.push(
        `A cor foi escolhida pelo Orbis, não por você: ${resultado.cor.motivo} Trocá-la é barato — todas as versões saem do mesmo símbolo, por cálculo.`,
      );
    }
    pendencias.push(
      'Conversão para impressão (CMYK) depende do perfil da gráfica e não foi verificada. Peça a prova de cor antes de imprimir em escala.',
    );
    pendencias.push(
      'O símbolo em vetor (SVG) ainda não foi produzido. Para aplicação em tamanho muito grande (fachada, veículo), ele é necessário.',
    );

    const pronta = await renderizarApresentacao(navegador, {
      nome: pedido.nome,
      oQueFaz: pedido.oQueFaz,
      tom: pedido.tom,
      cor,
      tintaSobreACor: cores.texto,
      fonte: fonteCss === null ? null : { familia: FONTE_PADRAO, css: fonteCss },
      logos: {
        principal: comoDataUri(precisa('logotipo.png')),
        negativo: comoDataUri(precisa('logotipo-negativo.png')),
        fundoBranco: comoDataUri(precisa('logotipo-fundo-branco.png')),
        lockupHorizontal: comoDataUri(precisa('lockup-horizontal.png')),
        lockupVertical: comoDataUri(precisa('lockup-vertical.png')),
      },
      favicons,
      paleta,
      direcaoDeImagem: direcoes.map((a, i) => ({
        titulo: `Referência ${i + 1}`,
        legenda: 'Luz natural, ambiente claro, sem aparelhagem à mostra.',
        imagem: comoDataUri(join(artesDir, a)),
      })),
      banners: compostos,
      pendencias,
      versao: 'v1',
      data: new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    });

    /**
     * A apresentação é MEDIDA antes de virar entrega.
     *
     * Ela nasceu sem régua, e a primeira consequência apareceu na primeira
     * leitura: um banner recortado com a headline cortada no meio. Quem viu foi
     * o olho, e o olho não escala.
     */
    const medida = await medirApresentacaoPronta(navegador, pronta.html);
    /**
     * O briefing de cada arte, lido do registro.
     *
     * É o que M9 confere: duas artes do mesmo briefing são, por construção,
     * variações de uma ideia. Medir a distância visual não serve — os pares de
     * mesma ideia e de ideias diferentes se CRUZAM na escala, e o porquê está
     * medido na régua.
     */
    const arquivoDosBriefings = join(artesDir, 'briefings.json');
    const briefings: string[] | null = existsSync(arquivoDosBriefings)
      ? (Object.values(
          JSON.parse(readFileSync(arquivoDosBriefings, 'utf8')) as Record<string, string>,
        ) as string[])
      : null;

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'apresentacao.pdf'), pronta.pdf);
    writeFileSync(join(dir, 'apresentacao.html'), pronta.html, 'utf8');
    writeFileSync(
      join(dir, 'apresentacao.medida.json'),
      JSON.stringify(
        {
          paginas: medida.paginas,
          transbordos: medida.transbordos,
          recortadas: medida.recortadas,
          quebradas: medida.quebradas,
          familiaAplicada: medida.familiaAplicada,
          briefings,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log('');
    console.log(`  ${pedido.nome} — apresentação em ${pronta.paginas} páginas`);
    console.log(
      `  ${Math.round(pronta.pdf.byteLength / 1024)} KB em ${join(dir, 'apresentacao.pdf')}`,
    );
    console.log(`  A fonte editável (HTML) está ao lado, e é dela que o PDF sai.`);
    console.log('');
    console.log(
      `  Artes na apresentação: ${direcoes.length} de direção, ${compostos.length} conceito(s).`,
    );
    console.log(`  Compostas sem gastar crédito: ${paraOPacote.map((p) => p.nome).join(', ')}`);
    console.log('');
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
