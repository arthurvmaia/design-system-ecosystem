import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { configPath, dbPath, topLevelDirs } from '@ds/shared/paths';
import Database from 'better-sqlite3';
import type { Database as SqliteDb } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

let cachedDb: DrizzleDb | null = null;
let cachedSqlite: SqliteDb | null = null;

/**
 * Garante que a árvore de diretórios do ecossistema existe e retorna
 * uma conexão Drizzle. Idempotente e cacheada por processo.
 */
export const getDb = (): DrizzleDb => {
  if (cachedDb !== null) return cachedDb;

  ensureDataTree();

  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');

  cachedSqlite = sqlite;
  cachedDb = drizzle(sqlite, { schema });
  return cachedDb;
};

/** Retorna a conexão bruta do better-sqlite3, para operações que o Drizzle não cobre (ex: exec de SQL raw). */
export const getSqlite = (): SqliteDb => {
  if (cachedSqlite === null) getDb();
  if (cachedSqlite === null) throw new Error('SQLite não inicializado');
  return cachedSqlite;
};

/**
 * Cria as pastas de topo e o arquivo de config default caso ainda não existam.
 */
export const ensureDataTree = (): void => {
  for (const dir of topLevelDirs()) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const cfg = configPath();
  if (!existsSync(cfg)) {
    writeFileSync(
      cfg,
      JSON.stringify(
        {
          version: 1,
          createdAt: Date.now(),
          preferences: {
            theme: 'dark-red',
            language: 'pt-BR',
          },
        },
        null,
        2,
      ),
    );
  }
};

export { schema };
