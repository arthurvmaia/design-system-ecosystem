import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import {
  PedidoCriativo,
  ResultadoCriativo,
  criativosDir,
  ehJobId,
  listDoneJobs,
  listPendingJobs,
} from '@ds/shared';
import { Hono } from 'hono';

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

criativosRoute.get('/', (c) => {
  const jobs = [...listPendingJobs(), ...listDoneJobs()].filter((j) => j.type === 'criativo');
  const items = jobs
    .map((job) => {
      const resultado = lerResultado(job.id);
      return {
        id: job.id,
        label: job.label,
        status: job.status,
        criadoEm: job.createdAt,
        pedido: lerPedido(job.payload),
        // A contagem vem do resultado, e é ela que a tela usa para dizer
        // "3 de 4 aprovadas" sem baixar arquivo nenhum.
        variacoes: resultado?.variacoes ?? [],
        aprovadas: (resultado?.variacoes ?? []).filter((v) => v.estado === 'aprovada').length,
        custoGasto: resultado?.custoGasto ?? null,
      };
    })
    .sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0));
  return c.json({ items });
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

  const raiz = resolve(criativosDir(jobId));
  const alvo = resolve(join(raiz, normalize(variacao.caminho ?? '')));
  // Cinto e suspensório: mesmo vindo do resultado, o arquivo tem de estar
  // DENTRO da pasta do job. Um `..` gravado no resultado não vira leitura livre.
  if (!alvo.startsWith(raiz)) return c.json({ error: 'fora_da_pasta' }, 400);
  if (!existsSync(alvo)) return c.json({ error: 'arquivo_sumiu' }, 404);

  const tipo = TIPO_POR_EXTENSAO[extname(alvo).toLowerCase()];
  if (tipo === undefined) return c.json({ error: 'tipo_nao_servido' }, 415);

  const buf = readFileSync(alvo);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(statSync(alvo).size),
      'Cache-Control': 'no-store',
    },
  });
});
