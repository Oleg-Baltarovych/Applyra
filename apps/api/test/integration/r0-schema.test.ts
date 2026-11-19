// R0 domain schema (M1-01, 05 §4.2/§5/§6/§7.4): what the database itself enforces on Job, Application,
// ApplicationEvent, Reminder, ImportSession and IdempotencyRecord — partial uniques, CHECKs, cascades, event tenancy,
// id/timestamp types and app-role privileges. Raw `pg` as applyra_app (constraints, not repositories, are under test).
import type { Client, DatabaseError } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { AppPrisma } from '../../src/platform/prisma/index.js';
import {
  applicationEventFactory,
  applicationFactory,
  idempotencyRecordFactory,
  importSessionFactory,
  jobFactory,
  reminderFactory,
  userFactory,
} from '../factories/index.js';
import { withPg } from './support/pg.js';
import { testPrisma } from './support/prisma.js';
import { testInfra } from './support/test-infra.js';

const R0_TABLES = [
  'Application',
  'ApplicationEvent',
  'IdempotencyRecord',
  'ImportSession',
  'Job',
  'Reminder',
];

type Row = Record<string, unknown>;

const asApp = <T>(run: (db: Client) => Promise<T>) => withPg(testInfra().databaseUrl, run);

let userSeq = 0;
async function newUser(db: Client): Promise<string> {
  userSeq += 1;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO "User" (name, email, "updatedAt") VALUES ($1, $2, now()) RETURNING id`,
    [`R0 ${String(userSeq)}`, `r0-${String(userSeq)}@example.test`],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('user insert returned no id');
  return id;
}

/** INSERT … RETURNING * with the given columns (quoted identifiers; values as parameters). */
async function insert(db: Client, table: string, values: Row): Promise<Row> {
  const columns = Object.keys(values);
  const { rows } = await db.query<Row>(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${columns.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING *`,
    Object.values(values),
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`${table} insert returned no row`);
  return row;
}

const idOf = (row: Row): string => {
  if (typeof row.id !== 'string') throw new Error('row without id');
  return row.id;
};

const insertJob = (db: Client, ownerId: string | null, extra: Row = {}) =>
  insert(db, 'Job', {
    visibility: 'PRIVATE',
    ownerId,
    companyNameRaw: 'Acme',
    title: 'Backend Engineer',
    normalizedTitle: 'backend engineer',
    descriptionText: 'Pasted description',
    updatedAt: new Date(),
    ...extra,
  });

const insertApplication = (db: Client, userId: string, extra: Row = {}) =>
  insert(db, 'Application', {
    userId,
    companyName: 'Acme',
    roleTitle: 'Backend Engineer',
    updatedAt: new Date(),
    ...extra,
  });

const insertEvent = (db: Client, applicationId: string, userId: string, extra: Row = {}) =>
  insert(db, 'ApplicationEvent', {
    applicationId,
    userId,
    type: 'CREATED',
    occurredAt: new Date(),
    ...extra,
  });

const insertReminder = (db: Client, userId: string, extra: Row = {}) =>
  insert(db, 'Reminder', {
    userId,
    source: 'MANUAL',
    kind: 'CUSTOM',
    title: 'Ping',
    dueAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });

const insertImportSession = (db: Client, userId: string, extra: Row = {}) =>
  insert(db, 'ImportSession', {
    userId,
    fileName: 'apps.csv',
    fileSha256: 'a'.repeat(64),
    rowCount: 10,
    mapping: JSON.stringify({ columns: {} }),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...extra,
  });

const insertIdempotency = (db: Client, userId: string, extra: Row = {}) =>
  insert(db, 'IdempotencyRecord', {
    userId,
    key: 'key-0001-abcdef',
    route: 'POST /applications',
    requestHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...extra,
  });

