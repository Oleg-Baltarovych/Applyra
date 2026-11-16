import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema.js';

const SECRET = 'unit-test-only-secret-0123456789abcdef';
const DB_PASSWORD = 'unit-test-db-password-7f3a';

const valid = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: `postgresql://applyra_app:${DB_PASSWORD}@localhost:5432/applyra`,
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:5173',
  AUTH_SIGNUP_ALLOWLIST: 'owner@example.com',
} satisfies Record<string, string>;

const production = {
  ...valid,
  NODE_ENV: 'production',
  BETTER_AUTH_URL: 'https://api.example.com',
  WEB_ORIGIN: 'https://app.example.com',
} satisfies Record<string, string>;

const without = (key: keyof typeof valid): Record<string, string> =>
  Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));

const errorsOf = (source: Record<string, string | undefined>): string[] => {
  const result = parseEnv(source);
  if (result.success) throw new Error('expected the env to be rejected');
  return result.errors;
};

const envOf = (source: Record<string, string | undefined>) => {
  const result = parseEnv(source);
  if (!result.success) throw new Error(`expected a valid env:\n${result.errors.join('\n')}`);
  return result.env;
};

describe('parseEnv', () => {
  it('parses a valid environment into typed values', () => {
    expect(envOf(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: valid.DATABASE_URL,
      REDIS_URL: valid.REDIS_URL,
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
      WEB_ORIGIN: valid.WEB_ORIGIN,
      AUTH_SIGNUP_ALLOWLIST: ['owner@example.com'],
      DEMO_ENABLED: false,
    });
  });

  it('ignores unrelated variables of the process environment', () => {
    expect(Object.keys(envOf({ ...valid, PATH: '/usr/bin', HOME: '/root' }))).not.toContain('PATH');
  });

  it('returns a deeply immutable env', () => {
    const env = envOf(valid);
    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.AUTH_SIGNUP_ALLOWLIST)).toBe(true);
    expect(() => (env.AUTH_SIGNUP_ALLOWLIST as string[]).push('intruder@example.com')).toThrow(
      TypeError,
    );
    expect(env.AUTH_SIGNUP_ALLOWLIST).toEqual(['owner@example.com']);
  });

  it.each([
    'PORT',
    'DATABASE_URL',
    'REDIS_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'WEB_ORIGIN',
    'AUTH_SIGNUP_ALLOWLIST',
    'NODE_ENV',
  ] as const)('reports a missing %s', (key) => {
    const errors = errorsOf(without(key));
    expect(errors).toEqual([`${key}: is required`]);
  });

  it.each(['BETTER_AUTH_URL', 'PORT', 'NODE_ENV'] as const)(
    'treats an empty %s as missing',
    (key) => {
      expect(errorsOf({ ...valid, [key]: '' })).toEqual([`${key}: is required`]);
    },
  );

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '3000.5'],
    ['NODE_ENV', 'staging'],
    ['DATABASE_URL', 'mysql://u:p@localhost/applyra'],
    ['DATABASE_URL', 'not a url'],
    ['REDIS_URL', 'http://localhost:6379'],
    ['BETTER_AUTH_URL', 'localhost:3000'],
    ['BETTER_AUTH_URL', 'http://localhost:3000/api'],
    ['BETTER_AUTH_URL', 'http://localhost:3000/'],
    ['WEB_ORIGIN', 'http://localhost:5173/'],
    ['WEB_ORIGIN', 'http://localhost:5173/app'],
    ['WEB_ORIGIN', 'ftp://localhost'],
    ['AUTH_SIGNUP_ALLOWLIST', 'owner@example.com, not-an-email'],
  ] as const)('reports an invalid %s (%s)', (key, value) => {
    const errors = errorsOf({ ...valid, [key]: value });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`^${key}: `));
  });

  it('lists every error at once', () => {
    const errors = errorsOf({ PORT: 'abc', BETTER_AUTH_SECRET: 'short' });
    const keys = errors.map((line) => line.split(':')[0]).sort();
    expect(keys).toEqual(
      [
        'AUTH_SIGNUP_ALLOWLIST',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'DATABASE_URL',
        'NODE_ENV',
        'PORT',
        'REDIS_URL',
        'WEB_ORIGIN',
      ].sort(),
    );
  });

  it('rejects a secret shorter than 32 characters', () => {
    const errors = errorsOf({ ...valid, BETTER_AUTH_SECRET: 'x'.repeat(31) });
    expect(errors).toEqual([expect.stringMatching(/^BETTER_AUTH_SECRET: .*32/)]);
    expect(parseEnv({ ...valid, BETTER_AUTH_SECRET: 'x'.repeat(32) }).success).toBe(true);
  });

  it('rejects BETTER_AUTH_SECRETS: Better Auth would prefer it over BETTER_AUTH_SECRET', () => {
    const errors = errorsOf({ ...valid, BETTER_AUTH_SECRETS: `1:${SECRET}` });
    expect(errors).toEqual([expect.stringMatching(/^BETTER_AUTH_SECRETS: .*not supported/)]);
  });

  it('splits the sign-up allowlist: trims items and drops empty ones (case is kept for the domain check)', () => {
    const result = envOf({
      ...valid,
      AUTH_SIGNUP_ALLOWLIST: ' Owner@Example.com ,, second@example.com, ',
    });
    expect(result.AUTH_SIGNUP_ALLOWLIST).toEqual(['Owner@Example.com', 'second@example.com']);
  });

  it('accepts an empty allowlist (sign-up closed) when the variable is present', () => {
    expect(envOf({ ...valid, AUTH_SIGNUP_ALLOWLIST: '' }).AUTH_SIGNUP_ALLOWLIST).toEqual([]);
  });

  it('never echoes secret values in the error text', () => {
    const shortSecret = 'leaky-secret-value';
    const badDbUrl = `mysql://applyra_app:${DB_PASSWORD}@localhost/applyra`;
    const errors = errorsOf({
      ...valid,
      BETTER_AUTH_SECRET: shortSecret,
      BETTER_AUTH_SECRETS: `1:${SECRET}`,
      DATABASE_URL: badDbUrl,
      REDIS_URL: `http://:${DB_PASSWORD}@localhost:6379`,
    });
    const text = errors.join('\n');
    expect(errors).toHaveLength(4);
    for (const leaked of [shortSecret, SECRET, DB_PASSWORD, badDbUrl]) {
      expect(text).not.toContain(leaked);
    }
  });
});

