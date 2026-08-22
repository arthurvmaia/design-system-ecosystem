import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { MEDIDO_EM, VALIDA_ATE, estimar } from '@ds/creative';
import {
  PedidoCriativo,
  ResultadoCriativo,
  criativoPedidoPath,
  criativoRascunhoDir,
  criativoUploadDir,
  criativosDir,
  criativosRootDir,
  dentroDaRaiz,
  ehJobId,
  enfileirarUmaVez,
  jobNaFila,
  listDoneJobs,
  listPendingJobs,
  removerRegistroDoJob,
  rotuloDaConferencia,
} from '@ds/shared';
import { Hono } from 'hono';
import { exigeSenhaDeAcao } from '../lib/exige-senha-de-acao.js';
import { conferirUpload, nomeSeguro, tipoPelaExtensao } from '../lib/upload-recebido.js';

/**
 * As PEÇAS produzidas pela frente Criativos.
 *
 * ## O buraco que isto fecha
 *
 * O contrato do pedido estava inteiro (`PedidoCriativo`), a tela dos quatro
 * passos existia e o Expresso também. Só que o job produzido não tinha onde
 * aparecer: quem pedia uma peça enfileirava e nunca mais a via. O resultado
 * mora em `criativos/<job>/resultado.json`, ao lado dos arquivos, e ninguém
 * lia aquilo.
 *
 * ## Por que a lista vem da FILA, e não do banco
 *
 * Porque é a fila que sabe o estado. Um pedido pode estar pendente (ninguém
 * processou), em andamento (o Orbis está produzindo) ou concluído — e a tela
 * precisa mostrar os três, senão quem pediu acha que o pedido sumiu. O banco
 * não guarda criativo; a pasta guarda o produto, a fila guarda o percurso.
 *
 * ## O que NÃO vira download
 *
 * Variação `reprovada` ou `falhou` não ganha arquivo servido, mesmo que o
 * arquivo exista em disco. É a regra do contrato: peça que não passou na
 * verificação não vira download silencioso — a tela diz o que falhou. Servir
 * assim mesmo transformaria "reprovada" em rótulo decorativo.
 */
export const criativosRoute = new Hono();

/**
 * Os tipos que se leem como documento, e não como imagem.
 *
 * `.svg` e `.pdf` executam script quando o navegador ABRE a URL (aba nova,
 * `<iframe>`, `<object>`) — e as duas estão na lista de tipos servidos porque a
 * frente pode produzi-las. Como imagem (`<img src>`) elas são inertes, que é
 * como a grade de prévia as usa.
 *
 * Por isso a defesa é `sandbox`, e não `Content-Disposition: attachment`: o
 * mesmo endereço alimenta a prévia e o botão de baixar (`CriativosPecas.tsx:179`
 * monta um só `url` para os dois), então forçar download apagaria a prévia de
 * todas as peças para proteger duas.
 */
const EXECUTA_SE_ABERTO = new Set(['.svg', '.pdf']);

/** Os tipos que a frente produz. Fora desta lista, nada é servido. */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

type PedidoLido = {
  marca: string;
  formato: string | null;
  tipo: string | null;
  variacoes: number | null;
};

/** O que a tela mostra do pedido, sem despejar o payload inteiro nela. */
const lerPedido = (payload: unknown): PedidoLido => {
  const p = PedidoCriativo.safeParse(payload);
  if (!p.success)
    return { marca: 'pedido não reconhecido', formato: null, tipo: null, variacoes: null };
  return {
    marca: p.data.marca,
    formato: p.data.formato,
    tipo: p.data.tipo,
    variacoes: p.data.variacoes,
  };
};

const lerResultado = (jobId: string): ResultadoCriativo | null => {
  const arquivo = join(criativosDir(jobId), 'resultado.json');
  if (!existsSync(arquivo)) return null;
  try {
    const cru = ResultadoCriativo.parse(JSON.parse(readFileSync(arquivo, 'utf8')));
    return cru;
  } catch {
    // Resultado ilegível é ausência de resultado, não erro de servidor: a tela
    // continua mostrando o pedido e o estado dele.
    return null;
  }
};

