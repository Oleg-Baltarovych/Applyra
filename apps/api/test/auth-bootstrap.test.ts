// Auth wiring on Better Auth's memory adapter (no Docker): global guard, body parsing, Google sign-up through the
// allowlist, input: false fields, and the built cookie/session/origin config (M0-02, M0-10). The Postgres-backed
// flow (Redis rate limit, session lifetime, sign-out) is test/integration/auth-flow.test.ts.
import { ApiError } from '@applyra/contracts';
import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type Auth, createAuth } from '../src/modules/auth/auth.config.js';
import {
  type AuthConfig,
  SESSION_COOKIE,
  SIGNUP_CLOSED,
  Session,
  type UserSession,
} from '../src/modules/auth/index.js';
import {
  GOOGLE_IDENTITIES,
  TEST_GOOGLE_CLIENT_ID,
  TEST_GOOGLE_CLIENT_SECRET,
  cookiesOf,
  googleSignIn,
} from './support/google-oauth-mock.js';
import { createHttpApp } from './support/http-app.js';
import { testEnv } from './support/test-env.js';

const BASE_URL = 'http://localhost:3000';
// testEnv() default; /api/auth/* and non-auth mutations need it as Origin.
const WEB_ORIGIN = 'http://localhost:5173';
const ALLOWED = GOOGLE_IDENTITIES['code-A'].email;
// Better Auth's response to update-user with only an input: false field (pinned by observation).
const UPDATE_USER_ROLE_STATUS = 400;
const TEST_SECRET = 'test-only-secret-never-used-outside-tests-0123456789';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Limits are covered on Redis (test/integration/auth-flow.test.ts); here every request passes.
const unlimited: AuthConfig['rateLimitStorage'] = {
  consume: () => Promise.resolve({ allowed: true, retryAfter: null }),
};

class EchoDto extends createZodDto(z.object({ name: z.string().min(1) }).strict()) {}

// Probe routes exist only in this test: a private route (no Public) and a Zod-validated body.
@Controller('probe')
class ProbeController {
  @Get('private')
  whoAmI(@Session() session: UserSession): { userId: string } {
    return { userId: session.user.id };
  }

  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }
}

type MemoryDb = Record<'user' | 'session' | 'account' | 'verification', Record<string, unknown>[]>;

const db: MemoryDb = { user: [], session: [], account: [], verification: [] };
// Mutable on purpose: a test removes an existing user from the allowlist (the hook reads it per sign-up).
const allowlist: string[] = [];

const baseConfig: AuthConfig = {
  database: memoryAdapter(db),
  signupAllowlist: allowlist,
  secret: TEST_SECRET,
  baseURL: BASE_URL,
  webOrigin: WEB_ORIGIN,
  google: { clientId: TEST_GOOGLE_CLIENT_ID, clientSecret: TEST_GOOGLE_CLIENT_SECRET },
  rateLimitStorage: unlimited,
};

// Test-specific auth config (memory adapter, mutable allowlist) injected via the forRootAsync seam.
const TEST_AUTH_CONFIG = Symbol('TEST_AUTH_CONFIG');
@Module({
  providers: [{ provide: TEST_AUTH_CONFIG, useValue: baseConfig }],
  exports: [TEST_AUTH_CONFIG],
})
class TestConfigModule {}

