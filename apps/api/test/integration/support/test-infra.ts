// Connection details of the current worker's isolated resources (M0-07a). Side-effect free: tests import this,
// never worker-setup.ts (which registers hooks).
import { inject } from 'vitest';
import { bullPrefix, redisPrefix, workerDbName } from '../../support/isolation.js';
import { readPoolId } from '../../support/runner-env.js';
import { postgresUrl } from './infra-context.js';

export interface TestInfra {
  /** applyra_app on the worker database — what the api uses (`testEnv({ DATABASE_URL })`). */
  readonly databaseUrl: string;
  /** applyra_maintenance on the worker database (DDL in tests, migrations). */
  readonly maintenanceUrl: string;
  /** Valkey URL including the per-run password. */
  readonly redisUrl: string;
  /** Prefix for plain Redis keys of this worker (`t<id>:`). */
  readonly redisPrefix: string;
  /** BullMQ `prefix` option of this worker (`t<id>`). */
  readonly bullPrefix: string;
}

export function testInfra(): TestInfra {
  const infra = inject('infra');
  const poolId = readPoolId();
  const db = workerDbName(poolId);
  return {
    databaseUrl: postgresUrl(infra, 'applyra_app', infra.appPassword, db),
    maintenanceUrl: postgresUrl(infra, 'applyra_maintenance', infra.maintenancePassword, db),
    redisUrl: infra.valkeyUrl,
    redisPrefix: redisPrefix(poolId),
    bullPrefix: bullPrefix(poolId),
  };
}