describe('parseEnv optional integrations (12 §7: cp .env.example .env is enough to start)', () => {
  const GOOGLE_SECRET = 'unit-test-google-client-secret-9z8y';

  it('passes with neither Google variable (provider not registered)', () => {
    const env = envOf(valid);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it('passes with both Google variables', () => {
    const env = envOf({
      ...valid,
      GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: GOOGLE_SECRET,
    });
    expect(env).toMatchObject({
      GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: GOOGLE_SECRET,
    });
  });

  it('treats empty Google variables as unset', () => {
    const env = envOf({ ...valid, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it.each([
    ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_SECRET: GOOGLE_SECRET }],
    ['GOOGLE_CLIENT_SECRET', { GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com' }],
    ['GOOGLE_CLIENT_SECRET', { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: '' }],
  ] as const)('reports %s missing when only the other one is set', (missing, set) => {
    const errors = errorsOf({ ...valid, ...set });
    expect(errors).toEqual([expect.stringMatching(new RegExp(`^${missing}: .*GOOGLE_CLIENT`))]);
    expect(errors.join('\n')).not.toContain(GOOGLE_SECRET);
  });

  it('accepts a SENTRY_DSN URL and treats an empty one as unset', () => {
    const dsn = 'https://publickey@o0.ingest.sentry.io/0';
    expect(envOf({ ...valid, SENTRY_DSN: dsn }).SENTRY_DSN).toBe(dsn);
    expect(envOf({ ...valid, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
  });

  it('rejects an invalid SENTRY_DSN without echoing it', () => {
    const errors = errorsOf({ ...valid, SENTRY_DSN: 'not-a-dsn-secretish' });
    expect(errors).toEqual([expect.stringMatching(/^SENTRY_DSN: /)]);
    expect(errors.join('\n')).not.toContain('not-a-dsn-secretish');
  });

  it.each([
    ['true', true],
    ['false', false],
  ] as const)('parses DEMO_ENABLED=%s', (value, expected) => {
    expect(envOf({ ...valid, DEMO_ENABLED: value }).DEMO_ENABLED).toBe(expected);
  });

  it('defaults DEMO_ENABLED to false when unset or empty', () => {
    expect(envOf(valid).DEMO_ENABLED).toBe(false);
    expect(envOf({ ...valid, DEMO_ENABLED: '' }).DEMO_ENABLED).toBe(false);
  });

  it.each(['1', '0', 'yes', 'TRUE', 'False', ' true'])('rejects DEMO_ENABLED=%j', (value) => {
    expect(errorsOf({ ...valid, DEMO_ENABLED: value })).toEqual([
      'DEMO_ENABLED: must be true or false',
    ]);
  });
});

describe('parseEnv in production', () => {
  it('accepts https origins and non-placeholder values', () => {
    expect(envOf(production).NODE_ENV).toBe('production');
  });

  it.each(['BETTER_AUTH_URL', 'WEB_ORIGIN'] as const)('requires https for %s', (key) => {
    const errors = errorsOf({ ...production, [key]: 'http://example.com' });
    expect(errors).toEqual([`${key}: must use https in production`]);
  });

  it.each([
    ['BETTER_AUTH_SECRET', 'local-dev-only-better-auth-secret-0123456789abcdef'],
    ['DATABASE_URL', 'postgresql://applyra_app:local-dev-only-app-role-pw@db:5432/applyra'],
    ['REDIS_URL', 'redis://:local-dev-only-redis@redis:6379'],
  ] as const)('rejects the local-dev-only placeholder in %s', (key, value) => {
    const errors = errorsOf({ ...production, [key]: value });
    expect(errors).toEqual([`${key}: must not be a local-dev-only placeholder in production`]);
    expect(errors.join('\n')).not.toContain(value);
  });

  it('allows the placeholders and http outside production', () => {
    const local = {
      ...valid,
      BETTER_AUTH_SECRET: 'local-dev-only-better-auth-secret-0123456789abcdef',
    };
    expect(parseEnv(local).success).toBe(true);
  });

  it('reports production guards together with schema errors, once per variable', () => {
    const errors = errorsOf({
      ...production,
      PORT: 'abc',
      WEB_ORIGIN: 'http://app.example.com',
      BETTER_AUTH_URL: 'not a url',
    });
    expect(errors.map((line) => line.split(':')[0]).sort()).toEqual([
      'BETTER_AUTH_URL',
      'PORT',
      'WEB_ORIGIN',
    ]);
  });
});
