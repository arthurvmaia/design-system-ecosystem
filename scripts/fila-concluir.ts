/**
 * Fecha um job da fila depois que o trabalho foi produzido.
 *
 * Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]
 *
 * Este script NÃO chama a API da Anthropic. Ele registra que um job terminou,
 * validando que o que foi produzido existe em disco antes de marcar como
 * concluído — para um job não ser fechado sem entrega. Ao fechar uma extração,
 * ele também segmenta e roda a validação do replay no navegador (passo do
 * processamento, não trabalho de LLM) para promover o que reproduz de verdade.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArquivoDoRazao,
  divergenciasDaFolha,
  lerRazao,
  medirMarca,
  paraARegua,
} from '@ds/creative';
import {
  CODIGOS_DA_REGUA_DE_MARCA,
  PedidoDeMarca,
  ResultadoDeMarca,
  conferirMarca,
  criativoPedidoPath,
  criativosDir,
  dimensaoDePng,
  finishJob,
  getJob,
  listarAssetsFaltando,
  marcaDir,
  marcaPedidoPath,
  problemasDaEntregaCriativa,
  problemasDaEntregaDeMarca,
  projectGeneratedDir,
  referenciaDoPedido,
  vaultDsDir,
  vaultExtractedDir,
} from '@ds/shared';
import { avisoSpa, segmentarEIndexar } from './segmentar.js';

/**
 * A marca a ser REMEDIDA no navegador antes de fechar. `null` = não é job de
 * marca, ou o resultado não deu para ler.
 */
let marcaParaRemedir: { dir: string; resultado: unknown } | null = null;

const [, , jobId, ...rest] = process.argv;

if (jobId === undefined) {
  console.error('Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]');
  process.exit(1);
}

const erroIdx = rest.indexOf('--erro');
const erro = erroIdx >= 0 ? rest[erroIdx + 1] : undefined;

const job = getJob(jobId);
if (job === null) {
  console.error(`Job não encontrado: ${jobId}`);
  process.exit(1);
}
if (job.status !== 'pendente') {
  console.error(`Job já está como "${job.status}".`);
  process.exit(1);
}

if (erro !== undefined) {
  finishJob(jobId, { error: erro });
  console.log(`Job marcado como erro: ${job.label}`);
  process.exit(0);
}

// Verifica que a entrega existe antes de fechar.
const problemas: string[] = [];

/** Preenchido quando o job é de extração e passou na validação. */
let paraSegmentar: `ds_${string}` | null = null;

if (job.type === 'extract') {
  const dsId = job.result?.designSystemId ?? job.payload.designSystemId;
  if (typeof dsId === 'string' && dsId.startsWith('ds_')) {
    paraSegmentar = dsId as `ds_${string}`;
  }
  if (typeof dsId !== 'string') {
    problemas.push('designSystemId não informado — grave o id do design system no job.');
  } else if (!existsSync(vaultDsDir(dsId as `ds_${string}`))) {
    problemas.push(`pasta do vault não existe: ${vaultDsDir(dsId as `ds_${string}`)}`);
  } else {
    // A pasta existir não quer dizer nada. O que interessa é o HTML estar lá e
    // os arquivos que ele promete existirem de verdade — foi por não checar
    // isso que uma extração sem CSS entrou na galeria como se estivesse pronta.
    const extraido = vaultExtractedDir(dsId as `ds_${string}`);
    const htmlPath = join(extraido, 'design-system.html');

    if (!existsSync(htmlPath)) {
      problemas.push(`design-system.html não existe em ${extraido}`);
    } else {
      const html = readFileSync(htmlPath, 'utf8');

      if (html.length < 200) {
        problemas.push('design-system.html tem menos de 200 bytes — está praticamente vazio.');
      }

      const faltando = listarAssetsFaltando(extraido, html);
      if (faltando.length > 0) {
        problemas.push(
          `o HTML referencia ${faltando.length} arquivo(s) que não existem: ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? ` (e mais ${faltando.length - 6})` : ''}`,
        );
        problemas.push(
          'Isso significa que os STEPs 2 a 4 não gravaram os assets. Sem eles o design system abre sem estilo.',
        );
      }
    }
  }
}

