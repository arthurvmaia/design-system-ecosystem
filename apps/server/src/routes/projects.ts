import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { generateSite } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  DEFAULT_LAYOUT,
  DEFAULT_PROJECT_BRANDING,
  DEFAULT_PROJECT_CONTENT,
  type MediaItem,
  MediaManifest,
  type ProjectBranding,
  type ProjectContent,
  ProjectLayout,
  ROTULO_DE_PAPEL,
  type SlotDeMidia,
  analisarVideo,
  ehProjectId,
  enqueueJob,
  jobsAbertosDoProjeto,
  lerOuDerivarContrato,
  libraryComponentBundleDir,
  newKitId,
  newProjectId,
  normalizarProjectBranding,
  normalizarProjectContent,
  normalizarProjectLayout,
  projectBrandingDir,
  projectContentDir,
  projectDir,
  projectMediaDir,
  sugerirMidiaDaSecao,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { MENSAGEM_API_BLOQUEADA, apiPagaPermitida, getModels } from '../lib/anthropic.js';
import { consolidarEGravar } from '../lib/consolidar-kit.js';
import { isQueueMode } from '../lib/execution-mode.js';
import { exigeSenhaDeAcao } from '../lib/exige-senha-de-acao.js';
import { montarContextoDeGeracao } from '../lib/generate-context.js';
import { criarMarcaAutomatica, criarMidiasDasSecoes } from '../lib/marca-automatica.js';
import { montarKitAutomatico } from '../lib/montar-kit-automatico.js';
import { recolorabilidadeDoBundle } from '../lib/recolorabilidade-do-bundle.js';
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
  // Sem estes três, um .mov saía como application/octet-stream e o <video>
  // recusava o arquivo — caixa preta sem erro. O mapa completo (com fontes e
  // áudio) vive em routes/asset.ts:45-49; aqui só o que a prévia de mídia serve.
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',
  '.json': 'application/json; charset=utf-8',
};

// Extensões que decidem o `kind` quando o navegador não manda o MIME do arquivo
// (file.type vem VAZIO em alguns sistemas). Espelham o MIME map acima.
const EXT_VIDEO = new Set(['.mp4', '.webm', '.mov', '.ogv', '.m4v']);
const EXT_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);

// 200 MB: acima disso o upload trava o navegador, o manifest fica gigante e a
// prévia não dá conta — vídeo desse tamanho pertence a um serviço de vídeo.
const TAMANHO_MAXIMO_BYTES = 200 * 1024 * 1024;

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
/** Exportada pelo mesmo motivo de `secoesQueAceitamMidia`. */
export const gravarConfig = (
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

// O catálogo de estruturas prontas (`GET /blueprints`) saiu com os blueprints:
// a estrutura passou a ser montada pelo usuário, seção a seção, e não há mais
// uma lista de moldes para o wizard escolher.

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
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  // Sem travessia: o nome é sempre um arquivo direto dentro de media/.
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const abs = join(projectMediaDir(id), name);
  if (!existsSync(abs) || statSync(abs).isDirectory()) return c.json({ error: 'not_found' }, 404);
  const buf = readFileSync(abs);
  const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=300' },
  });
});

/**
 * VIA EXPRESSA: kit, marca e projeto num pedido só — para quem não quer as
 * etapas e quer clicar para gerar. O servidor faz o que já sabe fazer separado,
 * na ordem certa: monta o kit pela sequência do objetivo, cria o projeto com a
 * estrutura que a montagem decidiu, veste a marca automática (com as mídias por
 * seção, porque aqui a estrutura já existe) e devolve o projectId — a tela
 * dispara a geração em seguida, pelo mesmo caminho de sempre.
 *
 * Trancada pela credencial de ação: é o portão de tudo que dispara gasto, e um
 * clique que faz três coisas caras merece a mesma assinatura das três.
 */
