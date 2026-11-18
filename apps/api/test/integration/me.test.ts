// GET /api/v1/me + PATCH /api/v1/me/settings end to end on Postgres + Valkey (M0-11, FR-PROF-01, 06 §7.1): the
// production AppModule, users A/B signed in through the real OAuth path. Rows are asserted with plain SQL.
import { ApiError, Me, UserSettings } from '@applyra/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectContract } from '../support/expect-contract.js';
import { createHttpApp } from '../support/http-app.js';
import { signInAs, type TestSession } from '../support/session.js';
import { testEnv } from '../support/test-env.js';
import { withPg } from './support/pg.js';
import { testInfra } from './support/test-infra.js';

const WEB_ORIGIN = testEnv().WEB_ORIGIN;
const DEFAULTS = {
  timezone: 'UTC',
  timezoneConfirmed: false,
  staleFollowUpDays: 7,
  staleDaysAfterInterview: 10,
  staleGhostDays: 21,
  hotkeysEnabled: true,
};

const sql = <R extends object>(text: string, values: unknown[] = []) =>
  withPg(testInfra().databaseUrl, (db) => db.query<R>(text, values)).then((r) => r.rows);
const settingsRows = (userId: string) =>
  sql<Record<string, unknown>>(
    `SELECT timezone, "timezoneConfirmed", "staleFollowUpDays", "staleDaysAfterInterview", "staleGhostDays",
            "hotkeysEnabled", "updatedAt" FROM "UserSettings" WHERE "userId" = $1`,
    [userId],
  );

function expectApiError(res: request.Response, status: number, code: string): ApiError {
  const body = expectContract(res, status, ApiError);
  expect(body.code).toBe(code);
  return body;
}

