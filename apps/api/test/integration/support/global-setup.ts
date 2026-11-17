// Vitest globalSetup of the integration config (M0-07a, 11-testing.md §3): one Postgres + one Valkey container
// per run, the template database, credentials handed to workers via provide(). Ryuk (Testcontainers' reaper,
// on by default; CI fails if it is disabled) removes the containers even when the run is killed.
// Nothing is read from env files. Never run with DEBUG=testcontainers*: its debug log may print container
// config incl. env (the Postgres superuser password is in it).
// Ports are published on all host interfaces: Testcontainers 12.2.1 has no host-IP binding API. Every service
// requires a per-run password, so an open port exposes nothing usable.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { Redis } from 'ioredis';
import type { TestProject } from 'vitest/node';
import { POSTGRES_IMAGE, VALKEY_IMAGE } from '../../support/images.js';
import { generateTestPasswords, redisPrefix } from '../../support/isolation.js';
import {
  type IntegrationInfra,
  postgresUrl,
  STALE_KEY,
  STALE_CONTROL_KEY,
  TEMPLATE_DB,
} from './infra-context.js';
import { prepareTemplate } from './postgres.js';

/**
 * Leaves a stale key under every possible worker prefix (pool ids 0…maxWorkers, the base differs between Vitest
 * majors) plus one control key outside them, so the smoke test can prove the per-file flush and its scope.
 */
async function seedStaleKeys(url: string, maxWorkers: number): Promise<void> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  try {
    const pipeline = redis.pipeline().set(STALE_CONTROL_KEY, '1');
    for (let poolId = 0; poolId <= maxWorkers; poolId += 1) {
      pipeline.set(`${redisPrefix(poolId)}${STALE_KEY}`, '1');
    }
    await pipeline.exec();
  } finally {
    redis.disconnect();
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const passwords = generateTestPasswords();
  const started = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('postgres')
      .withUsername('postgres')
      .withPassword(passwords.superuser)
      .start(),
    new ValkeyContainer(VALKEY_IMAGE).withPassword(passwords.valkey).start(),
  ]);
  const running = started.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const teardown = async (): Promise<void> => {
    await Promise.all(running.map((container) => container.stop()));
  };
  const [pgResult, valkeyResult] = started;
  if (pgResult?.status !== 'fulfilled' || valkeyResult?.status !== 'fulfilled') {
    await teardown();
    const failure = started.find((r) => r.status === 'rejected');
    throw new Error('integration containers failed to start', { cause: failure?.reason });
  }
  const postgres: StartedPostgreSqlContainer = pgResult.value;
  const valkey: StartedValkeyContainer = valkeyResult.value;

  try {
    const infra: IntegrationInfra = {
      host: postgres.getHost(),
      pgPort: postgres.getPort(),
      // redis://:<password>@host:port (the module sets the URL password from withPassword).
      valkeyUrl: valkey.getConnectionUrl(),
      superuserPassword: passwords.superuser,
      appPassword: passwords.app,
      maintenancePassword: passwords.maintenance,
    };
    await prepareTemplate(postgres, passwords, {
      admin: postgresUrl(infra, 'postgres', passwords.superuser, 'postgres'),
      templateMaintenance: postgresUrl(
        infra,
        'applyra_maintenance',
        passwords.maintenance,
        TEMPLATE_DB,
      ),
    });
    await seedStaleKeys(infra.valkeyUrl, project.config.maxWorkers);
    project.provide('infra', infra);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