projectsRoute.post(
  '/expresso',
  zValidator(
    'json',
    z.object({
      objetivo: z.enum([
        'captar-contato',
        'vender-produto',
        'apresentar-servico',
        'mostrar-trabalho',
      ]),
      nicho: z.string().optional(),
      nome: z.string().optional(),
      marca: z.string().optional(),
      /**
       * A origem que deve vestir o kit. Sem ela, a montagem escolhe a de maior
       * cobertura — e dois sites feitos na mesma Biblioteca saem com as mesmas
       * peças. Com ela, o mesmo acervo dá visuais diferentes.
       */
      origem: z.string().startsWith('ds_').optional(),
    }),
  ),
  async (c) => {
    const recusa = exigeSenhaDeAcao(c);
    if (recusa !== null) return recusa;
    const { objetivo, nicho, nome, marca: nomeDaMarca, origem } = c.req.valid('json');
    const db = getDb();

    const pecas = db.select().from(tables.libraryComponents).all();
    if (pecas.length === 0) {
      return c.json(
        {
          error: 'biblioteca_vazia',
          message:
            'A Biblioteca está vazia: a via expressa monta o kit com as suas peças. Capture um site e promova peças primeiro.',
        },
        422,
      );
    }

    const montagem = montarKitAutomatico(
      objetivo,
      pecas.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        kind: p.kind,
        designSystemId: p.designSystemId ?? 'sem-origem',
      })),
      (cmpId) =>
        recolorabilidadeDoBundle(libraryComponentBundleDir(cmpId as `cmp_${string}`))?.taxa ?? null,
      { origemPreferida: origem ?? null },
    );
    if (montagem.componentIds.length === 0) {
      return c.json(
        {
          error: 'sem_pecas_para_o_objetivo',
          message:
            'Nenhuma peça da Biblioteca cobre a sequência deste objetivo. Promova mais peças ou monte o kit à mão.',
        },
        422,
      );
    }

    const agora = Date.now();
    const base = nomeDaMarca?.trim() || nicho?.trim() || objetivo.replace(/-/g, ' ');
    const nomeDoProjeto =
      nome?.trim() || `Teste · ${base} · ${Math.random().toString(36).slice(2, 6)}`;

    // 1. O kit, como o POST /api/kits faria.
    const kitId = newKitId();
    db.transaction((tx) => {
      tx.insert(tables.kits)
        .values({
          id: kitId,
          name: `${nomeDoProjeto} · kit`,
          description: `Montado pela via expressa (${objetivo}).`,
          createdAt: agora,
          updatedAt: agora,
        })
        .run();
      montagem.componentIds.forEach((componentId, position) => {
        tx.insert(tables.kitComponents).values({ kitId, componentId, position }).run();
      });
    });
    consolidarEGravar(db, kitId);

    // 2. O projeto, com a estrutura que a montagem decidiu — inclusive as
    // etapas SEM peça, que a geração cria no estilo (permissões ligadas).
    const projectId = newProjectId();
    mkdirSync(projectContentDir(projectId), { recursive: true });
    mkdirSync(projectBrandingDir(projectId), { recursive: true });
    mkdirSync(projectMediaDir(projectId), { recursive: true });
    const layout = ProjectLayout.parse({
      ...DEFAULT_LAYOUT,
      objetivo,
      // A origem que venceu a montagem também rege a ESCALA do site (é dela
      // que sai a régua de tamanhos), senão o kit sairia de uma origem e as
      // proporções de outra.
      preferDesignSystemId: montagem.origemPrincipal,
      permissoes: { criarSecoesFaltantes: true, criarArteDeApoio: true },
      secoes: montagem.passos.map((p, i) => ({
        id: `sec-exp-${i + 1}`,
        nome: p.etapa,
        papel: p.papel,
        componentIds: p.componentId === null ? [] : [p.componentId],
      })),
    });
    db.insert(tables.projects)
      .values({
        id: projectId,
        name: nomeDoProjeto,
        createdAt: agora,
        updatedAt: agora,
        kitId,
        contentJson: JSON.stringify(DEFAULT_PROJECT_CONTENT),
        brandingJson: JSON.stringify(DEFAULT_PROJECT_BRANDING),
        mediaManifestJson: '[]',
        layoutJson: JSON.stringify(layout),
        status: 'draft',
      })
      .run();

    // 3. A marca automática — aqui a estrutura JÁ existe, então as mídias
    // nascem ancoradas nas seções.
    const marca = await criarMarcaAutomatica(projectId, {
      nicho: nicho?.trim() || null,
      nomeDaMarca: nomeDaMarca?.trim() || null,
      secoes: secoesQueAceitamMidia({ layoutJson: JSON.stringify(layout), kitId }),
    });
    const b = marca.branding;
    const branding = normalizarProjectBranding(
      JSON.stringify({
        brandName: b.brandName,
        nicho: b.nicho ?? undefined,
        tone: b.tone,
        logoPath: b.logoPath,
        faviconPath: b.faviconPath,
        palette: {
          primary: b.primary,
          background: b.background,
          foreground: b.foreground,
          accent: b.accent,
        },
        typography: { display: b.fontDisplay, body: b.fontBody },
        contact: b.contact,
        social: b.social,
        mainCta: b.mainCta,
        identidadeVerbal: b.identidadeVerbal,
        logos: b.logos,
        logosLocais: b.logosLocais,
        paleta: b.paleta,
        tipografia: b.tipografia,
        sociais: b.sociais,
      }),
    );
    db.update(tables.projects)
      .set({
        brandingJson: JSON.stringify(branding),
        mediaManifestJson: JSON.stringify(marca.media),
        updatedAt: Date.now(),
      })
      .where(eq(tables.projects.id, projectId))
      .run();
    gravarConfig(projectId, DEFAULT_PROJECT_CONTENT, branding);

    return c.json(
      {
        projectId,
        kitId,
        marca: b.brandName,
        midias: marca.media.length,
        passos: montagem.passos,
        avisos: montagem.avisos,
      },
      201,
    );
  },
);

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
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
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
    gravarConfig(id, content, branding);
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
/**
 * Marca automática para testes de geração: gera uma identidade completa
 * (receita curada — voz, paleta, tipografia, contato) e as mídias dela (logos
 * e imagens SVG), gravadas como qualquer upload. Devolve o patch pronto da
 * bancada de Marca; quem aplica e salva é a tela — o projeto não é alterado
 * aqui além da mídia, que já nasce no manifesto.
 */