/** SQLSTATE + constraint name of the error `promise` rejects with (fails the test if it resolves). */
async function violation(
  promise: Promise<unknown>,
): Promise<{ code: string | undefined; constraint: string | undefined }> {
  try {
    await promise;
  } catch (error) {
    const e = error as Partial<DatabaseError>; // pg rejects with DatabaseError (SQLSTATE in `code`)
    return { code: e.code, constraint: e.constraint };
  }
  throw new Error('expected the statement to fail');
}

const unique = (constraint: string) => ({ code: '23505', constraint });
const check = (constraint: string) => ({ code: '23514', constraint });

describe('partial and composite uniques (05 §6)', () => {
  it('application_user_job_active_uq: one active application per (user, job)', async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const job = idOf(await insertJob(db, a));
      const first = idOf(await insertApplication(db, a, { jobId: job }));

      expect(await violation(insertApplication(db, a, { jobId: job }))).toEqual(
        unique('application_user_job_active_uq'),
      );
      // Archived + a new active one is fine; jobId NULL never conflicts; another user is independent.
      await db.query(`UPDATE "Application" SET "archivedAt" = now() WHERE id = $1`, [first]);
      await expect(insertApplication(db, a, { jobId: job })).resolves.toBeDefined();
      await insertApplication(db, a, { jobId: null });
      await expect(insertApplication(db, a, { jobId: null })).resolves.toBeDefined();
      await expect(insertApplication(db, b, { jobId: job })).resolves.toBeDefined();
    });
  });

  it('job_owner_canonical_url_private_uq: canonicalUrl unique per owner, NULLs free', async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const url = 'https://jobs.example.test/1';
      await insertJob(db, a, { canonicalUrl: url });

      expect(await violation(insertJob(db, a, { canonicalUrl: url }))).toEqual(
        unique('job_owner_canonical_url_private_uq'),
      );
      await expect(insertJob(db, b, { canonicalUrl: url })).resolves.toBeDefined();
      await insertJob(db, a, { canonicalUrl: null });
      await expect(insertJob(db, a, { canonicalUrl: null })).resolves.toBeDefined();
    });
  });

  it('reminder_next_action_active_uq: one PENDING NEXT_ACTION per application', async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const app = idOf(await insertApplication(db, a));
      const nextAction = { applicationId: app, source: 'NEXT_ACTION', kind: 'FOLLOW_UP' };
      const first = idOf(await insertReminder(db, a, nextAction));

      expect(await violation(insertReminder(db, a, nextAction))).toEqual(
        unique('reminder_next_action_active_uq'),
      );
      await db.query(`UPDATE "Reminder" SET status = 'DONE' WHERE id = $1`, [first]);
      const second = idOf(await insertReminder(db, a, nextAction));
      await db.query(`UPDATE "Reminder" SET status = 'CANCELLED' WHERE id = $1`, [second]);
      await expect(insertReminder(db, a, nextAction)).resolves.toBeDefined();
      // MANUAL reminders on the same application are not limited.
      await insertReminder(db, a, { applicationId: app });
      await expect(insertReminder(db, a, { applicationId: app })).resolves.toBeDefined();
    });
  });

  it('application_user_import_key_uq: importKey unique per user', async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      await insertApplication(db, a, { importKey: 'k1' });

      expect(await violation(insertApplication(db, a, { importKey: 'k1' }))).toEqual(
        unique('application_user_import_key_uq'),
      );
      await expect(insertApplication(db, b, { importKey: 'k1' })).resolves.toBeDefined();
    });
  });

  it('IdempotencyRecord (userId, key) is unique per user', async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      await insertIdempotency(db, a);

      expect(await violation(insertIdempotency(db, a))).toEqual(
        unique('IdempotencyRecord_userId_key_key'),
      );
      await expect(insertIdempotency(db, b)).resolves.toBeDefined();
    });
  });
});

