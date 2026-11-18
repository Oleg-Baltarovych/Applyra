// Admin SQL for the integration test databases (M0-07a). Identifiers are only TEMPLATE_DB or workerDbName()
// output (regex-validated) and are still quoted with escapeIdentifier; no SQL is built from test input.
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, escapeIdentifier } from 'pg';
import type { TestPasswords } from '../../support/isolation.js';
import { childProcessEnv } from '../../support/runner-env.js';
import { TEMPLATE_DB } from './infra-context.js';

const ROLES_SCRIPT = fileURLToPath(
  new URL('../../../../../infra/postgres/init/10-roles.sql', import.meta.url),
);
const API_DIR = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATE_SCRIPT = fileURLToPath(new URL('../../../scripts/db-migrate.mjs', import.meta.url));
const execFileAsync = promisify(execFile);
/** Serialises clones across workers: CREATE DATABASE … TEMPLATE fails while another session uses the source. */
const CLONE_LOCK_KEY = 7007;

async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Builds the template the way production builds a database: roles script as superuser, then migrations as
 * applyra_maintenance; finally marks it as a template nobody can connect to.
 */
export async function prepareTemplate(
  container: StartedPostgreSqlContainer,
  passwords: TestPasswords,
  urls: { readonly admin: string; readonly templateMaintenance: string },
): Promise<void> {
  await withClient(urls.admin, (admin) =>
    admin.query(`CREATE DATABASE ${escapeIdentifier(TEMPLATE_DB)}`),
  );

  await container.copyFilesToContainer([{ source: ROLES_SCRIPT, target: '/tmp/10-roles.sql' }]);
  // The four role passwords go through the exec environment only (read by psql \getenv): never argv, never the
  // container config. (The superuser password IS in the container env: withPassword sets POSTGRES_PASSWORD.)
  const result = await container.exec(
    [
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      TEMPLATE_DB,
      '-f',
      '/tmp/10-roles.sql',
    ],
    {
      env: {
        APPLYRA_APP_PASSWORD: passwords.app,
        APPLYRA_MAINTENANCE_PASSWORD: passwords.maintenance,
        APPLYRA_BACKUP_PASSWORD: passwords.backup,
        APPLYRA_METRICS_PASSWORD: passwords.metrics,
      },
    },
  );
  if (result.exitCode !== 0) {
    // The script runs with VERBOSITY terse: messages only, no statement echo (so no password in the output).
    throw new Error(`10-roles.sql failed (exit ${String(result.exitCode)}):\n${result.output}`);
  }

  await applyMigrations(urls.templateMaintenance);

  await withClient(urls.admin, (admin) =>
    admin.query(
      `ALTER DATABASE ${escapeIdentifier(TEMPLATE_DB)} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`,
    ),
  );
}

/**
 * Applies the migrations to the template as applyra_maintenance through the same script as every other path
 * (scripts/db-migrate.mjs: `migrate deploy` + the "_prisma_migrations" REVOKE). Explicit minimal env: the
 * maintenance URL is set, so the script never reads an env file.
 */
/** Migration folder names in prisma/migrations, in apply order (what `_prisma_migrations` must list). */
export function repoMigrations(): string[] {
  return readdirSync(path.join(API_DIR, 'prisma/migrations'), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function applyMigrations(maintenanceUrl: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [MIGRATE_SCRIPT], {
      cwd: API_DIR,
      env: childProcessEnv({ MAINTENANCE_DATABASE_URL: maintenanceUrl }),
    });
  } catch (error) {
    // The script and Prisma never print connection strings; stdout/stderr carry the reason.
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    throw new Error(
      `db-migrate.mjs failed:
${stdout}
${stderr}`,
      { cause: error },
    );
  }
}

/** Re-creates `dbName` as a fresh copy of the template, owned by applyra_maintenance, with the database ACL. */
export async function cloneWorkerDb(adminUrl: string, dbName: string): Promise<void> {
  const db = escapeIdentifier(dbName);
  await withClient(adminUrl, async (admin) => {
    await admin.query('SELECT pg_advisory_lock($1)', [CLONE_LOCK_KEY]);
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
      await admin.query(
        `CREATE DATABASE ${db} TEMPLATE ${escapeIdentifier(TEMPLATE_DB)} OWNER applyra_maintenance`,
      );
      await grantDatabaseAccess(admin, dbName);
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [CLONE_LOCK_KEY]);
    }
  });
}

/**
 * Database-level ACL lives in pg_database and is NOT copied by CREATE DATABASE … TEMPLATE (schema ownership and
 * default privileges are in-database catalogs, those are). Mirrors the database part of 10-roles.sql; the smoke
 * test compares clone and template datacl, so drift between the two fails.
 */
export async function grantDatabaseAccess(admin: Client, dbName: string): Promise<void> {
  const db = escapeIdentifier(dbName);
  await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE ${db} TO applyra_app, backup, metrics`);
}
