// Prisma CLI config (migrate, diff, generate) — 05-data-model.md §2.1, ADR 016. The runtime never reads this file:
// the api connects as applyra_app through DATABASE_URL + @prisma/adapter-pg (src/platform/prisma).
// The CLI runs as applyra_maintenance (schema owner, 12-infra-ops.md §6): MAINTENANCE_DATABASE_URL.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Prisma 7 loads no env file. The repo-root env file is a local-dev convenience only: it is read when
// MAINTENANCE_DATABASE_URL is not set at all, and process.loadEnvFile never overrides an already-set variable,
// so an explicit environment (Testcontainers, CI, the migrate job) always wins. Same rule in scripts/db-migrate.mjs.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.MAINTENANCE_DATABASE_URL === undefined && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // process.env, not prisma/config env(): env() throws on a missing variable even for `prisma generate`,
    // which must work without any database (CI typecheck, fresh clones).
    url: process.env.MAINTENANCE_DATABASE_URL ?? '',
    // Only `migrate dev` / `migrate diff --from-migrations` need it (a CREATEDB/superuser role: maintenance has
    // no CREATEDB). Prisma resets a configured shadow DB but does not create it — `pnpm db:migration` does.
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
