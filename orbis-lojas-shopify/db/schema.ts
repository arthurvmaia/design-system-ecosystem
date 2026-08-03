import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    roleId: text("role_id").notNull().references(() => roles.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  segment: text("segment"),
  locale: text("locale").notNull().default("pt-BR"),
  visualStyle: text("visual_style"),
  onboarding: text("onboarding", { mode: "json" }),
  ...timestamps,
});

export const themeCategories = sqliteTable("theme_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const themes = sqliteTable(
  "themes",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").references(() => themeCategories.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("published"),
    tokenPrice: integer("token_price").notNull(),
    version: text("version").notNull(),
    author: text("author").notNull(),
    tags: text("tags", { mode: "json" }).notNull(),
    languages: text("languages", { mode: "json" }).notNull(),
    sectionCount: integer("section_count").notNull().default(0),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    badge: text("badge"),
    defaultSettings: text("default_settings", { mode: "json" }).notNull(),
    allowedSettings: text("allowed_settings", { mode: "json" }).notNull(),
    changelog: text("changelog").notNull().default(""),
    ...timestamps,
  },
  (table) => [uniqueIndex("idx_themes_slug").on(table.slug), index("idx_themes_status").on(table.status)],
);

export const themeImports = sqliteTable(
  "theme_imports",
  {
    themeId: text("theme_id").primaryKey().references(() => themes.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    sourceFilename: text("source_filename").notNull(),
    sourceSize: integer("source_size").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    architecture: text("architecture").notNull(),
    importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_theme_imports_source_key").on(table.sourceKey), index("idx_theme_imports_user").on(table.userId)],
);

export const themeVersions = sqliteTable(
  "theme_versions",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    schema: text("schema", { mode: "json" }).notNull(),
    changelog: text("changelog").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_theme_versions_theme_version").on(table.themeId, table.version)],
);

export const themeAssets = sqliteTable("theme_assets", {
  id: text("id").primaryKey(),
  themeId: text("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  altText: text("alt_text"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const themePages = sqliteTable("theme_pages", {
  id: text("id").primaryKey(),
  themeId: text("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  position: integer("position").notNull().default(0),
});

export const themeSections = sqliteTable("theme_sections", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  position: integer("position").notNull(),
  settings: text("settings", { mode: "json" }).notNull(),
});

export const themeSchemas = sqliteTable("theme_schemas", {
  themeId: text("theme_id").primaryKey().references(() => themes.id, { onDelete: "cascade" }),
  schema: text("schema", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    themeId: text("theme_id").notNull().references(() => themes.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    customization: text("customization", { mode: "json" }).notNull(),
    publishedSlug: text("published_slug"),
    ...timestamps,
  },
  (table) => [index("idx_projects_user_updated").on(table.userId, table.updatedAt), uniqueIndex("idx_projects_published_slug").on(table.publishedSlug)],
);

export const projectPages = sqliteTable("project_pages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  seo: text("seo", { mode: "json" }).notNull(),
});

export const projectCustomizations = sqliteTable("project_customizations", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  settings: text("settings", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectVersions = sqliteTable(
  "project_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    snapshot: text("snapshot", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_project_versions_project_created").on(table.projectId, table.createdAt)],
);

export const projectPublications = sqliteTable("project_publications", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull(),
  publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tokenPackages = sqliteTable("token_packages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokens: integer("tokens").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const tokenWallets = sqliteTable("token_wallets", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tokenTransactions = sqliteTable(
  "token_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    description: text("description").notNull(),
    reference: text("reference").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_token_transactions_reference").on(table.reference), index("idx_token_transactions_user_created").on(table.userId, table.createdAt)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    packageId: text("package_id").notNull().references(() => tokenPackages.id),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    tokens: integer("tokens").notNull(),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_payments_idempotency").on(table.idempotencyKey)],
);

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull().references(() => payments.id),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_payment_events_provider_event").on(table.providerEventId)],
);

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    themeId: text("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.themeId] })],
);

export const mediaFiles = sqliteTable("media_files", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  altText: text("alt_text").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const languages = sqliteTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const projectTranslations = sqliteTable(
  "project_translations",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    languageCode: text("language_code").notNull().references(() => languages.code),
    content: text("content", { mode: "json" }).notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.languageCode] })],
);

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  bonusTokens: integer("bonus_tokens").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: text("metadata", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_audit_logs_actor_created").on(table.actorId, table.createdAt)],
);

export const themeUnlocks = sqliteTable(
  "theme_unlocks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    themeId: text("theme_id").notNull().references(() => themes.id),
    projectId: text("project_id").notNull(),
    projectName: text("project_name").notNull(),
    customization: text("customization", { mode: "json" }).notNull(),
    cost: integer("cost").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_theme_unlocks_idempotency").on(table.idempotencyKey), uniqueIndex("idx_theme_unlocks_project").on(table.projectId)],
);
