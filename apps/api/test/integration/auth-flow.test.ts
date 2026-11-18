// Google OAuth + allowlist + sessions end to end on Postgres + Valkey (M0-10, FR-AUTH-01..04, 09 §3–4): the production
// AppModule and auth options, Google's token endpoint mocked (google-oauth-mock.ts). Rows are asserted with plain SQL.
import { Writable } from 'node:stream';
import { ApiError } from '@applyra/contracts';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SIGNUP_CLOSED,
  Public,
  Session,
  type UserSession,
} from '../../src/modules/auth/index.js';
import {
  GOOGLE_IDENTITIES,
  cookiesOf,
  expectGoogleCode,
  googleCallback,
  googleSignIn,
  nextTestIp,
  startGoogleSignIn,
} from '../support/google-oauth-mock.js';
import { createHttpApp } from '../support/http-app.js';
import { signInAs } from '../support/session.js';
import { testEnv } from '../support/test-env.js';
import { withPg } from './support/pg.js';
import { testInfra } from './support/test-infra.js';

const WEB_ORIGIN = testEnv().WEB_ORIGIN;
const DAY_MS = 24 * 60 * 60 * 1000;

@Controller('probe')
class ProbeController {
  @Get('private')
  whoAmI(@Session() session: UserSession): { userId: string } {
    return { userId: session.user.id };
  }

  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }

  @OptionalAuth()
  @Get('optional')
  maybe(@Session() session: UserSession | null): { userId: string | null } {
    return { userId: session?.user.id ?? null };
  }
}

let logs = '';
const sql = <R extends object>(text: string, values: unknown[] = []) =>
  withPg(testInfra().databaseUrl, (db) => db.query<R>(text, values)).then((r) => r.rows);
const userRow = async (email: string) =>
  (await sql<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [email]))[0];
const tokenOf = (cookiePair: string) =>
  decodeURIComponent(cookiePair.split('=')[1] ?? '').split('.')[0];

function boot(overrides: Record<string, string> = {}): Promise<INestApplication> {
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs += chunk.toString();
      cb();
    },
  });
  return createHttpApp({
    env: testEnv({
      DATABASE_URL: testInfra().databaseUrl,
      REDIS_URL: testInfra().redisUrl,
      ...overrides,
    }),
    logging: { level: 'info', stream },
    controllers: [ProbeController],
  });
}

