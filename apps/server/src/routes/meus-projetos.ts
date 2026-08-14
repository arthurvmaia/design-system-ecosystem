import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getDb, tables } from '@ds/indexer';
import {
  AjustesDoSite,
  type ProjectId,
  ehNomeDeVersao,
  ehProjectId,
  enqueueJob,
  projectGeneratedDir,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { montarProjetoDeEntrega, nomeDePacote } from '../lib/projeto-de-entrega.js';

export const meusProjetosRoute = new Hono();

const run = promisify(execFile);

type Versao = { timestamp: string; arquivos: number; bytes: number };

/** Soma recursiva do que existe dentro de uma versão gerada. */
const medir = (dir: string): { arquivos: number; bytes: number } => {
  let arquivos = 0;
  let bytes = 0;
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const alvo = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      const sub = medir(alvo);
      arquivos += sub.arquivos;
      bytes += sub.bytes;
      continue;
    }
    arquivos++;
    bytes += statSync(alvo).size;
  }
  return { arquivos, bytes };
};

const listarVersoes = (id: ProjectId): Versao[] => {
  const dir = projectGeneratedDir(id);
  if (!existsSync(dir)) return [];

  return (
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      // Só entra o que a prévia consegue servir. Uma pasta criada à mão no
      // Explorer ("... - Copia", com espaço e acento) aparecia aqui e baixava
      // como .zip, mas a rota /site a recusava: as telas discordavam sobre o que
      // é uma versão, e a discordância chegava à pessoa como um botão quebrado.
      .filter((e) => ehNomeDeVersao(e.name))
      .map((e) => {
        const { arquivos, bytes } = medir(join(dir, e.name));
        return { timestamp: e.name, arquivos, bytes };
      })
      .filter((v) => v.arquivos > 0)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  );
};

/**
 * Projetos que realmente viraram site.
 *
 * A tela de Projetos lista tudo, inclusive rascunho que nunca gerou nada. Aqui
 * só entra o que tem arquivo em disco para baixar — é a diferença entre "pedi"
 * e "está pronto".
 */
meusProjetosRoute.get('/', (c) => {
  const db = getDb();
  const rows = db.select().from(tables.projects).orderBy(desc(tables.projects.updatedAt)).all();

  const items = rows
    .map((row) => {
      const versoes = listarVersoes(row.id as ProjectId);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        versoes,
      };
    })
    .filter((p) => p.versoes.length > 0);

  return c.json({ items });
});

/**
 * Baixa uma versão gerada como PROJETO pronto para publicar.
 *
 * O que se baixa não é mais a pasta gerada compactada crua. `montarProjetoDeEntrega`
 * monta um projeto — leia-me com os caminhos de publicação, servidor local sem
 * dependência, configuração dos hosts estáticos, `.gitignore` e o resumo do que
 * foi verificado — porque o dono apontou o que faltava: *"o cliente precisa do
 * projeto para fazer deploy e subir isso"*. O zip continua existindo, mas como
 * TRANSPORTE: navegador não baixa pasta.
 *
 * A compactação usa a ferramenta do sistema em vez de uma dependência nova:
 * `Compress-Archive` no Windows, `zip` no resto. Vale o `if` porque evita
 * pedir um `pnpm install` a mais só para exportar uma pasta — e o servidor
 * sempre roda na máquina do usuário, nunca num container mínimo.
 */
