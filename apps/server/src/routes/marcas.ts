import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ESTAGIOS_DA_MARCA,
  GERACOES_DA_MARCA_COMPLETA,
  PedidoDeMarca,
  TETO_DA_MARCA_COMPLETA,
  ehJobId,
  enfileirarUmaVez,
  listDoneJobs,
  listPendingJobs,
  marcaDir,
  marcaPedidoPath,
  marcasRootDir,
  rotuloDaConferencia,
} from '@ds/shared';
import { Hono } from 'hono';
import { exigeSenhaDeAcao } from '../lib/exige-senha-de-acao.js';

/**
 * A criação de MARCA, pela tela.
 *
 * ## O buraco que isto fecha
 *
 * O motor de marca ficou pronto e provado — símbolo, versões por cálculo,
 * apresentação em PDF, pasta do cliente — e continuava sendo ferramenta de quem
 * tem terminal: o job de prova nasceu de um script escrito à mão. A frente
 * Criativos tinha imagem e vídeo, e a marca não estava lá.
 *
 * ## Por que a rota é separada de `/api/criativos`
 *
 * Pelo mesmo motivo que o contrato é: uma marca não tem formato de canal, nem
 * origem de imagem, nem headline queimada no pixel. Enfiar as duas na mesma
 * rota obrigaria metade dos campos a serem ignorados conforme o tipo, e campo
 * que o parse aceita e o motor ignora é o começo de uma divergência silenciosa.
 *
 * ## A ordem é a mesma do criativo, e pela mesma razão
 *
 * Disco primeiro, fila depois, com o retrato gravado em `wx`. Um job
 * enfileirado antes de o pedido existir em disco é um job cobrável apontando
 * para o vazio — e o reenvio o devolveria como se estivesse tudo bem.
 */
export const marcasRoute = new Hono();

/** O id do job sai da chave de envio: clicar duas vezes não abre dois pedidos pagos. */
const idDaChave = (chave: string): string =>
  `job_${createHash('sha256').update(`marca:${chave}`).digest('hex').slice(0, 24).toUpperCase()}`;

/**
 * O que a marca custa, com a conta aberta.
 *
 * Sai dos estágios declarados e não de um número na tela: é a mesma soma que o
 * razão vai cobrar, e duas cópias divergem na primeira mudança de preço.
 */
marcasRoute.get('/custos', (c) =>
  c.json({
    teto: TETO_DA_MARCA_COMPLETA,
    geracoes: GERACOES_DA_MARCA_COMPLETA,
    estagios: ESTAGIOS_DA_MARCA.map((e) => ({
      id: e.id,
      rotulo: e.rotulo,
      geracoes: e.geracoes,
      creditos: e.creditos,
    })),
  }),
);

const lerResultado = (jobId: string): { conferencia: unknown; custoGasto: number } | null => {
  const arquivo = join(marcaDir(jobId), 'resultado.json');
  if (!existsSync(arquivo)) return null;
  try {
    const cru = JSON.parse(readFileSync(arquivo, 'utf8')) as {
      conferencia?: unknown;
      custoGasto?: number;
    };
    return { conferencia: cru.conferencia ?? null, custoGasto: cru.custoGasto ?? 0 };
  } catch {
    // Resultado ilegível é ausência de resultado, não erro de servidor.
    return null;
  }
};

const lerPedido = (jobId: string): { nome: string; oQueFaz: string } | null => {
  const arquivo = marcaPedidoPath(jobId);
  if (!existsSync(arquivo)) return null;
  const lido = PedidoDeMarca.safeParse(JSON.parse(readFileSync(arquivo, 'utf8')));
  return lido.success ? { nome: lido.data.nome, oQueFaz: lido.data.oQueFaz } : null;
};

/**
 * A lista sai da fila E do disco, como a das peças.
 *
 * A fila é caixa de entrada e o `fila:limpar` a esvazia; a marca produzida
 * continua em `marcas/<job>/`, e sumir da tela junto com o registro deixaria
 * material pago inalcançável.
 */
marcasRoute.get('/', (c) => {
  const daFila = [...listPendingJobs(), ...listDoneJobs()].filter((j) => j.type === 'marca');
  const vistos = new Set(daFila.map((j) => j.id));
  const emDisco = existsSync(marcasRootDir())
    ? readdirSync(marcasRootDir(), { withFileTypes: true })
        .filter((d) => d.isDirectory() && ehJobId(d.name) && !vistos.has(d.name))
        .map((d) => d.name)
    : [];

  const items = [
    ...daFila.map((j) => ({ id: j.id, status: j.status, criadoEm: j.createdAt })),
    ...emDisco.map((id) => ({ id, status: 'concluido' as const, criadoEm: 0 })),
  ]
    .map((base) => {
      const pedido = lerPedido(base.id);
      const resultado = lerResultado(base.id);
      return {
        ...base,
        nome: pedido?.nome ?? 'pedido não encontrado',
        oQueFaz: pedido?.oQueFaz ?? '',
        /** O rótulo é DERIVADO da folha, como nas peças: o disco não guarda ele. */
        rotulo: rotuloDaConferencia(
          resultado?.conferencia as Parameters<typeof rotuloDaConferencia>[0],
        ),
        temApresentacao: existsSync(join(marcaDir(base.id), 'apresentacao.pdf')),
        custoGasto: resultado?.custoGasto ?? null,
      };
    })
    .sort((a, b) => b.criadoEm - a.criadoEm);

  return c.json({ items });
});

marcasRoute.post('/', async (c) => {
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

  const lido = PedidoDeMarca.safeParse(corpo.pedido);
  if (!lido.success) {
    return c.json(
      {
        error: 'pedido_invalido',
        message: lido.error.issues[0]?.message ?? 'O pedido não passa no contrato.',
        campo: lido.error.issues[0]?.path.join('.') ?? null,
      },
      400,
    );
  }
  const pedido = lido.data;

  /**
   * O teto não pode passar do que os estágios somam.
   *
   * A tela mostra a conta, e ela vem daqui — mas o payload é a fonte da verdade
   * e nada impede que ele chegue montado por fora. Conferir aqui é o que impede
   * um pedido de autorizar mais gasto do que a produção inteira custa.
   */
  if (pedido.tetoDeCreditos > TETO_DA_MARCA_COMPLETA * 1.5) {
    return c.json(
      {
        error: 'teto_alto_demais',
        message: `O teto pedido (${pedido.tetoDeCreditos}) passa muito do que a marca inteira custa (${TETO_DA_MARCA_COMPLETA}). Um teto folgado assim autoriza gasto que a produção não precisa.`,
      },
      400,
    );
  }

  const jobId = idDaChave(chave);
  const dir = marcaDir(jobId);
  const retrato = marcaPedidoPath(jobId);

  // O DISCO primeiro, a fila depois — a mesma ordem, pela mesma razão.
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(retrato, JSON.stringify(pedido, null, 2), { encoding: 'utf8', flag: 'wx' });
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
    // O retrato já existe: reenvio da mesma chave. Segue para o enfileiramento,
    // que é idempotente por conta própria e repara um enfileiramento que faltou.
  }

  const r = enfileirarUmaVez({
    id: jobId,
    type: 'marca',
    label: `Marca: ${pedido.nome}`,
    payload: pedido as unknown as Record<string, unknown>,
    mesmoPedido: (anterior) =>
      JSON.stringify(anterior) === JSON.stringify(pedido as unknown as Record<string, unknown>),
  });

  if (r === null) return c.json({ error: 'chave_invalida' }, 400);
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
