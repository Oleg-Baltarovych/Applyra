// Redis rate-limit store for Better Auth (M0-10, 09 §4.3) on the run's Valkey, under this worker's key prefix.
import { createServer, type Server, type Socket } from 'node:net';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createAuthRateLimitStore,
  sanitizeErrorMessage,
} from '../../src/modules/auth/auth-rate-limit.store.js';
import { testInfra } from './support/test-infra.js';

const rule = { window: 60, max: 3 };

describe('auth rate-limit store (Redis)', () => {
  let redis: Redis;
  const prefix = () => `${testInfra().redisPrefix}auth:rl:`;
  const logger = { warn: vi.fn(), debug: vi.fn() };

  beforeAll(() => {
    redis = new Redis(testInfra().redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('allows up to max per window, then denies with the seconds left; the key expires with the window', async () => {
    const store = createAuthRateLimitStore(redis, { keyPrefix: prefix(), logger });
    const key = '203.0.113.1|/sign-in/social';

    const results = [];
    for (let i = 0; i < rule.max + 1; i += 1) results.push(await store.consume(key, rule));

    expect(results.slice(0, rule.max)).toEqual(
      Array.from({ length: rule.max }, () => ({ allowed: true, retryAfter: null })),
    );
    const denied = results[rule.max];
    expect(denied?.allowed).toBe(false);
    expect(denied?.retryAfter).toBeGreaterThan(0);
    expect(denied?.retryAfter).toBeLessThanOrEqual(rule.window);
    const ttl = await redis.ttl(prefix() + key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(rule.window);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('counts each key separately', async () => {
    const store = createAuthRateLimitStore(redis, { keyPrefix: prefix(), logger });
    const one = '203.0.113.2|/callback/google';
    for (let i = 0; i < rule.max; i += 1) await store.consume(one, rule);

    expect((await store.consume(one, rule)).allowed).toBe(false);
    expect((await store.consume('203.0.113.3|/callback/google', rule)).allowed).toBe(true);
  });

  it('restarts the window once it has elapsed', async () => {
    const store = createAuthRateLimitStore(redis, { keyPrefix: prefix(), logger });
    const key = '203.0.113.4|/get-session';
    const short = { window: 1, max: 1 };
    expect((await store.consume(key, short)).allowed).toBe(true);
    expect((await store.consume(key, short)).allowed).toBe(false);

    await vi.waitFor(async () => expect(await redis.exists(prefix() + key)).toBe(0), {
      timeout: 3000,
      interval: 100,
    });
    expect((await store.consume(key, short)).allowed).toBe(true);
  });

  it('fails open with one warn per outage when Redis is unreachable', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);
    const outageLog = { warn: vi.fn(), debug: vi.fn() };
    const store = createAuthRateLimitStore(down, { keyPrefix: prefix(), logger: outageLog });

    try {
      for (let i = 0; i < rule.max + 2; i += 1) {
        expect(await store.consume('203.0.113.5|/sign-in/social', rule)).toEqual({
          allowed: true,
          retryAfter: null,
        });
      }
    } finally {
      down.disconnect();
    }
    expect(outageLog.warn).toHaveBeenCalledTimes(1);
    expect(outageLog.debug).toHaveBeenCalledTimes(rule.max + 1);
  });

  it('shares one connect between concurrent first requests on a fresh lazy client', async () => {
    const fresh = new Redis(testInfra().redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    const freshLog = { warn: vi.fn(), debug: vi.fn() };
    const store = createAuthRateLimitStore(fresh, { keyPrefix: prefix(), logger: freshLog });
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.consume('203.0.113.6|/sign-in/social', rule)),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(rule.max);
      expect(freshLog.warn).not.toHaveBeenCalled();
    } finally {
      fresh.disconnect();
    }
  });

  it('fails open when Redis accepts the connection but never answers (timeout)', async () => {
    const sockets = new Set<Socket>();
    const silent: Server = createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const address = silent.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const hung = new Redis(`redis://127.0.0.1:${String(port)}`, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    hung.on('error', () => undefined);
    const hungLog = { warn: vi.fn(), debug: vi.fn() };
    const store = createAuthRateLimitStore(hung, {
      keyPrefix: prefix(),
      logger: hungLog,
      timeoutMs: 200,
    });
    try {
      const started = Date.now();
      expect(await store.consume('203.0.113.7|/sign-in/social', rule)).toEqual({
        allowed: true,
        retryAfter: null,
      });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(hungLog.warn).toHaveBeenCalledWith(
        { errorName: 'Error', errorMessage: 'rate-limit store timeout' },
        expect.stringContaining('fail-open'),
      );
    } finally {
      hung.disconnect();
      for (const socket of sockets) socket.destroy();
      await new Promise((r) => silent.close(r));
    }
  });

  it('logs error messages without addresses or URLs', () => {
    expect(sanitizeErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:6379'))).toBe(
      'connect ECONNREFUSED <addr>',
    );
    expect(sanitizeErrorMessage(new Error('bad redis://:pw@cache.internal:6379/0'))).toBe(
      'bad <url>',
    );
    expect(sanitizeErrorMessage(new Error('x'.repeat(500)))).toHaveLength(120);
  });
});
