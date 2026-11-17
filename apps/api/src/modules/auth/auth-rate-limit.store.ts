// Better Auth rate-limit counters on Redis (09 §4.3, M0-10). Plugged in as `rateLimit.customStorage`, NOT as
// `secondaryStorage` — a global secondaryStorage would also move sessions into Redis.
import { Logger } from '@nestjs/common';
import type { BetterAuthRateLimitStorage } from 'better-auth';
import type { Redis } from 'ioredis';

/** Prefix of every counter key (`auth:rl:<ip>|<path>`). */
export const AUTH_RATE_LIMIT_KEY_PREFIX = 'auth:rl:';
const DEFAULT_TIMEOUT_MS = 1000;
const MAX_MESSAGE_LENGTH = 120;

// Fixed window: INCR, start the window (EXPIRE) on the first hit, return count + remaining TTL. One script = atomic,
// so concurrent requests cannot all pass a stale read. A key that lost its TTL gets it back (no immortal counter).
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export interface AuthRateLimitStoreOptions {
  readonly keyPrefix?: string;
  readonly logger?: Pick<Logger, 'warn' | 'debug'>;
  /** Budget per consume (connect + script); past it the request is allowed (fail-open). */
  readonly timeoutMs?: number;
}

/** Error message without addresses or URLs (ioredis messages carry host:port), bounded in length. */
export const sanitizeErrorMessage = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err))
    .replace(/rediss?:\/\/\S+/gi, '<url>')
    .replace(/\[?[\w.:-]+\]?:\d+/g, '<addr>')
    .slice(0, MAX_MESSAGE_LENGTH);

const isCountAndTtl = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === 'number' && Number.isInteger(n));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('rate-limit store timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Redis unavailable or slow → the request is ALLOWED (fail-open) with a warn log (first failure per outage, then
 * debug). Decision 2026-11-17 for R0 (Google-only: the credential check happens at Google). Password routes (R1)
 * must fail CLOSED instead.
 */
export function createAuthRateLimitStore(
  redis: Redis,
  {
    keyPrefix = AUTH_RATE_LIMIT_KEY_PREFIX,
    logger = new Logger('AuthRateLimit'),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: AuthRateLimitStoreOptions = {},
): BetterAuthRateLimitStorage {
  let failing = false;
  // Lazy client without an offline queue: the first command needs an explicit connect, shared by concurrent first
  // requests (a second connect() on a connecting client throws).
  let connecting: Promise<void> | undefined;
  const ensureConnected = async (): Promise<void> => {
    // While connecting, status is no longer 'wait' but commands still fail (no offline queue): wait for it.
    if (!connecting && redis.status !== 'wait') return;
    connecting ??= redis.connect().finally(() => {
      connecting = undefined;
    });
    await connecting;
  };

  const count = async (key: string, windowSeconds: number): Promise<[number, number]> => {
    await ensureConnected();
    const result: unknown = await redis.eval(CONSUME_SCRIPT, 1, keyPrefix + key, windowSeconds);
    if (!isCountAndTtl(result)) throw new Error('unexpected rate-limit script result');
    return result;
  };

  return {
    async consume(key, rule) {
      try {
        const [hits, ttl] = await withTimeout(count(key, rule.window), timeoutMs);
        failing = false;
        if (hits <= rule.max) return { allowed: true, retryAfter: null };
        return { allowed: false, retryAfter: Math.max(ttl, 1) };
      } catch (err) {
        const fields = {
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: sanitizeErrorMessage(err),
        };
        if (failing) logger.debug(fields, 'auth rate limit still unavailable, allowing request');
        else logger.warn(fields, 'auth rate limit unavailable, allowing request (fail-open)');
        failing = true;
        return { allowed: true, retryAfter: null };
      }
    },
  };
}
