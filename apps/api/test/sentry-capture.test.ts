// M0-15: the global error filter reports only unexpected 5xx to Sentry, scrubbed (12-infra-ops.md §9, 09 §12).
// A real Sentry client with an in-memory transport (no network): what it records is exactly what would be sent.
import { Controller, Get, type INestApplication } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Public } from '../src/modules/auth/index.js';
import { AppException } from '../src/platform/http/index.js';
import { sentryOptions } from '../src/platform/sentry/sentry-options.js';
import { createHttpApp } from './support/http-app.js';
import { testEnv } from './support/test-env.js';

@Controller('__sentry')
class SentryProbeController {
  @Public()
  @Get('crash')
  crash(): never {
    throw new Error('lookup failed for alice@example.com');
  }

  @Public()
  @Get('not-found')
  notFound(): never {
    throw new AppException('NOT_FOUND', 'Not found');
  }

  @Public()
  @Get('conflict')
  conflict(): never {
    throw new AppException('CONFLICT_STATE', 'Not allowed now');
  }
}

let app: INestApplication;
let events: Sentry.Event[] = [];

beforeAll(async () => {
  Sentry.init({
    ...sentryOptions({ dsn: 'https://public@sentry.invalid/1', environment: 'test' }),
    defaultIntegrations: false,
    transport: () => ({
      send: (envelope) => {
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') events.push(payload as Sentry.Event);
        }
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  });
  app = await createHttpApp({ env: testEnv(), controllers: [SentryProbeController] });
});

afterAll(async () => {
  await app.close();
  await Sentry.close();
});

beforeEach(() => {
  events = [];
});

async function get(path: string): Promise<request.Response> {
  const res = await request(app.getHttpServer()).get(`/api/v1/__sentry/${path}`);
  await Sentry.flush(2000);
  return res;
}

describe('Sentry capture in the global error filter', () => {
  it('reports an unexpected error once, tagged with the requestId and scrubbed', async () => {
    const res = await get('crash');

    expect(res.status).toBe(500);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.tags).toMatchObject({ requestId: res.body.requestId });
    expect(event?.exception?.values?.[0]?.value).toBe('lookup failed for a***@example.com');
  });

  it.each(['not-found', 'conflict'])('does not report an expected 4xx (%s)', async (path) => {
    const res = await get(path);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(events).toEqual([]);
  });
});