describe('/api/v1/me', () => {
  let app: INestApplication;
  let a: TestSession;
  let b: TestSession;
  const http = () => request(app.getHttpServer());
  const patch = (who: TestSession, body: unknown) =>
    who.agent.patch('/api/v1/me/settings').send(body as object);

  beforeAll(async () => {
    app = await createHttpApp({
      env: testEnv({ DATABASE_URL: testInfra().databaseUrl, REDIS_URL: testInfra().redisUrl }),
    });
    a = await signInAs(app, 'A');
    b = await signInAs(app, 'B');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await sql(`DELETE FROM "UserSettings"`);
  });

  describe('GET', () => {
    it('returns the session user and creates the settings row with the DB defaults', async () => {
      expect(await settingsRows(a.userId)).toEqual([]);

      const me = expectContract(await a.agent.get('/api/v1/me'), 200, Me);

      const [row] = await sql<{ email: string; name: string; createdAt: Date }>(
        `SELECT email, name, "createdAt" FROM "User" WHERE id = $1`,
        [a.userId],
      );
      expect(me.user).toEqual({
        id: a.userId,
        email: row?.email,
        name: row?.name,
        image: null,
        createdAt: row?.createdAt.toISOString(),
      });
      expect(me.settings).toEqual(DEFAULTS);
      expect(await settingsRows(a.userId)).toHaveLength(1);
    });

    it('never exposes role, deletedAt, demoExpiresAt or tokens', async () => {
      const res = await a.agent.get('/api/v1/me');
      expect(Object.keys(res.body.user).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'image',
        'name',
      ]);
    });

    it('two concurrent first calls → both 200, one row', async () => {
      const [r1, r2] = await Promise.all([a.agent.get('/api/v1/me'), a.agent.get('/api/v1/me')]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect(await settingsRows(a.userId)).toHaveLength(1);
    });

    it('without a session → 401 UNAUTHENTICATED', async () => {
      expectApiError(await http().get('/api/v1/me'), 401, 'UNAUTHENTICATED');
    });

    it("B's /me never contains A's id or email", async () => {
      const aMe = expectContract(await a.agent.get('/api/v1/me'), 200, Me);
      const bRes = await b.agent.get('/api/v1/me');
      const bMe = expectContract(bRes, 200, Me);
      expect(bMe.user.id).toBe(b.userId);
      expect(JSON.stringify(bRes.body)).not.toContain(aMe.user.id);
      expect(JSON.stringify(bRes.body)).not.toContain(aMe.user.email);
    });
  });

  describe('/api/v1 prefix', () => {
    it('the unprefixed /me is not routed → 404 NOT_FOUND, even with a session', async () => {
      expectApiError(await a.agent.get('/me'), 404, 'NOT_FOUND');
    });

    it('Better Auth stays at /api/auth (its excludes are restated with the prefix)', async () => {
      const res = await a.agent.get('/api/auth/get-session');
      expect(res.status).toBe(200);
      expect(res.body?.user?.id).toBe(a.userId);
      expectApiError(await http().get('/api/v1/api/auth/get-session'), 404, 'NOT_FOUND');
    });
  });

  describe('PATCH /settings', () => {
    it('changes only the passed fields and returns the full settings (row created on demand)', async () => {
      const res = await patch(a, { staleGhostDays: 30, hotkeysEnabled: false });
      const settings = expectContract(res, 200, UserSettings);
      expect(settings).toEqual({ ...DEFAULTS, staleGhostDays: 30, hotkeysEnabled: false });

      const second = expectContract(await patch(a, { staleFollowUpDays: 3 }), 200, UserSettings);
      expect(second).toEqual({
        ...DEFAULTS,
        staleGhostDays: 30,
        hotkeysEnabled: false,
        staleFollowUpDays: 3,
      });
      expect(expectContract(await a.agent.get('/api/v1/me'), 200, Me).settings).toEqual(second);
    });

    it('a timezone (even UTC) is stored case-fixed and marks it confirmed; other fields do not', async () => {
      const other = expectContract(await patch(a, { hotkeysEnabled: false }), 200, UserSettings);
      expect(other.timezoneConfirmed).toBe(false);

      const utc = expectContract(await patch(a, { timezone: 'utc' }), 200, UserSettings);
      expect(utc).toMatchObject({ timezone: 'UTC', timezoneConfirmed: true });

      for (const zone of ['Europe/Kyiv', 'America/Argentina/Buenos_Aires', 'Etc/GMT-3']) {
        const res = expectContract(await patch(a, { timezone: zone }), 200, UserSettings);
        expect(res.timezone).toBe(zone);
      }
      expect((await settingsRows(a.userId))[0]).toMatchObject({
        timezone: 'Etc/GMT-3',
        timezoneConfirmed: true,
      });
    });

    describe('validation → 400 VALIDATION_ERROR, row unchanged', () => {
      const cases: [string, unknown, string][] = [
        ['unknown key userId', { userId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' }, 'userId'],
        ['unknown key updatedAt', { hotkeysEnabled: false, updatedAt: '2020-01-01' }, 'updatedAt'],
        ['unknown key timezoneConfirmed', { timezoneConfirmed: true }, 'timezoneConfirmed'],
        ['empty patch', {}, ''],
        ['null timezone', { timezone: null }, 'timezone'],
        ['null hotkeysEnabled', { hotkeysEnabled: null }, 'hotkeysEnabled'],
        ['staleFollowUpDays 0', { staleFollowUpDays: 0 }, 'staleFollowUpDays'],
        ['staleDaysAfterInterview 91', { staleDaysAfterInterview: 91 }, 'staleDaysAfterInterview'],
        ['staleGhostDays 181', { staleGhostDays: 181 }, 'staleGhostDays'],
        ['non-integer', { staleGhostDays: 7.5 }, 'staleGhostDays'],
        ['Mars/Base', { timezone: 'Mars/Base' }, 'timezone'],
        ['offset string', { timezone: '+02:00' }, 'timezone'],
        ['GMT+7', { timezone: 'GMT+7' }, 'timezone'],
        ['empty timezone', { timezone: '' }, 'timezone'],
        ['> 64 chars', { timezone: `Europe/${'A'.repeat(60)}` }, 'timezone'],
      ];

      it.each(cases)('%s', async (_name, body, path) => {
        await a.agent.get('/api/v1/me');
        const before = await settingsRows(a.userId);

        const error = expectApiError(await patch(a, body), 400, 'VALIDATION_ERROR');

        expect(Array.isArray(error.details) && error.details.map((d) => d.path)).toContain(path);
        expect(await settingsRows(a.userId)).toEqual(before);
      });
    });

    it('without a session → 401 UNAUTHENTICATED', async () => {
      const res = await http()
        .patch('/api/v1/me/settings')
        .set('Origin', WEB_ORIGIN)
        .send({ hotkeysEnabled: false });
      expectApiError(res, 401, 'UNAUTHENTICATED');
    });

    it('without Origin: WEB_ORIGIN → 403 CSRF_ORIGIN, row unchanged', async () => {
      await a.agent.get('/api/v1/me');
      const before = await settingsRows(a.userId);
      const res = await http()
        .patch('/api/v1/me/settings')
        .set('Cookie', a.cookie)
        .send({ hotkeysEnabled: false });
      expectApiError(res, 403, 'CSRF_ORIGIN');
      const foreign = await http()
        .patch('/api/v1/me/settings')
        .set('Cookie', a.cookie)
        .set('Origin', 'https://evil.example')
        .send({ hotkeysEnabled: false });
      expectApiError(foreign, 403, 'CSRF_ORIGIN');
      expect(await settingsRows(a.userId)).toEqual(before);
    });

    it("isolation: A's PATCH never changes B's row", async () => {
      await b.agent.get('/api/v1/me');
      const bBefore = await settingsRows(b.userId);

      expectContract(
        await patch(a, { staleGhostDays: 99, timezone: 'Europe/Kyiv' }),
        200,
        UserSettings,
      );

      expect(await settingsRows(b.userId)).toEqual(bBefore);
      expect(expectContract(await b.agent.get('/api/v1/me'), 200, Me).settings).toEqual(DEFAULTS);
    });
  });
});
