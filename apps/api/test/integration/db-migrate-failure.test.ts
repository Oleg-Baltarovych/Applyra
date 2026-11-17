// scripts/db-migrate.mjs when `prisma migrate deploy` fails partway (M0-08, QA): the "_prisma_migrations" lockdown
// still runs and the script exits non-zero. Runs against its own fresh database (not the template clone) and a
// temporary copy of prisma/ whose second migration fails, selected with the script's `--config` hook.
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { escapeIdentifier } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { workerDbName } from '../support/isolation.js';
import { childProcessEnv, readPoolId } from '../support/runner-env.js';
import { postgresUrl } from './support/infra-context.js';
import { appPrivilegesOnMigrationsAt, withPg } from './support/pg.js';
import { grantDatabaseAccess } from './support/postgres.js';

const API_DIR = fileURLToPath(new URL('../../', import.meta.url));
const MIGRATE_SCRIPT = path.join(API_DIR, 'scripts/db-migrate.mjs');
const execFileAsync = promisify(execFile);

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

describe('db-migrate.mjs with a failing migration', () => {
  const infra = inject('infra');
  const dbName = `${workerDbName(readPoolId())}_fail`;
  const adminUrl = postgresUrl(infra, 'postgres', infra.superuserPassword, 'postgres');
  const maintenanceUrl = postgresUrl(
    infra,
    'applyra_maintenance',
    infra.maintenancePassword,
    dbName,
  );
  const workDir = mkdtempSync(path.join(tmpdir(), 'applyra-migrate-fail-'));
  let result: RunResult;

  beforeAll(async () => {
    // Fresh database prepared like 10-roles.sql does (schema owner + default privileges that grant the app DML),
    // so a missing REVOKE would be visible.
    await withPg(adminUrl, async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${escapeIdentifier(dbName)} OWNER applyra_maintenance`);
      await grantDatabaseAccess(admin, dbName);
    });
    await withPg(postgresUrl(infra, 'postgres', infra.superuserPassword, dbName), async (db) => {
      await db.query('ALTER SCHEMA public OWNER TO applyra_maintenance');
      await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await db.query('GRANT USAGE ON SCHEMA public TO applyra_app');
      await db.query(
        `ALTER DEFAULT PRIVILEGES FOR ROLE applyra_maintenance IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO applyra_app`,
      );
    });

    // prisma/ copy: the real init + a migration that creates a table, then fails.
    cpSync(path.join(API_DIR, 'prisma'), path.join(workDir, 'prisma'), { recursive: true });
    const failing = path.join(workDir, 'prisma/migrations/20991231000000_fails_partway');
    mkdirSync(failing, { recursive: true });
    writeFileSync(
      path.join(failing, 'migration.sql'),
      'CREATE TABLE "PartialProbe" (id int);\nSELECT 1/0;\n',
    );
    // Plain object (no prisma/config import: the temp dir cannot resolve packages). Paths are relative to it.
    writeFileSync(
      path.join(workDir, 'prisma.config.mjs'),
      `export default {
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MAINTENANCE_DATABASE_URL },
};
`,
    );

    // Positive control: default privileges in this database DO grant the app DML on new tables.
    await withPg(maintenanceUrl, async (db) => {
      await db.query('CREATE TABLE privilege_probe (id int)');
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT has_table_privilege('applyra_app', 'privilege_probe', 'INSERT') AS ok`,
      );
      expect(rows[0]?.ok).toBe(true);
      await db.query('DROP TABLE privilege_probe');
    });

    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [MIGRATE_SCRIPT, '--config', path.join(workDir, 'prisma.config.mjs')],
        { cwd: API_DIR, env: childProcessEnv({ MAINTENANCE_DATABASE_URL: maintenanceUrl }) },
      );
      result = { code: 0, stdout, stderr };
    } catch (error) {
      const {
        code,
        stdout = '',
        stderr = '',
      } = error as { code?: number; stdout?: string; stderr?: string };
      result = { code: typeof code === 'number' ? code : -1, stdout, stderr };
    }
  }, 60_000);

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    await withPg(adminUrl, (admin) =>
      admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`),
    );
  });

  it('exits non-zero and reports the deploy failure without printing connection strings', () => {
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('db-migrate: prisma migrate deploy failed');
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(infra.maintenancePassword);
    expect(output).not.toMatch(/postgres(ql)?:\/\/[^\s"]*@/);
  });

  it('applied init and recorded the failed migration in "_prisma_migrations"', async () => {
    const { rows } = await withPg(maintenanceUrl, (db) =>
      db.query<{ migration_name: string; finished: boolean }>(
        `SELECT migration_name, finished_at IS NOT NULL AS finished FROM "_prisma_migrations"
         ORDER BY migration_name`,
      ),
    );
    expect(rows).toEqual([
      { migration_name: expect.stringMatching(/^\d{14}_init$/), finished: true },
      { migration_name: '20991231000000_fails_partway', finished: false },
    ]);
  });

  it('still locked "_prisma_migrations": applyra_app holds none of the table privileges', async () => {
    expect(await appPrivilegesOnMigrationsAt(maintenanceUrl)).toEqual([]);
  });
});