/**
 * As seções que ACEITAM mídia, com a mesma régua da etapa de Mídia.
 *
 * Exportada para `scripts/projeto-de-kit.ts`: criar um projeto a partir de um
 * kit escolhido precisa exatamente desta lista para ancorar as fotos nas
 * seções. Reimplementar num script seria a segunda régua da mesma decisão — e a
 * que fica para trás quando esta melhora.
 */
export const secoesQueAceitamMidia = (row: {
  layoutJson: string | null;
  kitId: string | null;
}): Array<{ id: string; nome: string; papel?: string; quantas: number; oQue: string }> => {
  const db = getDb();
  const layout = normalizarProjectLayout(row.layoutJson);
  const kitCmps =
    row.kitId === null
      ? []
      : db
          .select()
          .from(tables.kitComponents)
          .where(eq(tables.kitComponents.kitId, row.kitId))
          .all();
  const espacos = kitCmps.map((l) => {
    const contrato = lerOuDerivarContrato(
      libraryComponentBundleDir(l.componentId as `cmp_${string}`),
    );
    return {
      id: l.componentId,
      disponivel: contrato !== null,
      midias: (contrato?.slots.midias ?? [])
        .filter((m) => !m.pareceLogo)
        .map((m) => ({ tipo: m.tipo })),
    };
  });
  return layout.secoes.map((s) => {
    const sugestao = sugerirMidiaDaSecao(s, espacos, layout.objetivo);
    return {
      id: s.id,
      nome: s.nome || (s.papel !== undefined ? ROTULO_DE_PAPEL[s.papel] : 'Seção'),
      papel: s.papel,
      quantas: sugestao.quantas,
      oQue: sugestao.oQue,
    };
  });
};

projectsRoute.post('/:id/marca-automatica', async (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  let nicho: string | null = null;
  try {
    const corpo = (await c.req.json()) as { nicho?: unknown };
    if (typeof corpo.nicho === 'string' && corpo.nicho.trim() !== '') nicho = corpo.nicho.trim();
  } catch {
    // sem corpo é uso legítimo: nicho é opcional
  }

  const r = await criarMarcaAutomatica(id, { nicho, secoes: secoesQueAceitamMidia(row) });
  const media = [...lerManifest(row.mediaManifestJson), ...r.media];
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ branding: r.branding, media }, 201);
});

/**
 * Gera as imagens das SEÇÕES a partir da marca que o projeto já tem.
 *
 * A ordem do wizard é Marca antes de Estrutura, então a marca automática roda
 * quando as seções ainda não existem. Este caminho fecha o ciclo: com a
 * estrutura de pé, lê a identidade SALVA (da automática ou preenchida à mão) e
 * veste cada seção que aceita mídia, ancorando por `secaoId`.
 */
