import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Schema do SQLite.
 *
 * Regras:
 * - Nomes de tabela e coluna em snake_case (convenção SQL).
 * - Timestamps em unix ms (integer).
 * - JSON blobs guardados como text; sempre validados por Zod ao ler.
 * - Foreign keys explícitas com onDelete comportamento definido.
 */

// ── Design Systems ─────────────────────────────────────────────────────────
export const designSystems = sqliteTable(
  'design_systems',
  {
    id: text('id').primaryKey(),
    sourceUrl: text('source_url'),
    sourceHash: text('source_hash').notNull(),
    extractedAt: integer('extracted_at').notNull(),
    name: text('name').notNull(),
    stackJson: text('stack_json'),
    status: text('status').notNull(),
    vaultPath: text('vault_path').notNull(),
    errorMessage: text('error_message'),
  },
  (t) => ({
    sourceHashUnique: uniqueIndex('design_systems_source_hash_uq').on(t.sourceHash),
    statusIdx: index('design_systems_status_idx').on(t.status),
  }),
);

// ── Segments (candidatos antes da curadoria) ───────────────────────────────
export const segments = sqliteTable(
  'segments',
  {
    id: text('id').primaryKey(),
    designSystemId: text('design_system_id')
      .notNull()
      .references(() => designSystems.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    htmlSnippet: text('html_snippet').notNull(),
    previewPath: text('preview_path'),
    position: integer('position').notNull(),
    inLibrary: integer('in_library', { mode: 'boolean' }).notNull().default(false),
    /**
     * Seção pai quando o segmento é um subcomponente extraído dela (botão,
     * card, badge…). NULL = seção raiz. Cascade: excluir a seção leva os
     * filhos junto. A anotação `AnySQLiteColumn` quebra o ciclo de tipos da
     * auto-referência.
     */
    parentId: text('parent_id').references((): AnySQLiteColumn => segments.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => ({
    dsCategoryIdx: index('segments_ds_category_idx').on(t.designSystemId, t.category),
    inLibraryIdx: index('segments_in_library_idx').on(t.inLibrary),
    parentIdx: index('segments_parent_idx').on(t.parentId),
  }),
);

// ── Library Components (o ativo curado) ────────────────────────────────────
export const libraryComponents = sqliteTable(
  'library_components',
  {
    id: text('id').primaryKey(),
    segmentId: text('segment_id').references(() => segments.id, { onDelete: 'set null' }),
    designSystemId: text('design_system_id').references(() => designSystems.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    bundlePath: text('bundle_path').notNull(),
    bundleHash: text('bundle_hash').notNull(),
    tokensJson: text('tokens_json'),
    addedAt: integer('added_at').notNull(),
    notes: text('notes'),
  },
  (t) => ({
    categoryIdx: index('library_components_category_idx').on(t.category),
    addedAtIdx: index('library_components_added_at_idx').on(t.addedAt),
    bundleHashIdx: index('library_components_bundle_hash_idx').on(t.bundleHash),
  }),
);

// ── Tags de componentes ────────────────────────────────────────────────────
export const componentTags = sqliteTable(
  'component_tags',
  {
    componentId: text('component_id')
      .notNull()
      .references(() => libraryComponents.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.componentId, t.tag] }),
    tagIdx: index('component_tags_tag_idx').on(t.tag),
  }),
);

// ── Dependências de componentes ────────────────────────────────────────────
export const componentDependencies = sqliteTable(
  'component_dependencies',
  {
    componentId: text('component_id')
      .notNull()
      .references(() => libraryComponents.id, { onDelete: 'cascade' }),
    depType: text('dep_type').notNull(),
    depPath: text('dep_path'),
    depUrl: text('dep_url'),
  },
  (t) => ({
    componentIdx: index('component_deps_component_idx').on(t.componentId),
  }),
);

// ── Kits (Design Systems finais) ───────────────────────────────────────────
/**
 * Um kit é um Design System FINAL: um conjunto nomeado e persistente de
 * componentes escolhidos da Biblioteca, que representa as decisões visuais de
 * uma marca ou de um estilo.
 *
 * É a entidade que faltava entre a Biblioteca (acervo solto) e o site gerado:
 * a Biblioteca guarda tudo que você já gostou de qualquer lugar; o kit é o
 * subconjunto coerente que você montou de propósito para gerar sites.
 */
export const kits = sqliteTable(
  'kits',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * O design system FINAL do kit, consolidado (`KitDesignSystem` do shared):
     * as cores de todas as peças agrupadas em clusters com papel semântico,
     * POR ORIGEM, mais o tema e as limitações da consolidação.
     *
     * É a camada que faltava entre "kit é uma lista de peças" e "kit é o
     * design system final" que o comentário desta tabela sempre prometeu. É
     * daqui que a recoloração tira o mapa literal→papel, e é isto que o Orbis
     * consulta (junto da identidade do usuário) para criar qualquer coisa "no
     * estilo do kit".
     *
     * Nulo = ainda não consolidado (kit antigo, ou a consolidação falhou). A
     * leitura faz backfill preguiçoso; a geração sem ele degrada para a
     * aparência original das peças, nunca para quebrado.
     */
    tokensJson: text('tokens_json'),
    /**
     * A origem que dá o RITMO do site: espaçamento, layout, raio, sombra e
     * movimento. É a família `fundamentos` da taxonomia — "a escala e o ritmo
     * que valem no site inteiro" — reduzida a uma escolha.
     *
     * Cor e tipografia NÃO vêm daqui: essas são da marca do usuário, por
     * decisão de produto. Da origem vem a forma; a identidade é dele.
     *
     * Nula = base em aberto, que é o estado de todo kit criado antes desta
     * coluna. O app segue funcionando e diz que a base não foi escolhida.
     * `set null` no delete: perder a captura não pode derrubar o kit.
     */
    origemBase: text('origem_base').references(() => designSystems.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    updatedAtIdx: index('kits_updated_at_idx').on(t.updatedAt),
  }),
);

