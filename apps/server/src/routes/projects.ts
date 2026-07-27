import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { generateSite } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  BUILTIN_BLUEPRINTS,
  CREATIVE_DIRECTIONS,
  DEFAULT_LAYOUT,
  DEFAULT_PROJECT_BRANDING,
  DEFAULT_PROJECT_CONTENT,
  type MediaItem,
  MediaManifest,
  type ProjectBranding,
  type ProjectContent,
  ProjectLayout,
  enqueueJob,
  newProjectId,
  normalizarProjectBranding,
  normalizarProjectContent,
  projectBrandingDir,
  projectContentDir,
  projectDir,
  projectMediaDir,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getModels } from '../lib/anthropic.js';
import { isQueueMode } from '../lib/execution-mode.js';
import { montarContextoDeGeracao } from '../lib/generate-context.js';
import { enqueueTask } from '../lib/task-queue.js';

export const projectsRoute = new Hono();

// Defaults vivem em @ds/shared (fonte única) — ver DEFAULT_PROJECT_CONTENT e
// DEFAULT_PROJECT_BRANDING. Aqui só a leitura normalizada.

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
};

/** Lê e desserializa o manifest de mídias de um projeto, tolerante a lixo. */
const lerManifest = (mediaManifestJson: string | null): MediaItem[] => {
  if (!mediaManifestJson) return [];
  try {
    return MediaManifest.parse(JSON.parse(mediaManifestJson));
  } catch {
    return [];
  }
};

/** Reescreve content.json/branding.json no disco — a fonte que o gerador lê. */
const gravarConfig = (
  id: `prj_${string}`,
  content: ProjectContent,
  branding: ProjectBranding,
): void => {
  writeFileSync(join(projectContentDir(id), 'content.json'), JSON.stringify(content, null, 2));
  writeFileSync(join(projectBrandingDir(id), 'branding.json'), JSON.stringify(branding, null, 2));
};

// Normalizadores do shared: JSON corrompido/legado vira default carimbado, e o
// buraco antigo (corrompido → objeto vazio silencioso) fecha nos DOIS modos.
const lerContent = (raw: string | null): ProjectContent => normalizarProjectContent(raw);
const lerBranding = (raw: string | null): ProjectBranding => normalizarProjectBranding(raw);

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

/** Serve um arquivo de mídia do projeto (prévia de logo/imagem no wizard). */
projectsRoute.get('/:id/media/:name', (c) => {
  const id = c.req.param('id');
  const name = c.req.param('name');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  // Sem travessia: o nome é sempre um arquivo direto dentro de media/.
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const abs = join(projectMediaDir(id as `prj_${string}`), name);
  if (!existsSync(abs) || statSync(abs).isDirectory()) return c.json({ error: 'not_found' }, 404);
  const buf = readFileSync(abs);
  const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=300' },
  });
});

const CreateProjectInput = z.object({
  name: z.string().min(1),
  kitId: z.string().startsWith('kit_').nullable().optional(),
});

/**
 * Cria um RASCUNHO. Não gera nada — só registra nome e kit e prepara a estrutura
 * de pastas. O site só é composto quando o wizard chama `POST /:id/generate`.
 */
projectsRoute.post('/', zValidator('json', CreateProjectInput), (c) => {
  const input = c.req.valid('json');
  const db = getDb();

  if (input.kitId) {
    const kit = db.select().from(tables.kits).where(eq(tables.kits.id, input.kitId)).get();
    if (!kit) return c.json({ error: 'kit_not_found' }, 400);
  }

  const projectId = newProjectId();
  const now = Date.now();

  mkdirSync(projectContentDir(projectId), { recursive: true });
  mkdirSync(projectBrandingDir(projectId), { recursive: true });
  mkdirSync(projectMediaDir(projectId), { recursive: true });
  gravarConfig(projectId, DEFAULT_PROJECT_CONTENT, DEFAULT_PROJECT_BRANDING);

  const layout = ProjectLayout.parse(DEFAULT_LAYOUT);

  db.insert(tables.projects)
    .values({
      id: projectId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      kitId: input.kitId ?? null,
      contentJson: JSON.stringify(DEFAULT_PROJECT_CONTENT),
      brandingJson: JSON.stringify(DEFAULT_PROJECT_BRANDING),
      mediaManifestJson: '[]',
      layoutJson: JSON.stringify(layout),
      status: 'draft',
    })
    .run();

  const row = db.select().from(tables.projects).where(eq(tables.projects.id, projectId)).get();
  return c.json({ item: row }, 201);
});