projectsRoute.post('/:id/midias-automaticas', async (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const secoes = secoesQueAceitamMidia(row).filter((s) => s.quantas > 0);
  if (secoes.length === 0) {
    return c.json(
      {
        error: 'sem_secoes_com_midia',
        message:
          'Nenhuma seção aceita mídia ainda. Monte a estrutura (e escolha as peças) primeiro; seção sem espaço de imagem não recebe imagem.',
      },
      422,
    );
  }

  // A identidade visual sai do branding SALVO: paleta semântica quando existe,
  // legado quando não. Cores fora da atribuição caem no legado correspondente.
  const b = normalizarProjectBranding(row.brandingJson);
  const hexDe = (token: string, fallback: string): string => {
    const idCor = b.paleta?.atribuicoes[token];
    return b.paleta?.cores.find((c2) => c2.id === idCor)?.hex ?? fallback;
  };
  const criadas = await criarMidiasDasSecoes(
    id,
    {
      nome: b.brandName ?? 'Marca',
      display: b.tipografia?.display ?? b.typography.display,
      body: b.tipografia?.body ?? b.typography.body,
      cores: [
        hexDe('background', b.palette.background),
        hexDe('surface', b.palette.background),
        hexDe('heading', b.palette.foreground),
        hexDe('body', b.palette.foreground),
        hexDe('primary', b.palette.primary),
        hexDe('primary-foreground', '#ffffff'),
        hexDe('accent', b.palette.accent ?? b.palette.primary),
      ],
    },
    secoes,
    // O nicho persiste no branding desde a marca automática; é ele que decide
    // a CENA das imagens (streetwear desenha roupa, não gradiente qualquer).
    b.nicho ?? null,
  );
  /**
   * Gerar de novo SUBSTITUI a leva anterior, não empilha.
   *
   * Empilhando, cada clique somava um jogo completo de imagens nas mesmas
   * seções e o painel da seção passava a mostrar cinco miniaturas para um
   * espaço só — foi o que aconteceu ao regerar depois de consertar a chave da
   * Pexels: quatro desenhos velhos disputando espaço com a foto nova.
   *
   * A troca alcança só o que ESTA rota gerou antes: imagem automática de seção
   * (o nome carrega `-secao-`) das seções que acabaram de ser refeitas. Upload
   * do usuário, logo e mídia de outra seção não são tocados — o que a pessoa
   * pôs ali com a própria mão não sai por causa de um clique em outro lugar.
   */
  const refeitas = new Set(secoes.map((s) => s.id));
  const anteriores = lerManifest(row.mediaManifestJson);
  const substituidas = anteriores.filter(
    (m) =>
      !(
        m.kind === 'image' &&
        m.secaoId !== undefined &&
        refeitas.has(m.secaoId) &&
        /-secao-/.test(m.path)
      ),
  );
  for (const velha of anteriores) {
    if (substituidas.includes(velha)) continue;
    try {
      rmSync(join(projectMediaDir(id), velha.path), { force: true });
    } catch {
      // arquivo já sumiu ou está preso: o manifesto é a fonte da verdade
    }
  }
  const media = [...substituidas, ...criadas];
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ criadas, media, substituidas: anteriores.length - substituidas.length }, 201);
});