/**
 * "Neste kit, botão vem desta captura."
 *
 * A regra que o usuário formulou: misturar botões de sites diferentes vira
 * bagunça. Vale para a família `pecas` da taxonomia — botão, card, badge,
 * input, acordeão, navegação. Dobras e efeitos ficam de fora de propósito: é
 * ali que a mistura é o produto.
 *
 * Uma linha por categoria travada. Categoria sem linha continua livre, então
 * kit antigo (tabela vazia) se comporta exatamente como antes.
 */
export const kitRegrasDeOrigem = sqliteTable(
  'kit_regras_de_origem',
  {
    kitId: text('kit_id')
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    /** Categoria da taxonomia. Texto porque o enum vive no Zod, como no resto. */
    categoria: text('categoria').notNull(),
    designSystemId: text('design_system_id')
      .notNull()
      .references(() => designSystems.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.kitId, t.categoria] }),
    kitIdx: index('kit_regras_kit_idx').on(t.kitId),
  }),
);

/**
 * Componentes de um kit, com posição estável.
 *
 * `onDelete: cascade` no componente: quando um item sai da Biblioteca, sai dos
 * kits junto. A interface mostra o impacto ANTES de deixar apagar — o cascade
 * é o mecanismo, não o aviso.
 */
export const kitComponents = sqliteTable(
  'kit_components',
  {
    kitId: text('kit_id')
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    componentId: text('component_id')
      .notNull()
      .references(() => libraryComponents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /**
     * O papel desta peça no site — `SectionRole` do `layout.ts`, o mesmo
     * vocabulário que o projeto já usa (`hero`, `pricing`, `footer`…).
     *
     * Mora no KIT, e não só no projeto, porque a decisão é do kit: "esta é a
     * minha peça de preços" vale para todo site que nascer dele. Nulo = o papel
     * ainda não foi declarado, e a estrutura decide na hora de gerar, como
     * sempre fez.
     */
    papel: text('papel'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.kitId, t.componentId] }),
    kitIdx: index('kit_components_kit_idx').on(t.kitId),
    componentIdx: index('kit_components_component_idx').on(t.componentId),
  }),
);

// ── Projects (sites gerados) ───────────────────────────────────────────────
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /**
     * O Design System final que este site usa como base visual. `set null` na
     * exclusão: o site gerado sobrevive ao kit (os arquivos estão em disco),
     * só perde a referência de origem.
     */
    kitId: text('kit_id').references(() => kits.id, { onDelete: 'set null' }),
    contentJson: text('content_json'),
    brandingJson: text('branding_json'),
    mediaManifestJson: text('media_manifest_json'),
    /** ProjectLayout serializado: blueprint escolhido, slots ligados, densidade e movimento. */
    layoutJson: text('layout_json'),
    status: text('status').notNull(),
  },
  (t) => ({
    updatedAtIdx: index('projects_updated_at_idx').on(t.updatedAt),
    statusIdx: index('projects_status_idx').on(t.status),
    kitIdx: index('projects_kit_idx').on(t.kitId),
  }),
);

// ── LLM cache (regenerável, mas evita custo) ───────────────────────────────
export const llmCache = sqliteTable('llm_cache', {
  inputHash: text('input_hash').primaryKey(),
  operation: text('operation').notNull(),
  outputJson: text('output_json').notNull(),
  costUsd: integer('cost_usd_micros'),
  createdAt: integer('created_at').notNull(),
});

// ── Tasks (histórico de operações longas) ──────────────────────────────────
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    operation: text('operation').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    inputJson: text('input_json').notNull(),
    outputJson: text('output_json'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    statusIdx: index('tasks_status_idx').on(t.status),
    createdAtIdx: index('tasks_created_at_idx').on(t.createdAt),
  }),
);

// SQL bruto para o FTS5 virtual table de busca textual em componentes.
// A instrução é executada em migrate.ts porque drizzle-kit não gera
// CREATE VIRTUAL TABLE. Mantida aqui como documentação da estrutura.
// CREATE VIRTUAL TABLE IF NOT EXISTS components_fts USING fts5(
//   component_id UNINDEXED, name, notes, tags,
//   tokenize = 'unicode61 remove_diacritics 2'
// );
