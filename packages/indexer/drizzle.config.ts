import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const dbPath = process.env.DS_ECOSYSTEM_ROOT
  ? join(process.env.DS_ECOSYSTEM_ROOT, 'ecosystem.db')
  : join(homedir(), 'design-system-ecosystem', 'ecosystem.db');

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url: dbPath },
  verbose: true,
  strict: true,
});
