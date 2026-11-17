import { type Env, parseEnv } from '../../src/platform/config/index.js';
import { TEST_GOOGLE_CLIENT_ID, TEST_GOOGLE_CLIENT_SECRET } from './google-oauth-mock.js';

/** A valid api environment for tests, built through the real schema (so it stays in sync with it). */
export function testEnv(overrides: Readonly<Record<string, string>> = {}): Env {
  const result = parseEnv({
    NODE_ENV: 'test',
    PORT: '3000',
    // As behind one proxy: tests pick the client IP with X-Forwarded-For (google-oauth-mock.ts nextTestIp).
    TRUST_PROXY_HOPS: '1',
    DATABASE_URL: 'postgresql://applyra_app:test-only-password@localhost:5432/applyra',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'test-only-secret-never-used-outside-tests-0123456789',
    BETTER_AUTH_URL: 'http://localhost:3000',
    WEB_ORIGIN: 'http://localhost:5173',
    // signInAs users A/B + the unverified C of google-oauth-mock.ts; override with '' to close sign-up.
    AUTH_SIGNUP_ALLOWLIST: 'user-a@example.com, user-b@example.com, user-c@example.com',
    // Fake creds: the token endpoint is mocked (google-oauth-mock.ts). Override both with '' to boot without Google.
    GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET,
    ...overrides,
  });
  if (!result.success) throw new Error(`invalid test env:\n${result.errors.join('\n')}`);
  return result.env;
}
