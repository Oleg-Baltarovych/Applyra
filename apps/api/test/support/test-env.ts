import { type Env, parseEnv } from '../../src/platform/config/index.js';

/** A valid api environment for tests, built through the real schema (so it stays in sync with it). */
export function testEnv(overrides: Readonly<Record<string, string>> = {}): Env {
  const result = parseEnv({
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://applyra_app:test-only-password@localhost:5432/applyra',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'test-only-secret-never-used-outside-tests-0123456789',
    BETTER_AUTH_URL: 'http://localhost:3000',
    WEB_ORIGIN: 'http://localhost:5173',
    AUTH_SIGNUP_ALLOWLIST: '',
    ...overrides,
  });
  if (!result.success) throw new Error(`invalid test env:\n${result.errors.join('\n')}`);
  return result.env;
}
