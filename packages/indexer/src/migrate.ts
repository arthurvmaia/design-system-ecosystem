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

const main = () => {
  const db = getDb();
  const migrationsFolder = join(__dirname, '..', 'migrations');

  console.log(`Aplicando migrations de ${migrationsFolder}`);
  migrate(db, { migrationsFolder });

  // FTS5 virtual table não é gerada pelo drizzle-kit, aplicamos manualmente.
  getSqlite().exec(FTS_INIT_SQL);

  console.log('Migrations aplicadas.');
};

main();
