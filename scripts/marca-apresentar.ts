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
import {
  ARRANJO,
  ARRANJOS_EM_ORDEM,
  type ArranjoDaPeca,
  PedidoDeMarca,
  ResultadoDeMarca,
  conferirMarca,
  conferirVariacaoCriativa,
  contrasteRatio,
  ehJobId,
  marcaDir,
  marcaPedidoPath,
  rotuloDaPeca,
} from '@ds/shared';
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
     * O briefing de cada arte, lido do registro.
     *
     * É o que M9 confere: duas artes do mesmo briefing são, por construção,
     * variações de uma ideia. Medir a distância visual não serve — os pares de
     * mesma ideia e de ideias diferentes se CRUZAM na escala, e o porquê está
     * medido na régua.
     */
    const arquivoDosBriefings = join(artesDir, 'briefings.json');
    const porArquivo: Record<string, string> = existsSync(arquivoDosBriefings)
      ? (JSON.parse(readFileSync(arquivoDosBriefings, 'utf8')) as Record<string, string>)
      : {};
    const briefings: string[] | null =
      Object.keys(porArquivo).length === 0 ? null : Object.values(porArquivo);

    const copyDosBanners = [
      { headline: 'Você entende o tratamento antes de ele começar', cta: 'Agendar avaliação' },
      { headline: 'A gente explica. Depois trata.', cta: 'Marcar horário' },
    ];
    const compostos: { titulo: string; legenda: string; imagem: string }[] = [];
    const paraOPacote: { nome: string; bytes: Uint8Array }[] = [];

    /**
     * Os conceitos de banner: desktop e mobile do MESMO pixel, em arranjos
     * DIFERENTES.
     *
     * O pixel gerado é matéria-prima; o conceito é ele com a marca, a copy e o
     * botão por cima. Mostrar o pixel cru seria mostrar a foto, não a aplicação
     * — e é a aplicação que o cliente precisa ver para saber o que recebeu.
     *
     * O arranjo não se repete, e a queixa do dono foi literal: *"você fez 1
     * estilo de banner só para os dois"*. Uma página de conceito existe para
     * mostrar abordagens DIFERENTES, e dois conceitos no mesmo arranjo são uma
     * abordagem com duas fotos. Arranjo é geometria: nenhum deles custa
     * crédito, então repetir não tem nem desculpa de orçamento. M10 confere
     * isto no registro.
     *
     * A queixa do dono foi literal: *"você fez 1 estilo de banner só para os
     * dois"*. Uma página de conceito existe para mostrar abordagens DIFERENTES,
     * e dois conceitos no mesmo arranjo são uma abordagem com duas fotos.
     * Arranjo é geometria: nenhum deles custa crédito, então repetir não tem
     */
    const usados = new Set<ArranjoDaPeca>();
    const arranjoPorConceito: Record<string, ArranjoDaPeca> = {};

    /** O que a régua da peça cobra sobre um conceito, com a geometria medida. */
    const conferirConceito = (
      formato: 'banner-3x1' | 'feed-1x1',
      peca: Awaited<ReturnType<typeof comporPeca>>,
      copy: { headline: string; cta: string },
    ) =>
      conferirVariacaoCriativa({
        formato,
        largura: peca.largura,
        altura: peca.altura,
        houvePixelGerado: true,
        headline: copy.headline,
        cta: copy.cta,
        textoRenderizado: peca.textos,
        caixasDosPapeis: peca.caixas,
        marca: pedido.nome,
        menorContraste: peca.menorContraste,
        hash: null,
        hashesIrmas: [],
        houveUpload: false,
        uploadPreservado: null,
        procedencia: {
          modelo: pedido.preset ?? 'imagem-marca',
          preset: pedido.preset ?? 'imagem-marca',
        },
        tipografia: { familia: FONTE_PADRAO, aplicou: peca.fonteAplicada },
      });

    for (const [i, arquivo] of bannersCrus.entries()) {
      const copy = copyDosBanners[i] ?? copyDosBanners[0];
      if (copy === undefined) continue;

      /**
       * Cada arranjo é uma chance NOVA de o texto não caber no quadro.
       *
       * Por isso o arranjo não é escolhido e sim APROVADO: o candidato é
       * composto nos dois formatos, medido pela régua da peça, e só vira
       * conceito se passar nos dois. Recompor não gasta crédito nenhum — o
       * pixel já está em disco —, então tentar o seguinte é de graça e parar
       * na primeira reprovação seria desperdício de nada.
       */
      const candidatos = ARRANJOS_EM_ORDEM.filter((a) => !usados.has(a));
      let aceito: {
        arranjo: ArranjoDaPeca;
        pecas: { onde: string; peca: Awaited<ReturnType<typeof comporPeca>> }[];
      } | null = null;
      const recusas: string[] = [];

      for (const arranjo of candidatos) {
        const tentativa: { onde: string; peca: Awaited<ReturnType<typeof comporPeca>> }[] = [];
        let motivo: string | null = null;
        for (const [formato, onde] of [
          ['banner-3x1', 'desktop'],
          ['feed-1x1', 'mobile'],
        ] as const) {
          const peca = await comporPeca(navegador, {
            formato,
            arranjo,
            fundo: join(artesDir, arquivo),
            marca: pedido.nome,
            logotipo: precisa('logotipo-negativo.png'),
            headline: copy.headline,
            cta: copy.cta,
            assinatura: null,
            fonte: fonteCss === null ? null : { familia: FONTE_PADRAO, css: fonteCss },
            cores,
          });
          const conferencia = conferirConceito(formato, peca, copy);
          if (rotuloDaPeca(conferencia) === 'reprovada') {
            motivo = `${onde}: ${conferencia.vereditos
              .filter((v) => v.estado === 'reprovou')
              .map((v) => `${v.codigo} ${v.motivo}`)
              .join(' ')}`;
            break;
          }
          tentativa.push({ onde, peca });
        }
        if (motivo === null) {
          aceito = { arranjo, pecas: tentativa };
          break;
        }
        recusas.push(`  ${ARRANJO[arranjo].rotulo} — ${motivo}`);
      }

      if (aceito === null) {
        /**
         * As duas causas são diferentes, e a mensagem tem de dizer qual foi.
         *
         * Ou os arranjos ACABARAM — há mais conceitos que arranjos, e M10 exige
         * que nenhum se repita —, ou eles foram tentados e reprovaram. Dizer
         * "não passou na régua" no primeiro caso mandaria alguém procurar
         * defeito numa peça que nunca chegou a ser composta.
         */
        morrer(
          candidatos.length === 0
            ? [
                `Acabaram os arranjos antes do conceito ${i + 1} (${arquivo}).`,
                `Existem ${ARRANJOS_EM_ORDEM.length} arranjos e M10 exige que nenhum se repita, então esta apresentação comporta no máximo ${ARRANJOS_EM_ORDEM.length} conceitos.`,
                'Tire uma das artes de banner da pasta, ou acrescente um arranjo ao motor.',
              ].join('\n  ')
            : [
                `O conceito ${i + 1} (${arquivo}) não passou na régua em nenhum arranjo disponível.`,
                'Recompor não gasta crédito, então isto não é falta de tentativa: é a peça não cabendo.',
                'O que cada arranjo respondeu:',
                ...recusas,
              ].join('\n  '),
        );
      }

      const escolhido = aceito as NonNullable<typeof aceito>;
      usados.add(escolhido.arranjo);
      arranjoPorConceito[`conceito-${i + 1}`] = escolhido.arranjo;

      for (const { onde, peca } of escolhido.pecas) {
        const nome = `conceito-${i + 1}-${onde}.png`;
        writeFileSync(join(artesDir, nome), peca.png);
        paraOPacote.push({ nome, bytes: peca.png });
        if (onde === 'desktop') {
          compostos.push({
            titulo: `Conceito ${i + 1} — ${ARRANJO[escolhido.arranjo].rotulo}`,
            /**
             * A legenda diz o ARRANJO, e não só a copy.
             *
             * Quem abre a página de conceitos está escolhendo uma abordagem. A
             * legenda que só repetia a headline dizia ao cliente que os dois
             * conceitos mostram a mesma coisa — exatamente o que a página não
             * pode dizer.
             */
            legenda: `${ARRANJO[escolhido.arranjo].comoE} A chamada é "${copy.headline}", com o botão "${copy.cta}". O mesmo pixel serve o banner largo do site e o quadrado das redes.`,
            imagem: `data:image/png;base64,${Buffer.from(peca.png).toString('base64')}`,
          });
        }
      }
    }

    /**
     * O arranjo de cada conceito fica REGISTRADO, ao lado dos briefings.
     *
     * É o mesmo remédio do mesmo veneno: a pergunta "são abordagens diferentes?"
     * não se responde no pixel — medir distância visual não separa as classes —,
     * e se responde exata na procedência.
     */
    if (Object.keys(arranjoPorConceito).length > 0) {
      writeFileSync(
        join(artesDir, 'arranjos.json'),
        JSON.stringify(arranjoPorConceito, null, 2),
        'utf8',
      );
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
      /**
       * A legenda de cada referência é o BRIEFING dela.
       *
       * Elas eram todas a mesma frase, o que dizia ao cliente que as três
       * mostram a mesma coisa — logo depois de eu ter refeito as três
       * justamente para que não mostrassem. A legenda que se repete é a versão
       * escrita do defeito que M9 pega no pixel.
       */
      direcaoDeImagem: direcoes.map((a, i) => ({
        titulo: `Referência ${i + 1}`,
        legenda: porArquivo[a] ?? 'Luz natural, ambiente claro.',
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

    /**
     * A FOLHA da marca é atualizada nas regras que só AQUI têm evidência.
     *
     * `pnpm marca:montar` grava a folha declarando M7, M8, M9 e M10 pendentes,
     * porque naquele ponto do percurso a apresentação ainda não existe — e o
     * que não se mede não fica verde. Sem esta escrita, elas ficariam pendentes
     * para SEMPRE: quatro regras que nenhum comando roda são quatro regras que
     * não existem.
     *
     * A junção é por REGRA, e não por folha inteira, porque cada rodada só tem
     * a evidência da sua metade. M1..M6 saem do símbolo e das versões, medidos
     * pelo `marca:montar` com os arquivos abertos num navegador; M7..M10 saem
     * da apresentação, e é ela que acabou de ser medida aqui. Reescrever a
     * folha toda a partir daqui apagaria as seis primeiras com `pendente`, que
     * é o mesmo carimbo errado ao contrário.
     */
    const REGRAS_DA_APRESENTACAO = ['M7', 'M8', 'M9', 'M10'];
    const arquivoDoResultado = join(dir, 'resultado.json');
    if (existsSync(arquivoDoResultado)) {
      const lido = ResultadoDeMarca.safeParse(JSON.parse(readFileSync(arquivoDoResultado, 'utf8')));
      if (!lido.success) {
        console.warn(
          '\n  AVISO: resultado.json não passa no contrato, então não atualizei a folha. A entrega vai recusar fechar até isso ser corrigido.',
        );
      } else {
        const daApresentacao = conferirMarca({
          pecas: null,
          distanciaEntreVersoes: null,
          cor: null,
          promptDoSimbolo: null,
          procedencia: null,
          decisaoDaCor: null,
          /**
           * A medição vira FRASE aqui, e não número solto.
           *
           * A régua monta o motivo concatenando estas listas, e é ele que uma
           * pessoa vai ler para saber o que consertar. "página 4: banner" diz
           * onde ir; um objeto serializado, não.
           */
          apresentacao: {
            paginas: medida.paginas,
            transbordos: medida.transbordos.map((t) => `página ${t.pagina}: ${t.onde}`),
            recortadas: medida.recortadas.map((r) => `página ${r.pagina}: ${r.alt}`),
            quebradas: medida.quebradas.map((q) => `página ${q.pagina}: ${q.alt}`),
          },
          briefingsDasArtes: briefings,
          arranjosDosConceitos: Object.values(arranjoPorConceito),
        }).vereditos.filter((v) => REGRAS_DA_APRESENTACAO.includes(v.codigo));

        const anteriores = (lido.data.conferencia ?? []).filter(
          (v) => !REGRAS_DA_APRESENTACAO.includes(v.codigo),
        );
        const folha = [...anteriores, ...daApresentacao].sort(
          (a, b) => Number(a.codigo.slice(1)) - Number(b.codigo.slice(1)),
        );
        writeFileSync(
          arquivoDoResultado,
          JSON.stringify({ ...lido.data, conferencia: folha }, null, 2),
          'utf8',
        );

        const reprovadas = folha.filter((v) => v.estado === 'reprovou');
        if (reprovadas.length > 0) {
          console.warn('');
          console.warn(
            `  AVISO: ${reprovadas.length} regra(s) REPROVADA(S) na folha. O fila:concluir vai recusar fechar:`,
          );
          for (const v of reprovadas) console.warn(`    ${v.codigo} — ${v.motivo}`);
        }
      }
    }

    console.log('');
    console.log(`  ${pedido.nome} — apresentação em ${pronta.paginas} páginas`);
    console.log(
      `  ${Math.round(pronta.pdf.byteLength / 1024)} KB em ${join(dir, 'apresentacao.pdf')}`,
    );
    console.log('  A fonte editável (HTML) está ao lado, e é dela que o PDF sai.');
    console.log('');
    console.log(
      `  Artes na apresentação: ${direcoes.length} de direção, ${compostos.length} conceito(s).`,
    );
    for (const [conceito, arranjo] of Object.entries(arranjoPorConceito)) {
      console.log(`    ${conceito}: ${ARRANJO[arranjo].rotulo} (${arranjo})`);
    }
    console.log(`  Compostas sem gastar crédito: ${paraOPacote.map((p) => p.nome).join(', ')}`);
    console.log('');
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