projectsRoute.post('/:id/media', async (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (typeof file === 'string' || !file || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'sem_arquivo' }, 400);
  }

  if (file.size > TAMANHO_MAXIMO_BYTES) {
    return c.json(
      {
        error: 'arquivo_grande_demais',
        message:
          'Esse vídeo passa de 200 MB. Comprima antes de enviar, ou suba para um serviço de vídeo e cole o link.',
      },
      413,
    );
  }

  const kind = typeof body.kind === 'string' ? body.kind : 'image';
  const kindParsed = z
    .enum(['image', 'video', 'logo', 'icon', '3d', 'lottie', 'mockup'])
    .safeParse(kind);
  if (!kindParsed.success) return c.json({ error: 'kind_invalido' }, 400);

  // O front infere o `kind` a partir de `file.type`, mas o navegador manda esse
  // campo VAZIO para alguns arquivos — e aí todo vídeo chegava como 'image' e o
  // thumb renderizava um <img> de .mp4 (caixa quebrada, sem erro). A extensão é
  // a evidência que sobra, então o servidor corrige aqui, nos dois sentidos.
  // Só image↔video: 'logo', 'icon' etc. são intenção declarada, não inferência.
  const ext = extname(file.name || '').toLowerCase();
  let kindFinal = kindParsed.data;
  if (kindFinal === 'image' && EXT_VIDEO.has(ext)) kindFinal = 'video';
  else if (kindFinal === 'video' && EXT_IMAGEM.has(ext)) kindFinal = 'image';

  const dir = projectMediaDir(id);
  mkdirSync(dir, { recursive: true });

  const original = file.name || 'arquivo';
  const safe = original.replace(/[^\w.-]/g, '_');
  const stored = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // O `.mp4` é um CONTAINER: o nome do arquivo não diz o codec que tem dentro.
  // Caso real: um `.mp4` de 29 MB entrou sem reclamação nenhuma e virou um
  // retângulo PRETO na tela de mídia e no site entregue, porque era HEVC
  // (H.265) — formato que os navegadores não tocam. Nada falhava, nada avisava.
  //
  // Recusar aqui é a única saída honesta: transcodificar exigiria ffmpeg, um
  // binário que este repo evita, e aceitar em silêncio entrega um site com um
  // buraco preto no meio. A análise só recusa quando tem CERTEZA (ver
  // `analisarVideo`); o que ela não sabe afirmar, passa.
  if (kindFinal === 'video') {
    const analise = analisarVideo(bytes);
    if (!analise.tocaNaWeb && analise.motivo !== null) {
      return c.json({ error: 'codec_nao_suportado', message: analise.motivo }, 415);
    }
  }

  writeFileSync(join(dir, stored), bytes);

  const item: MediaItem = {
    path: stored,
    mimeType: file.type || MIME[extname(stored).toLowerCase()] || 'application/octet-stream',
    kind: kindFinal,
    originalName: original,
    ...(typeof body.alt === 'string' && body.alt ? { alt: body.alt } : {}),
    // A âncora é o id da seção. O `slotRole` NÃO é gravado aqui: ele é o espelho
    // do papel daquela seção e é derivado na hora de montar o payload, senão
    // ficaria desatualizado assim que a pessoa trocasse a peça da seção.
    ...(typeof body.secaoId === 'string' && body.secaoId ? { secaoId: body.secaoId } : {}),
  };

  const media = [...lerManifest(row.mediaManifestJson), item];
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ item, media }, 201);
});

/**
 * Move uma mídia de seção sem reenviar o arquivo.
 *
 * `secaoId: null` devolve a mídia para "o gerador decide": ela perde a âncora
 * e passa a ser posicionada por quem monta o site.
 */
const PatchMediaInput = z.object({
  path: z.string().min(1),
  secaoId: z.string().min(1).nullable(),
});

projectsRoute.patch('/:id/media', zValidator('json', PatchMediaInput), (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const { path, secaoId } = c.req.valid('json');

  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const atual = lerManifest(row.mediaManifestJson);
  if (!atual.some((m) => m.path === path)) return c.json({ error: 'media_not_found' }, 404);

  const media = atual.map((m) =>
    m.path === path ? { ...m, ...(secaoId === null ? { secaoId: undefined } : { secaoId }) } : m,
  );
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ media });
});

/** Remove uma mídia do manifest e do disco. */
projectsRoute.delete('/:id/media', (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'sem_path' }, 400);

  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const media = lerManifest(row.mediaManifestJson).filter((m) => m.path !== path);
  // Só apaga do disco se o nome for um arquivo direto (sem travessia).
  if (!path.includes('/') && !path.includes('\\') && !path.includes('..')) {
    const abs = join(projectMediaDir(id), path);
    if (existsSync(abs)) rmSync(abs, { force: true });
  }
  db.update(tables.projects)
    .set({ mediaManifestJson: JSON.stringify(media), updatedAt: Date.now() })
    .where(eq(tables.projects.id, id))
    .run();

  return c.json({ deleted: true, media });
});

/**
 * O que este site herda de mídia presa à rolagem, dito na hora de gerar.
 *
 * A peça chega à geração como bundle e contrato; a âncora está gravada nos slots
 * de mídia desde a promoção. O que faltava era ALGUÉM DIZER: quem monta o site
 * troca a imagem de um hero sem saber que aquela imagem se move entre 20% e 60%
 * da rolagem, e o resultado fica estranho sem ninguém entender por quê.
 *
 * Isto declara, e só. Não promete que a troca preserva o movimento: o gerador
 * não foi validado com mídia trocada dentro de cápsula, e prometer o que
 * ninguém conferiu é o que este produto evita.
 */
