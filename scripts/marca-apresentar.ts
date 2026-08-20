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
  ArquivoDoRazao,
  comoDataUri,
  comporPeca,
  coresDerivadas,
  cssDaFonte,
  lerRazao,
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
  /**
   * As cores de apoio entram na derivação, e não só na página da paleta.
   *
   * `coresDerivadas` escolhe o ACENTO — o botão — entre elas: a primeira que se
   * separa da principal e ainda aceita texto legível. Sem passá-las, o botão de
   * todo conceito sairia na dupla invertida do preto-e-branco, que é contraste
   * garantido e nenhuma relação com a marca.
   */
  const cores = coresDerivadas(cor, pedido.coresDeApoio);
  if (pedido.coresDeApoio.length > 0 && !cores.acentoVeioDaMarca) {
    console.warn(
      '  AVISO: nenhuma cor de apoio se separa da principal e aceita tinta legível ao mesmo tempo, então o botão saiu na cor derivada.',
    );
  }

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
     * Os conceitos são BANNERS DE SITE, e só isso.
     *
     * Eles saíam também em 1:1, chamado de "mobile", do mesmo pixel. Era um
     * erro de categoria, e o dono nomeou: *"serão banners pra o site, e os
     * criativos é criativos de vendas do tráfego pago"*. São dois produtos, não
     * dois tamanhos do mesmo.
     *
     * Um banner de site é visto por quem JÁ está no site: ele estabelece a
     * marca, é largo, tem respiro e uma frase de posicionamento. Um criativo de
     * tráfego é visto por quem está rolando o feed e nunca ouviu falar dela:
     * assunto fechado, impacto, oferta e um CTA que converte. Recortar o
     * primeiro em quadrado não produz o segundo — produz o primeiro, cortado.
     *
     * O criativo de tráfego vive na frente Criativos, que tem formato próprio,
     * copy de venda e orçamento próprio.
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
    /**
     * As artes PRONTAS: o pixel já chega com a copy dentro.
     *
     * Regra do dono: *"delegue tudo para o magnific em questão de imagem e
     * vídeo"* — o prompt descreve a peça inteira e o motor só busca o arquivo.
     * Uma arte assim não passa pelo compositor, porque não há o que compor.
     *
     * O que se PERDE, e fica declarado em vez de escondido: a régua da peça mede
     * o documento, e aqui não há documento. C2 (o texto literal), C3 (a grafia
     * da marca), C4 (o contraste) e C11 (a tipografia) saem do DOM que o
     * compositor monta; sobre um PNG gerado, responder qualquer uma delas
     * exigiria OCR. Então elas não são respondidas — a conferência é de olho, e
     * a apresentação diz isso na página de pendências. Um "aprovado" aqui seria
     * o carimbo verde que esta casa já pagou para aprender a não dar.
     */
    /**
     * As artes PRONTAS, e a convenção que separa desktop de mobile.
     *
     * `arte-*.png` é a versão larga (o banner do site no computador) e
     * `arte-*-mobile.png` é a do telefone. Ela não é um recorte da primeira: o
     * texto foi diagramado para a largura que o recorte destruiria, então cada
     * uma é uma peça — e M11 recusa a entrega que só tem metade.
     */
    const ehMobile = (a: string): boolean => a.endsWith('-mobile.png');
    const todasAsProntas = artes.filter((a) => a.startsWith('arte-') && a.endsWith('.png')).sort();
    const artesProntas = todasAsProntas.filter((a) => !ehMobile(a));
    const mobileDe = (a: string): string => a.replace(/\.png$/, '-mobile.png');
    const conceitosSemMobile = artesProntas.filter((a) => !todasAsProntas.includes(mobileDe(a)));

    /**
     * A PROPOSTA VISUAL de cada arte, lida do registro.
     *
     * Não é o layout: é a direção inteira — que peso de cor, que assunto, que
     * registro —, e ela sai do briefing da marca. Duas geometrias da mesma
     * direção continuam sendo uma direção só, que foi o defeito que três
     * rodadas de conserto de layout não resolveram.
     */
    const arquivoDasPropostas = join(artesDir, 'propostas.json');
    const propostaPorArte: Record<string, string> = existsSync(arquivoDasPropostas)
      ? (JSON.parse(readFileSync(arquivoDasPropostas, 'utf8')) as Record<string, string>)
      : {};

    const usados = new Set<ArranjoDaPeca>();
    const arranjoPorConceito: Record<string, ArranjoDaPeca> = {};

    /**
     * O arranjo PRETENDIDO de cada arte, quando quem a gerou já sabia.
     *
     * A foto e o arranjo não são independentes: num `faixa-inferior` o terço de
     * baixo some sob a faixa, então o assunto tem de viver em cima; num
     * `veu-cheio` a cena precisa aguentar um véu e um texto no meio. Briefar a
     * imagem para um arranjo e compô-la noutro desperdiça o briefing — e o
     * briefing é a parte que custou crédito.
     *
     * Ele é uma PREFERÊNCIA, não uma ordem: a medição continua mandando, e um
     * arranjo pretendido que reprova cede lugar ao seguinte.
     */
    const arquivoPretendidos = join(artesDir, 'arranjos-pretendidos.json');
    const pretendido: Record<string, string> = existsSync(arquivoPretendidos)
      ? (JSON.parse(readFileSync(arquivoPretendidos, 'utf8')) as Record<string, string>)
      : {};

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
        fracaoDaFoto: peca.fracaoDaFoto,
        temFoto: true,
      });

    for (const [i, arquivo] of artesProntas.entries()) {
      const caminho = join(artesDir, arquivo);
      const proposta = propostaPorArte[arquivo];
      compostos.push({
        titulo: `Conceito ${i + 1}`,
        legenda: `${proposta === undefined ? '' : `${proposta} `}Arte gerada por completo — imagem e texto saíram juntos do gerador. A grafia foi conferida a olho, e não medida no documento.`,
        imagem: comoDataUri(caminho),
      });
      paraOPacote.push({ nome: arquivo, bytes: readFileSync(caminho) });
      /**
       * A versão de TELEFONE entra na apresentação, e não só na pasta.
       *
       * Regra do dono, e a razão é a mesma que fez M11 existir: o telefone é
       * onde a maior parte das pessoas vê o banner. Um brandbook que mostra só
       * a versão larga deixa o cliente aprovar uma peça e receber outra — e a
       * página de conceito existe justamente para ele ver o que vai receber.
       */
      const doTelefone = join(artesDir, mobileDe(arquivo));
      if (existsSync(doTelefone)) {
        paraOPacote.push({ nome: mobileDe(arquivo), bytes: readFileSync(doTelefone) });
        compostos.push({
          titulo: `Conceito ${i + 1} — no telefone`,
          legenda:
            'A mesma proposta diagramada para a tela vertical. Não é um recorte da versão larga: o texto foi refeito para a largura do telefone.',
          imagem: comoDataUri(doTelefone),
        });
      }
    }

    for (const [i, arquivo] of (artesProntas.length > 0 ? [] : bannersCrus).entries()) {
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
      const daArte = pretendido[arquivo];
      const candidatos = ARRANJOS_EM_ORDEM.filter((a) => !usados.has(a)).sort(
        (a, b) => (a === daArte ? -1 : 0) - (b === daArte ? -1 : 0),
      );
      let aceito: {
        arranjo: ArranjoDaPeca;
        pecas: { onde: string; peca: Awaited<ReturnType<typeof comporPeca>> }[];
      } | null = null;
      const recusas: string[] = [];

      for (const arranjo of candidatos) {
        const tentativa: { onde: string; peca: Awaited<ReturnType<typeof comporPeca>> }[] = [];
        let motivo: string | null = null;
        for (const [formato, onde] of [['banner-3x1', 'site']] as const) {
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
        if (onde === 'site') {
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
            legenda: `${ARRANJO[escolhido.arranjo].comoE} A chamada é "${copy.headline}", com o botão "${copy.cta}".`,
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
      /**
       * As cores de apoio do cliente, com o contraste MEDIDO como as outras.
       *
       * Elas entram nomeadas por posição porque o pedido não pede nome — pedir
       * um rótulo para cada cor seria cobrar de quem preenche um trabalho que a
       * apresentação faz melhor: o papel de cada uma sai do que ela consegue
       * fazer, e isso é conta.
       */
      ...pedido.coresDeApoio.map((hex, i) => ({
        nome: `Cor de apoio ${i + 1}`,
        hex,
        papel:
          hex === cores.acento
            ? 'O botão das peças: separa da cor da marca e aceita texto legível'
            : 'Apoio, para gráficos e destaques',
        sobreBranco: contrasteRatio(hex, '#ffffff'),
      })),
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
    /**
     * A pendência do vetor só existe enquanto o vetor não existe.
     *
     * Ela era incondicional, e uma pendência que não some quando o problema
     * acaba ensina o cliente a ignorar a página de pendências inteira.
     */
    const arquivoDoVetor = join(dir, 'logotipo.svg');
    if (!existsSync(arquivoDoVetor)) {
      pendencias.push(
        'O símbolo em vetor (SVG) ainda não foi produzido. Para aplicação em tamanho muito grande (fachada, veículo), ele é necessário.',
      );
    }
    if (conceitosSemMobile.length > 0) {
      pendencias.push(
        `Falta a versão de telefone de: ${conceitosSemMobile.join(', ')}. O banner de site precisa das duas, e a do telefone não é um recorte da larga — o texto foi diagramado para a largura que o recorte destruiria.`,
      );
    }
    if (artesProntas.length > 0) {
      pendencias.push(
        'Os banners foram gerados por completo — imagem e texto saíram juntos do gerador. A grafia da marca e da chamada foi conferida a olho, e não medida no documento como nas peças compostas: confira o texto antes de publicar.',
      );
    }

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
    /**
     * As regras cuja evidência só existe AQUI.
     *
     * Regra nova da apresentação é entrada nova nesta lista, senão ela nunca sai de
     * pendente: `marca:montar` grava todas as quatro como pendentes e é este passo
     * que as recompõe. Aconteceu com M11 na primeira rodada — a régua a produzia e a
     * folha nunca a recebia.
     */
    const REGRAS_DA_APRESENTACAO = ['M7', 'M8', 'M9', 'M10', 'M11'];
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
          /**
           * A proposta de cada conceito sai do registro quando a arte veio
           * pronta, e do arranjo quando ela foi composta aqui: nos dois casos é
           * a direção declarada, que é o que M10 confere.
           */
          propostasDosConceitos:
            artesProntas.length > 0
              ? artesProntas.map((a) => propostaPorArte[a] ?? a)
              : Object.values(arranjoPorConceito),
          conceitosSemMobile: artesProntas.length > 0 ? conceitosSemMobile : null,
        }).vereditos.filter((v) => REGRAS_DA_APRESENTACAO.includes(v.codigo));

        const anteriores = (lido.data.conferencia ?? []).filter(
          (v) => !REGRAS_DA_APRESENTACAO.includes(v.codigo),
        );
        const folha = [...anteriores, ...daApresentacao].sort(
          (a, b) => Number(a.codigo.slice(1)) - Number(b.codigo.slice(1)),
        );
        /**
         * O CUSTO também é reescrito aqui, e pela mesma razão que a folha.
         *
         * `marca:montar` grava `custoGasto` lendo o razão no momento em que ele
         * roda — e naquele momento só o símbolo saiu. Tudo o que vem depois (as
         * artes, os conceitos, as versões de telefone) é gasto que o resultado
         * nunca via. Medido no job de prova: o resultado dizia 75 e o razão
         * 1425, e o portão da entrega recusou com a conta na mão — "a entrega
         * afirmaria um custo que os lançamentos não sustentam".
         *
         * O número sai do RAZÃO, nunca de um contador local. É a mesma regra que
         * já vale nos dois comandos que o gravam; faltava valer no que o
         * reescreve por último.
         */
        /**
         * O vetor entra na lista de peças do resultado.
         *
         * Ele nasce fora do `derivarPacoteDaMarca` — é uma geração paga, e não
         * um recorte —, então `marca:montar` não o conhece. Sem entrar aqui,
         * ele ficaria em disco e fora da entrega: o portão só confere os
         * arquivos que o resultado CITA.
         *
         * A medida sai do próprio arquivo. Um SVG sem `width`/`height` ainda
         * tem `viewBox`, e é dele que a caixa real vem.
         */
        const pecas = [...lido.data.pecas];
        if (existsSync(arquivoDoVetor) && !pecas.some((x) => x.peca === 'logotipo-svg')) {
          const svg = readFileSync(arquivoDoVetor, 'utf8');
          const caixa = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
          const largura = Math.round(Number(caixa?.[1] ?? 0)) || 1024;
          const altura = Math.round(Number(caixa?.[2] ?? 0)) || 1024;
          pecas.push({ peca: 'logotipo-svg', caminho: 'logotipo.svg', largura, altura });
        }

        const arquivoDoRazao = join(dir, 'razao.json');
        let custoGasto = lido.data.custoGasto;
        if (existsSync(arquivoDoRazao)) {
          try {
            custoGasto = lerRazao(
              ArquivoDoRazao.parse(JSON.parse(readFileSync(arquivoDoRazao, 'utf8'))).lancamentos,
            ).gasto;
          } catch {
            console.warn(
              '  AVISO: o razão está ilegível, então mantive o custo que já estava no resultado.',
            );
          }
        }
        writeFileSync(
          arquivoDoResultado,
          JSON.stringify({ ...lido.data, pecas, conferencia: folha, custoGasto }, null, 2),
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
    if (artesProntas.length > 0) {
      console.log(
        `    ${artesProntas.length} arte(s) PRONTA(S), com o texto já dentro do pixel: ${artesProntas.join(', ')}`,
      );
      console.log(
        '    A régua da peça não roda sobre elas — não há documento para medir. A grafia é conferência de olho, e a apresentação declara isso.',
      );
    }
    console.log(`  Compostas sem gastar crédito: ${paraOPacote.map((p) => p.nome).join(', ')}`);
    console.log('');
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
