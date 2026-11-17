// Vitest `setupFiles` entry of the integration config (M0-07a). With `isolate: true` it runs once per test file:
// re-clones the worker database from the template and empties the worker's Redis prefix before the file starts.
// Tests read connection details from test-infra.ts, not from here.
import { Redis } from 'ioredis';
import { beforeAll, inject } from 'vitest';
import { resetFactories } from '../../factories/index.js';
import { redisPrefix, workerDbName } from '../../support/isolation.js';
import { readPoolId } from '../../support/runner-env.js';
import { postgresUrl } from './infra-context.js';
import { cloneWorkerDb } from './postgres.js';

async function flushPrefix(url: string, prefix: string): Promise<void> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
      if (keys.length > 0) await redis.unlink(...keys);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
}

beforeAll(async () => {
  const infra = inject('infra');
  const poolId = readPoolId();
  resetFactories();
  await cloneWorkerDb(
    postgresUrl(infra, 'postgres', infra.superuserPassword, 'postgres'),
    workerDbName(poolId),
  );
  await flushPrefix(infra.valkeyUrl, redisPrefix(poolId));
});
