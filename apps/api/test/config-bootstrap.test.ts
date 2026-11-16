// The production composition (AppModule + env-driven auth config) boots from a validated env alone.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { Auth } from '../src/modules/auth/auth.config.js';
import { SIGNUP_CLOSED, authOptionsFromConfig } from '../src/modules/auth/index.js';
import { ConfigService } from '../src/platform/config/index.js';
import { testEnv } from './support/test-env.js';

const WEB_ORIGIN = 'http://app.localhost:5173';

describe('AppModule with the env-driven config', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          env: testEnv({ WEB_ORIGIN, PORT: '3100', AUTH_SIGNUP_ALLOWLIST: 'Owner@Example.com' }),
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * The env-driven config has no email + password (R0 = Google only, M0-10), so drive user creation
   * through Better Auth's own adapter: it runs the same databaseHooks.user.create as an OAuth sign-up.
   */
  const createUser = async (email: string) => {
    const context = await app.get<AuthService<Auth>>(AuthService).instance.$context;
    return context.internalAdapter.createUser(
      { email, name: 'Config Test', emailVerified: true },
      { method: 'admin' },
    );
  };

  it('exposes typed, immutable env values through ConfigService', () => {
    const config = app.get(ConfigService);
    expect(config.get('PORT')).toBe(3100);
    expect(config.get('WEB_ORIGIN')).toBe(WEB_ORIGIN);

    const allowlist = config.get('AUTH_SIGNUP_ALLOWLIST');
    expect(() => (allowlist as string[]).push('intruder@example.com')).toThrow(TypeError);
    expect(config.get('AUTH_SIGNUP_ALLOWLIST')).toEqual(['Owner@Example.com']);
  });

  it('serves /health/live', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
  });

  it('builds the auth config from the env', async () => {
    const auth = await authOptionsFromConfig.useFactory(app.get(ConfigService));

    expect(auth).toMatchObject({
      secret: 'test-only-secret-never-used-outside-tests-0123456789',
      baseURL: 'http://localhost:3000',
      trustedOrigins: [WEB_ORIGIN],
    });
    // R0 = Google OAuth only (M0-10): the env-driven config never enables email + password.
    expect(auth.emailAndPassword).toBeUndefined();
  });

  it('rejects sign-up of an email outside AUTH_SIGNUP_ALLOWLIST with 403 SIGNUP_CLOSED', async () => {
    await expect(createUser('stranger@example.com')).rejects.toMatchObject({
      statusCode: 403,
      body: { code: SIGNUP_CLOSED },
    });
  });

  it('admits an allowlisted email regardless of case (case-folding in the domain check)', async () => {
    const user = await createUser('owner@example.COM');
    expect(user).toMatchObject({ email: 'owner@example.com' });
  });
});
