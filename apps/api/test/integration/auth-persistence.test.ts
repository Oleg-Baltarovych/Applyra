// Better Auth on the Prisma adapter (M0-08, FR-AUTH-02): the production AppModule against the worker database as
// applyra_app, incl. the HTTP surface for the input: false fields (S-06: no privilege escalation via sign-up or
// update-user). Rows are asserted with plain SQL, independent of Better Auth's own reads.
import type { INestApplication } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Auth, AuthConfig } from '../../src/modules/auth/auth.config.js';
import { authOptionsFromConfig, SIGNUP_CLOSED } from '../../src/modules/auth/index.js';
import { ConfigService } from '../../src/platform/config/index.js';
import type { AppPrisma } from '../../src/platform/prisma/index.js';
import { GOOGLE_IDENTITIES } from '../support/google-oauth-mock.js';
import { createHttpApp } from '../support/http-app.js';
import { signInAs } from '../support/session.js';
import { testEnv } from '../support/test-env.js';
import { withPg } from './support/pg.js';
import { testInfra } from './support/test-infra.js';

const OWNER = 'owner@example.com';
const HTTP_USER = 'http@example.com';
const HTTP_REJECTED = 'rejected@example.com';
const WEB_ORIGIN = testEnv().WEB_ORIGIN;

interface UserRow {
  id: string;
  email: string;
  role: string;
  deletedAt: Date | null;
  demoExpiresAt: Date | null;
  version: number;
}

describe('Better Auth persistence (Prisma adapter)', () => {
  let app: INestApplication;
  let ownerId: string;
  const sql = <R extends object>(text: string, values: unknown[] = []) =>
    withPg(testInfra().databaseUrl, (db) => db.query<R>(text, values)).then((r) => r.rows);
  const userRow = async (email: string) =>
    (
      await sql<UserRow>(
        `SELECT id, email, role, "deletedAt", "demoExpiresAt", uuid_extract_version(id) AS version
         FROM "User" WHERE email = $1`,
        [email],
      )
    )[0];

  const authContext = () => app.get<AuthService<Auth>>(AuthService).instance.$context;
  const createUser = async (email: string) =>
    (await authContext()).internalAdapter.createUser(
      { email, name: 'Persisted', emailVerified: true },
      { method: 'admin' },
    );

  beforeAll(async () => {
    // The production HTTP composition (configureHttp: client IP header, Origin policy) — as in main.ts.
    app = await createHttpApp({
      env: testEnv({
        DATABASE_URL: testInfra().databaseUrl,
        REDIS_URL: testInfra().redisUrl,
        AUTH_SIGNUP_ALLOWLIST: `Owner@Example.com, ${HTTP_USER}, ${HTTP_REJECTED}, ${GOOGLE_IDENTITIES['code-A'].email}`,
      }),
      // The production options (Prisma adapter) + email/password, ONLY here: it drives the HTTP sign-up without
      // an OAuth mock. Never copy into real config (R0 = Google only).
      auth: {
        inject: authOptionsFromConfig.inject ?? [],
        useFactory: async (
          config: ConfigService,
          prisma: AppPrisma,
          redis: Redis,
        ): Promise<AuthConfig> => ({
          ...(await authOptionsFromConfig.useFactory(config, prisma, redis)),
          emailAndPassword: { enabled: true },
        }),
      },
    });
    // Shared fixture: the allowlisted owner (case differs from the allowlist entry on purpose).
    ownerId = (await createUser('owner@example.COM')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists an allowlisted sign-up as a "User" row with a UUID v7 id and role USER', async () => {
    expect(await userRow(OWNER)).toMatchObject({ id: ownerId, role: 'USER', version: 7 });
  });

  it('rejects a non-allowlisted email with 403 SIGNUP_CLOSED and writes nothing', async () => {
    await expect(createUser('stranger@example.com')).rejects.toMatchObject({
      statusCode: 403,
      body: { code: SIGNUP_CLOSED },
    });

    expect(await userRow('stranger@example.com')).toBeUndefined();
  });

  it('runs session and account flows on Postgres with UUID v7 ids', async () => {
    const ctx = await authContext();
    const account = await ctx.internalAdapter.linkAccount({
      userId: ownerId,
      providerId: 'google',
      accountId: 'google-sub-1',
    });
    const session = await ctx.internalAdapter.createSession(ownerId);
    expect(await ctx.internalAdapter.findSession(session.token)).toMatchObject({
      user: { id: ownerId },
    });
    expect(await ctx.internalAdapter.findAccounts(ownerId)).toHaveLength(1);

    const versions = await sql<{ table: string; version: number }>(
      `SELECT 'Session' AS table, uuid_extract_version(id) AS version FROM "Session" WHERE id = $1
       UNION ALL SELECT 'Account', uuid_extract_version(id) FROM "Account" WHERE id = $2`,
      [session.id, account.id],
    );
    expect(versions).toEqual([
      { table: 'Session', version: 7 },
      { table: 'Account', version: 7 },
    ]);

    await ctx.internalAdapter.deleteSession(session.token);
    expect(await sql(`SELECT 1 FROM "Session" WHERE id = $1`, [session.id])).toHaveLength(0);
  });

  describe('HTTP: input: false fields cannot be set', () => {
    const signUp = (email: string, extra: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .set('Origin', WEB_ORIGIN)
        .send({ email, password: 'correct-horse-battery-staple', name: 'Http User', ...extra });

    it('email sign-up of an allowlisted but unverified address is SIGNUP_CLOSED (403) and writes no row', async () => {
      // The allowlist requires a provider-verified email (M0-10), so R1 email sign-up cannot bypass it.
      const res = await signUp(HTTP_USER, { role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: SIGNUP_CLOSED });
      expect(await userRow(HTTP_USER)).toBeUndefined();
    });

    it.each([
      ['deletedAt', '2020-01-01T00:00:00.000Z'],
      ['demoExpiresAt', '2099-01-01T00:00:00.000Z'],
    ])(
      'sign-up with %s is rejected (400 FIELD_NOT_ALLOWED) and writes no row',
      async (field, value) => {
        const res = await signUp(HTTP_REJECTED, { role: 'ADMIN', [field]: value });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
        expect(await userRow(HTTP_REJECTED)).toBeUndefined();
      },
    );

    it('a Google sign-up is role USER; update-user cannot raise the role (400, row unchanged)', async () => {
      const { cookie } = await signInAs(app, 'A');
      const email = GOOGLE_IDENTITIES['code-A'].email;
      const before = await userRow(email);
      expect(before).toMatchObject({
        role: 'USER',
        deletedAt: null,
        demoExpiresAt: null,
        version: 7,
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(await userRow(email)).toEqual(before);
    });
  });
});