const PatchProjectInput = z.object({
  name: z.string().min(1).optional(),
  kitId: z.string().startsWith('kit_').nullable().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Atualiza um rascunho. O wizard chama isto a cada etapa, então nada se perde
 * se a pessoa fechar no meio. Regrava content.json/branding.json no disco.
 */
projectsRoute.patch('/:id', zValidator('json', PatchProjectInput), (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  const input = c.req.valid('json');
  const db = getDb();

  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  if (input.kitId) {
    const kit = db.select().from(tables.kits).where(eq(tables.kits.id, input.kitId)).get();
    if (!kit) return c.json({ error: 'kit_not_found' }, 400);
  }

  const content = (input.content as ProjectContent | undefined) ?? lerContent(row.contentJson);
  const branding = (input.branding as ProjectBranding | undefined) ?? lerBranding(row.brandingJson);

  let layoutJson = row.layoutJson;
  if (input.layout !== undefined) {
    const layout = ProjectLayout.parse({ ...DEFAULT_LAYOUT, ...input.layout });
    layoutJson = JSON.stringify(layout);
  }

  if (input.content !== undefined || input.branding !== undefined) {
    gravarConfig(id as `prj_${string}`, content, branding);
  }

  db.update(tables.projects)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kitId !== undefined ? { kitId: input.kitId } : {}),
      ...(input.content !== undefined ? { contentJson: JSON.stringify(content) } : {}),
      ...(input.branding !== undefined ? { brandingJson: JSON.stringify(branding) } : {}),
      ...(input.layout !== undefined ? { layoutJson } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(tables.projects.id, id))
    .run();

  const updated = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  return c.json({ item: updated });
});

/** Upload de uma mídia. Guarda em media/ e anexa ao manifest com o slotRole. */
projectsRoute.post('/:id/media', async (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (typeof file === 'string' || !file || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'sem_arquivo' }, 400);
  }

  const kind = typeof body.kind === 'string' ? body.kind : 'image';
  const kindParsed = z
    .enum(['image', 'video', 'logo', 'icon', '3d', 'lottie', 'mockup'])
    .safeParse(kind);
  if (!kindParsed.success) return c.json({ error: 'kind_invalido' }, 400);

  const dir = projectMediaDir(id as `prj_${string}`);
  mkdirSync(dir, { recursive: true });

  const original = file.name || 'arquivo';
  const safe = original.replace(/[^\w.-]/g, '_');
  const stored = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(dir, stored), bytes);

  const item: MediaItem = {
    path: stored,
    mimeType: file.type || MIME[extname(stored).toLowerCase()] || 'application/octet-stream',
    kind: kindParsed.data,
    originalName: original,
    ...(typeof body.alt === 'string' && body.alt ? { alt: body.alt } : {}),
    ...(typeof body.slotRole === 'string' && body.slotRole ? { slotRole: body.slotRole } : {}),
  };

  const media = [...lerManifest(row.mediaManifestJson), item];
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ item, media }, 201);
});

/** Remove uma mídia do manifest e do disco. */
projectsRoute.delete('/:id/media', (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'sem_path' }, 400);

  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const media = lerManifest(row.mediaManifestJson).filter((m) => m.path !== path);
  // Só apaga do disco se o nome for um arquivo direto (sem travessia).
  if (!path.includes('/') && !path.includes('\\') && !path.includes('..')) {
    const abs = join(projectMediaDir(id as `prj_${string}`), path);
    if (existsSync(abs)) rmSync(abs, { force: true });
  }
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ deleted: true, media });
});

/**
 * Dispara a geração do site a partir do rascunho já salvo.
 *
 * Regra central da reforma: o site usa SOMENTE os componentes do kit do projeto
 * — não a Biblioteca inteira. O kit é o Design System final; gerar fora dele
 * traria peças de origens que não conversam.
 */