describe('API bootstrap: auth guard, body parsing, Google sign-up allowlist', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createHttpApp({
      env: testEnv(),
      auth: {
        imports: [TestConfigModule],
        inject: [TEST_AUTH_CONFIG],
        useFactory: (config: AuthConfig) => config,
      },
      controllers: [ProbeController],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const table of Object.values(db)) table.length = 0;
    allowlist.splice(0, allowlist.length, ALLOWED);
  });

  const signIn = async (code: keyof typeof GOOGLE_IDENTITIES = 'code-A') => {
    const { callback } = await googleSignIn(app, code, { webOrigin: WEB_ORIGIN });
    if (!callback) throw new Error('sign-in/social returned no authorize URL');
    return { res: callback, session: cookiesOf(callback).get(SESSION_COOKIE) };
  };

  it('serves a Public route without a session', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rejects a route without Public when there is no session (global guard)', async () => {
    const res = await request(app.getHttpServer()).get('/probe/private');
    expect(res.status).toBe(401);
  });

  it('runs the guard before body validation on a private route', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Origin', WEB_ORIGIN)
      .send({ name: '' });
    expect(res.status).toBe(401);
  });

  it('creates an allowlisted Google user with a UUID v7 id and default additional fields', async () => {
    const { res, session } = await signIn();

    expect(res.status).toBe(302);
    expect(res.get('Location')).toBe(`${WEB_ORIGIN}/`);
    expect(db.user).toHaveLength(1);
    expect(db.user[0]?.id).toMatch(UUID_V7);
    expect(db.user[0]).toMatchObject({ email: ALLOWED, role: 'USER', emailVerified: true });
    expect(db.user[0]?.demoExpiresAt ?? null).toBeNull();
    expect(db.session[0]?.id).toMatch(UUID_V7);
    expect(db.account[0]).toMatchObject({ providerId: 'google', accountId: 'google-sub-a' });
    expect(db.account[0]?.id).toMatch(UUID_V7);

    // The session cookie passes the global guard, and the body pipe works on a private route.
    if (!session) throw new Error('no session cookie');
    const me = await request(app.getHttpServer()).get('/probe/private').set('Cookie', session.pair);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ userId: db.user[0]?.id });

    const echo = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', session.pair)
      .send({ name: 'Ada' });
    expect(echo.status).toBe(201);
    expect(echo.body).toEqual({ name: 'Ada' });

    const invalid = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', session.pair)
      .send({ name: '', extra: true });
    expect(invalid.status).toBe(400);
  });

  it.each([
    ['outside the allowlist', 'code-denied'],
    ['allowlisted but not verified by Google', 'code-unverified'],
  ] as const)('redirects an email %s to SIGNUP_CLOSED and creates nothing', async (_, code) => {
    allowlist.push(GOOGLE_IDENTITIES['code-unverified'].email);
    const { res, session } = await signIn(code);

    expect(res.status).toBe(302);
    const location = new URL(res.get('Location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/sign-in`);
    expect(location.searchParams.get('error')).toBe(SIGNUP_CLOSED);
    expect(session).toBeUndefined();
    expect(db.user).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it('lets an existing user sign in after leaving the allowlist, with a new session token', async () => {
    const first = await signIn();
    allowlist.length = 0;

    const second = await signIn();

    expect(second.res.status).toBe(302);
    expect(second.res.get('Location')).toBe(`${WEB_ORIGIN}/`);
    expect(db.user).toHaveLength(1);
    expect(second.session?.pair).toBeDefined();
    expect(second.session?.pair).not.toBe(first.session?.pair);
  });

  it('does not let a signed-in user raise their role via update-user', async () => {
    const { session } = await signIn();

    const res = await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', session?.pair ?? '')
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(UPDATE_USER_ROLE_STATUS);
    expect(db.user[0]).toMatchObject({ email: ALLOWED, role: 'USER' });
  });

  it('rejects an /api/auth mutation carrying a cookie from a foreign Origin (403 CSRF_ORIGIN)', async () => {
    const { session } = await signIn();

    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Origin', 'https://evil.example')
      .set('Cookie', session?.pair ?? '')
      .send({});

    expect(res.status).toBe(403);
    expect(ApiError.parse(res.body)).toMatchObject({ code: 'CSRF_ORIGIN' });
    expect(db.session).toHaveLength(1);
  });

  // Login CSRF: Better Auth checks Origin only with a cookie; platform/http authRequestPolicy checks every mutation.
  it.each([
    [
      'a foreign Origin',
      (r: request.Test) => r.set('Origin', 'https://evil.example').send({ provider: 'google' }),
    ],
    [
      'no Origin (text/plain form post)',
      (r: request.Test) => r.set('Content-Type', 'text/plain').send('{"provider":"google"}'),
    ],
  ])(
    'rejects a cookie-less sign-in/social with %s → 403 CSRF_ORIGIN, no state cookie',
    async (_, build) => {
      const res = await build(request(app.getHttpServer()).post('/api/auth/sign-in/social'));

      expect(res.status).toBe(403);
      expect(ApiError.parse(res.body)).toMatchObject({ code: 'CSRF_ORIGIN' });
      expect(res.get('Set-Cookie')).toBeUndefined();
    },
  );

  it.each([
    ['callbackURL', 'INVALID_CALLBACK_URL'],
    ['errorCallbackURL', 'INVALID_ERROR_CALLBACK_URL'],
  ])('rejects a foreign %s (no open redirect)', async (field, code) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .send({
        provider: 'google',
        callbackURL: `${WEB_ORIGIN}/`,
        [field]: 'https://evil.example/x',
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code });
  });
});

describe('createAuth: built cookie, session and origin config', () => {
  const build = (overrides: Partial<AuthConfig> = {}) =>
    createAuth({ ...baseConfig, database: memoryAdapter({ ...db }), ...overrides });
  const context = (auth: Auth) => auth.$context;

  it('names cookies __Host-applyra.* with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain', async () => {
    const { authCookies, createAuthCookie } = await context(build());

    expect(authCookies.sessionToken.name).toBe('__Host-applyra.session');
    expect(authCookies.sessionToken.attributes).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    expect(authCookies.sessionToken.attributes.domain).toBeUndefined();
    const state = createAuthCookie('state');
    expect(state.name).toBe('__Host-applyra.state');
    expect(state.attributes).toMatchObject({ secure: true, path: '/' });
  });

  it('sets the session lifetimes of 09 §4.2 and keeps the origin check on under NODE_ENV=test', async () => {
    const ctx = await context(build());

    expect(ctx.sessionConfig).toMatchObject({
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 10 * 60,
    });
    expect(ctx.skipOriginCheck).toBe(false);
    // Better Auth always adds its own baseURL; the only foreign origin is the SPA.
    expect(ctx.trustedOrigins).toEqual([BASE_URL, WEB_ORIGIN]);
    expect(ctx.rateLimit.enabled).toBe(true);
  });

  it('registers Google only when credentials are configured', async () => {
    const providers = async (auth: Auth) =>
      (await context(auth)).socialProviders.map((p: { id: string }) => p.id);

    expect(await providers(build())).toEqual(['google']);
    expect(await providers(build({ google: undefined }))).toEqual([]);
  });
});

describe('API without Google credentials', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createHttpApp({
      env: testEnv(),
      auth: { useFactory: () => ({ ...baseConfig, google: undefined }) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots, serves /health/live, and answers sign-in/social google with 404 PROVIDER_NOT_FOUND', async () => {
    expect((await request(app.getHttpServer()).get('/health/live')).status).toBe(200);

    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .send({ provider: 'google', callbackURL: `${WEB_ORIGIN}/` });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'PROVIDER_NOT_FOUND' });
  });
});

describe('createAuth secret validation', () => {
  const base: Omit<AuthConfig, 'secret'> = {
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    signupAllowlist: [],
    baseURL: BASE_URL,
    webOrigin: WEB_ORIGIN,
    rateLimitStorage: unlimited,
  };

  it('throws when the secret is missing', () => {
    expect(() => createAuth({ ...base, secret: '' })).toThrow(/secret/i);
  });

  it('throws when the secret is shorter than 32 characters', () => {
    expect(() => createAuth({ ...base, secret: 'x'.repeat(31) })).toThrow(/32/);
  });

  it('accepts a 32+ character secret', () => {
    expect(() => createAuth({ ...base, secret: 'x'.repeat(32) })).not.toThrow();
  });
});
