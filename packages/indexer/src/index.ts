export { ensureDataTree, getDb, getSqlite, schema } from './db.js';
/**
 * Os operadores de consulta saem por aqui, e não do `drizzle-orm` direto.
 *
 * Quatro scripts na raiz importavam `eq` de `drizzle-orm` — um pacote que a
 * raiz nunca declarou. Funcionava por acidente: rodando `tsx script.ts`, a
 * busca por node_modules parte de dentro do `.pnpm` e acha o pacote de outra
 * pessoa. Rodando `node --import tsx --test`, que é como `pnpm test` roda, a
 * busca parte da raiz e não acha nada: a suíte inteira caía num
 * `Cannot find module 'drizzle-orm'` que não tinha a ver com o teste.
 *
 * Quem declara o ORM é este pacote. Passar por ele torna a dependência real.
 */
export { and, desc, eq, inArray, isNull } from 'drizzle-orm';
export { runMigrations } from './migrate.js';
export type { DrizzleDb } from './db.js';
export * as tables from './schema.js';
