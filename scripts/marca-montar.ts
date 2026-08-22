/**
 * Monta a MARCA a partir do símbolo gerado: deriva, mede, confere e grava.
 *
 * Uso:
 *   pnpm marca:montar <job_id> --prompt              # só imprime o prompt do símbolo
 *   pnpm marca:montar <job_id> --simbolo <arquivo>   # monta a marca inteira
 *
 * ## A divisão de trabalho, e por que ela é assim
 *
 * Quem fala com o provedor é o AGENTE, pelo MCP: a autenticação é OAuth
 * interativo, e a própria documentação diz que ela não serve a um backend não
 * assistido. Então este comando não gera nada — ele faz a metade
 * DETERMINÍSTICA, que é toda a metade que se pode conferir:
 *
 *   1. `--prompt` imprime o prompt EXATO, montado do briefing por regra. O
 *      agente passa esse texto ao gerador sem reescrever: é ele que fica
 *      gravado no resultado, e é ele que faz a marca ser reproduzível (M6).
 *   2. `--simbolo` recebe o arquivo que voltou, deriva as três versões por
 *      CÁLCULO, mede tudo no navegador, roda M1..M6 e grava o `resultado.json`.
 *
 * Nenhum crédito é gasto aqui, nas duas chamadas. O símbolo custa uma geração e
 * as versões saem dele — pedi-las ao gerador abriria três pedidos novos e ele
 * desenharia outro símbolo a cada um, que foi como a marca chegava em três
 * modelos diferentes em vez de uma marca em três roupas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  ArquivoDoRazao,
  corDaMarca,
  cssDaFonte,
  derivarLogosDaMarca,
  derivarPacoteDaMarca,
  lerRazao,
  medirMarca,
  paraARegua,
  promptDoSimbolo,
} from '@ds/creative';
import {
  PedidoDeMarca,
  conferirMarca,
  ehJobId,
  marcaDir,
  marcaPedidoPath,
  rotuloDaPeca,
} from '@ds/shared';
import { chromium } from 'playwright';
import { executadoDireto } from './executado-direto.js';

const USO = [
  'Uso:',
  '  pnpm marca:montar <job_id> --prompt',
  '  pnpm marca:montar <job_id> --simbolo <arquivo>',
].join('\n  ');

/**
 * Anotação no LADO ESQUERDO de propósito.
 *
 * O TypeScript só usa uma função que nunca retorna para estreitar o tipo do
 * que vem DEPOIS dela quando a anotação está na variável, não no valor.
 */