describe('CHECK constraints (05 §7.4 · R0)', () => {
  type Case = [constraint: string, run: (db: Client, userId: string) => Promise<unknown>];
  const cases: Case[] = [
    ['job_visibility_owner_chk', (db) => insertJob(db, null)],
    ['job_visibility_owner_chk', (db, u) => insertJob(db, u, { visibility: 'PUBLIC' })],
    ['job_salary_chk', (db, u) => insertJob(db, u, { salaryMin: 5000, salaryMax: 4000 })],
    ['job_salary_nonneg_chk', (db, u) => insertJob(db, u, { salaryMin: -1 })],
    ['job_salary_nonneg_chk', (db, u) => insertJob(db, u, { salaryMax: -1 })],
    ['job_currency_chk', (db, u) => insertJob(db, u, { salaryCurrency: 'usd' })],
    ['job_currency_chk', (db, u) => insertJob(db, u, { salaryCurrency: 'US' })],
    ['job_country_chk', (db, u) => insertJob(db, u, { countryCode: 'ua' })],
    [
      'application_salary_currency_chk',
      (db, u) => insertApplication(db, u, { salaryExpected: 3000 }),
    ],
    [
      'application_salary_nonneg_chk',
      (db, u) => insertApplication(db, u, { salaryOffered: -5, salaryCurrency: 'USD' }),
    ],
    ['application_currency_chk', (db, u) => insertApplication(db, u, { salaryCurrency: 'U$D' })],
    [
      'application_next_action_pair_chk',
      (db, u) => insertApplication(db, u, { nextActionText: 'Call back' }),
    ],
    [
      'application_next_action_pair_chk',
      (db, u) => insertApplication(db, u, { nextActionAt: new Date() }),
    ],
    [
      'application_event_status_chk',
      async (db, u) =>
        insertEvent(db, idOf(await insertApplication(db, u)), u, {
          type: 'STATUS_CHANGED',
          toStatus: 'APPLIED',
        }),
    ],
    [
      'application_event_status_chk',
      async (db, u) =>
        insertEvent(db, idOf(await insertApplication(db, u)), u, {
          type: 'STATUS_CHANGED',
          fromStatus: 'APPLIED',
          toStatus: 'APPLIED',
        }),
    ],
    ['reminder_source_link_chk', (db, u) => insertReminder(db, u, { source: 'NEXT_ACTION' })],
    ['reminder_snooze_count_chk', (db, u) => insertReminder(db, u, { snoozeCount: -1 })],
    ['reminder_channels_chk', (db, u) => insertReminder(db, u, { channels: null })],
    ['import_session_row_count_chk', (db, u) => insertImportSession(db, u, { rowCount: -1 })],
    ['import_session_row_count_chk', (db, u) => insertImportSession(db, u, { rowCount: 5001 })],
    ['idempotency_response_pair_chk', (db, u) => insertIdempotency(db, u, { statusCode: 201 })],
    [
      'idempotency_response_pair_chk',
      (db, u) => insertIdempotency(db, u, { responseJson: JSON.stringify({ ok: true }) }),
    ],
    [
      'idempotency_status_code_chk',
      (db, u) => insertIdempotency(db, u, { statusCode: 500, responseJson: '{}' }),
    ],
    [
      'idempotency_status_code_chk',
      (db, u) => insertIdempotency(db, u, { statusCode: 199, responseJson: '{}' }),
    ],
    ['idempotency_key_format_chk', (db, u) => insertIdempotency(db, u, { key: 'short' })],
    ['idempotency_key_format_chk', (db, u) => insertIdempotency(db, u, { key: 'has space 123' })],
    ['idempotency_key_format_chk', (db, u) => insertIdempotency(db, u, { key: 'k'.repeat(129) })],
  ];

  it.each(cases)('%s rejects a violating row (23514)', async (constraint, run) => {
    await asApp(async (db) => {
      expect(await violation(run(db, await newUser(db)))).toEqual(check(constraint));
    });
  });

  it('defaults Reminder.channels to {IN_APP} when omitted', async () => {
    await asApp(async (db) => {
      const row = await insertReminder(db, await newUser(db));
      const { rows } = await db.query<{ channels: string }>(
        'SELECT channels::text AS channels FROM "Reminder" WHERE id = $1',
        [idOf(row)],
      );
      expect(rows[0]?.channels).toBe('{IN_APP}');
    });
  });

  it('rejects a violating UPDATE too (application_next_action_pair_chk)', async () => {
    await asApp(async (db) => {
      const app = idOf(await insertApplication(db, await newUser(db)));
      expect(
        await violation(
          db.query(`UPDATE "Application" SET "nextActionAt" = now() WHERE id = $1`, [app]),
        ),
      ).toEqual(check('application_next_action_pair_chk'));
    });
  });

  it('accepts one fully populated valid row per table', async () => {
    await asApp(async (db) => {
      const u = await newUser(db);
      const job = await insertJob(db, u, {
        countryCode: 'UA',
        salaryMin: 0,
        salaryMax: 5000,
        salaryCurrency: 'USD',
        salaryPeriod: 'MONTH',
        canonicalUrl: 'https://jobs.example.test/valid',
      });
      const app = await insertApplication(db, u, {
        jobId: idOf(job),
        salaryExpected: 4000,
        salaryOffered: 4500,
        salaryCurrency: 'EUR',
        nextActionText: 'Follow up',
        nextActionAt: new Date(),
      });
      await insertEvent(db, idOf(app), u, {
        type: 'STATUS_CHANGED',
        fromStatus: 'WISHLIST',
        toStatus: 'APPLIED',
        payload: JSON.stringify({ note: 'x' }),
      });
      await insertReminder(db, u, {
        applicationId: idOf(app),
        source: 'NEXT_ACTION',
        kind: 'FOLLOW_UP',
        snoozeCount: 2,
      });
      await insertImportSession(db, u, { rowCount: 5000 });
      await insertIdempotency(db, u, {
        key: 'A'.repeat(128),
        statusCode: 201,
        responseJson: JSON.stringify({ id: idOf(app) }),
      });
      await expect(
        insertIdempotency(db, u, { key: 'abcd_EF-', statusCode: 499, responseJson: '{}' }),
      ).resolves.toBeDefined();
    });
  });
});

