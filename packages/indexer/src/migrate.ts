import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, getSqlite } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** SQL raw para FTS5, aplicado após as migrations do drizzle-kit. */
const FTS_INIT_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS components_fts USING fts5(
    component_id UNINDEXED,
    name,
    notes,
    tags,
    tokenize = 'unicode61 remove_diacritics 2'
  );
`;

/**
 * Aplica as migrations pendentes e garante o FTS5.
 *
 * Idempotente: o drizzle registra o que já rodou em `__drizzle_migrations` e só
 * aplica o que vier depois do último marco. Por isso é seguro chamar a CADA boot
 * do servidor — e é o que impede o `no such table` num banco criado antes de uma
 * migration nova. O `pnpm db:migrate` (manual) só rodava no primeiro INICIAR,
 * quando o banco ainda não existia; um banco que já existia nunca recebia as
 * migrations seguintes, e a tabela nova (kits) nunca aparecia.
 */
export const runMigrations = (): void => {
  const db = getDb();
  const migrationsFolder = join(__dirname, '..', 'migrations');
  migrate(db, { migrationsFolder });
  // FTS5 virtual table não é gerada pelo drizzle-kit, aplicamos manualmente.
  getSqlite().exec(FTS_INIT_SQL);
};

// Execução direta pela linha de comando: `pnpm db:migrate` (tsx src/migrate.ts).
// Guardado para que importar este módulo (no boot do servidor) não dispare o CLI.
if (process.argv[1]?.includes('migrate')) {
  console.log('Aplicando migrations...');
  runMigrations();
  console.log('Migrations aplicadas.');
}
