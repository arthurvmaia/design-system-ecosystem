import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSite } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  BUILTIN_BLUEPRINTS,
  CREATIVE_DIRECTIONS,
  DEFAULT_LAYOUT,
  type ProjectBranding,
  type ProjectContent,
  ProjectLayout,
  enqueueJob,
  getBlueprint,
  libraryComponentBundleDir,
  newProjectId,
  projectBrandingDir,
  projectContentDir,
  projectDir,
  projectMediaDir,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getModels } from '../lib/anthropic.js';
import { isQueueMode } from '../lib/execution-mode.js';
import { enqueueTask } from '../lib/task-queue.js';

export const projectsRoute = new Hono();

const CreateProjectInput = z.object({
  name: z.string().min(1),
  content: z.record(z.string(), z.unknown()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
});

/** Catálogo de estruturas e direções criativas, para o wizard montar a tela de escolha. */
projectsRoute.get('/blueprints', (c) =>
  c.json({ items: BUILTIN_BLUEPRINTS, directions: CREATIVE_DIRECTIONS }),
);

projectsRoute.get('/', (c) => {
  const db = getDb();
  const rows = db.select().from(tables.projects).orderBy(desc(tables.projects.updatedAt)).all();
  return c.json({ items: rows });
});

projectsRoute.get('/:id', (c) => {
  const db = getDb();
  const row = db
    .select()
    .from(tables.projects)
    .where(eq(tables.projects.id, c.req.param('id')))
    .get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ item: row });
});

/**
 * Apaga um projeto: o registro no índice e a pasta em disco.
 *
 * Leva junto os sites já gerados, então some também de Meus projetos. É
 * definitivo — não existe lixeira intermediária. A confirmação fica na
 * interface, que é onde a pessoa consegue ler o nome do que está apagando.
 */
projectsRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);

  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const dir = projectDir(id as `prj_${string}`);
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      return c.json(
        {
          error: 'falha_ao_apagar_pasta',
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  db.delete(tables.projects).where(eq(tables.projects.id, id)).run();
  return c.json({ deleted: true });
});

projectsRoute.post('/', zValidator('json', CreateProjectInput), (c) => {
  // A chave só é exigida no modo api — o modo fila não chama a Anthropic.
  // A checagem fica depois da ramificação, mais abaixo.
  const input = c.req.valid('json');
  const projectId = newProjectId();
  const now = Date.now();

  const db = getDb();

  // Cria estrutura no filesystem.
  mkdirSync(projectDir(projectId), { recursive: true });
  mkdirSync(projectContentDir(projectId), { recursive: true });
  mkdirSync(projectBrandingDir(projectId), { recursive: true });
  mkdirSync(projectMediaDir(projectId), { recursive: true });

  // Conteúdo default se não vier nada.
  const content: ProjectContent = (input.content as ProjectContent) ?? {
    about: 'Uma empresa moderna que resolve seu problema.',
    slogan: 'A solução que faltava',
    cta: 'Comece agora',
  };
  const branding: ProjectBranding = (input.branding as ProjectBranding) ?? {
    palette: {
      primary: '#7f1d1d',
      background: '#ffffff',
      foreground: '#0a0a0a',
    },
    typography: { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
  };

  writeFileSync(
    join(projectContentDir(projectId), 'content.json'),
    JSON.stringify(content, null, 2),
  );
  writeFileSync(
    join(projectBrandingDir(projectId), 'branding.json'),
    JSON.stringify(branding, null, 2),
  );

  // Layout: o que veio do wizard sobre o default. No modo criativo o seed é
  // sorteado agora, para que cada projeto (e cada regeração) varie de verdade.
  const layout: ProjectLayout = ProjectLayout.parse({
    ...DEFAULT_LAYOUT,
    ...(input.layout ?? {}),
  });
  if (layout.mode === 'criativo' && layout.creativeSeed === 0) {
    layout.creativeSeed = Math.floor(Math.random() * 1_000_000);
  }

  const blueprint = getBlueprint(layout.blueprintId) ?? BUILTIN_BLUEPRINTS[0];
  if (blueprint === undefined) {
    return c.json({ error: 'blueprint_not_found', blueprintId: layout.blueprintId }, 400);
  }

  db.insert(tables.projects)
    .values({
      id: projectId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      contentJson: JSON.stringify(content),
      brandingJson: JSON.stringify(branding),
      mediaManifestJson: '[]',
      layoutJson: JSON.stringify(layout),
      status: 'draft',
    })
    .run();

  const libraryItems = db.select().from(tables.libraryComponents).all();
  if (libraryItems.length === 0) {
    return c.json(
      { error: 'library_empty', hint: 'adicione componentes à biblioteca primeiro' },
      400,
    );
  }

  // Modo fila: o projeto já está gravado; só a geração fica pendente.
  if (isQueueMode()) {
    const job = enqueueJob('generate', `Gerar site — ${input.name}`, {
      projectId,
      projectName: input.name,
      layout,
      blueprintId: blueprint.id,
    });
    return c.json({ queued: true, job, projectId }, 202);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return c.json({ error: 'anthropic_not_configured' }, 500);

  const models = getModels();
  const task = enqueueTask('generate-site', { projectId }, async (_, onEvent) => {
    onEvent('info', `Compondo site com ${libraryItems.length} componentes disponíveis`);

    const catalog = libraryItems.map((lib) => {
      const htmlPath = join(libraryComponentBundleDir(lib.id as `cmp_${string}`), 'index.html');
      const preview = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8').slice(0, 500) : '';
      return {
        id: lib.id,
        name: lib.name,
        category: lib.category,
        htmlPreview: preview,
        designSystemId: lib.designSystemId,
      };
    });

    const result = await generateSite(
      {
        projectId,
        projectName: input.name,
        content,
        branding,
        library: catalog,
        layout,
        blueprint,
      },
      {
        apiKey,
        model: models.generator,
        onProgress: (msg) => onEvent('info', msg),
      },
    );

    const db2 = getDb();
    db2
      .update(tables.projects)
      .set({ status: 'generated', updatedAt: Date.now() })
      .where(eq(tables.projects.id, projectId))
      .run();

    onEvent('info', `Site gerado em ${result.outputDir}`);
    return { outputDir: result.outputDir, sections: result.plan.sections.length };
  });

  return c.json({ project: { id: projectId, name: input.name }, task }, 202);
});