describe('Google OAuth flow (Postgres + Redis)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const privateRoute = (cookie: string) =>
    http().get('/api/v1/probe/private').set('Cookie', cookie);
  const getSession = (cookie: string) => http().get('/api/auth/get-session').set('Cookie', cookie);

  beforeAll(async () => {
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sign-in/social returns the Google authorize URL with PKCE S256 + state and sets the signed state cookie', async () => {
    const res = await http()
      .post('/api/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', nextTestIp())
      .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/` });

    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/google',
    );
    const state = cookiesOf(res).get('__Host-applyra.state');
    expect(state?.raw).toMatch(/; Path=\/(;|$)/);
    expect(state?.raw).toMatch(/; Secure/);
    expect(state?.raw).toMatch(/; HttpOnly/);
    expect(state?.raw).not.toMatch(/Domain=/i);
    // Signed: `<value>.<hmac>` (URL-encoded).
    expect(decodeURIComponent(state?.pair ?? '')).toMatch(/^__Host-applyra\.state=[^.]+\..+$/);
  });

  it('callback for an allowlisted, verified email creates user + account + session and sets the __Host- session cookie', async () => {
    const { callback } = await googleSignIn(app, 'code-A', {
      webOrigin: WEB_ORIGIN,
      callbackURL: `${WEB_ORIGIN}/board`,
    });

    expect(callback?.status).toBe(302);
    expect(callback?.get('Location')).toBe(`${WEB_ORIGIN}/board`);
    const session = callback && cookiesOf(callback).get(SESSION_COOKIE);
    expect(session?.raw).toMatch(/; Max-Age=604800/);
    expect(session?.raw).toMatch(/; Path=\/(;|$)/);
    expect(session?.raw).toMatch(/; HttpOnly/);
    expect(session?.raw).toMatch(/; Secure/);
    expect(session?.raw).toMatch(/; SameSite=Lax/);
    expect(session?.raw).not.toMatch(/Domain=/i);

    const user = await userRow(GOOGLE_IDENTITIES['code-A'].email);
    expect(user).toBeDefined();
    const accounts = await sql<{
      providerId: string;
      accountId: string;
      accessToken: string | null;
    }>(`SELECT "providerId", "accountId", "accessToken" FROM "Account" WHERE "userId" = $1`, [
      user?.id,
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerId: 'google', accountId: 'google-sub-a' });
    // account.encryptOAuthTokens: the stored token is not the plaintext Google sent.
    expect(accounts[0]?.accessToken).toBeTruthy();
    expect(accounts[0]?.accessToken).not.toContain('access-code-A');
    const sessions = await sql(`SELECT 1 FROM "Session" WHERE token = $1`, [
      tokenOf(session?.pair ?? ''),
    ]);
    expect(sessions).toHaveLength(1);

    // Redaction: neither the OAuth code nor the session token reaches the logs (an authenticated request is logged
    // with its Cookie header present). Note: /api/auth/* itself gets no pino-http line — see CONTEXT §6.
    expect((await privateRoute(session?.pair ?? '')).status).toBe(200);
    expect(logs).toContain('"path":"/api/v1/probe/private"');
    expect(logs).not.toContain('code-A');
    expect(logs).not.toContain(tokenOf(session?.pair ?? '') ?? '');
  });

  it.each([
    ['outside the allowlist', 'code-denied'],
    ['allowlisted but not verified by Google', 'code-unverified'],
  ] as const)(
    'callback for an email %s → 302 to /sign-in?error=SIGNUP_CLOSED, no user row',
    async (_, code) => {
      const { callback } = await googleSignIn(app, code, {
        webOrigin: WEB_ORIGIN,
        errorCallbackURL: `${WEB_ORIGIN}/sign-in`,
      });

      expect(callback?.status).toBe(302);
      const location = new URL(callback?.get('Location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/sign-in`);
      expect(location.searchParams.get('error')).toBe(SIGNUP_CLOSED);
      expect(callback && cookiesOf(callback).get(SESSION_COOKIE)).toBeUndefined();
      expect(await userRow(GOOGLE_IDENTITIES[code].email)).toBeUndefined();
    },
  );

  it('without errorCallbackURL a rejection still lands on the SPA (onAPIError.errorURL)', async () => {
    const { callback } = await googleSignIn(app, 'code-denied', { webOrigin: WEB_ORIGIN });

    const location = new URL(callback?.get('Location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/sign-in`);
    expect(location.searchParams.get('error')).toBe(SIGNUP_CLOSED);
  });

  it('a relative errorCallbackURL is passed through as-is (the browser resolves it on the API origin)', async () => {
    const { callback } = await googleSignIn(app, 'code-denied', {
      webOrigin: WEB_ORIGIN,
      errorCallbackURL: '/sign-in',
    });

    expect(callback?.get('Location')).toMatch(/^\/sign-in\?error=SIGNUP_CLOSED/);
  });

  it('an existing user signs in after leaving the allowlist; every sign-in issues a new session token', async () => {
    const first = await signInAs(app, 'B');
    const closed = await boot({ AUTH_SIGNUP_ALLOWLIST: '' });
    try {
      const { callback } = await googleSignIn(closed, 'code-B', { webOrigin: WEB_ORIGIN });

      expect(callback?.status).toBe(302);
      expect(callback?.get('Location')).toBe(`${WEB_ORIGIN}/`);
      const second = callback && cookiesOf(callback).get(SESSION_COOKIE);
      expect(second).toBeDefined();
      expect(tokenOf(second?.pair ?? '')).not.toBe(tokenOf(first.cookie));
      expect((await getSession(second?.pair ?? '')).body?.user?.id).toBe(first.userId);
    } finally {
      await closed.close();
    }
  });

  it('signInAs gives A and B their own sessions', async () => {
    const a = await signInAs(app, 'A');
    const b = await signInAs(app, 'B');

    expect(a.userId).not.toBe(b.userId);
    expect((await a.agent.get('/api/v1/probe/private')).body).toEqual({ userId: a.userId });
    expect((await b.agent.get('/api/v1/probe/private')).body).toEqual({ userId: b.userId });
  });

  describe('session lifetime (FR-AUTH-04, 09 §4.2)', () => {
    it('a private route without a session → 401 UNAUTHENTICATED', async () => {
      const res = await http().get('/api/v1/probe/private');

      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body)).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('a session past its sliding expiry (7 d idle) → 401', async () => {
      const { cookie } = await signInAs(app, 'A');
      await sql(`UPDATE "Session" SET "expiresAt" = now() - interval '1 second' WHERE token = $1`, [
        tokenOf(cookie),
      ]);

      const res = await privateRoute(cookie);
      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body)).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('a session created more than 30 d ago → 401 and the row is deleted, so get-session is null', async () => {
      const { cookie } = await signInAs(app, 'A');
      const token = tokenOf(cookie);
      expect((await privateRoute(cookie)).status).toBe(200);
      await sql(`UPDATE "Session" SET "createdAt" = $2 WHERE token = $1`, [
        token,
        new Date(Date.now() - 30 * DAY_MS - 60_000),
      ]);

      const res = await privateRoute(cookie);

      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body)).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(await sql(`SELECT 1 FROM "Session" WHERE token = $1`, [token])).toHaveLength(0);
      const after = await getSession(cookie);
      expect(after.status).toBe(200);
      expect(after.body).toBeNull();
    });

    it('a 29-day-old session still works', async () => {
      const { cookie } = await signInAs(app, 'A');
      await sql(`UPDATE "Session" SET "createdAt" = $2 WHERE token = $1`, [
        tokenOf(cookie),
        new Date(Date.now() - 29 * DAY_MS),
      ]);

      expect((await privateRoute(cookie)).status).toBe(200);
    });

    it('sign-out deletes the session row; replaying the old cookie → 401', async () => {
      const { cookie } = await signInAs(app, 'A');

      const out = await http()
        .post('/api/auth/sign-out')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', cookie)
        .send({});

      expect(out.status).toBe(200);
      expect(await sql(`SELECT 1 FROM "Session" WHERE token = $1`, [tokenOf(cookie)])).toHaveLength(
        0,
      );
      expect((await privateRoute(cookie)).status).toBe(401);
    });
  });

  describe('rate limit on Redis', () => {
    it('stores counters under auth:rl: and answers 429 with X-Retry-After past 10 sign-in/social per minute', async () => {
      const ip = nextTestIp();
      const start = () =>
        http()
          .post('/api/auth/sign-in/social')
          .set('Origin', WEB_ORIGIN)
          .set('X-Forwarded-For', ip)
          .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/` });

      for (let i = 0; i < 10; i += 1) expect((await start()).status).toBe(200);
      const limited = await start();

      expect(limited.status).toBe(429);
      expect(Number(limited.get('X-Retry-After'))).toBeGreaterThan(0);
      expect(Number(limited.get('X-Retry-After'))).toBeLessThanOrEqual(60);

      const redis = new Redis(testInfra().redisUrl, { lazyConnect: true });
      try {
        await redis.connect();
        const key = `auth:rl:${ip}|/sign-in/social`;
        expect(await redis.get(key)).toBe('11');
        expect(await redis.ttl(key)).toBeGreaterThan(0);
      } finally {
        redis.disconnect();
      }
    });
  });

  describe('client IP for the rate limit (TRUST_PROXY_HOPS, 09 §4.3)', () => {
    it('with 0 hops X-Forwarded-For is ignored: rotating it still shares one bucket', async () => {
      const direct = await boot({ TRUST_PROXY_HOPS: '0' });
      try {
        const start = () =>
          request(direct.getHttpServer())
            .post('/api/auth/sign-in/social')
            .set('Origin', WEB_ORIGIN)
            .set('X-Forwarded-For', nextTestIp())
            .set('X-Applyra-Client-Ip', nextTestIp())
            .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/` });
        for (let i = 0; i < 10; i += 1) expect((await start()).status).toBe(200);
        expect((await start()).status).toBe(429);
      } finally {
        await direct.close();
      }
    });

    it('with 1 hop the proxy-appended X-Forwarded-For entry tells clients apart', async () => {
      const [a, b] = [nextTestIp(), nextTestIp()];
      const start = (ip: string) =>
        http()
          .post('/api/auth/sign-in/social')
          .set('Origin', WEB_ORIGIN)
          .set('X-Forwarded-For', ip)
          .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/` });
      for (let i = 0; i < 10; i += 1) expect((await start(a)).status).toBe(200);
      expect((await start(a)).status).toBe(429);
      expect((await start(b)).status).toBe(200);
    });
  });

  describe('absolute cap inside Better Auth (session update hook)', () => {
    it('a sliding refresh never extends expiresAt past createdAt + 30 d', async () => {
      const { cookie } = await signInAs(app, 'A');
      const createdAt = new Date(Date.now() - 24 * DAY_MS);
      // Last refreshed 1.5 d ago → due for a refresh, which would set now + 7 d = createdAt + 31 d.
      await sql(`UPDATE "Session" SET "createdAt" = $2, "expiresAt" = $3 WHERE token = $1`, [
        tokenOf(cookie),
        createdAt,
        new Date(Date.now() + 5.5 * DAY_MS),
      ]);

      expect((await getSession(cookie)).body?.user).toBeDefined();

      const [row] = await sql<{ expiresAt: Date }>(
        `SELECT "expiresAt" FROM "Session" WHERE token = $1`,
        [tokenOf(cookie)],
      );
      expect(row?.expiresAt.getTime()).toBe(createdAt.getTime() + 30 * DAY_MS);
    });

    it('so an over-age session is null on get-session without any private route call', async () => {
      const { cookie } = await signInAs(app, 'A');
      const createdAt = new Date(Date.now() - 30 * DAY_MS - 1000);
      // The state the cap leaves behind: expiresAt = createdAt + 30 d, now just passed.
      await sql(`UPDATE "Session" SET "createdAt" = $2, "expiresAt" = $3 WHERE token = $1`, [
        tokenOf(cookie),
        createdAt,
        new Date(createdAt.getTime() + 30 * DAY_MS),
      ]);

      const res = await getSession(cookie);

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
      expect(await sql(`SELECT 1 FROM "Session" WHERE token = $1`, [tokenOf(cookie)])).toHaveLength(
        0,
      );
    });

    it('Nest guard (defence in depth): over-age session passes @Public, is anonymous on @Optional', async () => {
      const { cookie } = await signInAs(app, 'A');
      // Not reachable through the hook (expiresAt beyond the cap), e.g. a row written before the cap existed.
      await sql(`UPDATE "Session" SET "createdAt" = $2 WHERE token = $1`, [
        tokenOf(cookie),
        new Date(Date.now() - 31 * DAY_MS),
      ]);

      expect((await http().get('/api/v1/probe/public').set('Cookie', cookie)).status).toBe(200);
      const optional = await http().get('/api/v1/probe/optional').set('Cookie', cookie);
      expect(optional.status).toBe(200);
      expect(optional.body).toEqual({ userId: null });
      expect(await sql(`SELECT 1 FROM "Session" WHERE token = $1`, [tokenOf(cookie)])).toHaveLength(
        0,
      );
    });
  });

  describe('OAuth state and linking failures create no session', () => {
    const expectSignInError = (res: request.Response, error?: string) => {
      expect(res.status).toBe(302);
      const location = new URL(res.get('Location') ?? '');
      expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/sign-in`);
      expect(location.searchParams.get('error')).toBeTruthy();
      if (error) expect(location.searchParams.get('error')).toBe(error);
      expect(cookiesOf(res).get(SESSION_COOKIE)).toBeUndefined();
    };
    const started = async () => {
      const flow = await startGoogleSignIn(app, { webOrigin: WEB_ORIGIN });
      expectGoogleCode('code-A', flow.authorizeUrl?.searchParams.get('code_challenge') ?? '');
      return flow;
    };
    const sessionCount = async () =>
      Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM "Session"`))[0]?.n);

    it('tampered state', async () => {
      const before = await sessionCount();
      const flow = await started();
      const res = await googleCallback(app, {
        code: 'code-A',
        state: `${flow.state}x`,
        cookie: flow.stateCookie,
      });
      expectSignInError(res);
      expect(await sessionCount()).toBe(before);
    });

    it('valid state without the state cookie', async () => {
      const before = await sessionCount();
      const flow = await started();
      expectSignInError(
        await googleCallback(app, { code: 'code-A', state: flow.state, cookie: '' }),
      );
      expect(await sessionCount()).toBe(before);
    });

    it('the state cookie of flow A with the state of flow B', async () => {
      const before = await sessionCount();
      const a = await started();
      const b = await started();
      const res = await googleCallback(app, {
        code: 'code-A',
        state: b.state,
        cookie: a.stateCookie,
      });
      expectSignInError(res);
      expect(await sessionCount()).toBe(before);
    });

    it('an unverified Google email does not link to an existing user (09 §4.4)', async () => {
      const a = await signInAs(app, 'A');
      const { callback } = await googleSignIn(app, 'code-A-unverified-other', {
        webOrigin: WEB_ORIGIN,
      });

      if (!callback) throw new Error('no callback');
      expectSignInError(callback, 'account_not_linked');
      expect(
        await sql(`SELECT 1 FROM "Account" WHERE "accountId" = 'google-sub-a-other'`),
      ).toHaveLength(0);
      expect(await sql(`SELECT 1 FROM "Account" WHERE "userId" = $1`, [a.userId])).toHaveLength(1);
    });
  });
});