/**
 * A duração do vídeo do preset `video-curto`.
 *
 * O contrato ainda não tem campo de duração — quando tiver, ele manda. Até lá o
 * número vive aqui, ao lado da conta que ele alimenta, em vez de espalhado.
 */
const SEGUNDOS_DO_VIDEO = 8;

/**
 * Quanto custa, de verdade.
 *
 * A tela mostrava 75 e 300 por variação, escritos à mão num arquivo do front
 * (`criativos/partes.ts`), com um comentário admitindo que o de vídeo era
 * "chute deliberado". O de vídeo estava errado por 73%: o preset escolhido custa
 * 520 por peça de 8s com áudio.
 *
 * Número de dinheiro não pode viver na tela. Ele sai da tabela MEDIDA, e quando
 * a tabela vence esta rota recusa — porque um preço velho respondendo com a
 * mesma confiança de sempre é pior que não responder.
 */
criativosRoute.get('/custos', (c) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const imagem = estimar({
    presetId: 'imagem-padrao',
    transporte: 'mcp',
    quantidade: 1,
    resolucao: '2k',
    hoje,
  });
  const video = estimar({
    presetId: 'video-curto',
    transporte: 'mcp',
    segundos: SEGUNDOS_DO_VIDEO,
    comAudio: true,
    hoje,
  });

  // Cada um recusa por si: juntar os dois num `||` só diria que "algum" falhou,
  // e a tela precisa do motivo daquele que falhou.
  if (!imagem.ok) return c.json({ error: 'preco_indisponivel', message: imagem.motivo }, 409);
  if (!video.ok) return c.json({ error: 'preco_indisponivel', message: video.motivo }, 409);

  return c.json({
    medidoEm: MEDIDO_EM,
    validaAte: VALIDA_ATE,
    porVariacao: { imagem: imagem.creditos, video: video.creditos },
    detalhe: {
      imagem: 'Nano Banana 2, 2K',
      video: `Veo 3.1 Lite, ${SEGUNDOS_DO_VIDEO}s, 1080p, com áudio`,
    },
  });
});

/** O retrato do pedido gravado ao lado da saída, quando existe. */
const lerPedidoEmDisco = (jobId: string): unknown => {
  const arquivo = criativoPedidoPath(jobId);
  if (!existsSync(arquivo)) return null;
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
};

