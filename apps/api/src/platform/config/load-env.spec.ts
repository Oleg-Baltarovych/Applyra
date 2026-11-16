import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from './load-env.js';

class ExitCalled extends Error {}

describe('loadEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints every invalid variable without its value and exits with code 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitCalled();
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const secret = 'too-short-secret-value';

    expect(() => loadEnv({ PORT: 'abc', BETTER_AUTH_SECRET: secret })).toThrow(ExitCalled);

    expect(exit).toHaveBeenCalledWith(1);
    const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    for (const key of ['PORT', 'BETTER_AUTH_SECRET', 'DATABASE_URL', 'WEB_ORIGIN']) {
      expect(output).toContain(`  - ${key}: `);
    }
    expect(output).not.toContain(secret);
  });

  it('returns the parsed env when it is valid', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/applyra',
      REDIS_URL: 'redis://localhost:6379',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      WEB_ORIGIN: 'http://localhost:5173',
      AUTH_SIGNUP_ALLOWLIST: '',
    });
    expect(env.PORT).toBe(3000);
  });
});