if (job.type === 'generate') {
  const prjId = job.payload.projectId;
  if (typeof prjId !== 'string') {
    problemas.push('projectId ausente no payload.');
  } else {
    const geradosDir = projectGeneratedDir(prjId as `prj_${string}`);

    if (!existsSync(geradosDir)) {
      problemas.push(`nenhuma versão gerada em: ${geradosDir}`);
    } else {
      // Mesma checagem da extração, pelo mesmo motivo: um index.html que
      // aponta para um CSS inexistente abre sem estilo. Aqui dói ainda mais,
      // porque é o arquivo que a pessoa vai baixar e mandar para um cliente.
      const versoes = readdirSync(geradosDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      const ultima = versoes.at(-1);

      if (ultima === undefined) {
        problemas.push(`a pasta ${geradosDir} existe mas está vazia.`);
      } else {
        const dir = join(geradosDir, ultima);
        const indexPath = join(dir, 'index.html');

        if (!existsSync(indexPath)) {
          problemas.push(`index.html não existe em ${dir}`);
        } else {
          const html = readFileSync(indexPath, 'utf8');
          const faltando = listarAssetsFaltando(dir, html);
          if (faltando.length > 0) {
            problemas.push(
              `o site gerado referencia ${faltando.length} arquivo(s) que não existem: ${faltando.slice(0, 6).join(', ')}`,
            );
          }
          // A marca precisa VENCER a cascata: quando existe um CSS de marca
          // separado, ele tem que carregar depois do CSS do esqueleto.
          if (existsSync(join(dir, 'assets', 'marca.css'))) {
            const posEsqueleto = html.indexOf('assets/styles.css');
            const posMarca = html.indexOf('assets/marca.css');
            if (posEsqueleto !== -1 && posMarca !== -1 && posMarca < posEsqueleto) {
              problemas.push(
                'assets/marca.css carrega ANTES de assets/styles.css — a identidade do usuário perde a cascata para o esqueleto.',
              );
            }
          }
          // Proveniência explícita é contrato do produto: toda seção declara
          // se veio da biblioteca ou foi criada no estilo.
          if (!/data-origem=/.test(html)) {
            problemas.push(
              'nenhuma seção marca a proveniência (data-origem="biblioteca"|"gerado") no HTML gerado.',
            );
          }
          // Responsividade é REQUISITO: viewport declarado e alguma camada
          // com @media de largura — sem isso o "mobile" é só a página estreitada.
          if (!/name="viewport"/.test(html)) {
            problemas.push('o site gerado não declara a meta viewport — não funciona no celular.');
          }
          const cssDaVersao = ['assets/responsivo.css', 'assets/styles.css', 'assets/marca.css']
            .map((p) => join(dir, p))
            .filter((p) => existsSync(p))
            .map((p) => readFileSync(p, 'utf8'))
            .join('\n');
          if (!/@media[^{]*max-width/.test(cssDaVersao)) {
            problemas.push(
              'nenhum CSS do site tem regra @media de largura — a versão mobile precisa ser pensada, não só espremida.',
            );
          }
        }
      }
    }
  }
}

/**
 * `criativo` — o job que gasta DINHEIRO fechava sem conferência nenhuma.
 *
 * Este ramo não existia. `extract` e `generate` eram validados e o `criativo`
 * caía direto no `finishJob`: resultado ausente, fora do schema, apontando para
 * arquivo que não existe ou com gasto acima do teto — tudo fechava calado, como
 * "concluído". Descoberto ao exercitar o fluxo de ponta a ponta pela primeira
 * vez, que é exatamente para isso que se exercita.
 *
 * As quatro perguntas, na ordem em que doem:
 *
 * 1. **O resultado existe?** Sem `resultado.json` a tela "Minhas peças" não tem
 *    o que mostrar, e o pedido some para quem o fez.
 * 2. **Ele obedece ao contrato?** `ResultadoCriativo` já cobra que aprovada tem
 *    arquivo e que reprovada tem motivo. Aqui isso vira portão em vez de boa
 *    intenção.
 * 3. **O arquivo da aprovada está EM DISCO?** O schema garante que o caminho foi
 *    preenchido, não que ele aponta para algo. Botão de download que baixa 404 é
 *    pior que peça reprovada com motivo.
 * 4. **O gasto respeitou o teto?** A regra do motor é parar ao zerar. Fechar um
 *    job que estourou o teto do cliente seria registrar o estouro como sucesso.
 */
if (job.type === 'criativo') {
  const dir = criativosDir(jobId);
  const arquivo = join(dir, 'resultado.json');

  // A fila é volátil por desenho — o `fila:limpar` a esvazia — e enquanto o
  // pedido morava só lá, esvaziá-la levava junto o teto de créditos, os claims
  // autorizados e a peça inteira da tela "Minhas peças". Por isso o retrato
  // existe, e por isso ele é gravado no ATO do pedido, pelo POST.
  //
  // Quem decide o que fazer com ele é `referenciaDoPedido`, e o porquê está lá.
  const arquivoDoRetrato = criativoPedidoPath(jobId);
  let retratoLido: unknown | undefined = null;
  if (existsSync(arquivoDoRetrato)) {
    try {
      retratoLido = JSON.parse(readFileSync(arquivoDoRetrato, 'utf8'));
    } catch {
      retratoLido = undefined;
    }
  }
  const referencia = referenciaDoPedido({ retrato: retratoLido, payloadDaFila: job.payload });
  if (referencia.ilegivel) {
    problemas.push(
      `o retrato do pedido está ilegível em ${arquivoDoRetrato}: não fecho um job pago sem saber contra que teto medir.`,
    );
  }
  if (referencia.gravarRetrato) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(arquivoDoRetrato, JSON.stringify(job.payload, null, 2), 'utf8');
    } catch (err) {
      problemas.push(
        `não consegui gravar o retrato do pedido em ${dir}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  const pedidoDeReferencia = referencia.pedido;

  if (!existsSync(arquivo)) {
    problemas.push(`resultado.json não existe em ${dir} — a peça não tem onde ser lida.`);
  } else {
    let bruto: unknown = null;
    let leu = false;
    try {
      bruto = JSON.parse(readFileSync(arquivo, 'utf8'));
      leu = true;
    } catch (err) {
      problemas.push(
        `resultado.json não é JSON válido: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    /**
     * O razão entra na conferência.
     *
     * Sem ele, o portão comparava o teto contra o `custoGasto` do
     * `resultado.json` — um número que nasce zerado e que quem produziu escreve.
     * `0 > teto` nunca dispara, e a régua do orçamento era código morto.
     */
    const arquivoDoRazao = join(dir, 'razao.json');
    let razao: { gasto: number; empenhado: number } | undefined;
    if (existsSync(arquivoDoRazao)) {
      try {
        const r = ArquivoDoRazao.parse(JSON.parse(readFileSync(arquivoDoRazao, 'utf8')));
        const conta = lerRazao(r.lancamentos);
        razao = { gasto: conta.gasto, empenhado: conta.empenhado };
      } catch (err) {
        problemas.push(
          `razao.json está ilegível (${err instanceof Error ? err.message : String(err)}): não fecho um job pago por cima de um registro de dinheiro que não consigo ler.`,
        );
      }
    }

    if (leu) {
      problemas.push(
        ...problemasDaEntregaCriativa({
          resultado: bruto,
          pedido: pedidoDeReferencia,
          razao,
          existe: (relativo: string) => existsSync(join(dir, relativo)),
          /**
           * O medidor: é ele que faz o portão conferir o ARQUIVO em vez de
           * acreditar no número que o resultado declara ao lado.
           *
           * Só PNG. O SVG do logotipo devolve `null` — medi-lo exigiria
           * interpretar `viewBox`, e "não consegui medir" é resposta melhor do
           * que um palpite que vira acusação.
           */
          medirImagem: (relativo: string) => {
            const caminho = join(dir, relativo);
            if (!relativo.toLowerCase().endsWith('.png') || !existsSync(caminho)) return null;
            try {
              return dimensaoDePng(readFileSync(caminho));
            } catch {
              return null;
            }
          },
          // O portão mede o ARQUIVO, em vez de acreditar na folha que veio
          // junto: ela é escrita por quem produziu, e uma entrega que confia na
          // própria declaração não é conferida por ninguém.
          dimensaoDe: (relativo) => {
            const caminho = join(dir, relativo);
            if (!existsSync(caminho)) return null;
            try {
              return dimensaoDePng(readFileSync(caminho));
            } catch {
              return null;
            }
          },
        }),
      );
    }
  }
}

/**
 * `marca` — o outro job que gasta DINHEIRO, e que também fechava sem conferência.
 *
 * A marca ganhou tipo próprio na fila e este arquivo não a conhecia: ela caía
 * direto no `finishJob`. É o mesmo buraco que o `criativo` já teve, e o custo é
 * maior — uma marca é carregada por tudo o que a empresa faz depois.
 */
if (job.type === 'marca') {
  const dir = marcaDir(jobId);
  const arquivo = join(dir, 'resultado.json');

  // O retrato manda aqui pela mesma razão do criativo: é contra o teto DELE que
  // o gasto é medido, e o payload da fila é o lado mutável.
  const arquivoDoRetrato = marcaPedidoPath(jobId);
  let retratoLido: unknown | undefined = null;
  if (existsSync(arquivoDoRetrato)) {
    try {
      retratoLido = JSON.parse(readFileSync(arquivoDoRetrato, 'utf8'));
    } catch {
      retratoLido = undefined;
    }
  }
  const referenciaDaMarca = referenciaDoPedido({
    retrato: retratoLido,
    payloadDaFila: job.payload,
  });
  if (referenciaDaMarca.ilegivel) {
    problemas.push(
      `o retrato do pedido de marca está ilegível em ${arquivoDoRetrato}: não fecho um job pago sem saber contra que teto medir.`,
    );
  }

  if (!existsSync(arquivo)) {
    problemas.push(`resultado.json não existe em ${dir} — a marca não tem onde ser lida.`);
  } else {
    let bruto: unknown;
    try {
      bruto = JSON.parse(readFileSync(arquivo, 'utf8'));
    } catch (err) {
      problemas.push(
        `resultado.json não é JSON válido: ${err instanceof Error ? err.message : String(err)}`,
      );
      bruto = undefined;
    }

    const arquivoDoRazaoDaMarca = join(dir, 'razao.json');
    let razaoDaMarca: { gasto: number; empenhado: number } | undefined;
    /**
     * O teto em vigor, quando o dono liberou mais depois do pedido.
     *
     * O retrato continua sendo a trava, e continua intocado; os aumentos vivem
     * no razão, com data e motivo. O portão precisa dos dois — senão ele recusa
     * a entrega de um job cujo estouro tem autorização escrita.
     */
    let tetoEmVigorDaMarca: number | undefined;
    if (existsSync(arquivoDoRazaoDaMarca)) {
      try {
        const arquivo = ArquivoDoRazao.parse(
          JSON.parse(readFileSync(arquivoDoRazaoDaMarca, 'utf8')),
        );
        const conta = lerRazao(arquivo.lancamentos);
        razaoDaMarca = { gasto: conta.gasto, empenhado: conta.empenhado };
        const liberado = arquivo.aumentos.reduce((t, a) => t + a.creditos, 0);
        if (liberado > 0) {
          const teto = PedidoDeMarca.safeParse(referenciaDaMarca.pedido);
          if (teto.success) tetoEmVigorDaMarca = teto.data.tetoDeCreditos + liberado;
        }
      } catch (err) {
        problemas.push(
          `razao.json da marca está ilegível (${err instanceof Error ? err.message : String(err)}): não fecho um job pago por cima de um registro de dinheiro que não consigo ler.`,
        );
      }
    }

    if (bruto !== undefined) marcaParaRemedir = { dir, resultado: bruto };
    if (bruto !== undefined) {
      problemas.push(
        ...problemasDaEntregaDeMarca({
          resultado: bruto,
          pedido: referenciaDaMarca.pedido,
          existe: (relativo: string) => existsSync(join(dir, relativo)),
          temApresentacao: existsSync(join(dir, 'apresentacao.pdf')),
          razao: razaoDaMarca,
          tetoEmVigor: tetoEmVigorDaMarca,
          codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
        }),
      );
    }
  }
}

if (problemas.length > 0) {
  console.error('\nNão dá para concluir este job:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nProduza a saída antes de fechar, ou use --erro para registrar a falha.\n');
  process.exit(1);
}

// Segmentação. Roda aqui, e não a cargo de quem processou, porque é o passo
// que já foi esquecido uma vez: o design system entrou no banco como
// `extracted`, a Galeria abriu com "0 de 0 segmentos" e não havia o que curar.
// Extrair sem segmentar não entrega nada de útil, então os dois andam juntos.
if (paraSegmentar !== null) {
  try {
    const { total, raizes, suspeitoDeSpa } = segmentarEIndexar(paraSegmentar);
    if (total === 0) {
      console.error('\nA segmentação não encontrou nenhuma peça.');
      console.error('O design-system.html existe, mas o <body> não tem filhos');
      console.error('diretos que sirvam como peça. Refaça a captura.\n');
      process.exit(1);
    }
    console.log(`\n${total} peça(s) prontas na Galeria.`);
    // Aviso, não bloqueio: existe página legítima com poucas seções, e recusar
    // fecharia o job de alguém que sabe o que está fazendo. O número do aviso
    // são as SEÇÕES — contar os filhos da subdivisão inflaria a mensagem.
    if (suspeitoDeSpa) console.log(avisoSpa(raizes));
  } catch (err) {
    console.error(`\nFalha ao segmentar: ${err instanceof Error ? err.message : String(err)}`);
    console.error('O job continua pendente — corrija e rode de novo.\n');
    process.exit(1);
  }
}

/**
 * Refaz a régua da marca sobre os ARQUIVOS, e confronta com a folha.
 *
 * `problemasDaEntregaDeMarca` já refaz o que dá para refazer sem navegador — a
 * medida de cada peça e a existência das capas. O resto da régua (alfa,
 * silhueta, contraste) precisa decodificar pixel, e é justamente onde a folha
 * continuava sendo a única fonte: um `passou` escrito por um comando com
 * defeito passava, porque quem escreve a folha é quem produziu a marca.
 *
 * Aqui a medição é REFEITA, por quem não produziu nada. Só a divergência
 * importa: quando esta conferência REPROVA e a folha diz `passou`, a folha está
 * errada e o job não fecha. Onde esta conferência fica `pendente` — as regras
 * da apresentação, que dependem de dados que não existem no fechamento — ela
 * cala, porque "não consegui medir" não é acusação.
 *
 * Sem navegador, devolve lista vazia e DIZ isso. Degradar em silêncio aqui
 * seria substituir uma conferência que não rodou por um verde.
 */
export const remedirAMarca = async (alvo: { dir: string; resultado: unknown }): Promise<
  string[]
> => {
  const lido = ResultadoDeMarca.safeParse(alvo.resultado);
  if (!lido.success || lido.data.conferencia === null) return [];

  /**
   * Só o que o medidor sabe LER: ele decodifica pixel, e o `logotipo.svg` não
   * é pixel. Passá-lo derrubava a remedição inteira com IMAGEM_NAO_CARREGOU —
   * uma peça que o medidor não entende não pode custar a conferência das
   * outras. As três versões da logo, que é o que M1..M5 julgam, são PNG.
   */
  const arquivos: Record<string, string> = {};
  for (const peca of lido.data.pecas) {
    if (!peca.caminho.toLowerCase().endsWith('.png')) continue;
    const caminho = join(alvo.dir, peca.caminho);
    if (existsSync(caminho)) arquivos[peca.peca] = caminho;
  }
  if (Object.keys(arquivos).length === 0) return [];

  let navegador: Awaited<ReturnType<typeof import('playwright').chromium.launch>> | null = null;
  try {
    const { chromium } = await import('playwright');
    navegador = await chromium.launch({ args: ['--no-sandbox'] });
  } catch (err) {
    console.log(
      `  remedição pulada (sem navegador): ${err instanceof Error ? err.message : String(err)}`,
    );
    console.log('    A folha da marca fica valendo pelo que o produtor escreveu.');
    return [];
  }

  try {
    const medidas = await medirMarca(navegador, arquivos);
    const refeita = conferirMarca({
      ...paraARegua(medidas),
      cor: lido.data.cor.hex,
      promptDoSimbolo: lido.data.promptDoSimbolo,
      procedencia: lido.data.procedencia,
      decisaoDaCor: { por: lido.data.cor.decidida, motivo: lido.data.cor.motivo },
      // O que o fechamento não tem como saber: são as regras da apresentação, e
      // elas ficam `pendente` aqui de propósito.
      apresentacao: null,
      briefingsDasArtes: null,
      propostasDosConceitos: null,
      conceitosSemMobile: null,
      colecoesSemCapa: null,
    });

    // O julgamento do confronto mora em `@ds/creative`, com teste: é a regra, e
    // regra não vive num script que executa ao ser importado.
    return divergenciasDaFolha(refeita.vereditos, lido.data.conferencia);
  } catch (err) {
    /**
     * Falhar a remedição NÃO reprova a marca.
     *
     * Um arquivo que o medidor não entende, um navegador que morreu no meio —
     * nada disso é defeito da marca, e transformar "não consegui medir" em
     * "está errado" faria o fechamento recusar entrega boa. Mas também não sai
     * calado: quem lê precisa saber que esta conferência não aconteceu.
     */
    console.log(
      `  remedição falhou: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`,
    );
    console.log('    A folha da marca fica valendo pelo que o produtor escreveu.');
    return [];
  } finally {
    await navegador.close();
  }
};

/**
 * Validação automática do replay (navegador) + fechamento. Num `main` async
 * (não top-level await: o tsx transpila os scripts para CJS). A validação é
 * passo do processamento, logo após os segmentos indexados — sem comando extra
 * do usuário. Reusa a previewRoute de produção e não bloqueia o fechamento: se
 * falhar ou o navegador faltar, os segmentos seguem `replayable` e a validação
 * pode rodar depois; nunca vira `unsupported` por indisponibilidade.
 */
const finalizar = async (): Promise<void> => {
  if (marcaParaRemedir !== null) {
    console.log('');
    console.log('Refazendo a régua da marca sobre os arquivos…');
    const divergencias = await remedirAMarca(marcaParaRemedir);
    if (divergencias.length > 0) {
      console.error('');
      console.error('Não dá para concluir este job:');
      console.error('');
      for (const d of divergencias) console.error(`  - ${d}`);
      console.error('');
      console.error(
        'A folha afirma o que a medição nega. Conserte a marca, ou o comando que escreveu a folha.',
      );
      console.error('');
      process.exit(1);
    }
    console.log('  A folha bate com o que eu medi.');
  }

  if (paraSegmentar !== null) {
    try {
      const { validarPreviews } = await import('@ds/server/validate');
      console.log('\nValidando previews (navegador)…');
      const val = await validarPreviews(paraSegmentar);
      const validadas = val.results.filter((r) => r.ok).length;
      console.log(`  ${val.status}: ${validadas} interação(ões) validada(s).`);
    } catch (err) {
      console.log(`  validação pulada: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  finishJob(jobId, { result: { fechadoEm: new Date().toISOString() } });
  console.log(`\nConcluído: ${job.label}\n`);
};

finalizar().catch((err) => {
  console.error(`\nFalha ao concluir: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