describe('tenancy (composite FKs, plan Decision 5 + review)', () => {
  it("rejects an event whose userId differs from its application's (23503)", async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const app = idOf(await insertApplication(db, a));

      expect(await violation(insertEvent(db, app, b))).toEqual({
        code: '23503',
        constraint: 'ApplicationEvent_applicationId_userId_fkey',
      });
      await expect(insertEvent(db, app, a)).resolves.toBeDefined();
    });
  });

  it("rejects a reminder on another user's application; NULL applicationId skips the FK", async () => {
    await asApp(async (db) => {
      const a = await newUser(db);
      const b = await newUser(db);
      const app = idOf(await insertApplication(db, a));

      expect(await violation(insertReminder(db, b, { applicationId: app }))).toEqual({
        code: '23503',
        constraint: 'Reminder_applicationId_userId_fkey',
      });
      await expect(insertReminder(db, a, { applicationId: app })).resolves.toBeDefined();
      await expect(insertReminder(db, b, { applicationId: null })).resolves.toBeDefined();
    });
  });
});

describe('cascades (05 §5)', () => {
  const prisma: AppPrisma = testPrisma();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A user with one row in each of the six tables (event + reminder on the application). */
  async function seedOwner() {
    const user = await userFactory.create(prisma);
    const job = await jobFactory.create(prisma, { ownerId: user.id });
    const app = await applicationFactory.create(prisma, { userId: user.id, jobId: job.id });
    await applicationEventFactory.create(prisma, { userId: user.id, applicationId: app.id });
    await reminderFactory.create(prisma, { userId: user.id, applicationId: app.id });
    await importSessionFactory.create(prisma, { userId: user.id });
    await idempotencyRecordFactory.create(prisma, { userId: user.id });
    return { user, job, app };
  }

  /** Row count per R0 table for one owner (Job by ownerId, the rest by userId). */
  const countsFor = (ownerId: string) =>
    asApp(async (db) => {
      const out: Record<string, number> = {};
      for (const table of R0_TABLES) {
        const column = table === 'Job' ? 'ownerId' : 'userId';
        const { rows } = await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = $1`,
          [ownerId],
        );
        out[table] = rows[0]?.n ?? -1;
      }
      return out;
    });

  it("deleting a User removes all of its R0 rows and leaves another user's untouched", async () => {
    const a = await seedOwner();
    const b = await seedOwner();

    await asApp((db) => db.query(`DELETE FROM "User" WHERE id = $1`, [a.user.id]));

    expect(await countsFor(a.user.id)).toEqual(Object.fromEntries(R0_TABLES.map((t) => [t, 0])));
    expect(await countsFor(b.user.id)).toEqual(Object.fromEntries(R0_TABLES.map((t) => [t, 1])));
  });

  it('deleting a Job sets Application.jobId to NULL and keeps the snapshot', async () => {
    const { job, app } = await seedOwner();

    await asApp((db) => db.query(`DELETE FROM "Job" WHERE id = $1`, [job.id]));

    const { rows } = await asApp((db) =>
      db.query<Row>(`SELECT "jobId", "companyName", "roleTitle" FROM "Application" WHERE id = $1`, [
        app.id,
      ]),
    );
    expect(rows).toEqual([{ jobId: null, companyName: app.companyName, roleTitle: app.roleTitle }]);
  });

  it('deleting an Application removes its events and reminders', async () => {
    const { user, app } = await seedOwner();

    await asApp((db) => db.query(`DELETE FROM "Application" WHERE id = $1`, [app.id]));

    const counts = await countsFor(user.id);
    expect(counts).toMatchObject({
      Application: 0,
      ApplicationEvent: 0,
      Reminder: 0,
      Job: 1,
      ImportSession: 1,
      IdempotencyRecord: 1,
    });
  });
});

describe('ids, timestamps and privileges', () => {
  it('defaults ids to UUID v7 on a raw insert without id', async () => {
    await asApp(async (db) => {
      const u = await newUser(db);
      const app = idOf(await insertApplication(db, u));
      const ids = [
        idOf(await insertJob(db, u)),
        app,
        idOf(await insertEvent(db, app, u)),
        idOf(await insertReminder(db, u)),
        idOf(await insertImportSession(db, u)),
        idOf(await insertIdempotency(db, u)),
      ];
      const { rows } = await db.query<{ v: number }>(
        'SELECT uuid_extract_version(id) AS v FROM unnest($1::uuid[]) AS id',
        [ids],
      );
      expect(rows.map((r) => r.v)).toEqual([7, 7, 7, 7, 7, 7]);
    });
  });

  it('stores every timestamp as timestamptz(3)', async () => {
    const { rows } = await asApp((db) =>
      db.query<{ table_name: string; column_name: string; data_type: string; p: number }>(
        `SELECT table_name, column_name, data_type, datetime_precision AS p
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1) AND data_type LIKE 'timestamp%'`,
        [R0_TABLES],
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.filter((r) => r.data_type !== 'timestamp with time zone' || r.p !== 3)).toEqual([]);
  });

  it.each(R0_TABLES)('applyra_app has DML but no TRUNCATE on "%s"', async (table) => {
    const { rows } = await asApp((db) =>
      db.query<{ p: string; granted: boolean }>(
        `SELECT p, has_table_privilege('applyra_app', format('%I.%I', 'public', $1::text), p) AS granted
         FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p`,
        [table],
      ),
    );
    expect(Object.fromEntries(rows.map((r) => [r.p, r.granted]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: true,
      TRUNCATE: false,
    });
  });
});
