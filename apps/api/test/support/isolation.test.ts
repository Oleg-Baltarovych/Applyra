import { describe, expect, it } from 'vitest';
import { bullPrefix, generateTestPasswords, redisPrefix, workerDbName } from './isolation.js';
import { readPoolId } from './runner-env.js';

describe('generateTestPasswords', () => {
  it('returns six distinct URL-safe passwords of at least 16 characters', () => {
    const passwords = generateTestPasswords();
    const values = Object.values(passwords);

    expect(Object.keys(passwords).sort()).toEqual([
      'app',
      'backup',
      'maintenance',
      'metrics',
      'superuser',
      'valkey',
    ]);
    expect(new Set(values).size).toBe(6);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    }
  });

  it('differs between calls (generated per run)', () => {
    expect(generateTestPasswords().app).not.toBe(generateTestPasswords().app);
  });
});

describe('workerDbName', () => {
  it('derives the worker database name from the pool id', () => {
    expect(workerDbName(3)).toBe('test_w3');
    expect(workerDbName(0)).toBe('test_w0');
  });

  it.each([-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects %s', (poolId) => {
    expect(() => workerDbName(poolId)).toThrow(/pool id/);
  });
});

describe('redis prefixes', () => {
  it('scopes keys per worker', () => {
    expect(redisPrefix(3)).toBe('t3:');
    expect(bullPrefix(3)).toBe('t3');
  });

  it('rejects an invalid pool id', () => {
    expect(() => redisPrefix(-2)).toThrow(/pool id/);
    expect(() => bullPrefix(Number.NaN)).toThrow(/pool id/);
  });
});

describe('readPoolId', () => {
  it('parses VITEST_POOL_ID as a non-negative integer', () => {
    expect(readPoolId({ VITEST_POOL_ID: '2' })).toBe(2);
    expect(readPoolId({ VITEST_POOL_ID: '0' })).toBe(0);
  });

  it.each([undefined, '', 'x', '-1', '1.5', '01a'])(
    'throws naming the variable for %j',
    (value) => {
      expect(() => readPoolId({ VITEST_POOL_ID: value })).toThrow(/VITEST_POOL_ID/);
    },
  );
});
