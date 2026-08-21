import { env } from "cloudflare:workers";
import type { Viewer, BootstrapData, Project, Theme, TokenPackage, TokenTransaction } from "@/lib/types";
import { DEFAULT_CUSTOMIZATION, normalizeCustomization } from "@/lib/business-rules.mjs";
import { identidadeDoTemaImportado, type ShopifyThemeImport } from "@/lib/shopify-theme";

type Identity = Omit<Viewer, "role">;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES roles(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS theme_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES theme_categories(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    token_price INTEGER NOT NULL CHECK(token_price >= 0),
    version TEXT NOT NULL,
    author TEXT NOT NULL,
    tags TEXT NOT NULL,
    languages TEXT NOT NULL,
    section_count INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    badge TEXT,
    default_settings TEXT NOT NULL,
    allowed_settings TEXT NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_themes_status ON themes(status)`,
  `CREATE TABLE IF NOT EXISTS theme_imports (
    theme_id TEXT PRIMARY KEY REFERENCES themes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_key TEXT NOT NULL UNIQUE,
    source_filename TEXT NOT NULL,
    source_size INTEGER NOT NULL,
    source_fingerprint TEXT NOT NULL,
    architecture TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_theme_imports_user ON theme_imports(user_id)`,
  `CREATE TABLE IF NOT EXISTS token_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tokens INTEGER NOT NULL CHECK(tokens > 0),
    price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS token_wallets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS token_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
    description TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created ON token_transactions(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    package_id TEXT NOT NULL REFERENCES token_packages(id),
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_id TEXT NOT NULL REFERENCES themes(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    customization TEXT NOT NULL,
    published_slug TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, theme_id)
  )`,
  `CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    metadata TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS theme_unlocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    theme_id TEXT NOT NULL REFERENCES themes(id),
    project_id TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    customization TEXT NOT NULL,
    cost INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  /**
   * A CONEXÃO com a loja do cliente, viva só entre a ida e a volta do OAuth.
   *
   * O `estado` é a chave, e é ele que atravessa o passeio: sorteado na ida,
   * conferido na volta, usado uma vez para instalar e apagado em seguida. Nada
   * aqui é histórico; é uma linha de recado entre duas requisições.
   *
   * O token fica gravado por SEGUNDOS, o tempo entre o cliente aprovar e a
   * instalação terminar. Guardar token de escrita da loja de alguém por mais
   * tempo é assumir a responsabilidade de protegê-lo — e aí entram cifra,
   * rotação e o webhook de desinstalação. Enquanto ele não sobrevive à
   * instalação, nada disso é preciso.
   */
  `CREATE TABLE IF NOT EXISTS shopify_conexoes (
    estado TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    loja TEXT NOT NULL,
    token TEXT,
    escopos TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TRIGGER IF NOT EXISTS validate_payment_before_insert
    BEFORE INSERT ON payments
    WHEN NEW.tokens != (SELECT tokens FROM token_packages WHERE id = NEW.package_id)
      OR NEW.amount_cents != (SELECT price_cents FROM token_packages WHERE id = NEW.package_id)
    BEGIN SELECT RAISE(ABORT, 'PACKAGE_CHANGED'); END`,
  `CREATE TRIGGER IF NOT EXISTS credit_completed_payment
    AFTER INSERT ON payments
    WHEN NEW.status = 'completed'
    BEGIN
      UPDATE token_wallets SET balance = balance + NEW.tokens, updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
      INSERT INTO token_transactions(id, user_id, type, amount, balance_after, description, reference)
      VALUES ('tx-' || NEW.id, NEW.user_id, 'purchase', NEW.tokens,
        (SELECT balance FROM token_wallets WHERE user_id = NEW.user_id),
        'Compra simulada de tokens', 'payment:' || NEW.id);
    END`,
  `CREATE TRIGGER IF NOT EXISTS validate_unlock_before_insert
    BEFORE INSERT ON theme_unlocks
    WHEN NEW.cost != (SELECT token_price FROM themes WHERE id = NEW.theme_id)
      OR (SELECT balance FROM token_wallets WHERE user_id = NEW.user_id) < NEW.cost
    BEGIN SELECT RAISE(ABORT, 'UNLOCK_REJECTED'); END`,
  `CREATE TRIGGER IF NOT EXISTS complete_unlock_after_insert
    AFTER INSERT ON theme_unlocks
    BEGIN
      UPDATE token_wallets SET balance = balance - NEW.cost, updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
      INSERT INTO token_transactions(id, user_id, type, amount, balance_after, description, reference)
      VALUES ('tx-' || NEW.id, NEW.user_id, 'consumption', -NEW.cost,
        (SELECT balance FROM token_wallets WHERE user_id = NEW.user_id),
        'Desbloqueio de tema', 'unlock:' || NEW.id);
      INSERT INTO projects(id, user_id, theme_id, name, status, customization)
      VALUES (NEW.project_id, NEW.user_id, NEW.theme_id, NEW.project_name, 'editing', NEW.customization);
    END`,
];

let initialized: Promise<void> | null = null;

export function getD1(): D1Database {
  if (!env.DB) throw new Error("DATABASE_UNAVAILABLE");
  return env.DB;
}

export async function ensureDatabase() {
  if (!initialized) initialized = initializeDatabase();
  return initialized;
}

async function initializeDatabase() {
  const db = getD1();
  for (const statement of schemaStatements) {
    await db.prepare(statement).run();
  }

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO roles(id, name) VALUES ('admin', 'Administrador')"),
    db.prepare("INSERT OR IGNORE INTO roles(id, name) VALUES ('client', 'Cliente')"),
    db.prepare("INSERT OR IGNORE INTO theme_categories(id, name, slug) VALUES ('ecommerce', 'Loja virtual', 'loja-virtual')"),
    db.prepare("INSERT OR IGNORE INTO token_packages(id, name, tokens, price_cents) VALUES ('starter', 'Inicial', 30, 2900)"),
    db.prepare("INSERT OR IGNORE INTO token_packages(id, name, tokens, price_cents) VALUES ('growth', 'Crescimento', 75, 5900)"),
    db.prepare("INSERT OR IGNORE INTO token_packages(id, name, tokens, price_cents) VALUES ('studio', 'Estúdio', 180, 11900)"),
  ]);

  const themes = [
    {
      id: "shrine-pro",
      category: "ecommerce",
      name: "ShrinePro",
      slug: "shrine-pro",
      description: "Tema Shopify premium importado, com foco em conversão, bundles, prova social e vitrines responsivas.",
      price: 0,
      version: "1.0-import",
      author: "Shrine",
      tags: ["e-commerce", "conversão", "shopify"],
      languages: ["pt-BR", "en", "es"],
      sections: 28,
      featured: 1,
      badge: "Tema importado",
      defaults: DEFAULT_CUSTOMIZATION,
      allowed: ["global", "announcement", "header", "hero", "benefits", "products", "bundle", "comparison", "testimonials", "faq", "newsletter", "footer", "search", "productPage", "collection", "cart", "blog"],
    },
  ];

  for (const theme of themes) {
    await db.prepare(`INSERT OR IGNORE INTO themes(
      id, category_id, name, slug, description, token_price, version, author,
      tags, languages, section_count, featured, badge, default_settings, allowed_settings
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      theme.id,
      theme.category,
      theme.name,
      theme.slug,
      theme.description,
      theme.price,
      theme.version,
      theme.author,
      JSON.stringify(theme.tags),
      JSON.stringify(theme.languages),
      theme.sections,
      theme.featured,
      theme.badge,
      JSON.stringify(theme.defaults),
      JSON.stringify(theme.allowed),
    ).run();
  }

  const shrinePro = themes[0];
  await db.prepare(`UPDATE themes SET
    description = ?, token_price = ?, badge = ?
    WHERE id = 'shrine-pro'`).bind(
    shrinePro.description,
    shrinePro.price,
    shrinePro.badge,
  ).run();

  await removerTemasZumbis(db, themes.map((theme) => theme.id));
  await removerAssetsOrfaos(db);
}

/**
 * OS ASSETS DE TEMAS QUE JÁ NÃO EXISTEM.
 *
 * A partir de agora `deleteTheme` leva os assets junto. Só que o que já estava
 * no disco não tem como ser alcançado por ele: a chave é
 * `theme-assets/<dono>/<fingerprint>/…`, e o fingerprint saiu do banco junto
 * com o tema. Ficariam ali para sempre, sem nenhum caminho de volta.
 *
 * Medido neste computador depois de o usuário apagar tudo pela tela: nenhum
 * tema no banco, nenhum ZIP de origem no R2, e 2.365 objetos órfãos ocupando
 * 342 MB.
 *
 * A regra é simples e não depende de histórico: fingerprint que nenhum tema
 * VIVO declara não serve a ninguém. Reimportar o mesmo ZIP recria tudo, porque
 * o fingerprint é do conteúdo.
 */
async function removerAssetsOrfaos(db: ReturnType<typeof getD1>) {
  if (!env.MEDIA) return 0;
  const vivos = new Set<string>();
  const temas = await db.prepare("SELECT default_settings AS defaults FROM themes").all<{ defaults: string }>();
  for (const tema of temas.results ?? []) {
    const fingerprint = parseJson<{ shopify?: { sourceFingerprint?: string } }>(tema.defaults, {}).shopify?.sourceFingerprint;
    if (fingerprint) vivos.add(fingerprint);
  }

  let cursor: string | undefined;
  let apagados = 0;
  let pendentes: string[] = [];
  const descarregar = async () => {
    if (!pendentes.length) return;
    await env.MEDIA.delete(pendentes);
    apagados += pendentes.length;
    pendentes = [];
  };
  /* com cursor e em lotes: um acervo real passa de dois mil objetos, e listar
     de uma vez devolve a primeira página em silêncio */
  do {
    const pagina = await env.MEDIA.list({ prefix: "theme-assets/", cursor, limit: 500 });
    for (const objeto of pagina.objects as Array<{ key: string }>) {
      const fingerprint = objeto.key.split("/")[2];
      if (fingerprint && !vivos.has(fingerprint)) pendentes.push(objeto.key);
      if (pendentes.length >= 200) await descarregar();
    }
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor);
  await descarregar();
  return apagados;
}

/**
 * OS ZUMBIS DO BOTÃO ANTIGO, que arquivava em vez de apagar.
 *
 * Um tema `archived` não sai por caminho nenhum: o `bootstrap` só devolve
 * publicados, então ele é invisível, e a remoção pedia `status = 'published'`,
 * então era indeletável. Ficava no banco para sempre.
 *
 * E não ficava quieto. `importShopifyTheme` grava com
 * `ON CONFLICT(id) DO UPDATE SET status = 'published'`: importar qualquer tema
 * que caia no mesmo id RESSUSCITA o zumbi — e o modelo nativo dele vira a base
 * do tema novo, via `currentDefaults`. É assim que o conteúdo de uma loja
 * apagada reaparecia dentro de uma importação recém-feita.
 *
 * A limpeza é estreita de propósito, e cada condição tem motivo:
 *
 * - só `archived`, porque nada no código de hoje arquiva tema: quem está assim
 *   veio do botão antigo, e o usuário já mandou apagar uma vez;
 * - só sem projeto apontando, porque apagar o tema de um projeto vivo deixaria
 *   o projeto órfão na tela — pior que o zumbi;
 * - nunca um id SEMEADO: o seed o recriaria oco, sem os dados Shopify, e um
 *   tema vazio de volta na lista é mais confuso que um invisível fora dela.
 */
async function removerTemasZumbis(db: ReturnType<typeof getD1>, semeados: string[]) {
  const marcadores = semeados.map(() => "?").join(", ");
  const alvos = await db.prepare(`SELECT id FROM themes
    WHERE status = 'archived'
      AND id NOT IN (${marcadores})
      AND id NOT IN (SELECT DISTINCT theme_id FROM projects)`)
    .bind(...semeados).all<{ id: string }>();
  for (const alvo of alvos.results ?? []) {
    await db.batch([
      db.prepare("DELETE FROM favorites WHERE theme_id = ?").bind(alvo.id),
      db.prepare("DELETE FROM theme_imports WHERE theme_id = ?").bind(alvo.id),
      db.prepare("DELETE FROM theme_unlocks WHERE theme_id = ?").bind(alvo.id),
      db.prepare("DELETE FROM themes WHERE id = ?").bind(alvo.id),
    ]);
  }
}

export async function ensureUser(identity: Identity): Promise<Viewer> {
  await ensureDatabase();
  const db = getD1();
  await db.prepare(`INSERT OR IGNORE INTO users(id, email, name, role_id)
    VALUES (?, ?, ?, CASE WHEN (SELECT COUNT(*) FROM users) = 0 THEN 'admin' ELSE 'client' END)`)
    .bind(identity.id, identity.email, identity.name)
    .run();
  await db.prepare("INSERT OR IGNORE INTO token_wallets(user_id, balance) VALUES (?, 40)").bind(identity.id).run();
  const row = await db.prepare("SELECT id, email, name, role_id AS role FROM users WHERE id = ?").bind(identity.id).first<Viewer>();
  if (!row) throw new Error("USER_INITIALIZATION_FAILED");
  return row;
}

export async function getBootstrap(viewer: Viewer): Promise<BootstrapData> {
  await ensureDatabase();
  const db = getD1();
  const [wallet, themesResult, projectsResult, packagesResult, transactionsResult, favoritesResult] = await Promise.all([
    db.prepare("SELECT balance FROM token_wallets WHERE user_id = ?").bind(viewer.id).first<{ balance: number }>(),
    db.prepare(`SELECT t.id, t.name, t.slug, t.description, c.name AS category,
      t.token_price AS tokenPrice, t.version, t.author, t.languages,
      t.section_count AS sectionCount, t.featured, t.badge, t.default_settings AS defaultSettings
      FROM themes t LEFT JOIN theme_categories c ON c.id = t.category_id
      WHERE t.status = 'published' AND t.id NOT IN ('mosaic-studio', 'flora', 'flora-care') ORDER BY t.featured DESC, t.created_at DESC`).all<Record<string, unknown>>(),
    db.prepare(`SELECT p.id, p.theme_id AS themeId, t.name AS themeName, p.name, p.status,
      p.customization, p.published_slug AS publishedSlug, p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM projects p JOIN themes t ON t.id = p.theme_id
      WHERE p.user_id = ? AND p.theme_id NOT IN ('mosaic-studio', 'flora', 'flora-care') ORDER BY p.updated_at DESC`).bind(viewer.id).all<Record<string, unknown>>(),
    db.prepare("SELECT id, name, tokens, price_cents AS priceCents FROM token_packages WHERE active = 1 ORDER BY tokens").all<TokenPackage>(),
    db.prepare(`SELECT id, type, amount, balance_after AS balanceAfter, description, created_at AS createdAt
      FROM token_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`).bind(viewer.id).all<TokenTransaction>(),
    db.prepare("SELECT theme_id AS themeId FROM favorites WHERE user_id = ?").bind(viewer.id).all<{ themeId: string }>(),
  ]);

  const themeRows = themesResult.results.map((row) => ({
    ...row,
    languages: parseJson(row.languages, []),
    defaultSettings: parseJson(row.defaultSettings, {}),
  })) as Theme[];
  const projectRows = projectsResult.results.map((row) => ({
    ...row,
    customization: parseJson(row.customization, DEFAULT_CUSTOMIZATION),
  })) as Project[];

  return {
    viewer,
    balance: wallet?.balance ?? 0,
    themes: themeRows,
    projects: projectRows,
    packages: packagesResult.results,
    transactions: transactionsResult.results,
    favorites: favoritesResult.results.map((row) => row.themeId),
  };
}

export async function buyTokens(viewer: Viewer, packageId: string, idempotencyKey: string) {
  const db = getD1();
  const pack = await db.prepare("SELECT tokens, price_cents AS priceCents FROM token_packages WHERE id = ? AND active = 1")
    .bind(packageId).first<{ tokens: number; priceCents: number }>();
  if (!pack) throw new Error("PACKAGE_NOT_FOUND");
  const paymentId = crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO payments(id, user_id, package_id, provider, status, tokens, amount_cents, idempotency_key)
    VALUES (?, ?, ?, 'mock', 'completed', ?, ?, ?)`)
    .bind(paymentId, viewer.id, packageId, pack.tokens, pack.priceCents, `payment:${viewer.id}:${idempotencyKey}`)
    .run();
  return getBootstrap(viewer);
}

export async function unlockTheme(viewer: Viewer, themeId: string, idempotencyKey: string) {
  const db = getD1();
  const theme = await db.prepare("SELECT name, token_price AS price, default_settings AS defaults FROM themes WHERE id = ? AND status = 'published'")
    .bind(themeId).first<{ name: string; price: number; defaults: string }>();
  if (!theme) throw new Error("THEME_NOT_FOUND");

  const existing = await db.prepare("SELECT project_id AS projectId FROM theme_unlocks WHERE idempotency_key = ?")
    .bind(`unlock:${viewer.id}:${idempotencyKey}`).first<{ projectId: string }>();
  if (existing) return { data: await getBootstrap(viewer), projectId: existing.projectId };

  const unlockId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await db.prepare(`INSERT INTO theme_unlocks(id, user_id, theme_id, project_id, project_name, customization, cost, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      unlockId,
      viewer.id,
      themeId,
      projectId,
      `${theme.name}: novo projeto`,
      JSON.stringify(normalizeCustomization(parseJson(theme.defaults, DEFAULT_CUSTOMIZATION))),
      theme.price,
      `unlock:${viewer.id}:${idempotencyKey}`,
    ).run();

  return { data: await getBootstrap(viewer), projectId };
}

export async function saveProject(viewer: Viewer, projectId: string, customization: Record<string, unknown>) {
  const result = await getD1().prepare(`UPDATE projects SET customization = ?, status = CASE WHEN status = 'draft' THEN 'editing' ELSE status END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
    .bind(JSON.stringify(normalizeCustomization(customization)), projectId, viewer.id).run();
  if (!result.meta.changes) throw new Error("PROJECT_NOT_FOUND");
  return { savedAt: new Date().toISOString() };
}

export async function createVersion(viewer: Viewer, projectId: string, label: string) {
  const project = await getD1().prepare("SELECT customization FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, viewer.id).first<{ customization: string }>();
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const id = crypto.randomUUID();
  await getD1().prepare("INSERT INTO project_versions(id, project_id, label, snapshot) VALUES (?, ?, ?, ?)")
    .bind(id, projectId, label, project.customization).run();
  return { id };
}

export async function restoreVersion(viewer: Viewer, projectId: string, versionId: string) {
  const version = await getD1().prepare(`SELECT v.snapshot FROM project_versions v
    JOIN projects p ON p.id = v.project_id WHERE v.id = ? AND p.id = ? AND p.user_id = ?`)
    .bind(versionId, projectId, viewer.id).first<{ snapshot: string }>();
  if (!version) throw new Error("VERSION_NOT_FOUND");
  await getD1().prepare("UPDATE projects SET customization = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(version.snapshot, projectId, viewer.id).run();
  return getBootstrap(viewer);
}

export async function duplicateProject(viewer: Viewer, projectId: string) {
  const source = await getD1().prepare("SELECT theme_id AS themeId, name, customization FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, viewer.id).first<{ themeId: string; name: string; customization: string }>();
  if (!source) throw new Error("PROJECT_NOT_FOUND");
  const id = crypto.randomUUID();
  await getD1().prepare("INSERT INTO projects(id, user_id, theme_id, name, status, customization) VALUES (?, ?, ?, ?, 'draft', ?)")
    .bind(id, viewer.id, source.themeId, `${source.name} (cópia)`, source.customization).run();
  return getBootstrap(viewer);
}

export async function deleteProject(viewer: Viewer, projectId: string) {
  const db = getD1();
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, viewer.id).first<{ id: string }>();
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  await db.batch([
    db.prepare("DELETE FROM project_versions WHERE project_id = ?").bind(projectId),
    db.prepare("DELETE FROM theme_unlocks WHERE project_id = ? AND user_id = ?").bind(projectId, viewer.id),
    db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(projectId, viewer.id),
  ]);
  return getBootstrap(viewer);
}

/**
 * As imagens que SÓ aqueles projetos usavam.
 *
 * `media_files` não guarda de quem é o arquivo: ele é enviado antes de o
 * projeto existir, então não há coluna que ligue os dois. O que existe é o
 * texto: a customização do projeto guarda os endereços `/api/media/<id>` que o
 * tema aponta. Lendo os dois lados dá para saber o que sai junto e o que fica.
 *
 * O "só" é a parte que importa. Um arquivo citado por OUTRO projeto que
 * sobrevive não pode ser apagado — a loja daquele cliente ficaria com a imagem
 * quebrada, e imagem quebrada em loja entregue é pior que arquivo a mais.
 *
 * Sem isso, cada loja gerada deixava as imagens dela no disco para sempre.
 * Medido neste computador: 281 arquivos, 957 MB, com zero projetos vivos.
 */
const ENDERECO_DE_MIDIA = /\/api\/media\/([0-9a-fA-F-]{16,64})/g;

async function apagarMidiaDosProjetos(projectIds: string[]) {
  if (!projectIds.length) return;
  const db = getD1();
  const marcadores = projectIds.map(() => "?").join(", ");
  const idsDe = (linhas: Array<{ customization: string }>) => {
    const ids = new Set<string>();
    for (const linha of linhas) {
      for (const achado of String(linha.customization ?? "").matchAll(ENDERECO_DE_MIDIA)) ids.add(achado[1]);
    }
    return ids;
  };

  const saindo = await db.prepare(`SELECT customization FROM projects WHERE id IN (${marcadores})`)
    .bind(...projectIds).all<{ customization: string }>();
  const candidatos = idsDe(saindo.results);
  if (!candidatos.size) return;

  /* o que QUALQUER projeto sobrevivente ainda cita fica de pé */
  const ficando = await db.prepare(`SELECT customization FROM projects WHERE id NOT IN (${marcadores})`)
    .bind(...projectIds).all<{ customization: string }>();
  const usados = idsDe(ficando.results);
  const apagar = [...candidatos].filter((id) => !usados.has(id));
  if (!apagar.length) return;

  const alvos = await db.prepare(`SELECT id, storage_key AS storageKey FROM media_files WHERE id IN (${apagar.map(() => "?").join(", ")})`)
    .bind(...apagar).all<{ id: string; storageKey: string }>();
  for (const alvo of alvos.results) {
    if (env.MEDIA && alvo.storageKey) await env.MEDIA.delete(alvo.storageKey);
  }
  if (alvos.results.length) {
    await db.prepare(`DELETE FROM media_files WHERE id IN (${alvos.results.map(() => "?").join(", ")})`)
      .bind(...alvos.results.map((alvo) => alvo.id)).run();
  }
}

/**
 * OS ASSETS INSTALADOS DO TEMA saem com ele.
 *
 * A importação copia cada imagem, CSS, JS e fonte do ZIP para
 * `theme-assets/<dono>/<fingerprint>/…` no R2 — é de lá que a prévia serve o
 * arquivo. A remoção do tema apagava o ZIP de origem e esquecia essa cópia,
 * que é a MAIOR das duas: ela fica descompactada, arquivo por arquivo.
 *
 * Medido neste computador depois de o usuário apagar tudo pela tela: nenhum
 * tema no banco, nenhum ZIP de origem no R2 — e 2.365 objetos de `theme-assets`
 * órfãos, 342 MB, de temas que não existem mais. Ninguém tinha como alcançá-los:
 * a chave depende de um fingerprint que saiu do banco junto com o tema.
 */
async function apagarAssetsDoTema(fingerprint: string, ownerId: string) {
  if (!env.MEDIA || !/^[0-9a-f]{16}$/.test(fingerprint) || !ownerId) return 0;
  const prefix = `theme-assets/${ownerId}/${fingerprint}/`;
  let cursor: string | undefined;
  let apagados = 0;
  /* em lote e com cursor: um tema real passa de mil arquivos, e listar de uma
     vez só devolve a primeira página em silêncio */
  do {
    const lote = await env.MEDIA.list({ prefix, cursor, limit: 500 });
    const chaves = (lote.objects as Array<{ key: string }>).map((objeto) => objeto.key);
    if (chaves.length) {
      await env.MEDIA.delete(chaves);
      apagados += chaves.length;
    }
    cursor = lote.truncated ? lote.cursor : undefined;
  } while (cursor);
  return apagados;
}

export async function deleteTheme(viewer: Viewer, themeId: string) {
  const db = getD1();
  /**
   * Existe é o bastante para ser apagado — publicado ou não.
   *
   * A guarda pedia `status = 'published'`, e isso trancava a porta justamente
   * para quem mais precisava dela: os temas ARQUIVADOS pelo botão antigo, que
   * arquivava em vez de apagar. Eles são invisíveis (o `bootstrap` só devolve
   * publicados) E indeletáveis — a rota responde THEME_NOT_FOUND. Um estado do
   * qual não se sai por caminho nenhum.
   */
  const theme = await db.prepare("SELECT id, default_settings AS defaults FROM themes WHERE id = ?")
    .bind(themeId).first<{ id: string; defaults: string }>();
  if (!theme) throw new Error("THEME_NOT_FOUND");

  /**
   * Nada aqui filtra por dono, e é de propósito.
   *
   * O tema inteiro está saindo. Uma linha que aponte para ele e sobreviva não
   * fica "de outra pessoa": fica QUEBRADA, apontando para um id que não existe
   * — e, como `projects` e `theme_unlocks` referenciam `themes` sem cascata, o
   * banco recusaria a remoção e a limpeza terminaria pela metade, com o ZIP de
   * origem já apagado do R2 lá em cima. Meio apagado é o pior estado dos três.
   */
  const projects = await db.prepare("SELECT id FROM projects WHERE theme_id = ?")
    .bind(themeId).all<{ id: string }>();
  const source = await db.prepare("SELECT source_key AS sourceKey, user_id AS userId FROM theme_imports WHERE theme_id = ?")
    .bind(themeId).first<{ sourceKey: string; userId: string }>();
  if (source?.sourceKey && env.MEDIA) await env.MEDIA.delete(source.sourceKey);
  /* e os ASSETS instalados do tema, que ninguém removia */
  await apagarAssetsDoTema(parseJson<{ shopify?: { sourceFingerprint?: string } }>(theme.defaults, {}).shopify?.sourceFingerprint ?? "", source?.userId || viewer.id);
  await apagarMidiaDosProjetos(projects.results.map((projeto) => projeto.id));
  for (const project of projects.results) {
    await db.batch([
      db.prepare("DELETE FROM project_versions WHERE project_id = ?").bind(project.id),
      db.prepare("DELETE FROM theme_unlocks WHERE project_id = ?").bind(project.id),
      db.prepare("DELETE FROM projects WHERE id = ?").bind(project.id),
    ]);
  }

  /**
   * APAGAR é apagar. Antes isto ARQUIVAVA.
   *
   * O tema sumia da tela e continuava no banco para sempre. Medido neste
   * computador: sete temas "apagados", todos ainda ali. E o pior não era o
   * espaço, era o zumbi: o ZIP de origem em R2 JÁ ERA removido logo acima, de
   * modo que a linha sobrevivente apontava para um arquivo que não existe mais.
   * Tema arquivado sem origem não renderiza, não exporta e não volta — e se
   * algum projeto ainda apontasse para ele, a prévia ficava girando sem dizer
   * por quê.
   *
   * A ordem importa: `projects` e `theme_unlocks` referenciam `themes` SEM
   * cascata, então eles saem primeiro (no laço acima) ou o banco recusa a
   * remoção. `theme_imports` e `favorites` têm cascata e sairiam sozinhos;
   * ficam explícitos porque depender de cascata que alguém pode trocar num
   * `CREATE TABLE` é confiar em regra que não está escrita aqui.
   */
  await db.batch([
    db.prepare("DELETE FROM favorites WHERE theme_id = ?").bind(themeId),
    db.prepare("DELETE FROM theme_imports WHERE theme_id = ?").bind(themeId),
    db.prepare("DELETE FROM theme_unlocks WHERE theme_id = ?").bind(themeId),
    db.prepare("DELETE FROM themes WHERE id = ?").bind(themeId),
  ]);
  return getBootstrap(viewer);
}

export async function importShopifyTheme(viewer: Viewer, imported: ShopifyThemeImport) {
  await ensureDatabase();
  const db = getD1();
  /**
   * UMA LOJA ENTREGUE NÃO É O TEMA DE ORIGEM.
   *
   * O id saía do `theme_info` do ZIP, e uma loja feita sobre o Dawn continua se
   * chamando "Dawn": reimportá-la caía em `import-dawn`, o MESMO id do tema
   * base do estúdio, e o `ON CONFLICT DO UPDATE` abaixo a gravava por cima
   * dele. A loja do cliente virava o tema de todo mundo, e duas lojas feitas
   * sobre o mesmo tema disputavam a mesma linha — a última a entrar apagava a
   * anterior, sem aviso.
   *
   * Quem entrega declara o nome próprio no marcador (`orbisLoja`), e é ele que
   * manda. Tema sem marcador segue pelo nome, como sempre.
   */
  const { id, slug, nome } = identidadeDoTemaImportado(imported);
  const isShrine = id === "shrine-pro";
  const existing = await db.prepare("SELECT default_settings AS defaults FROM themes WHERE id = ?")
    .bind(id).first<{ defaults: string }>();
  const currentDefaults = normalizeCustomization(parseJson(existing?.defaults, DEFAULT_CUSTOMIZATION));
  /**
   * O modelo nativo vem da LOJA quando ela o traz.
   *
   * O tema Shopify não é a loja inteira: o estúdio tem um modelo próprio
   * (cabeçalho, dobra, rodapé, cores), e ele desenha as telas que não passam
   * pelo Liquid. Ele não viajava no pacote, então a importação o herdava do que
   * já estivesse naquele id — na prática, o conteúdo de demonstração. A loja do
   * cliente abria com a marca certa no tema e "CACTUS" em tudo o mais.
   */
  const defaults = normalizeCustomization({ ...currentDefaults, ...(imported.orbisCustomizacao ?? {}), shopify: imported });
  const displayName = nome;
  const description = `${imported.compatibility.architecture} extraído por completo: ${imported.summary.fileCount} arquivos, ${imported.summary.templateCount} páginas, ${imported.summary.sectionDefinitionCount} tipos de seção e ${imported.summary.editableSettingCount} configurações editáveis.`;
  const languages = Array.from(new Set(imported.sourceFiles.filter((file) => file.kind === "locale" && !file.path.endsWith(".schema.json")).map((file) => file.path.split("/").at(-1)?.replace(/\.json$/i, "")).filter((value): value is string => Boolean(value)))).slice(0, 40);

  await db.prepare(`INSERT INTO themes(
    id, category_id, name, slug, description, status, token_price, version, author,
    tags, languages, section_count, featured, badge, default_settings, allowed_settings
  ) VALUES (?, 'ecommerce', ?, ?, ?, 'published', 0, ?, ?, ?, ?, ?, ?, 'Extraído do ZIP', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, slug = excluded.slug, description = excluded.description,
    status = 'published', token_price = 0, version = excluded.version, author = excluded.author,
    tags = excluded.tags, languages = excluded.languages, section_count = excluded.section_count,
    badge = excluded.badge, default_settings = excluded.default_settings,
    allowed_settings = excluded.allowed_settings, updated_at = CURRENT_TIMESTAMP`).bind(
    id,
    displayName,
    slug,
    description,
    imported.version.slice(0, 40),
    imported.author.slice(0, 80),
    JSON.stringify(["shopify", "extraído", imported.format.replace("shopify-", "")]),
    JSON.stringify(languages.length ? languages : ["pt-BR"]),
    imported.summary.sectionDefinitionCount,
    isShrine ? 1 : 0,
    JSON.stringify(defaults),
    JSON.stringify(["shopify", "global", "pages", "sections", "blocks"]),
  ).run();

  const projects = await db.prepare("SELECT id, customization FROM projects WHERE theme_id = ? AND user_id = ?")
    .bind(id, viewer.id).all<{ id: string; customization: string }>();
  for (const project of projects.results) {
    const current = normalizeCustomization(parseJson(project.customization, DEFAULT_CUSTOMIZATION));
    const customization = normalizeCustomization({ ...current, shopify: imported });
    await db.prepare("UPDATE projects SET customization = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(JSON.stringify(customization), project.id, viewer.id).run();
  }

  return { data: await getBootstrap(viewer), themeId: id, summary: imported.summary, compatibility: imported.compatibility };
}

export async function registerThemeSource(viewer: Viewer, themeId: string, imported: ShopifyThemeImport, sourceKey: string, sourceSize: number) {
  await ensureDatabase();
  const db = getD1();
  const previous = await db.prepare("SELECT source_key AS sourceKey FROM theme_imports WHERE theme_id = ? AND user_id = ?")
    .bind(themeId, viewer.id).first<{ sourceKey: string }>();
  await db.prepare(`INSERT INTO theme_imports(theme_id, user_id, source_key, source_filename, source_size, source_fingerprint, architecture)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(theme_id) DO UPDATE SET user_id = excluded.user_id, source_key = excluded.source_key,
      source_filename = excluded.source_filename, source_size = excluded.source_size,
      source_fingerprint = excluded.source_fingerprint, architecture = excluded.architecture,
      imported_at = CURRENT_TIMESTAMP`).bind(
    themeId,
    viewer.id,
    sourceKey,
    imported.sourceFile,
    sourceSize,
    imported.sourceFingerprint,
    imported.compatibility.architecture,
  ).run();
  if (previous?.sourceKey && previous.sourceKey !== sourceKey && env.MEDIA) await env.MEDIA.delete(previous.sourceKey);
}

export async function toggleFavorite(viewer: Viewer, themeId: string, favorite: boolean) {
  if (favorite) {
    await getD1().prepare("INSERT OR IGNORE INTO favorites(user_id, theme_id) VALUES (?, ?)").bind(viewer.id, themeId).run();
  } else {
    await getD1().prepare("DELETE FROM favorites WHERE user_id = ? AND theme_id = ?").bind(viewer.id, themeId).run();
  }
  return getBootstrap(viewer);
}

export async function publishProject(viewer: Viewer, projectId: string) {
  const slug = `projeto-${projectId.slice(0, 8)}`;
  const result = await getD1().prepare("UPDATE projects SET status = 'published', published_slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(slug, projectId, viewer.id).run();
  if (!result.meta.changes) throw new Error("PROJECT_NOT_FOUND");
  return getBootstrap(viewer);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

