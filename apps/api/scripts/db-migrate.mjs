// `pnpm db:migrate` — the ONLY way migrations are applied (local, Testcontainers template, CI; M0-14 migrate job):
// `prisma migrate deploy` as applyra_maintenance, then take every privilege on "_prisma_migrations" away from
// applyra_app (default privileges grant DML; the runtime never reads the table) and verify that. Never run
// `prisma migrate dev` to apply: it would skip the REVOKE.
// Env: MAINTENANCE_DATABASE_URL (required). The repo-root env file is read only when it is not set at all — the
// same rule as prisma.config.ts — so an explicit environment always wins. Connection strings are never printed.
// Optional `--config <path>`: passed to `prisma migrate deploy --config` (another Prisma config / migrations dir).
// Used only by test/integration/db-migrate-failure.test.ts; the default (no argument) is apps/api/prisma.config.ts.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
/** Every table privilege PostgreSQL 18 knows; the app role must hold none of them on "_prisma_migrations". */
const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
];
const MIGRATOR_ROLE = 'applyra_maintenance';

/** `--config <path>` or `--config=<path>`; any other argument is an error (no silent typos). */
function parseArgs(argv) {
  const [first, second, ...rest] = argv;
  if (first === undefined) return [];
  if (first === '--config' && second && rest.length === 0) return ['--config', second];
  if (first.startsWith('--config=') && first.length > 9 && second === undefined) return [first];
  console.error('usage: db-migrate.mjs [--config <path>]');
  process.exit(1);
}
const deployArgs = parseArgs(process.argv.slice(2));

const message = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.MAINTENANCE_DATABASE_URL === undefined && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}
const maintenanceUrl = process.env.MAINTENANCE_DATABASE_URL;
if (!maintenanceUrl) {
  console.error('db-migrate: MAINTENANCE_DATABASE_URL is not set (role applyra_maintenance).');
  process.exit(1);
}

/** Runs `fn` with a connection as the migrator; pg errors carry no connection string. */
async function withMaintenance(fn) {
  const client = new pg.Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

// Objects must be owned by applyra_maintenance: default privileges are FOR ROLE applyra_maintenance, so DDL run as
// another role (e.g. the superuser) would leave the app role without its grants.
try {
  const { rows } = await withMaintenance((c) => c.query('SELECT current_user AS role'));
  if (rows[0]?.role !== MIGRATOR_ROLE) {
    console.error(
      `db-migrate: must connect as ${MIGRATOR_ROLE}, connected as ${String(rows[0]?.role)}.`,
    );
    process.exit(1);
  }
} catch (error) {
  console.error(`db-migrate: cannot connect as ${MIGRATOR_ROLE}: ${message(error)}`);
  process.exit(1);
}

// The local Prisma CLI through the current node binary: no shell, no PATH lookup of `prisma`.
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const deploy = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', ...deployArgs], {
  cwd: apiDir,
  stdio: 'inherit',
  env: process.env,
});
const deployFailed = deploy.status !== 0;

// Lock "_prisma_migrations" even after a failed deploy (a partial run may already have created it).
let lockFailed = false;
try {
  await withMaintenance(async (c) => {
    const { rows: exists } = await c.query(
      `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS present`,
    );
    if (!exists[0]?.present) {
      if (!deployFailed)
        throw new Error('"_prisma_migrations" is missing after a successful deploy');
      return;
    }
    await c.query('REVOKE ALL ON "_prisma_migrations" FROM applyra_app');
    const { rows } = await c.query(
      `SELECT p AS privilege FROM unnest($1::text[]) AS p
       WHERE has_table_privilege('applyra_app', '"_prisma_migrations"', p)`,
      [TABLE_PRIVILEGES],
    );
    if (rows.length > 0) {
      throw new Error(
        `applyra_app still has ${rows.map((r) => r.privilege).join(', ')} on "_prisma_migrations"`,
      );
    }
  });
} catch (error) {
  console.error(`db-migrate: locking "_prisma_migrations" failed: ${message(error)}`);
  lockFailed = true;
}

if (deployFailed) {
  console.error(
    `db-migrate: prisma migrate deploy failed (exit ${String(deploy.status ?? deploy.signal)}).`,
  );
  process.exit(1);
}
if (lockFailed) process.exit(1);
console.log(
  'db-migrate: migrations applied; applyra_app has no privileges on "_prisma_migrations".',
);
