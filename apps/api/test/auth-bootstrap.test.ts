// M0-02 spike evidence kept as a regression test: Nest 11 + nestjs-zod 5 + @thallesp/nestjs-better-auth.
// Better Auth runs on its memory adapter here; the Prisma-backed auth integration test arrives in M0-10.
import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { createAuth } from '../src/modules/auth/auth.config.js';
import {
  type AuthConfig,
  SIGNUP_CLOSED,
  Session,
  type UserSession,
} from '../src/modules/auth/index.js';

const BASE_URL = 'http://localhost:3000';
const ALLOWED = 'owner@example.com';
// Better Auth's response to update-user with only an input: false field (pinned by observation).
const UPDATE_USER_ROLE_STATUS = 400;
const TEST_SECRET = 'test-only-secret-never-used-outside-tests-0123456789';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

// Stand-in for the M0-04 config module: auth config comes from an injected provider via forRootAsync.
const TEST_AUTH_CONFIG = Symbol('TEST_AUTH_CONFIG');
const testAuthConfig: AuthConfig = {
  database: memoryAdapter(db),
  signupAllowlist: allowlist,
  secret: TEST_SECRET,
  baseURL: BASE_URL,
  trustedOrigins: [BASE_URL],
  // Test-only: drives sign-up without an OAuth mock. Never copy into real config (R0 = Google only).
  emailAndPassword: { enabled: true },
};
@Module({
  providers: [{ provide: TEST_AUTH_CONFIG, useValue: testAuthConfig }],
  exports: [TEST_AUTH_CONFIG],
})
class TestConfigModule {}

describe('API bootstrap: auth guard, body parsing, sign-up allowlist', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          auth: {
            imports: [TestConfigModule],
            inject: [TEST_AUTH_CONFIG],
            useFactory: (config: AuthConfig) => config,
          },
        }),
      ],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const table of Object.values(db)) table.length = 0;
    allowlist.splice(0, allowlist.length, ALLOWED);
  });

  const signUp = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', BASE_URL)
      .send({ password: 'correct-horse-battery', name: 'Spike User', ...body });

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
    const res = await request(app.getHttpServer()).post('/probe/echo').send({ name: '' });
    expect(res.status).toBe(401);
  });

  it('creates an allowlisted user with a UUID v7 id and default additional fields', async () => {
    const res = await signUp({ email: ALLOWED });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toMatch(UUID_V7);
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({ id: res.body.user.id, email: ALLOWED, role: 'USER' });
    expect(db.user[0]?.demoExpiresAt ?? null).toBeNull();
    expect(db.session[0]?.id).toMatch(UUID_V7);
    expect(db.account[0]?.id).toMatch(UUID_V7);

    // The session cookie passes the global guard, and the body pipe works on a private route.
    const cookie = res.get('Set-Cookie') ?? [];
    expect(cookie.length).toBeGreaterThan(0);
    const me = await request(app.getHttpServer()).get('/probe/private').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ userId: res.body.user.id });

    const echo = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Cookie', cookie)
      .send({ name: 'Ada' });
    expect(echo.status).toBe(201);
    expect(echo.body).toEqual({ name: 'Ada' });

    const invalid = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Cookie', cookie)
      .send({ name: '', extra: true });
    expect(invalid.status).toBe(400);
  });

  it('rejects an email outside the allowlist with 403 SIGNUP_CLOSED and creates nothing', async () => {
    const res = await signUp({ email: 'stranger@example.com' });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: SIGNUP_CLOSED });
    expect(db.user).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it('drops a client-supplied role on sign-up (input: false)', async () => {
    const res = await signUp({ email: ALLOWED, role: 'ADMIN' });

    // Better Auth 1.7 silently strips input: false fields rather than rejecting the request.
    expect(res.status).toBe(200);
    expect(db.user[0]).toMatchObject({ email: ALLOWED, role: 'USER' });
  });

  it('lets an existing user sign in after leaving the allowlist (hook runs on create only)', async () => {
    expect((await signUp({ email: ALLOWED })).status).toBe(200);
    allowlist.length = 0;

    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', BASE_URL)
      .send({ email: ALLOWED, password: 'correct-horse-battery' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ALLOWED);
  });

  it('does not let a signed-in user raise their role via update-user', async () => {
    const cookie = (await signUp({ email: ALLOWED })).get('Set-Cookie') ?? [];

    const res = await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Origin', BASE_URL)
      .set('Cookie', cookie)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(UPDATE_USER_ROLE_STATUS);
    expect(db.user[0]).toMatchObject({ email: ALLOWED, role: 'USER' });
  });
});

describe('createAuth secret validation', () => {
  const base: Omit<AuthConfig, 'secret'> = {
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    signupAllowlist: [],
    baseURL: BASE_URL,
    trustedOrigins: [BASE_URL],
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