meusProjetosRoute.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);

  const versoes = listarVersoes(id);
  if (versoes.length === 0) return c.json({ error: 'sem_versao_gerada' }, 404);

  // Sem `?versao=`, baixa a mais recente.
  const pedida = c.req.query('versao');
  const versao = pedida === undefined ? versoes[0] : versoes.find((v) => v.timestamp === pedida);
  if (versao === undefined) return c.json({ error: 'versao_nao_encontrada' }, 404);

  const db = getDb();
  const projeto = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  const marca = projeto?.name ?? 'site';

  const origem = join(projectGeneratedDir(id), versao.timestamp);
  const temp = mkdtempSync(join(tmpdir(), 'ds-zip-'));
  const destino = join(temp, `${id}.zip`);

  try {
    const raiz = montarProjetoDeEntrega({ origem, destino: temp, marca, versao: versao.timestamp });
    if (process.platform === 'win32') {
      await run('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path '${raiz}' -DestinationPath '${destino}' -Force`,
      ]);
    } else {
      await run('zip', ['-r', '-q', destino, nomeDePacote(marca)], { cwd: temp });
    }

    const buf = readFileSync(destino);
    const nome = `${nomeDePacote(marca)}-${versao.timestamp}.zip`.replace(/[^\w.-]/g, '_');

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Content-Length': String(buf.byteLength),
      },
    });
  } catch (err) {
    return c.json(
      {
        error: 'falha_ao_compactar',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  } finally {
    // O zip é descartável: existe só para virar resposta HTTP.
    rmSync(temp, { recursive: true, force: true });
  }
});