projectsRoute.post('/:id/generate', async (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();

  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (!row.kitId) return c.json({ error: 'sem_kit', hint: 'escolha um kit antes de gerar' }, 400);

  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, row.kitId)).get();
  if (!kit) return c.json({ error: 'kit_not_found' }, 400);

  const links = db
    .select()
    .from(tables.kitComponents)
    .where(eq(tables.kitComponents.kitId, row.kitId))
    .orderBy(asc(tables.kitComponents.position))
    .all();
  if (links.length === 0) {
    return c.json({ error: 'kit_vazio', hint: 'adicione componentes ao kit' }, 400);
  }

  const componentes = db
    .select()
    .from(tables.libraryComponents)
    .where(
      inArray(
        tables.libraryComponents.id,
        links.map((l) => l.componentId),
      ),
    )
    .all();
  const porId = new Map(componentes.map((cmp) => [cmp.id, cmp]));

  // O CONTEXTO ÚNICO de geração: fila e API consomem o MESMO payload validado.
  // Divergência entre os modos era exatamente o defeito (a mídia não chegava
  // ao gerador no modo API) — agora qualquer campo novo entra no construtor e
  // chega aos dois mundos ou a nenhum.
  const componentesDoKit = links.flatMap((l) => {
    const cmp = porId.get(l.componentId);
    return cmp
      ? [
          {
            id: cmp.id,
            name: cmp.name,
            category: cmp.category,
            kind: cmp.kind,
            designSystemId: cmp.designSystemId ?? null,
          },
        ]
      : [];
  });
  const ausentes = links.map((l) => l.componentId).filter((cid) => !porId.has(cid));
  const contexto = montarContextoDeGeracao({
    projeto: row,
    kit: { id: kit.id, name: kit.name },
    componentes: componentesDoKit,
    ausentes,
  });

  // Modo fila: registra o pedido com o payload do contrato. Nada roda aqui.
  if (isQueueMode()) {
    const job = enqueueJob('generate', `Gerar site — ${row.name}`, contexto.payload);
    db.update(tables.projects)
      .set({ status: 'ready-to-generate', updatedAt: Date.now() })
      .where(eq(tables.projects.id, id))
      .run();
    return c.json({ queued: true, job, projectId: id, avisos: contexto.avisos }, 202);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return c.json({ error: 'anthropic_not_configured' }, 500);
  const models = getModels();

  db.update(tables.projects)
    .set({ status: 'generating', updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  const task = enqueueTask('generate-site', { projectId: id }, async (_, onEvent) => {
    onEvent(
      'info',
      `Compondo site com ${contexto.payload.kit.components.length} componentes do kit "${kit.name}"`,
    );
    for (const aviso of contexto.avisos) onEvent('warn', aviso);

    const result = await generateSite(contexto.payload, {
      apiKey,
      model: models.generator,
      onProgress: (msg) => onEvent('info', msg),
    });

    getDb()
      .update(tables.projects)
      .set({ status: 'generated', updatedAt: Date.now() })
      .where(eq(tables.projects.id, id))
      .run();

    onEvent('info', `Site gerado em ${result.outputDir}`);
    return { outputDir: result.outputDir, sections: result.plan.sections.length };
  });

  return c.json({ task, projectId: id }, 202);
});

/** Duplica um projeto como novo rascunho: copia config e mídia, deixa os sites gerados para trás. */
projectsRoute.post('/:id/duplicate', (c) => {
  const id = c.req.param('id');
  if (!id.startsWith('prj_')) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const novoId = newProjectId();
  const now = Date.now();

  mkdirSync(projectContentDir(novoId), { recursive: true });
  mkdirSync(projectBrandingDir(novoId), { recursive: true });
  mkdirSync(projectMediaDir(novoId), { recursive: true });

  const content = lerContent(row.contentJson);
  const branding = lerBranding(row.brandingJson);
  gravarConfig(novoId, content, branding);

  // Copia os arquivos de mídia (o manifest referencia por nome relativo).
  const origemMedia = projectMediaDir(id as `prj_${string}`);
  const media = lerManifest(row.mediaManifestJson);
  if (existsSync(origemMedia)) {
    for (const m of media) {
      const de = join(origemMedia, m.path);
      if (existsSync(de) && !statSync(de).isDirectory()) {
        writeFileSync(join(projectMediaDir(novoId), m.path), readFileSync(de));
      }
    }
  }

  db.insert(tables.projects)
    .values({
      id: novoId,
      name: `${row.name} (cópia)`,
      createdAt: now,
      updatedAt: now,
      kitId: row.kitId,
      contentJson: JSON.stringify(content),
      brandingJson: JSON.stringify(branding),
      mediaManifestJson: JSON.stringify(media),
      layoutJson: row.layoutJson,
      status: 'draft',
    })
    .run();

  const novo = db.select().from(tables.projects).where(eq(tables.projects.id, novoId)).get();
  return c.json({ item: novo }, 201);
});

/**
 * Apaga um projeto: o registro no índice e a pasta em disco.
 *
 * Leva junto os sites já gerados, então some também de Meus sites. É definitivo
 * — não existe lixeira. A confirmação fica na interface, que é onde a pessoa
 * consegue ler o nome do que está apagando.
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