/** As pastas de criativo que existem em disco, com id de verdade. */
const jobsEmDisco = (): string[] => {
  const raiz = criativosRootDir();
  if (!existsSync(raiz)) return [];
  try {
    return readdirSync(raiz, { withFileTypes: true })
      .filter((d) => d.isDirectory() && ehJobId(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
};

const montarItem = (dados: {
  id: string;
  label: string;
  status: string;
  criadoEm: number;
  payload: unknown;
}) => {
  const resultado = lerResultado(dados.id);
  const variacoes = resultado?.variacoes ?? [];
  return {
    id: dados.id,
    label: dados.label,
    status: dados.status,
    criadoEm: dados.criadoEm,
    pedido: lerPedido(dados.payload),
    // A contagem vem do resultado, e é ela que a tela usa para dizer
    // "3 de 4 aprovadas" sem baixar arquivo nenhum.
    variacoes,
    aprovadas: variacoes.filter((v) => v.estado === 'aprovada').length,
    /**
     * Quantas das aprovadas carregam pendência nomeada.
     *
     * Sai daqui e não da tela porque o `estado` gravado não sabe dizer: o
     * schema só conhece `aprovada | reprovada | falhou`, então "aprovada com
     * ressalva" colapsa em "aprovada" no disco. Enquanto ninguém derivava isto
     * da folha, a tela dizia "3 de 3 aprovadas" sobre peças cujo C7 e C8
     * estavam explicitamente pendentes — o carimbo verde que a régua inteira
     * existe para não dar.
     */
    comRessalva: variacoes.filter(
      (v) => rotuloDaConferencia(v.conferencia) === 'aprovada com ressalva',
    ).length,
    custoGasto: resultado?.custoGasto ?? null,
  };
};

/**
 * A lista de peças sai da fila E do disco.
 *
 * Só da fila era frágil de um jeito que já custava material: a fila é uma caixa
 * de entrada, o `fila:limpar` a esvazia, e a peça paga sumia da tela junto com
 * o registro — os arquivos continuavam em `criativos/<job_id>/`, alcançáveis
 * apenas por quem soubesse o id de cor.
 *
 * Pasta SEM `resultado.json` não entra: ali não há o que mostrar e não houve
 * perda. E o que vem do disco diz que veio do disco, em vez de fingir que o
 * registro da fila ainda existe.
 */
criativosRoute.get('/', (c) => {
  const daFila = [...listPendingJobs(), ...listDoneJobs()].filter((j) => j.type === 'criativo');
  const naFila = new Set(daFila.map((j) => j.id));

  const recuperados = jobsEmDisco()
    .filter((id) => !naFila.has(id))
    .flatMap((id) => {
      if (lerResultado(id) === null) return [];
      const payload = lerPedidoEmDisco(id);
      const marca = lerPedido(payload).marca;
      let criadoEm = 0;
      try {
        criadoEm = statSync(criativosDir(id)).mtimeMs;
      } catch {
        // Pasta sumiu entre a listagem e a leitura: entra sem data em vez de
        // derrubar a tela inteira por causa de um item.
      }
      return [
        montarItem({
          id,
          label: `Criativo: ${marca} (recuperado do disco)`,
          // O registro da fila não existe mais, então o desfecho não é
          // conhecido — o que se sabe é que a peça produziu resultado e saiu
          // da fila. Dizer mais que isso seria inventar.
          status: 'concluido',
          criadoEm,
          payload,
        }),
      ];
    });

  const items = [
    ...daFila.map((job) =>
      montarItem({
        id: job.id,
        label: job.label,
        status: job.status,
        criadoEm: job.createdAt,
        payload: job.payload,
      }),
    ),
    ...recuperados,
  ].sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0));

  return c.json({ items });
});

/**
 * O id do job SAI da chave de envio.
 *
 * É o que torna o enfileiramento idempotente numa syscall: o mesmo clique
 * derivado duas vezes produz o mesmo nome de arquivo, e `flag: 'wx'` recusa o
 * segundo. Hexadecimal porque o id vira caminho de disco e `ehJobId` só aceita
 * alfanumérico.
 */
const hashDaChave = (chave: string): string =>
  createHash('sha256').update(chave, 'utf8').digest('hex').slice(0, 24);

const idDaChave = (chave: string): string => `job_${hashDaChave(chave)}`;

/**
 * O rascunho e o job saem da MESMA chave.
 *
 * É o que liga o arquivo enviado ao pedido que vai citá-lo, sem inventar um
 * segundo identificador para a tela guardar e depois devolver certo.
 */
const idDoRascunho = (chave: string): string => `rasc_${hashDaChave(chave)}`;

/**
 * A mesma forma vira a mesma string, seja qual for a ordem em que as chaves
 * foram escritas.
 *
 * A primeira versão disto usava `JSON.stringify(a, Object.keys(a).sort())`,
 * achando que o segundo argumento ordenava. Ele não ordena: um array ali é uma
 * LISTA DE CHAVES PERMITIDAS, aplicada recursivamente. Como a lista tinha só as
 * chaves do topo, tudo que era objeto aninhado — `imagem`, `texto`,
 * `autorizacoesDeClaim` — serializava como `{}`.
 *
 * O efeito era caro e silencioso: dois pedidos que diferiam SÓ na headline, ou
 * um que trocava `origem: 'gerar'` por `'upload'`, comparavam iguais. O reenvio
 * voltava 200 "repetido", e o que era produzido e cobrado era o pedido VELHO —
 * inclusive gerando quando o cliente tinha acabado de mandar o arquivo dele.
 */
const canonico = (v: unknown): string =>
  JSON.stringify(v, (_chave, valor) =>
    valor !== null && typeof valor === 'object' && !Array.isArray(valor)
      ? Object.fromEntries(
          Object.entries(valor as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : valor,
  );

/** Dois pedidos são o mesmo? */
const mesmoConteudo = (a: unknown, b: unknown): boolean => canonico(a) === canonico(b);

/**
 * Cria o pedido criativo. É a ponte que faltava.
 *
 * As duas pontas já existiam há tempo — o contrato (`PedidoCriativo`, com
 * upload vencendo geração, claims um a um e teto obrigatório) e a leitura
 * (listar, conferir, baixar só o aprovado). No meio não havia nada: as telas
 * terminavam num aviso dizendo, por escrito, que não enfileiravam nada.
 *
 * Três coisas acontecem aqui, nesta ordem, e nenhuma delas pode faltar:
 *
 * 1. **A credencial da ação.** 428 quando não veio. O diálogo da tela já pedia
 *    a senha e jogava fora o que foi digitado; agora ela chega, e é o servidor
 *    que decide.
 * 2. **A idempotência.** O id sai da chave de envio, e o arquivo é criado com
 *    exclusividade. Clicar duas vezes devolve o MESMO job em vez de abrir dois
 *    e cobrar duas vezes.
 * 3. **O retrato do pedido em disco**, ao lado de onde a saída vai nascer. A
 *    fila é volátil; o pedido não pode ser.
 */
/**
 * Recebe o arquivo do cliente ANTES de o pedido existir.
 *
 * O contrato exige o caminho do arquivo dentro do próprio pedido, e o job só
 * nasce quando o pedido é aceito: sem um lugar para o arquivo esperar, escolher
 * "tenho a foto" criaria um pedido apontando para um arquivo que não existe em
 * lugar nenhum. O rascunho fica indexado pela CHAVE DO ENVIO, a mesma que dá o
 * id do job, para o pedido aceito saber qual pasta é a dele.
 */
/**
 * Os papéis que um arquivo pode ter no rascunho.
 *
 * Enquanto havia um só, a pasta do rascunho guardava um arquivo e reenviar
 * apagava tudo. Com a direção de marca o pedido passou a trazer DOIS arquivos
 * de naturezas diferentes — a imagem da peça e o logotipo —, e um apagaria o
 * outro. Cada papel ganha sua gaveta, e trocar a imagem não derruba a logo.
 */
const PAPEIS_DO_RASCUNHO = ['imagem', 'logotipo'] as const;
type PapelDoRascunho = (typeof PAPEIS_DO_RASCUNHO)[number];

const papelPedido = (cru: string | undefined): PapelDoRascunho | null => {
  // Ausente é `imagem`: é o que toda tela mandava antes de o logotipo existir,
  // e um rascunho em voo não pode virar 400 no meio de um envio.
  if (cru === undefined || cru === '') return 'imagem';
  return (PAPEIS_DO_RASCUNHO as readonly string[]).includes(cru) ? (cru as PapelDoRascunho) : null;
};

/** A gaveta de um papel dentro do rascunho. */
const gavetaDoRascunho = (rascunhoId: string, papel: PapelDoRascunho): string =>
  join(criativoRascunhoDir(rascunhoId), papel);

/**
 * O arquivo guardado num papel, ou `null`.
 *
 * Lê a gaveta E a raiz do rascunho: rascunho aberto antes desta mudança guardou
 * o arquivo solto, e transformar isso em "upload ausente" faria a pessoa perder
 * o envio por uma mudança nossa.
 */
const arquivoDaGaveta = (rascunhoId: string, papel: PapelDoRascunho): string | null => {
  const gaveta = gavetaDoRascunho(rascunhoId, papel);
  if (existsSync(gaveta)) {
    const achado = readdirSync(gaveta).filter((f) => !f.startsWith('.'))[0];
    if (achado !== undefined) return achado;
  }
  if (papel !== 'imagem') return null;
  const raiz = criativoRascunhoDir(rascunhoId);
  if (!existsSync(raiz)) return null;
  return (
    readdirSync(raiz, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name)[0] ?? null
  );
};

criativosRoute.post('/rascunhos/:chave/arquivo', async (c) => {
  const rascunho = idDoRascunho(c.req.param('chave'));
  const papel = papelPedido(c.req.query('papel'));
  if (papel === null) {
    return c.json(
      {
        error: 'papel_desconhecido',
        message: `Não sei o que fazer com um arquivo de papel "${c.req.query('papel')}". Os papéis são: ${PAPEIS_DO_RASCUNHO.join(', ')}.`,
      },
      400,
    );
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (typeof file === 'string' || !file || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'sem_arquivo', message: 'Não veio arquivo nenhum.' }, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const recusa = conferirUpload({ nome: file.name ?? '', tamanho: file.size, bytes });
  if (recusa !== null) {
    return c.json({ error: recusa.error, message: recusa.message }, recusa.status);
  }

  // Um papel, um arquivo: reenviar TROCA o anterior em vez de acumular lixo que
  // ninguém sabe qual é. O que se apaga agora é só a gaveta deste papel.
  const dir = gavetaDoRascunho(rascunho, papel);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const nome = nomeSeguro(file.name ?? '');
  writeFileSync(join(dir, nome), bytes);
  return c.json({ caminho: nome, papel, tipo: tipoPelaExtensao(nome) }, 201);
});

criativosRoute.post('/', async (c) => {
  const recusa = exigeSenhaDeAcao(c);
  if (recusa !== null) return recusa;

  let corpo: { chaveDeEnvio?: unknown; pedido?: unknown } = {};
  try {
    corpo = (await c.req.json()) as typeof corpo;
  } catch {
    return c.json({ error: 'corpo_invalido', message: 'Não consegui ler o pedido.' }, 400);
  }

  const chave = typeof corpo.chaveDeEnvio === 'string' ? corpo.chaveDeEnvio.trim() : '';
  if (chave === '') {
    return c.json(
      {
        error: 'chave_ausente',
        message:
          'Falta a chave deste envio. Ela é o que impede o mesmo clique de virar dois pedidos pagos.',
      },
      400,
    );
  }

  const lido = PedidoCriativo.safeParse(corpo.pedido);
  if (!lido.success) {
    return c.json(
      {
        error: 'pedido_invalido',
        message: 'O pedido não passa no contrato.',
        problemas: lido.error.issues.map((i) => ({ campo: i.path.join('.'), motivo: i.message })),
      },
      400,
    );
  }
  /**
   * Vídeo ainda não tem produção nem conferência, e por isso não é vendido.
   *
   * A tela mostra 520 créditos por peça de vídeo, mas não existe rota que
   * produza `.mp4`, e o portão de entrega não sabe medir duração nem dimensão
   * de vídeo. Aceitar o pedido seria cobrar por uma coisa que só poderia sair
   * errada — na melhor hipótese, uma imagem parada entregue como vídeo.
   *
   * Recusar aqui é a resposta honesta enquanto a rota não existe. Quando ela
   * existir, esta guarda sai junto com o teste que a prova.
   */
  if (lido.data.tipo === 'video') {
    return c.json(
      {
        error: 'video_ainda_nao',
        message:
          'Ainda não produzo vídeo: não há rota de produção nem conferência de duração e dimensão. Aceitar o pedido seria cobrar por uma peça que eu não sei entregar.',
      },
      400,
    );
  }

  const jobId = idDaChave(chave);

  /**
   * O upload deixa de ser uma promessa.
   *
   * O contrato garante que um pedido `upload` traz um caminho, não que aquele
   * caminho aponte para alguma coisa. A tela só guardava `file.name`, então o
   * pedido nascia citando um arquivo que não existia em lugar nenhum — e isso
   * só apareceria na hora de produzir, depois de a pessoa já ter confirmado.
   *
   * Aqui o arquivo é conferido AGORA, e o caminho do pedido passa a ser o de
   * dentro da pasta do job, relativo, como o contrato pede.
   */
  let pedido = lido.data;
  const rascunhoId = idDoRascunho(chave);
  const rascunho = criativoRascunhoDir(rascunhoId);
  let arquivoDoRascunho: string | null = null;

  /**
   * Este envio já foi aceito antes?
   *
   * O rascunho é esvaziado quando o pedido entra, então um reenvio da mesma
   * chave não acha mais o arquivo na gaveta — e respondia `upload_ausente`, um
   * 400, para quem clicou duas vezes. A idempotência existe justamente para o
   * segundo clique devolver o MESMO job, e ela caía no caso que mais precisa
   * dela: o pedido que já tem arquivo pago em disco.
   *
   * Havendo retrato, os caminhos vêm DELE. O que decide "é o mesmo pedido?" é
   * todo o resto — marca, formato, texto, teto —, não o nome do arquivo, que é
   * o servidor quem escreve.
   */
  const jaAceito = lerPedidoEmDisco(jobId);
  const doRetrato = jaAceito === null ? null : PedidoCriativo.safeParse(jaAceito);
  if (doRetrato?.success === true) {
    pedido = {
      ...pedido,
      imagem: { ...pedido.imagem, caminhoDoUpload: doRetrato.data.imagem.caminhoDoUpload },
      direcao: { ...pedido.direcao, logotipo: doRetrato.data.direcao.logotipo },
    };
  }

  if (doRetrato?.success !== true && pedido.imagem.origem === 'upload') {
    arquivoDoRascunho = arquivoDaGaveta(rascunhoId, 'imagem');
    if (arquivoDoRascunho === null) {
      return c.json(
        {
          error: 'upload_ausente',
          message:
            'Este pedido diz que tem arquivo, mas não recebi nenhum. Envie o arquivo antes de confirmar.',
        },
        400,
      );
    }
    pedido = {
      ...pedido,
      imagem: { ...pedido.imagem, caminhoDoUpload: `upload/${arquivoDoRascunho}` },
    };
  }

  /**
   * O logotipo segue o mesmo caminho do upload da peça, e pela mesma razão.
   *
   * O contrato diz que `direcao.logotipo` é relativo à pasta do job. A tela não
   * tem como saber esse caminho antes de o job existir, então ela envia o
   * arquivo para a gaveta e o servidor reescreve o campo aqui. Declarar um
   * logotipo e não ter mandado o arquivo REPROVA: seguir calado entregaria uma
   * peça sem a marca que o pedido prometeu, e o contrário do que se pediu não
   * pode passar por omissão.
   */
  const logotipoDoRascunho =
    doRetrato?.success === true ? null : arquivoDaGaveta(rascunhoId, 'logotipo');
  /**
   * O nome com que o logotipo passa a morar no job.
   *
   * Os dois arquivos vão para a MESMA pasta `upload/`, e nada impede o cliente
   * de mandar a foto e a logo chamadas `logo.png`. Sem desempate, o segundo
   * `renameSync` apagaria o primeiro e o pedido apontaria dois campos para um
   * arquivo só.
   */
  const nomeDoLogotipoNoJob =
    logotipoDoRascunho !== null && logotipoDoRascunho === arquivoDoRascunho
      ? `logotipo-${logotipoDoRascunho}`
      : logotipoDoRascunho;
  if (doRetrato?.success !== true && pedido.direcao.logotipo !== null) {
    if (logotipoDoRascunho === null) {
      return c.json(
        {
          error: 'logotipo_ausente',
          message:
            'Este pedido declara um logotipo e o arquivo não chegou. Envie o logotipo antes de confirmar, ou tire a marca do logotipo do pedido.',
        },
        400,
      );
    }
    pedido = {
      ...pedido,
      direcao: { ...pedido.direcao, logotipo: `upload/${nomeDoLogotipoNoJob}` },
    };
  }

  /**
   * O DISCO primeiro, a fila depois. A ordem é a correção.
   *
   * Antes, o job era enfileirado e só então os arquivos mudavam de casa e o
   * retrato era gravado. Um `renameSync` que falhasse ali deixava um job
   * ENFILEIRADO e cobrável citando um arquivo que não existe em lugar nenhum —
   * e o reenvio da mesma chave caía em `repetido`, devolvendo o job quebrado
   * como se estivesse tudo bem. O estrago só aparecia na hora de produzir,
   * depois de a pessoa ter confirmado o gasto.
   *
   * Invertida a ordem, a falha troca de lado: sem enfileiramento não há job,
   * ninguém processa e nada é gasto. E ela se REPARA sozinha, porque o
   * `pedido.json` é escrito com `wx` e vira a exclusividade do lado do disco:
   * o reenvio encontra o retrato pronto, pula a mudança de arquivos e segue
   * para o enfileiramento, que é idempotente por conta própria.
   *
   * O id sai da chave de envio e é determinístico, então isto é possível: a
   * pasta do job pode existir antes de o job existir.
   */
  const dir = criativosDir(jobId);
  const retrato = criativoPedidoPath(jobId);
  let donoDoDisco = false;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(retrato, JSON.stringify(pedido, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
    });
    donoDoDisco = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      return c.json(
        {
          error: 'disco_indisponivel',
          message:
            'Não consegui gravar o pedido em disco, então não enfileiro nada. Um job que nasce sem o pedido ao lado é um job cobrável apontando para o vazio.',
        },
        500,
      );
    }
    // O retrato já existe: outro envio da mesma chave chegou primeiro (ou este
    // mesmo, e o enfileiramento não completou). Nada de arquivo se move.
  }

  if (donoDoDisco) {
    /**
     * Os arquivos saem do rascunho e passam a morar com o job.
     *
     * Falhar aqui APAGA o retrato: um pedido em disco dizendo que tem arquivo,
     * ao lado de uma pasta sem arquivo nenhum, é pior que pedido nenhum — ele
     * passaria no `wx` do reenvio e travaria a chave para sempre.
     */
    try {
      if (arquivoDoRascunho !== null || logotipoDoRascunho !== null) {
        const destino = criativoUploadDir(jobId);
        mkdirSync(destino, { recursive: true });
        // A origem é a gaveta quando ela existe, e a raiz quando o rascunho foi
        // aberto antes das gavetas existirem.
        const mover = (papel: 'imagem' | 'logotipo', nome: string, comoSeChama: string): void => {
          const naGaveta = join(gavetaDoRascunho(rascunhoId, papel), nome);
          renameSync(
            existsSync(naGaveta) ? naGaveta : join(rascunho, nome),
            join(destino, comoSeChama),
          );
        };
        if (arquivoDoRascunho !== null) mover('imagem', arquivoDoRascunho, arquivoDoRascunho);
        if (logotipoDoRascunho !== null && nomeDoLogotipoNoJob !== null)
          mover('logotipo', logotipoDoRascunho, nomeDoLogotipoNoJob);
        rmSync(rascunho, { recursive: true, force: true });
      }
    } catch (err) {
      rmSync(retrato, { force: true });
      return c.json(
        {
          error: 'arquivo_nao_mudou_de_casa',
          message: `Recebi o arquivo mas não consegui guardá-lo com o pedido (${
            err instanceof Error ? err.message : String(err)
          }). Nada foi enfileirado: envie de novo.`,
        },
        500,
      );
    }
  }

  const r = enfileirarUmaVez({
    id: jobId,
    type: 'criativo',
    label: `Criativo: ${pedido.marca}`,
    payload: pedido as unknown as Record<string, unknown>,
    mesmoPedido: (anterior) => mesmoConteudo(pedido, anterior),
  });

  if (r === null) {
    return c.json({ error: 'chave_invalida' }, 400);
  }
  if (r.estado === 'conflito') {
    return c.json(
      {
        error: 'chave_ja_usada',
        message:
          'Esta chave de envio já abriu um pedido diferente. Recarregue a tela para começar um envio novo.',
        job: { id: r.job.id },
      },
      409,
    );
  }

  return c.json(
    {
      job: { id: r.job.id, label: r.job.label, status: r.job.status, criadoEm: r.job.createdAt },
      repetido: r.estado === 'repetido',
    },
    r.estado === 'criado' ? 202 : 200,
  );
});

/**
 * Serve um arquivo de variação APROVADA.
 *
 * O caminho vem do `resultado.json` — não do que o cliente pediu. É o que
 * impede que um nome de arquivo montado na URL escape da pasta do job: o
 * servidor só entrega o que ele mesmo declarou como aprovado.
 */
criativosRoute.get('/:jobId/arquivo', (c) => {
  const jobId = c.req.param('jobId');
  if (!ehJobId(jobId)) return c.json({ error: 'invalid_id' }, 400);
  const pedido = c.req.query('caminho');
  if (pedido === undefined) return c.json({ error: 'caminho_ausente' }, 400);

  const resultado = lerResultado(jobId);
  if (resultado === null) return c.json({ error: 'sem_resultado' }, 404);

  const variacao = resultado.variacoes.find((v) => v.caminho === pedido);
  if (variacao === undefined) return c.json({ error: 'nao_declarado' }, 404);
  if (variacao.estado !== 'aprovada') {
    return c.json({ error: 'nao_aprovada', motivo: variacao.motivo }, 409);
  }

  // Cinto e suspensório: mesmo vindo do resultado, o arquivo tem de estar
  // DENTRO da pasta do job. Um `..` gravado no resultado não vira leitura livre.
  //
  // A conta era `alvo.startsWith(raiz)` — texto, sem separador —, e ela aprovava
  // o IRMÃO com prefixo comum: com a raiz em `job_ab`, um caminho que resolvesse
  // para `job_abc/` passava. `dentroDaRaiz` é o mesmo idioma das outras três
  // rotas de arquivo, agora num lugar só.
  const alvo = dentroDaRaiz(criativosDir(jobId), variacao.caminho ?? '');
  if (alvo === null) return c.json({ error: 'fora_da_pasta' }, 400);
  if (!existsSync(alvo)) return c.json({ error: 'arquivo_sumiu' }, 404);

  const ext = extname(alvo).toLowerCase();
  const tipo = TIPO_POR_EXTENSAO[ext];
  if (tipo === undefined) return c.json({ error: 'tipo_nao_servido' }, 415);

  const buf = readFileSync(alvo);
  const cabecalhos: Record<string, string> = {
    'Content-Type': tipo,
    'Content-Length': String(statSync(alvo).size),
    'Cache-Control': 'no-store',
    // A lista de extensões acima é uma allow-list, mas ela confia no NOME do
    // arquivo. Sem `nosniff`, o navegador pode reclassificar o conteúdo e servir
    // como script algo que declaramos como imagem.
    'X-Content-Type-Options': 'nosniff',
  };
  if (EXECUTA_SE_ABERTO.has(ext)) {
    // `sandbox` sem token nenhum: sem script, sem formulário, sem origem
    // própria. A peça continua abrindo e vendo-se; ela só perde a capacidade de
    // executar no contexto do aplicativo.
    cabecalhos['Content-Security-Policy'] = 'sandbox';
  }
  return new Response(new Uint8Array(buf), { headers: cabecalhos });
});

/**
 * Excluir uma peça criativa, com os arquivos dela.
 *
 * ## Por que ela recusa o que está na fila
 *
 * Apagar a pasta de um job que está sendo processado é um estrago que esta casa
 * já viveu com um projeto: o `DELETE` levou tudo e quem processava seguiu
 * escrevendo, sem saber de nada. O resultado nasceu órfão — completo em disco,
 * invisível na tela. Aqui a recusa é 409, e a mensagem diz o que fazer.
 *
 * ## Por que ela apaga a PASTA e o registro
 *
 * Deixar a pasta seria deixar em disco o pixel pago, o razão e a conferência de
 * um pedido que a pessoa mandou sumir — e a listagem os recupera do disco
 * mesmo sem registro, então ele voltaria para a tela no próximo carregamento.
 *
 * ## Por que ela pede a credencial da ação
 *
 * Não porque custe crédito: porque é irreversível. Entrar no app e apagar
 * trabalho pago são decisões de peso diferente, e uma sessão aberta não devia
 * autorizar as duas.
 */
criativosRoute.delete('/:jobId', (c) => {
  const recusa = exigeSenhaDeAcao(c);
  if (recusa !== null) return recusa;

  const jobId = c.req.param('jobId');
  if (!ehJobId(jobId)) return c.json({ error: 'id_invalido' }, 400);

  if (jobNaFila(jobId)) {
    return c.json(
      {
        error: 'na_fila',
        message:
          'Este pedido ainda está na fila, senhor. Apagar a pasta agora deixaria quem processa escrevendo no vazio. Espere terminar, ou tire-o da fila antes.',
      },
      409,
    );
  }

  const pasta = criativosDir(jobId);
  const tinhaPasta = existsSync(pasta);
  const registros = removerRegistroDoJob(jobId);
  if (!tinhaPasta && registros === 0) return c.json({ error: 'nao_encontrado' }, 404);
  if (tinhaPasta) rmSync(pasta, { recursive: true, force: true });

  return c.json({ ok: true });
});