/** Abre a pasta do projeto no explorador de arquivos do sistema. */
meusProjetosRoute.post('/:id/abrir-pasta', async (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);

  const dir = projectGeneratedDir(id);
  if (!existsSync(dir)) return c.json({ error: 'not_found' }, 404);

  try {
    if (process.platform === 'win32') await run('explorer', [dir]).catch(() => undefined);
    else if (process.platform === 'darwin') await run('open', [dir]);
    else await run('xdg-open', [dir]);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(
      { error: 'falha_ao_abrir', message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

/** Usado pelo badge da sidebar. */
meusProjetosRoute.get('/contagem', (c) => {
  const db = getDb();
  const rows = db.select({ id: tables.projects.id }).from(tables.projects).all();
  const total = rows.filter((r) => listarVersoes(r.id as ProjectId).length > 0).length;
  return c.json({ total });
});

/** Mantido por último para não capturar `/contagem` como se fosse um id. */
meusProjetosRoute.get('/:id', (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ item: { ...row, versoes: listarVersoes(id) } });
});

// ── Retoques num site já gerado ─────────────────────────────────────────────
//
// O dono pediu um botão em cada site para dizer, em texto livre, o que quer
// diferente: "esse título está pequeno", "esse azul não é o meu azul".
//
// O pedido NÃO regera o site. O site entregue é independente (carrega cópia de
// todos os assets, conferido em `montarPaginaDoKit`), então o retoque pousa
// nele: a montagem emite `assets/ajustes.css` vazia e ligada por último na
// cascata, e é lá que o ajuste é escrito. A composição original fica intacta e
// desfazer é apagar um bloco.
//
// Quem escreve o CSS é o agente, pela fila — julgar "mais destacado" é trabalho
// de quem enxerga a página, não de uma regra. A rota só registra e enfileira.

const PedidoDeAjuste = z.object({ pedido: z.string().min(3).max(2000) });

/** O arquivo de histórico daquela versão. Fica AO LADO do site, não no banco:
 *  baixar o .zip leva o histórico junto, e apagar a versão não deixa órfão. */
const caminhoDosAjustes = (id: ProjectId, versao: string): string =>
  join(projectGeneratedDir(id), versao, 'ajustes.json');

const lerAjustes = (id: ProjectId, versao: string): AjustesDoSite => {
  const p = caminhoDosAjustes(id, versao);
  if (!existsSync(p)) return { formato: 1, ajustes: [] };
  try {
    return AjustesDoSite.parse(JSON.parse(readFileSync(p, 'utf8')));
  } catch {
    return { formato: 1, ajustes: [] };
  }
};

meusProjetosRoute.get('/:id/ajustes', (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const versao = c.req.query('versao') ?? listarVersoes(id)[0]?.timestamp;
  if (versao === undefined || !ehNomeDeVersao(versao)) {
    return c.json({ error: 'versao_nao_encontrada' }, 404);
  }
  return c.json({ versao, ...lerAjustes(id, versao) });
});

meusProjetosRoute.post('/:id/ajustes', zValidator('json', PedidoDeAjuste), (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);

  const versoes = listarVersoes(id);
  const pedida = c.req.query('versao');
  const versao = pedida === undefined ? versoes[0]?.timestamp : pedida;
  if (versao === undefined || !ehNomeDeVersao(versao)) {
    return c.json({ error: 'versao_nao_encontrada' }, 404);
  }
  const dir = join(projectGeneratedDir(id), versao);
  if (!existsSync(dir)) return c.json({ error: 'versao_nao_encontrada' }, 404);

  const { pedido } = c.req.valid('json');
  const atual = lerAjustes(id, versao);
  const novo = {
    id: `ajt_${Date.now().toString(36)}`,
    pedido: pedido.trim(),
    pedidoEm: Date.now(),
    estado: 'pendente' as const,
    aplicadoEm: null,
    css: '',
    resposta: '',
  };
  const conteudo: AjustesDoSite = { formato: 1, ajustes: [...atual.ajustes, novo] };
  writeFileSync(caminhoDosAjustes(id, versao), JSON.stringify(conteudo, null, 2), 'utf8');

  const projeto = getDb().select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  const job = enqueueJob('ajustar', `Ajustar — ${projeto?.name ?? id}`, {
    projectId: id,
    versao,
    ajusteId: novo.id,
    pedido: novo.pedido,
  });
  return c.json({ ajuste: novo, job }, 202);
});

// ── Pendências ──────────────────────────────────────────────────────────────
//
// O que a regra de aceite reprovou ou marcou, reunido num lugar só.
//
// O dono pediu a tela: "o que não passar você vai estudar e tentar passar, mas
// se não tiver como pode seguir e deixar ela na tela de pendências". Ela é o
// oposto de esconder — o site sobe, e o que ele deve fica visível até alguém
// resolver ou aceitar.
//
// Lê o `aceite.json` que a montagem grava ao lado de cada versão. Versão antiga,
// gerada antes de a regra existir, simplesmente não aparece: dizer que ela tem
// zero pendências seria mentira, e inventar veredito para o passado seria pior.

meusProjetosRoute.get('/pendencias', (c) => {
  const db = getDb();
  const projetos = db.select().from(tables.projects).all();
  const itens: unknown[] = [];

  for (const p of projetos) {
    for (const versao of listarVersoes(p.id as ProjectId)) {
      const caminho = join(projectGeneratedDir(p.id as ProjectId), versao.timestamp, 'aceite.json');
      if (!existsSync(caminho)) continue;
      try {
        const lido = JSON.parse(readFileSync(caminho, 'utf8')) as {
          vereditos?: { codigo: string; titulo: string; estado: string; motivo: string }[];
        };
        const abertos = (lido.vereditos ?? []).filter((v) => v.estado !== 'passou');
        if (abertos.length === 0) continue;
        itens.push({
          projectId: p.id,
          projectName: p.name,
          versao: versao.timestamp,
          vereditos: abertos,
        });
      } catch {
        // aceite.json ilegível não pode derrubar a tela inteira
      }
    }
  }
  return c.json({ itens });
});

/**
 * "Faça-me aprender": mais uma tentativa sobre o que não passou.
 *
 * Não é retoque — é investigação. A regra reprovou ou marcou algo, e o que se
 * pede aqui é que alguém estude AQUELE caso e tente outra abordagem: outra forma
 * de interpretar o componente, outra maneira de reproduzir a tecnologia que ele
 * usa. Por isso o job carrega o código da regra e o motivo dela: quem for tentar
 * precisa saber o que falhou, não só que falhou.
 */
const PedidoDeAprendizado = z.object({
  versao: z.string().min(1),
  codigo: z.string().min(1).max(8),
  motivo: z.string().max(600).default(''),
});

meusProjetosRoute.post('/:id/aprender', zValidator('json', PedidoDeAprendizado), (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const { versao, codigo, motivo } = c.req.valid('json');
  if (!ehNomeDeVersao(versao)) return c.json({ error: 'versao_nao_encontrada' }, 404);
  if (!existsSync(join(projectGeneratedDir(id), versao))) {
    return c.json({ error: 'versao_nao_encontrada' }, 404);
  }

  const projeto = getDb().select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  const job = enqueueJob('aprender', `Aprender ${codigo} — ${projeto?.name ?? id}`, {
    projectId: id,
    versao,
    codigo,
    motivo,
    alvo: 'site',
  });
  return c.json({ job }, 202);
});