export const avisoDeMidiaPresaARolagem = (
  nomeDaPeca: string,
  midias: readonly SlotDeMidia[],
): string | null => {
  const presas = midias.filter((m) => (m.ancoras?.length ?? 0) > 0);
  if (presas.length === 0) return null;
  const efeitos = [...new Set(presas.flatMap((m) => (m.ancoras ?? []).map((a) => a.efeito)))].join(
    ', ',
  );
  const quantas =
    presas.length === 1 ? '1 mídia está presa' : `${presas.length} mídias estão presas`;
  const fim =
    'Trocar o arquivo mantém o movimento do original, e o arquivo novo precisa funcionar nesse enquadramento.';
  return `Na peça "${nomeDaPeca}", ${quantas} a um ponto da rolagem (${efeitos}). ${fim}`;
};

/** Os avisos de mídia posicional de um kit inteiro, lidos dos contratos em disco. */
const avisosDeMidiaPresaARolagem = (
  componentes: readonly { id: string; name: string }[],
): string[] =>
  componentes.flatMap((cmp) => {
    const contrato = lerOuDerivarContrato(libraryComponentBundleDir(cmp.id as `cmp_${string}`));
    if (contrato === null) return [];
    const aviso = avisoDeMidiaPresaARolagem(cmp.name, contrato.slots.midias);
    return aviso === null ? [] : [aviso];
  });

/**
 * Dispara a geração do site a partir do rascunho já salvo.
 *
 * Regra central da reforma: o site usa SOMENTE os componentes do kit do projeto
 * — não a Biblioteca inteira. O kit é o Design System final; gerar fora dele
 * traria peças de origens que não conversam.
 */
projectsRoute.post('/:id/generate', async (c) => {
  // A outra ação cara. Mesma tranca da extração, e pelo mesmo motivo.
  const recusa = exigeSenhaDeAcao(c);
  if (recusa !== null) return recusa;

  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
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
  // O design system consolidado viaja no payload. `kit` é a linha crua da
  // tabela, então o tokensJson está à mão. JSON quebrado degrada para null
  // (sem recoloração), nunca para 500.
  const designSystemDoKit = (() => {
    if (kit.tokensJson == null) return null;
    try {
      return JSON.parse(kit.tokensJson) as unknown;
    } catch {
      return null;
    }
  })();
  const contexto = montarContextoDeGeracao({
    projeto: row,
    kit: { id: kit.id, name: kit.name, designSystem: designSystemDoKit },
    componentes: componentesDoKit,
    ausentes,
  });
  const avisos = [...contexto.avisos, ...avisosDeMidiaPresaARolagem(componentesDoKit)];

  // Modo fila: registra o pedido com o payload do contrato. Nada roda aqui.
  if (isQueueMode()) {
    const job = enqueueJob('generate', `Gerar site: ${row.name}`, contexto.payload);
    db.update(tables.projects)
      .set({ status: 'ready-to-generate', updatedAt: Date.now() })
      .where(eq(tables.projects.id, id))
      .run();
    return c.json({ queued: true, job, projectId: id, avisos }, 202);
  }

  if (!apiPagaPermitida())
    return c.json({ error: 'api_paga_bloqueada', message: MENSAGEM_API_BLOQUEADA }, 403);
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
    for (const aviso of avisos) onEvent('warn', aviso);

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
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);
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
  const origemMedia = projectMediaDir(id);
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
 *
 * Recusa enquanto houver job na fila para este projeto. Quem gera o site é um
 * processo de fora, que lê o pedido do disco e escreve o resultado na pasta:
 * apagar por baixo dele não interrompe nada, só garante que o trabalho termine
 * num lugar que ninguém mais alcança. Já aconteceu — um projeto sumiu da tela
 * enquanto o site dele continuava sendo escrito. Cancelar o job primeiro é uma
 * decisão da pessoa, não algo para o servidor fazer por conta.
 */
projectsRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!ehProjectId(id)) return c.json({ error: 'invalid_id' }, 400);

  const db = getDb();
  const row = db.select().from(tables.projects).where(eq(tables.projects.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  const abertos = jobsAbertosDoProjeto(id);
  if (abertos.length > 0) {
    return c.json(
      {
        error: 'job_em_aberto',
        message:
          abertos.length === 1
            ? `"${abertos[0]?.label}" ainda está na fila para este projeto. Cancele o pedido antes de apagar.`
            : `${abertos.length} pedidos deste projeto ainda estão na fila. Cancele antes de apagar.`,
        jobs: abertos.map((j) => ({ id: j.id, label: j.label, type: j.type })),
      },
      409,
    );
  }

  const dir = projectDir(id);
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
