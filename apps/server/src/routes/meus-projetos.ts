import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getDb, tables } from '@ds/indexer';
import { type ProjectId, ehNomeDeVersao, ehProjectId, projectGeneratedDir } from '@ds/shared';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

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
 * Baixa uma versão gerada como .zip.
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

  const origem = join(projectGeneratedDir(id), versao.timestamp);
  const temp = mkdtempSync(join(tmpdir(), 'ds-zip-'));
  const destino = join(temp, `${id}.zip`);

  try {
    if (process.platform === 'win32') {
      await run('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path '${origem}\\*' -DestinationPath '${destino}' -Force`,
      ]);
    } else {
      await run('zip', ['-r', '-q', destino, '.'], { cwd: origem });
    }

    const buf = readFileSync(destino);
    const nome = `${id}-${versao.timestamp}.zip`.replace(/[^\w.-]/g, '_');

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