const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const principal = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const jobId = args[0];
  const soPrompt = args.includes('--prompt');
  const iSimbolo = args.indexOf('--simbolo');
  const simboloArg = iSimbolo >= 0 ? args[iSimbolo + 1] : undefined;

  if (jobId === undefined || !ehJobId(jobId)) morrer(`Id de job inválido.\n\n  ${USO}`);
  const dir = marcaDir(jobId as string);
  const arquivoDoPedido = marcaPedidoPath(jobId as string);
  if (!existsSync(arquivoDoPedido)) morrer(`Não achei o pedido em ${arquivoDoPedido}.`);

  const lido = PedidoDeMarca.safeParse(JSON.parse(readFileSync(arquivoDoPedido, 'utf8')));
  if (!lido.success) morrer(`O pedido não passa no contrato: ${lido.error.issues[0]?.message}`);
  const pedido = lido.data;

  const cor = corDaMarca(pedido.corPreferida);
  const prompt = promptDoSimbolo(pedido, cor.hex);

  if (soPrompt || simboloArg === undefined) {
    console.log('');
    console.log(`  Marca: ${pedido.nome}`);
    console.log(`  Família: ${prompt.familia} (${prompt.motivoDaFamilia})`);
    console.log(`  Cor: ${cor.hex}${cor.decidida === 'orbis' ? ' — escolhida pelo Orbis' : ''}`);
    if (cor.motivo !== '') console.log(`         ${cor.motivo}`);
    console.log(`  Teto do pedido: ${pedido.tetoDeCreditos} créditos`);
    console.log('');
    console.log('  PROMPT (passe este texto ao gerador, sem reescrever):');
    console.log('');
    console.log(`  ${prompt.texto}`);
    console.log('');
    if (!soPrompt) {
      console.log('  Depois, monte a marca:');
      console.log(`  pnpm marca:montar ${jobId} --simbolo <arquivo baixado>`);
      console.log('');
    }
    return;
  }

  const simbolo = isAbsolute(simboloArg) ? resolve(simboloArg) : resolve(join(dir, simboloArg));
  if (!existsSync(simbolo)) morrer(`O símbolo não existe: ${simbolo}`);

  mkdirSync(dir, { recursive: true });
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const versoes = await derivarLogosDaMarca(navegador, simbolo);
    const arquivos: Record<string, string> = {
      logotipo: join(dir, 'logotipo.png'),
      'logotipo-fundo-branco': join(dir, 'logotipo-fundo-branco.png'),
      'logotipo-fundo-preto': join(dir, 'logotipo-fundo-preto.png'),
      'logotipo-negativo': join(dir, 'logotipo-negativo.png'),
    };
    writeFileSync(arquivos.logotipo as string, versoes.transparente);
    writeFileSync(arquivos['logotipo-fundo-branco'] as string, versoes.fundoBranco);
    writeFileSync(arquivos['logotipo-fundo-preto'] as string, versoes.fundoPreto);
    writeFileSync(arquivos['logotipo-negativo'] as string, versoes.negativo);

    /**
     * O resto do pacote, também por CÁLCULO e também de graça.
     *
     * Lockup horizontal e vertical, nome por extenso e os cinco favicons mais o
     * `.ico` — cinco páginas da referência que custam zero, porque são o mesmo
     * símbolo em outra roupa. É por isso que 22 seções custam 9 gerações.
     *
     * A fonte da marca entra embutida: o nome é DESENHADO em tipografia, e não
     * gerado, porque modelo erra letra e a grafia da marca é a única coisa
     * deste contrato que não admite interpretação.
     */
    const familia = 'Sora';
    const fonteCss = (await cssDaFonte(familia)) ?? '';
    if (fonteCss === '') {
      console.warn(
        `
  AVISO: não consegui obter a fonte "${familia}". O nome sai na letra da casa.`,
      );
    }
    const pacote = await derivarPacoteDaMarca(navegador, {
      simbolo: arquivos.logotipo as string,
      nome: pedido.nome,
      cor: cor.hex,
      fonteCss,
      familia: fonteCss === '' ? null : familia,
    });
    for (const [peca, png] of Object.entries(pacote.pngs)) {
      const destino = join(dir, `${peca}.png`);
      writeFileSync(destino, png);
      arquivos[peca] = destino;
    }
    writeFileSync(join(dir, 'favicon.ico'), pacote.ico);

    const medidas = await medirMarca(navegador, arquivos);
    const conferencia = conferirMarca({
      ...paraARegua(medidas),
      cor: cor.hex,
      promptDoSimbolo: prompt.texto,
      procedencia: {
        modelo: pedido.preset ?? 'imagem-marca',
        preset: pedido.preset ?? 'imagem-marca',
      },
      decisaoDaCor: { por: cor.decidida, motivo: cor.motivo },
      /**
       * A apresentação e os briefings NÃO são conferidos aqui.
       *
       * Este comando monta as peças a partir do símbolo; a apresentação é o
       * passo seguinte (`pnpm marca:apresentar`) e é ele que mede M7, M8 e M9.
       * Declarar `null` faz as três saírem PENDENTES — que é a verdade neste
       * ponto do percurso, e o que impede a marca de parecer pronta antes de a
       * apresentação existir.
       */
      apresentacao: null,
      briefingsDasArtes: null,
      propostasDosConceitos: null,
      conceitosSemMobile: null,
      // As capas ainda não existem neste passo: quem as recorta é
      // `marca:colecoes --montar`, e quem as confere é `marca:apresentar`.
      colecoesSemCapa: null,
    });

    /**
     * O custo sai do RAZÃO, não de um contador local.
     *
     * É a mesma razão do lado criativo: enquanto o resultado escrevia um número
     * próprio, ele e os lançamentos nunca se encontravam, e a conferência de
     * teto comparava contra um zero que nunca dispara.
     */
    const arquivoDoRazao = join(dir, 'razao.json');
    let custoGasto = 0;
    if (existsSync(arquivoDoRazao)) {
      try {
        custoGasto = lerRazao(
          ArquivoDoRazao.parse(JSON.parse(readFileSync(arquivoDoRazao, 'utf8'))).lancamentos,
        ).gasto;
      } catch {
        morrer(
          'O razão está ilegível, e sem ele eu não sei quanto esta marca custou. Não gravo entrega com custo inventado.',
        );
      }
    }

    const resultado = {
      pecas: Object.entries(arquivos).map(([peca, caminho]) => {
        const m = medidas.porPeca[peca];
        return {
          peca,
          caminho: caminho.slice(dir.length + 1).replace(/\\/g, '/'),
          largura: m?.largura ?? 0,
          altura: m?.altura ?? 0,
        };
      }),
      cor: { hex: cor.hex, decidida: cor.decidida, motivo: cor.motivo },
      procedencia: {
        modelo: pedido.preset ?? 'imagem-marca',
        preset: pedido.preset ?? 'imagem-marca',
      },
      promptDoSimbolo: prompt.texto,
      conferencia: conferencia.vereditos,
      custoGasto,
    };
    writeFileSync(join(dir, 'resultado.json'), JSON.stringify(resultado, null, 2), 'utf8');

    const rotulo = rotuloDaPeca(conferencia);
    console.log('');
    console.log(`  ${pedido.nome} — ${rotulo}`);
    console.log(
      `  distância entre as versões: ${medidas.distanciaEntreVersoes?.toFixed(3) ?? 'não medida'}`,
    );
    for (const v of conferencia.vereditos) {
      const marca =
        v.estado === 'passou' ? '  ok  ' : v.estado === 'reprovou' ? ' FALHA' : ' pend.';
      console.log(
        `   ${marca} ${v.codigo}  ${v.titulo}${v.motivo === '' ? '' : `\n           ${v.motivo}`}`,
      );
    }
    console.log('');
    console.log(
      `  ${Object.keys(arquivos).length + 1} arquivos em ${dir}, todos do MESMO símbolo, por cálculo.`,
    );
    console.log('');
  } catch (err) {
    /**
     * O recorte falhou — quase sempre porque o fundo do símbolo não era liso.
     *
     * Entregar o símbolo como ele veio é melhor que um recorte que comeu metade
     * do desenho, e gerar de novo custa outros 75: quem chamou decide, sabendo.
     */
    morrer(
      [
        `Não consegui montar a marca (${err instanceof Error ? err.message : String(err)}).`,
        'O recorte pressupõe fundo LISO de cor única, bem separado do símbolo, que é o que o prompt pede.',
        'Se o símbolo veio com fundo texturizado, gerar de novo custa outra vez: vale conferir o prompt antes.',
      ].join('\n  '),
    );
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
