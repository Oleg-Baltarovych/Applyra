// /health/ready (M0-09, 12-infra-ops.md §9): PG `SELECT 1` as applyra_app + Redis PING, 1 s each. A failure is a
// 503 UNAVAILABLE whose body names no dependency or host; the failing probe is named in the log only.
import { Writable } from 'node:stream';
import { ApiError } from '@applyra/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '../support/http-app.js';
import { testEnv } from '../support/test-env.js';
import { testInfra } from './support/test-infra.js';

// Nothing listens on port 1: connection refused, immediately.
const CLOSED_PG = 'postgresql://applyra_app:test-only-password@127.0.0.1:1/applyra';
const CLOSED_REDIS = 'redis://127.0.0.1:1';

let app: INestApplication | undefined;
let logs = '';

afterEach(async () => {
  await app?.close();
  app = undefined;
  logs = '';
});

async function boot(overrides: Record<string, string>): Promise<INestApplication> {
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs += chunk.toString();
      cb();
    },
  });
  app = await createHttpApp({
    env: testEnv({
      DATABASE_URL: testInfra().databaseUrl,
      REDIS_URL: testInfra().redisUrl,
      ...overrides,
    }),
    logging: { level: 'warn', stream },
  });
  return app;
}

const expectUnavailable = (res: request.Response) => {
  expect(res.status).toBe(503);
  const body = ApiError.parse(res.body);
  expect(body).toMatchObject({ code: 'UNAVAILABLE', message: 'Not ready', details: null });
  expect(JSON.stringify(res.body)).not.toMatch(/postgres|redis|127\.0\.0\.1|ECONNREFUSED|:1\b/i);
};

describe('GET /health/ready', () => {
  it('200 when Postgres and Redis answer', async () => {
    const res = await request((await boot({})).getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('503 UNAVAILABLE when Postgres is down; the log names it', async () => {
    const res = await request((await boot({ DATABASE_URL: CLOSED_PG })).getHttpServer()).get(
      '/health/ready',
    );
    expectUnavailable(res);
    expect(logs).toContain('"failed":["postgres"]');
    expect(logs).toContain('"probe":"postgres"');
    // Probe name + error name/code only: no host:port from the driver message.
    expect(logs).not.toMatch(/127\.0\.0\.1:1|Can't reach/);
  });

  it('503 UNAVAILABLE when Redis is down; the log names it', async () => {
    const res = await request((await boot({ REDIS_URL: CLOSED_REDIS })).getHttpServer()).get(
      '/health/ready',
    );
    expectUnavailable(res);
    expect(logs).toContain('"failed":["redis"]');
  });

  it('answers within the probe timeout even when a probe never settles', async () => {
    // 10.255.255.1 is non-routable: the TCP connect hangs instead of being refused.
    const started = Date.now();
    const res = await request(
      (await boot({ REDIS_URL: 'redis://10.255.255.1:6379' })).getHttpServer(),
    ).get('/health/ready');
    expectUnavailable(res);
    expect(Date.now() - started).toBeLessThan(2500);
  });
});
