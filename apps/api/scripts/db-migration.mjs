// `pnpm db:migration <snake_case_name>` — create (not apply) a new migration from schema.prisma (/prisma-migration):
// 1. make sure the shadow database from SHADOW_DATABASE_URL exists (Prisma resets a configured shadow DB but never
//    creates it; applyra_maintenance has no CREATEDB, so the URL uses a CREATEDB/superuser role);
// 2. `prisma migrate dev --create-only --name <name>` → edit the untracked migration.sql (raw SQL, 05 §7);
// 3. apply with `pnpm db:migrate` (never `migrate dev`: it would skip the "_prisma_migrations" REVOKE).
// Env: MAINTENANCE_DATABASE_URL + SHADOW_DATABASE_URL; the repo-root env file is read only when
// MAINTENANCE_DATABASE_URL is not set (same rule as prisma.config.ts). Connection strings are never printed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error('usage: pnpm db:migration <snake_case_name>');
  process.exit(1);
}
if (process.env.MAINTENANCE_DATABASE_URL === undefined && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}
const shadowUrl = process.env.SHADOW_DATABASE_URL;
if (!process.env.MAINTENANCE_DATABASE_URL || !shadowUrl) {
  console.error('db-migration: MAINTENANCE_DATABASE_URL and SHADOW_DATABASE_URL must both be set.');
  process.exit(1);
}

const shadow = new URL(shadowUrl);
const shadowDb = decodeURIComponent(shadow.pathname.slice(1));
if (!/^[a-z_][a-z0-9_]*$/.test(shadowDb)) {
  console.error(
    'db-migration: SHADOW_DATABASE_URL must name a lower-case database (e.g. applyra_shadow).',
  );
  process.exit(1);
}
// Connect to the server's `postgres` database with the same (CREATEDB) credentials to create the shadow DB.
shadow.pathname = '/postgres';
const admin = new pg.Client({ connectionString: shadow.toString() });
try {
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    shadowDb,
  ]);
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(shadowDb)}`);
    console.log(`db-migration: created shadow database ${shadowDb}.`);
  }
} catch (error) {
  console.error(
    `db-migration: cannot prepare the shadow database: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
} finally {
  await admin.end().catch(() => undefined);
}

const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const result = spawnSync(
  process.execPath,
  [prismaCli, 'migrate', 'dev', '--create-only', '--name', name],
  { cwd: apiDir, stdio: 'inherit', env: process.env },
);
process.exitCode = result.status ?? 1;
