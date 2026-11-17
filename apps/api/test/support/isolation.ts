// Per-run credentials and per-worker resource names for integration tests (M0-07a, 11-testing.md §3).
import { randomBytes } from 'node:crypto';

export interface TestPasswords {
  readonly superuser: string;
  readonly app: string;
  readonly maintenance: string;
  readonly backup: string;
  readonly metrics: string;
  readonly valkey: string;
}

/** Fresh random passwords for one test run: 32 base64url chars each (≥ 16 as 10-roles.sql requires), URL-safe. */
export function generateTestPasswords(): TestPasswords {
  const next = (): string => randomBytes(24).toString('base64url');
  return {
    superuser: next(),
    app: next(),
    maintenance: next(),
    backup: next(),
    metrics: next(),
    valkey: next(),
  };
}

function assertPoolId(poolId: number): void {
  if (!Number.isSafeInteger(poolId) || poolId < 0) {
    throw new Error(`invalid Vitest pool id: ${String(poolId)} (expected a non-negative integer)`);
  }
}

/** Worker database cloned from the template; the name is always `/^test_w\d+$/` (safe as an identifier). */
export function workerDbName(poolId: number): string {
  assertPoolId(poolId);
  return `test_w${String(poolId)}`;
}

/** Key prefix for plain Redis keys of one worker (`t<id>:`). */
export function redisPrefix(poolId: number): string {
  return `${bullPrefix(poolId)}:`;
}

/** BullMQ `prefix` option of one worker: its keys become `t<id>:<queue>:…`, i.e. under {@link redisPrefix}. */
export function bullPrefix(poolId: number): string {
  assertPoolId(poolId);
  return `t${String(poolId)}`;
}
