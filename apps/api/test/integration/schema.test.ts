// Migrations in the template (M0-08): raw SQL from 05 §7 works, "_prisma_migrations" is read-only for the app role,
// and the set of tables the app role may UPDATE/DELETE is an explicit, reviewed allowlist.
import { describe, expect, it } from 'vitest';
import { appPrivilegesOnMigrationsAt, sqlState, withPg } from './support/pg.js';
import { applyMigrations, repoMigrations } from './support/postgres.js';
import { testInfra } from './support/test-infra.js';

const asApp = <T>(run: Parameters<typeof withPg<T>>[1]) => withPg(testInfra().databaseUrl, run);
const asMaintenance = <T>(run: Parameters<typeof withPg<T>>[1]) =>
  withPg(testInfra().maintenanceUrl, run);
const appPrivilegesOnMigrations = () => appPrivilegesOnMigrationsAt(testInfra().maintenanceUrl);

/**
 * Tables where applyra_app may UPDATE or DELETE. A new table fails the test until it is listed here — review its
 * privileges first (e.g. AuditLog is INSERT/SELECT only, 05 §7.5).
 */
const APP_MUTABLE_TABLES = [
  'Account',
  'Application',
  'ApplicationEvent', // append-mostly, not revoked: undo (M1-08) deletes events (M1-01 Decision 4)
  'IdempotencyRecord',
  'ImportSession',
  'Job',
  'Reminder',
  'Session',
  'User',
  'UserSettings',
  'Verification',
];

describe('migrations', () => {
  it('every migration folder is recorded as finished in "_prisma_migrations"', async () => {
    const { rows } = await asMaintenance((db) =>
      db.query<{ migration_name: string }>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
      ),
    );
    expect(rows.map((r) => r.migration_name)).toEqual(repoMigrations());
    expect(repoMigrations()[0]).toMatch(/^\d{14}_init$/);
  });

  it('provides f_unaccent (05 §7.2)', async () => {
    const { rows } = await asApp((db) =>
      db.query<{ v: string }>("SELECT f_unaccent('Café Zürich') AS v"),
    );
    expect(rows[0]?.v).toBe('Cafe Zurich');
  });

  it('enforces user_settings_ranges_chk (05 §7.4) with SQLSTATE 23514', async () => {
    await asApp(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO "User" (name, email, "updatedAt") VALUES ('Check', 'check@example.com', now()) RETURNING id`,
      );
      const userId = rows[0]?.id;
      const insertSettings = (days: number) =>
        db.query(
          `INSERT INTO "UserSettings" ("userId", "staleFollowUpDays", "updatedAt") VALUES ($1, $2, now())
           ON CONFLICT ("userId") DO UPDATE SET "staleFollowUpDays" = EXCLUDED."staleFollowUpDays"`,
          [userId, days],
        );

      expect(await sqlState(insertSettings(0))).toBe('23514');
      expect(await sqlState(insertSettings(91))).toBe('23514');
      await expect(insertSettings(90)).resolves.toMatchObject({ rowCount: 1 });
    });
  });
});

describe('privileges of applyra_app', () => {
  it('holds no privilege at all on "_prisma_migrations"', async () => {
    expect(await appPrivilegesOnMigrations()).toEqual([]);
  });

  it.each([
    ['SELECT', 'SELECT 1 FROM "_prisma_migrations"'],
    [
      'INSERT',
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ('x', 'x', 'x')`,
    ],
    ['UPDATE', `UPDATE "_prisma_migrations" SET logs = 'x'`],
    ['DELETE', `DELETE FROM "_prisma_migrations"`],
    ['TRUNCATE', `TRUNCATE "_prisma_migrations"`],
  ])('cannot %s "_prisma_migrations" (42501)', async (_privilege, statement) => {
    expect(await asApp((db) => sqlState(db.query(statement)))).toBe('42501');
  });

  it('may UPDATE/DELETE exactly the allowlisted public tables', async () => {
    const { rows } = await asApp((db) =>
      db.query<{ table: string }>(
        `SELECT tablename AS table FROM pg_tables
         WHERE schemaname = 'public'
           AND (has_table_privilege('applyra_app', format('%I.%I', schemaname, tablename), 'UPDATE')
             OR has_table_privilege('applyra_app', format('%I.%I', schemaname, tablename), 'DELETE'))
         ORDER BY tablename COLLATE "C"`,
      ),
    );
    expect(rows.map((r) => r.table)).toEqual(APP_MUTABLE_TABLES);
  });

  it('has no DDL on the schema', async () => {
    expect(await asApp((db) => sqlState(db.query('CREATE TABLE app_ddl_probe (id int)')))).toBe(
      '42501',
    );
  });
});

describe('db-migrate.mjs', () => {
  it('is idempotent: a second run applies nothing and keeps "_prisma_migrations" locked', async () => {
    await applyMigrations(testInfra().maintenanceUrl);
    await applyMigrations(testInfra().maintenanceUrl);

    const { rows } = await asMaintenance((db) =>
      db.query<{ n: string }>('SELECT count(*) AS n FROM "_prisma_migrations"'),
    );
    expect(rows[0]?.n).toBe(String(repoMigrations().length));
    expect(await appPrivilegesOnMigrations()).toEqual([]);
  });

  it('refuses to run as any role other than applyra_maintenance', async () => {
    await expect(applyMigrations(testInfra().databaseUrl)).rejects.toThrow(
      /must connect as applyra_maintenance, connected as applyra_app/,
    );
  });
});
